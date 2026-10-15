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
  AS.CLAY_IDS = ['ym-tarny', 'fm-chekhov', 'starodvorskie', 'lemana-kinel', 'sviyazhsk', 'ym-sofyino', 'ozon-sofyino', 'ym-kuvekino', 'returns-domodedovo', 'fm-stupino', 'major', 'lemana-south', 'lemana-north', 'lemana-zelenograd', 'forum-auto', 'splat', 'art-pak', 'lemana-nn', 'ym-tura-ff', 'ym-tura-sc', 'fm-tolbino', 'fm-elektrougli', 'wurth'];
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
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

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
      if (w && h) { fw = w; fh = h; }
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

    function build() {
      clear();
      if (!D) return;
      var TH = THEMES[themeName], ACC = css('--accent', '#ff5a1f'), LIG = css('--accent-3', '#ff8b5f'), S = D.size, F = D.far || S * 2;
      var frameHex = css('--frame', '#1c1c1c');
      var groundCol = TH.ground ? new T.Color(TH.ground) : mix(frameHex, '#ffffff', TH.lift);
      scene = new T.Scene();
      // граница квартала — неровная: «скруглённый квадрат» кадра, по краю которого гуляет волна (своя у каждого объекта);
      // снизу граница ближе к центру — подпись кадра лежит на чистой земле
      var rest = new T.PerspectiveCamera(22, frame()[0] / frame()[1], 1, S * 20); pose(rest, 0, 0);
      var sd = hash(idNow || 'clay'), ph = [0, 1, 2].map(function (i) { return ((sd >>> (i * 8)) & 255) / 255 * Math.PI * 2; });
      var edge = function (an) {   // радиус границы в направлении an (0 — вправо, π/2 — вниз), в долях полукадра
        var r = 1 + 0.12 * (0.45 * Math.sin(2 * an + ph[0]) + 0.3 * Math.sin(3 * an + ph[1]) + 0.25 * Math.sin(7 * an + ph[2]));
        return r - 0.16 * Math.pow(Math.max(0, Math.sin(an)), 6);
      };
      var sq = function (u, v) { return Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25); };
      var ndc = function (x, y, z) { var v = new T.Vector3(x, y, z).project(rest); return [v.x, -v.y]; };   // кадр: −1…1, вниз — плюс
      // здание остаётся целиком или пропадает целиком: середина — внутри границы, и всё здание помещается на холст
      // (с запасом на параллакс), поэтому рамка ни одно здание не режет. У каждого здания своя поправка к границе (±0.1) —
      // у кромки соседние дома то остаются, то пропадают: край рваный, а не ровная линия
      var M = 0.09, UX = 1 + 2 * BLEED.x - M, VT = -(1 + 2 * BLEED.t - M), VB = 1 + 2 * BLEED.b - M;
      var keep = D.b.filter(function (b) {
        if (b.wh || b.host) return true;
        var h = Math.max(3, b.h), cx = 0, cy = 0, n = 0, fits = true, qs = [];
        b.p.forEach(function (p) {
          [0, h].forEach(function (y) { var q = ndc(p[0], y, -p[1]); qs.push(q); cx += q[0]; cy += q[1]; n++; if (Math.abs(q[0]) > UX || q[1] < VT || q[1] > VB) fits = false; });
        });
        cx /= n; cy /= n; b.c = [cx, cy];
        b.r = Math.max.apply(null, qs.map(function (q) { return Math.hypot(q[0] - cx, q[1] - cy); }));   // «радиус» здания в кадре
        var jit = ((hash(b.p[0][0].toFixed(1) + ',' + b.p[0][1].toFixed(1)) & 1023) / 1023 - 0.5) * 0.2;
        return fits && sq(cx, cy) < edge(Math.atan2(cy, cx)) + jit;
      });
      // без «сирот»: дом у кромки, рядом с которым (край к краю) не осталось соседей, висел бы в пустоте отдельно от квартала
      keep = keep.filter(function (b) {
        if (!b.c || sq(b.c[0], b.c[1]) < 0.85) return true;
        return keep.some(function (o) { return o !== b && o.c && Math.hypot(o.c[0] - b.c[0], o.c[1] - b.c[1]) - o.r - b.r < 0.07; });
      });
      // та же граница на земле (чуть внутрь — дороги кончаются раньше крайних домов): луч из камеры через границу → плоскость земли
      var ray = new T.Raycaster(), gp = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3(), rim = [];
      for (var i = 0; i < 120; i++) {
        var an = i / 120 * Math.PI * 2, er = (edge(an) - 0.07) / sq(Math.cos(an), Math.sin(an));
        ray.setFromCamera(new T.Vector2(Math.cos(an) * er, -Math.sin(an) * er), rest);
        if (ray.ray.intersectPlane(gp, hit)) rim.push([hit.x, -hit.z]);
      }
      // земля: тон рамки, дороги, зелень, мягкое затенение у подножия зданий — в текстуру
      var tex = document.createElement('canvas'), N = 2048; tex.width = tex.height = N;
      var g = tex.getContext('2d'), k = N / (2 * F), P = function (p) { return [N / 2 + p[0] * k, N / 2 - p[1] * k]; };
      var poly = function (pts) { g.beginPath(); pts.forEach(function (p, i) { var q = P(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); };
      g.fillStyle = '#' + groundCol.getHexString(); g.fillRect(0, 0, N, N);
      g.fillStyle = TH.green; D.green.forEach(poly);
      // вода — темнее земли, по берегу тонкая светлая линия: водоём читается, но не спорит со складом
      if (D.water && D.water.length) {
        g.save(); g.beginPath();
        D.water.forEach(function (pts) { pts.forEach(function (p, i) { var q = P(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); });
        g.fillStyle = '#' + groundCol.clone().lerp(new T.Color(TH.ground ? '#7f99a8' : '#000000'), TH.ground ? 0.35 : 0.6).getHexString(); g.fill('evenodd');
        // водная рябь — редкие светлые штрихи вдоль берега читаются как вода, а не как тень
        g.clip('evenodd'); g.lineWidth = Math.max(3, 4 * k); g.strokeStyle = 'rgba(255,255,255,' + (TH.ground ? .5 : .22) + ')'; g.stroke();
        g.lineWidth = Math.max(1, 1.2 * k); g.strokeStyle = 'rgba(255,255,255,.05)';
        for (var wy = 0; wy < N; wy += Math.max(6, 9 * k)) { g.beginPath(); g.moveTo(0, wy); g.lineTo(N, wy); g.stroke(); }
        g.restore();
      }
      g.strokeStyle = '#' + groundCol.clone().lerp(new T.Color(TH.road > 0 ? '#ffffff' : '#000000'), Math.abs(TH.road)).getHexString();
      g.lineCap = g.lineJoin = 'round';
      D.roads.forEach(function (r) { g.lineWidth = r.w * k; g.beginPath(); r.p.forEach(function (p, i) { var q = P(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); });
      g.save(); g.filter = 'blur(' + Math.max(3, Math.round(5 * k)) + 'px)'; g.fillStyle = TH.ao; keep.forEach(function (b) { poly(b.p); }); g.restore();
      // земля — только внутри границы квартала (край мягкий, чтобы дороги не обрывались ножом); снаружи прозрачно — там фон страницы
      if (rim.length > 8) { g.save(); g.globalCompositeOperation = 'destination-in'; g.filter = 'blur(' + Math.round(14 * k) + 'px)'; g.fillStyle = '#000'; poly(rim); g.restore(); }
      var gt = track(new T.CanvasTexture(tex)); gt.colorSpace = T.SRGBColorSpace; gt.anisotropy = 8;
      var MM = mats(TH, ACC, LIG, frameHex);
      // в рельефе земля не освещается — она ровно того же цвета, что рамка вокруг; тени ложатся отдельным прозрачным слоем
      if (!MM.ground) MM.ground = TH.relief ? new T.MeshBasicMaterial({ map: gt, transparent: true }) : new T.MeshStandardMaterial({ map: gt, roughness: 1, transparent: true });
      else MM.ground.map = gt;
      var ground = new T.Mesh(track(new T.PlaneGeometry(2 * F, 2 * F)), MM.ground);
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = !TH.relief; ground.renderOrder = -2; scene.add(ground);
      if (TH.relief) {
        var shade = new T.Mesh(track(new T.PlaneGeometry(2 * F, 2 * F)), MM.shade);
        shade.rotation.x = -Math.PI / 2; shade.position.y = 0.05; shade.receiveShadow = true; shade.renderOrder = -1; scene.add(shade);
      }
      // здания: выдавленные блоки со скруглёнными краями; склад — цветом дизайна, дом с жильём — светлый
      var mat = MM.block, whMat = MM.wh, hostMat = MM.host;
      // здания одного материала — одна геометрия: сотни домов рисуются тремя вызовами, а не сотнями
      var groups = { block: [], wh: [], host: [] };
      keep.forEach(function (b) {
        var sh = new T.Shape();
        b.p.forEach(function (p, i) { if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
        var h = Math.max(3, b.h), bev = Math.min(1.2, h * 0.15);
        var geo = new T.ExtrudeGeometry(sh, { depth: h - bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 2 });
        geo.rotateX(-Math.PI / 2);   // форма в плоскости x/y (y — север) → x/z, высота — вверх
        groups[b.wh ? 'wh' : b.host ? 'host' : 'block'].push(geo);
      });
      [['block', mat], ['wh', whMat], ['host', hostMat]].forEach(function (gm) {
        var list = groups[gm[0]]; if (!list.length) return;
        var n = 0; list.forEach(function (g) { n += g.attributes.position.count; });
        var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
        list.forEach(function (g) {   // ExtrudeGeometry без индексов — просто склеиваем массивы вершин
          pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose();
        });
        var all = track(new T.BufferGeometry());
        all.setAttribute('position', new T.BufferAttribute(pos, 3)); all.setAttribute('normal', new T.BufferAttribute(nor, 3)); all.computeBoundingSphere();
        var m = new T.Mesh(all, gm[1]); m.castShadow = m.receiveShadow = true; scene.add(m);
      });
      // маршрут жильё → склад: светящаяся трубка цвета трассы + мягкий ореол, как подсветка трассы на плоской карте.
      // У дальнего жилья (drive) — только хвост дороги: к неровной границе квартала он плавно уходит в фон
      // (та же граница, что у зданий), поэтому край холста дорогу не обрезает
      var mode = D.mode || 'walk', pts = (D.route || []).map(function (p) { return new T.Vector3(p[0], 1.8, -p[1]); });
      if (pts.length > 1) {
        var curve = new T.CatmullRomCurve3(pts, false, 'centripetal', 0.2), segs = Math.max(120, pts.length * 8), fd = mode === 'drive', ra = [];
        for (var ri = 0; ri <= segs; ri++) {
          var cq = curve.getPointAt(ri / segs), q = ndc(cq.x, 0, cq.z), rr = sq(q[0], q[1]) / edge(Math.atan2(q[1], q[0]));
          var ru = Math.max(0, Math.min(1, (1 - rr) / 0.28)); ra.push(fd ? ru * ru * (3 - 2 * ru) : 1);
        }
        // только последний въезд в квартал: петли дороги, которые раньше выходили за край и возвращались, не показываем
        if (fd) { for (var lz = segs; lz >= 0 && ra[lz] > 0; lz--); for (var zi = 0; zi < lz; zi++) ra[zi] = 0; }
        var tube = function (r, rs) {
          var gm = track(new T.TubeGeometry(curve, segs, r, rs, false));
          if (fd) {
            var col = new Float32Array((segs + 1) * (rs + 1) * 4);
            for (var i = 0; i <= segs; i++) for (var j = 0; j <= rs; j++) { var o = (i * (rs + 1) + j) * 4; col[o] = col[o + 1] = col[o + 2] = 1; col[o + 3] = ra[i]; }
            gm.setAttribute('color', new T.BufferAttribute(col, 4));
          }
          return gm;
        };
        scene.add(new T.Mesh(tube(2.2, 12), fd ? MM.routeFade : MM.route));
        scene.add(new T.Mesh(tube(7, 10), fd ? MM.haloFade : MM.halo));
        if (mode === 'drive') {   // подпись «жильё» — там, где дорога, входя в квартал, становится видна целиком
          for (var ai = 0; ai <= segs && ra[ai] < 0.97; ai++);
          if (ai <= segs) { var ap = curve.getPointAt(Math.min(1, (ai + segs * 0.04) / segs)); awayAt = new T.Vector3(ap.x, 2, ap.z); }
        } else {   // жильё — белое кольцо на земле (как кружки офисов на плоской карте)
          var a = pts[0];
          var ring = new T.Mesh(track(new T.TorusGeometry(9, 1.8, 12, 40)), MM.ring); ring.rotation.x = -Math.PI / 2; ring.position.set(a.x, 2, a.z); scene.add(ring);
          hostAt = new T.Vector3(a.x, 2, a.z);
        }
      }
      // склад — шарик на ножке над главным корпусом
      var z = D.pin ? new T.Vector3(D.pin[0], 0, -D.pin[1]) : pts[pts.length - 1];
      var whTop = Math.max.apply(null, D.b.filter(function (b) { return b.wh; }).map(function (b) { return b.h; }).concat([0]));
      PIN_H = whTop + 34;
      var pinMat = MM.pin;
      pin = new T.Mesh(track(new T.SphereGeometry(9, 32, 20)), pinMat); pin.position.set(z.x, PIN_H, z.z); pin.castShadow = true; scene.add(pin);
      var stem = new T.Mesh(track(new T.CylinderGeometry(1, 1, PIN_H - whTop, 10)), pinMat); stem.position.set(z.x, whTop + (PIN_H - whTop) / 2, z.z); stem.castShadow = true; scene.add(stem);
      // свет: рассеянный «небесный» + мягкое солнце слева сверху (одни и те же на все кварталы — карта теней одна)
      if (!hemi) {
        hemi = new T.HemisphereLight(0xffffff, TH.gnd, TH.hemi);
        sun = new T.DirectionalLight(0xffffff, TH.sun); sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 9; sun.shadow.blurSamples = 16; sun.shadow.bias = -0.0004;
      }
      hemi.groundColor.set(TH.gnd); hemi.intensity = TH.hemi; sun.intensity = TH.sun;
      sun.position.set(-S * 0.9, S * 1.3, S * 0.35);
      var sc = sun.shadow.camera; sc.left = -S * 1.6; sc.right = S * 1.6; sc.top = S * 1.6; sc.bottom = -S * 1.6; sc.near = 1; sc.far = S * 5; sc.updateProjectionMatrix();
      scene.add(hemi); scene.add(sun);
      renderer.shadowMap.needsUpdate = true;   // тени нового квартала — на ближайшем кадре
      var s = size(); cam = new T.PerspectiveCamera(22, s[0] / s[1], 1, S * 20);
      resize();
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
      has: function (id) { return AS.CLAY_IDS.indexOf(id) >= 0; },
      // загрузить данные объекта (без показа); null — данных нет
      load: function (id) {
        if (AS.CLAY_IDS.indexOf(id) < 0) return Promise.resolve(null);
        var p = cache[id] || (cache[id] = fetch('data/clay/' + id + '.json?v=20261022b').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
        return p.then(function (d) { if (d && d !== D) { D = d; idNow = id; build(); } return d; });
      },
      render: function (now) { if (!scene) return; place(now); renderer.render(scene, cam); },
      // экранные точки (px внутри кадра): верх метки склада, кольцо жилья (walk) или место подписи «жильё» на дороге (drive)
      points: function () {
        if (!scene || !pin) return null;
        return { wh: toPx(pin.position), host: hostAt ? toPx(hostAt) : null, away: awayAt ? toPx(awayAt) : null };
      },
      pointer: function (nx, ny) { tx = nx; ty = ny; },
      bleed: bleed,   // поля холста за кадром w × h, px: { x, t, b } — панель ставит по ним слой
      resize: resize,   // resize(w, h) — размер кадра
      setTheme: function (t) { themeName = t === 'light' ? 'light' : 'dark'; dropMats(); if (hemi) { hemi.dispose(); sun.dispose(); hemi = sun = null; } if (D) build(); }
    };
  };
})();
