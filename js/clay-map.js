/* Альфа-Стафф · 3D-квартал объекта в стиле «глиняного рендера» — следующий шаг приближения карты в панели
   «География объектов»: здания OpenStreetMap выдавлены в 3D из одного матового материала, мягкий свет и тени,
   затенение у подножия нарисовано на земле; склад — цветом дизайна (--accent), маршрут жильё → склад светится
   так же, как трасса на плоской карте. Тёмная тема — «рельеф из фона»: земля ровно цвета рамки сайта (без освещения),
   дома того же тона — форму рисуют только блики и тени. Фон прозрачный. Рамка кадра квартал не режет: холст шире кадра
   (BLEED), здания отбираются целиком по неровной границе — часть выступает за кадр, с какого-то края их нет вовсе.
   Подписи, уголки кадра и «пилюли» рисует панель поверх — по точкам points(). Кадры — по вызову render() из цикла панели.
   Данные — data/clay/<id объекта>.json (здания/дороги/зелень OSM + маршрут OSRM; метры от центра кадра). Режим (mode):
   walk — жильё рядом: пеший маршрут и кольцо «заселение»; drive — жильё далеко: хвост автомобильного маршрута
   входит в квартал с края: к неровной границе квартала дорога плавно уходит в фон, подпись «жильё» — где она видна целиком;
   onsite / solo — без маршрута (жильё на территории / жильё не найдено на карте).
   AS.ClayMap(el, { theme: 'dark' | 'light' }) → { has, load, render, points, pointer, bleed, resize, setTheme } */
(function () {
  'use strict';
  var AS = window.AS = window.AS || {};
  // объекты, для которых собраны данные (tools/build_clay.py)
  AS.CLAY_IDS = ['ym-tarny', 'fm-chekhov', 'starodvorskie', 'lemana-kinel', 'sviyazhsk', 'ym-sofyino', 'ozon-sofyino', 'ym-kuvekino', 'returns-domodedovo', 'fm-stupino', 'major', 'lemana-south', 'lemana-north', 'lemana-zelenograd', 'forum-auto', 'splat', 'art-pak', 'lemana-nn', 'ym-kazan', 'fm-kazan', 'fm-tolbino', 'fm-elektrougli', 'wurth'];
  // тёмная тема — «рельеф из фона» под тёмный сайт, светлая — на будущую светлую версию.
  // relief: земля = --frame без освещения, дома = --frame под светом; host — насколько дом с жильём светлее (доля белого)
  var THEMES = {
    // blockLift — насколько дома светлее фона (доля белого); дороги — светлее земли: окружение читается, склад — главный (выбор 14.10)
    dark: { relief: true, host: 0.22, road: 0.07, green: 'rgba(0,0,0,0)', ao: 'rgba(0,0,0,.6)', shadow: 0.45, gnd: 0x000000, hemi: 1.15, sun: 2.0, lift: 0, blockLift: 0.1 },
    light: { block: '#efe9df', host: '#ffffff', road: -0.03, green: 'rgba(90,110,70,.08)', ao: 'rgba(80,58,28,.42)', gnd: 0xa89c88, hemi: 0.8, sun: 1.9, lift: 0, ground: '#e8e2d7' }
  };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function css(name, fb) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb; }
  function mix(hex, to, k) {   // смешать цвет с белым/чёрным: «чуть светлее рамки»
    var c = new window.THREE.Color(hex); return c.lerp(new window.THREE.Color(to), k);
  }
  // поля холста за кадром (доли кадра с каждой стороны) — в них выступают здания с края квартала
  var BLEED = { x: 0.11, t: 0.06, b: 0.06 };   // сверху — заголовок панели, снизу — край панели: там запас меньше
  var workerURL = new URL('clay-worker.js?v=20261015-worker1', document.currentScript.src).href;

  AS.ClayMap = function (el, opts) {
    var T = window.THREE; if (!T) return null;
    opts = opts || {};
    var themeName = opts.theme === 'light' ? 'light' : 'dark';
    var cv = document.createElement('canvas'); cv.className = 'clay__cv'; el.appendChild(cv);
    var renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, premultipliedAlpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.VSMShadowMap;
    renderer.shadowMap.autoUpdate = false;   // квартал неподвижен (двигается только камера) — тени считаем один раз после сборки
    renderer.outputColorSpace = T.SRGBColorSpace;
    var cache = {}, D = null, scene = null, cam = null, pin = null, hostAt = null, awayAt = null, PIN_H = 0, disposables = [];
    // Prepared resources live in a bounded CPU cache; only the visible scene owns GPU buffers.
    var preparedCache = new Map(), activeKey = '', activeTheme = '', revision = 0, pending = null;
    var worker = null, job = null, serial = 0, resizeTimer = 0, wantedId = '', unavailable = new Set();
    var canPrepare = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';
    // материалы и свет живут всё время, а не создаются на каждый квартал: иначе при каждой смене объекта
    // шейдеры компилируются заново, а «солнце» оставляет в видеопамяти свою карту теней
    var M = null, hemi = null, sun = null;
    var tx = 0, ty = 0, mx = 0, my = 0, t0 = performance.now(), fw = 0, fh = 0, idNow = '';

    // кадр (fw × fh) задаёт панель; холст больше кадра на поля bleed, камера снимает кадр «со смещением» — квартал в кадре на прежнем месте
    function bleed(w, h) { return { x: Math.round(w * BLEED.x), t: Math.round(h * BLEED.t), b: Math.round(h * BLEED.b) }; }
    function frame() {
      if (fw) return [fw, fh];
      if (el.clientWidth) return [el.clientWidth / (1 + 2 * BLEED.x), el.clientHeight / (1 + BLEED.t + BLEED.b)];
      return [1, 0.9];
    }
    function size() { var f = frame(), b = bleed(f[0], f[1]); return [f[0] + 2 * b.x, f[1] + b.t + b.b]; }
    function resize(w, h) {
      var changed = w && h && (w !== fw || h !== fh);
      if (w && h) { fw = w; fh = h; }
      if (changed && D && !pending) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { if (!pending) load(idNow); }, 120);
      }
      var f = frame(), b = bleed(f[0], f[1]), s = size();
      renderer.setSize(s[0], s[1], false);
      if (cam) { cam.aspect = f[0] / f[1]; cam.setViewOffset(f[0], f[1], -b.x, -b.t, s[0], s[1]); cam.updateProjectionMatrix(); }
    }
    // камера: наклон 38°, лёгкий поворот; ax/ay — параллакс от мыши (−1…1)
    function pose(c, ax, ay) {
      // кадр выше, чем шире: отходим дальше, чтобы по ширине квартал помещался так же (а по высоте видно больше)
      var f = frame(), asp = Math.min(1, f[0] / f[1]);
      var fit = D.fit || D.size * 0.92, dist = fit / asp / Math.tan(T.MathUtils.degToRad(11)) * 0.98;
      var tilt = T.MathUtils.degToRad(38 + ay * 3), yaw = -0.18 + ax * 0.06;
      c.position.set(Math.sin(yaw) * Math.sin(tilt) * dist, Math.cos(tilt) * dist, Math.cos(yaw) * Math.sin(tilt) * dist);
      c.lookAt(0, 0, 0); c.updateMatrixWorld();
    }
    function track(x) { disposables.push(x); return x; }
    function clear() { disposables.forEach(function (d) { d.dispose(); }); disposables = []; scene = null; pin = null; hostAt = awayAt = null; }
    function mats(TH, ACC, LIG, frameHex) {
      if (!M) {
        var std = function (o) { return new T.MeshStandardMaterial(o); };
        M = {
          block: std({ roughness: 0.95 }), wh: std({ roughness: 0.7, emissiveIntensity: 0.08 }), host: std({ roughness: 0.9 }),
          route: std({ roughness: 0.5, emissiveIntensity: 0.55 }), routeFade: std({ roughness: 0.5, emissiveIntensity: 0.55, vertexColors: true, transparent: true }),
          halo: new T.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending }),
          haloFade: new T.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending, vertexColors: true }),
          ring: std({ color: '#ffffff', roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.25 }),
          pin: std({ color: '#ffffff', roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.35 }),   // белая — видна на красной крыше склада
          ground: null, shade: new T.ShadowMaterial({ opacity: TH.shadow || 0.4 })
        };
      }
      // цвета — из переменных дизайна (у «Оранжевого» и «Брендбука» разные): смена цвета шейдер не пересобирает
      M.block.color.copy(TH.relief ? mix(frameHex, '#ffffff', TH.blockLift || 0) : new T.Color(TH.block));
      M.host.color.copy(TH.relief ? mix(frameHex, '#ffffff', Math.max(TH.host, (TH.blockLift || 0) + 0.15)) : new T.Color(TH.host));
      M.wh.color.set(ACC); M.wh.emissive.set(ACC); M.halo.color.set(ACC); M.haloFade.color.set(ACC);
      [M.route, M.routeFade].forEach(function (m) { m.color.set(LIG); m.emissive.set(LIG); });
      return M;
    }
    function dropMats() { if (M) Object.keys(M).forEach(function (k) { if (M[k]) M[k].dispose(); }); M = null; }

    function geometry(spec) {
      var g = track(new T.BufferGeometry());
      ['position', 'normal', 'uv', 'color'].forEach(function (name) {
        if (spec[name]) g.setAttribute(name, new T.BufferAttribute(spec[name], name === 'uv' ? 2 : name === 'color' ? 4 : 3));
      });
      if (spec.index) g.setIndex(new T.BufferAttribute(spec.index, 1));
      g.computeBoundingSphere();
      return g;
    }
    function release(prepared) { if (prepared && prepared.ground) prepared.ground.close(); }
    function remember(key, prepared) {
      preparedCache.delete(key); preparedCache.set(key, prepared);
      while (preparedCache.size > 3) {
        var oldest = Array.from(preparedCache.keys()).find(function (k) { return k !== activeKey && k !== key; });
        if (oldest == null) break;
        release(preparedCache.get(oldest)); preparedCache.delete(oldest);
      }
    }
    function cancelJob() {
      if (!job) return;
      var old = job; job = null;
      clearTimeout(old.timeout);
      if (worker) { worker.terminate(); worker = null; }
      old.resolve(null);
    }
    function prepare(data, config) {
      if (!canPrepare) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var token = ++serial;
        function fail() {
          if (!job || job.id !== token) return;
          canPrepare = false; cancelJob();
        }
        try {
          if (!worker) worker = new Worker(workerURL);
          job = { id: token, resolve: resolve, timeout: setTimeout(fail, 20000) };
          worker.onmessage = function (event) {
            var reply = event.data;
            if (!job || reply.id !== job.id) { release(reply.prepared); return; }
            var current = job; job = null; clearTimeout(current.timeout);
            if (reply.error) unavailable.add(config.id);
            current.resolve(reply.prepared || null);
          };
          worker.onerror = function (event) { event.preventDefault(); fail(); };
          worker.onmessageerror = fail;
          worker.postMessage({ id: token, data: data, config: config });
        } catch (error) {
          canPrepare = false;
          if (job) cancelJob(); else resolve(null);
        }
      });
    }
    function configFor(id) { return { id: id, frame: frame(), theme: THEMES[themeName], frameHex: css('--frame', '#1c1c1c') }; }
    function configKey(config) { return JSON.stringify(config); }
    function build(prepared) {
      clear();
      var TH = THEMES[themeName], ACC = css('--accent', '#ff5a1f'), LIG = css('--accent-3', '#ff8b5f');
      var S = prepared.size, F = prepared.far, frameHex = css('--frame', '#1c1c1c');
      if (activeTheme !== themeName) { dropMats(); activeTheme = themeName; }
      scene = new T.Scene();
      // ImageBitmap is already flipped in the worker; WebGL ignores Texture.flipY for bitmaps.
      var gt = track(new T.Texture(prepared.ground));
      gt.flipY = false; gt.colorSpace = T.SRGBColorSpace; gt.anisotropy = 8; gt.needsUpdate = true;
      var MM = mats(TH, ACC, LIG, frameHex);
      if (!MM.ground) MM.ground = TH.relief ? new T.MeshBasicMaterial({ map: gt, transparent: true }) : new T.MeshStandardMaterial({ map: gt, roughness: 1, transparent: true });
      else MM.ground.map = gt;
      MM.shade.opacity = TH.shadow || 0.4;
      var ground = new T.Mesh(track(new T.PlaneGeometry(2 * F, 2 * F)), MM.ground);
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = !TH.relief; ground.renderOrder = -2; scene.add(ground);
      if (TH.relief) {
        var shade = new T.Mesh(track(new T.PlaneGeometry(2 * F, 2 * F)), MM.shade);
        shade.rotation.x = -Math.PI / 2; shade.position.y = 0.05; shade.receiveShadow = true; shade.renderOrder = -1; scene.add(shade);
      }
      ['block', 'wh', 'host'].forEach(function (name) {
        if (!prepared.buildings[name]) return;
        var mesh = new T.Mesh(geometry(prepared.buildings[name]), MM[name]);
        mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
      });
      prepared.routes.forEach(function (spec, i) {
        scene.add(new T.Mesh(geometry(spec), i ? (prepared.routeFade ? MM.haloFade : MM.halo) : (prepared.routeFade ? MM.routeFade : MM.route)));
      });
      if (prepared.hostAt) {
        hostAt = new T.Vector3().fromArray(prepared.hostAt);
        var ring = new T.Mesh(track(new T.TorusGeometry(9, 1.8, 12, 40)), MM.ring);
        ring.rotation.x = -Math.PI / 2; ring.position.copy(hostAt); scene.add(ring);
      }
      if (prepared.awayAt) awayAt = new T.Vector3().fromArray(prepared.awayAt);
      PIN_H = prepared.pinHeight;
      pin = new T.Mesh(track(new T.SphereGeometry(9, 32, 20)), MM.pin);
      pin.position.fromArray(prepared.pinAt); pin.castShadow = true; scene.add(pin);
      var stem = new T.Mesh(track(new T.CylinderGeometry(1, 1, 34, 10)), MM.pin);
      stem.position.set(pin.position.x, PIN_H - 17, pin.position.z); stem.castShadow = true; scene.add(stem);
      if (!hemi) {
        hemi = new T.HemisphereLight(0xffffff, TH.gnd, TH.hemi);
        sun = new T.DirectionalLight(0xffffff, TH.sun); sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 9; sun.shadow.blurSamples = 16; sun.shadow.bias = -0.0004;
      }
      hemi.groundColor.set(TH.gnd); hemi.intensity = TH.hemi; sun.intensity = TH.sun;
      sun.position.set(-S * 0.9, S * 1.3, S * 0.35);
      var sc = sun.shadow.camera; sc.left = -S * 1.6; sc.right = S * 1.6; sc.top = S * 1.6; sc.bottom = -S * 1.6;
      sc.near = 1; sc.far = S * 5; sc.updateProjectionMatrix();
      scene.add(hemi); scene.add(sun); renderer.shadowMap.needsUpdate = true;
      var s = size(); cam = new T.PerspectiveCamera(22, s[0] / s[1], 1, S * 20);
      resize();
    }
    function load(id) {
      var initialKey = configKey(configFor(id));
      if (pending && pending.key === initialKey) return pending.promise;
      var ticket = ++revision;
      cancelJob();
      pending = null; wantedId = id;
      if (!canPrepare || unavailable.has(id) || AS.CLAY_IDS.indexOf(id) < 0) return Promise.resolve(null);
      var request = { key: initialKey, promise: null };
      pending = request;
      request.promise = (async function () {
        try {
          var dataPromise = cache[id] || (cache[id] = fetch('data/clay/' + id + '.json?v=20261019k')
            .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
          var data = await dataPromise;
          if (ticket !== revision) return null;
          if (!data) { delete cache[id]; unavailable.add(id); return null; }
          // A resize/theme change during preparation must not commit resources for the old frame.
          while (ticket === revision) {
            var config = configFor(id), key = configKey(config);
            var prepared = preparedCache.get(key) || await prepare(data, config);
            if (ticket !== revision) { if (prepared && !preparedCache.has(key)) release(prepared); return null; }
            if (!prepared) return null;
            remember(key, prepared);
            if (configKey(configFor(id)) !== key) continue;
            if (activeKey !== key) { D = data; idNow = id; build(prepared); activeKey = key; }
            else mats(THEMES[themeName], css('--accent', '#ff5a1f'), css('--accent-3', '#ff8b5f'), config.frameHex);
            return data;
          }
          return null;
        } finally { if (pending === request) pending = null; }
      })();
      return request.promise;
    }

    function place(now) {
      mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
      pose(cam, mx, my);
      if (pin && !reduce) pin.position.y = PIN_H + Math.sin((now - t0) / 600) * 2.5;
    }
    function toPx(v) {   // px внутри кадра (не холста)
      var s = size(), f = frame(), b = bleed(f[0], f[1]), p = v.clone().project(cam);
      return [(p.x + 1) / 2 * s[0] - b.x, (1 - p.y) / 2 * s[1] - b.t];
    }

    return {
      has: function (id) { return canPrepare && !unavailable.has(id) && AS.CLAY_IDS.indexOf(id) >= 0; },
      // Only the newest request can replace the visible scene; cancelled loads resolve to null.
      load: load,
      render: function (now) { if (!scene) return; place(now); renderer.render(scene, cam); },
      // экранные точки (px внутри кадра): верх метки склада, кольцо жилья (walk) или место подписи «жильё» на дороге (drive)
      points: function () {
        if (!scene || !pin) return null;
        return { wh: toPx(pin.position), host: hostAt ? toPx(hostAt) : null, away: awayAt ? toPx(awayAt) : null };
      },
      pointer: function (nx, ny) { tx = nx; ty = ny; },
      bleed: bleed,   // поля холста за кадром w × h, px: { x, t, b } — панель ставит по ним слой
      resize: resize,   // resize(w, h) — размер кадра
      setTheme: function (t) { themeName = t === 'light' ? 'light' : 'dark'; return wantedId ? load(wantedId) : Promise.resolve(null); }
    };
  };
})();
