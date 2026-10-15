/* Прототип «глиняной» карты объекта: здания OSM выдавлены в 3D, один матовый материал, мягкий свет и тени,
   затенение у подножия зданий нарисовано на земле; маршрут жильё → склад — гладкая трубка; склад — цветом дизайна.
   Данные: proto-clay-data.json (собран из OpenStreetMap; координаты — метры от центра кадра, x — восток, y — север). */
(function () {
  'use strict';
  var T = window.THREE;
  var ACC = '#ff5a1f';
  var THEMES = {
    dark: { bg: '#161616', ground: '#181818', block: '#2f2f2f', host: '#d8d8d8', green: '#1b1e1b', water: '#151a1f', road: '#1f1f1f', sky: 0xffffff, gnd: 0x000000, hemi: 0.55, sun: 2.4, route: '#e6e6e6', ao: 'rgba(0,0,0,.75)' },
    light: { bg: '#ece7de', ground: '#e8e2d7', block: '#efe9df', host: '#ffffff', green: '#e0ded0', water: '#dcdfdf', road: '#efeae1', sky: 0xffffff, gnd: 0xa89c88, hemi: 0.8, sun: 1.9, route: '#a39b8e', ao: 'rgba(80,58,28,.42)' }
  };

  fetch('proto-clay-data.json?v=' + Date.now()).then(function (r) { return r.json(); }).then(function (D) {
    document.querySelectorAll('[data-info]').forEach(function (el) {
      el.innerHTML = '<div class="info__route"><b><span class="o"></span>' + D.from + '</b><i></i><b><span class="pin"></span>' + D.to + '</b></div>' +
        D.rows.map(function (r) { return '<div class="row"><span>' + r[0] + '</span><span>' + r[1] + '</span></div>'; }).join('');
    });
    var scenes = [];
    document.querySelectorAll('[data-map]').forEach(function (cv) { scenes.push(build(cv, D, THEMES[cv.dataset.map])); });
    document.querySelectorAll('[data-acc]').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('[data-acc]').forEach(function (x) { x.classList.toggle('on', x === b); });
        ACC = b.dataset.acc; document.documentElement.style.setProperty('--accent', ACC);
        scenes.forEach(function (s) { s.setAccent(ACC); });
      });
    });
  });

  function build(cv, D, TH) {
    var W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    var renderer = new T.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.VSMShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    var scene = new T.Scene(); scene.background = new T.Color(TH.bg);
    var S = D.size, F = D.far || S * 2; // полсторона кадра и всей земли, м

    // ---------- земля: цвет, зелень, вода, дороги и мягкое затенение у подножия зданий (рисуем в текстуру) ----------
    var tex = document.createElement('canvas'), N = 2048; tex.width = tex.height = N;
    var g = tex.getContext('2d'), k = N / (2 * F), P = function (p) { return [N / 2 + p[0] * k, N / 2 - p[1] * k]; };
    g.fillStyle = TH.ground; g.fillRect(0, 0, N, N);
    function fillPoly(pts) { g.beginPath(); pts.forEach(function (p, i) { var q = P(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); }
    g.fillStyle = TH.green; D.green.forEach(fillPoly);
    g.fillStyle = TH.water; D.water.forEach(fillPoly);
    g.strokeStyle = TH.road; g.lineCap = g.lineJoin = 'round';
    D.roads.forEach(function (r) { g.lineWidth = r.w * k; g.beginPath(); r.p.forEach(function (p, i) { var q = P(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); });
    g.save(); g.filter = 'blur(' + Math.max(3, Math.round(5 * k)) + 'px)'; g.fillStyle = TH.ao;
    D.b.forEach(function (b) { fillPoly(b.p); }); g.restore();
    var gt = new T.CanvasTexture(tex); gt.colorSpace = T.SRGBColorSpace; gt.anisotropy = 8;
    var ground = new T.Mesh(new T.PlaneGeometry(2 * F, 2 * F), new T.MeshStandardMaterial({ map: gt, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // ---------- здания: выдавленные блоки со скруглёнными краями ----------
    var mat = new T.MeshStandardMaterial({ color: TH.block, roughness: 0.95 });
    var whMat = new T.MeshStandardMaterial({ color: ACC, roughness: 0.75 });
    var hostMat = new T.MeshStandardMaterial({ color: TH.host, roughness: 0.9 });   // дом, где живут, — светлее остальных
    D.b.forEach(function (b) {
      var sh = new T.Shape();
      b.p.forEach(function (p, i) { if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
      var h = Math.max(3, b.h), bev = Math.min(1.2, h * 0.15);
      var geo = new T.ExtrudeGeometry(sh, { depth: h - bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 2 });
      geo.rotateX(-Math.PI / 2);   // форма в плоскости x/y (y — север) → x/z, высота — вверх
      var m = new T.Mesh(geo, b.wh ? whMat : b.host ? hostMat : mat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    });

    // ---------- маршрут жильё → склад: гладкая трубка над землёй + точки на концах ----------
    var pts = D.route.map(function (p) { return new T.Vector3(p[0], 1.6, -p[1]); });
    var curve = new T.CatmullRomCurve3(pts, false, 'centripetal', 0.2);
    var routeMat = new T.MeshStandardMaterial({ color: TH.route, roughness: 0.6 });
    var tube = new T.Mesh(new T.TubeGeometry(curve, Math.max(60, pts.length * 8), 2.6, 12, false), routeMat);
    tube.castShadow = true; scene.add(tube);
    var a = pts[0], z = pts[pts.length - 1];
    var ring = new T.Mesh(new T.TorusGeometry(11, 2.8, 14, 44), routeMat); ring.rotation.x = -Math.PI / 2; ring.position.set(a.x, 2.6, a.z); ring.castShadow = true; scene.add(ring);
    var pinMat = new T.MeshStandardMaterial({ color: ACC, roughness: 0.5, emissive: ACC, emissiveIntensity: 0.15 });
    var whTop = Math.max.apply(null, D.b.filter(function (b) { return b.wh; }).map(function (b) { return b.h; }).concat([0]));
    // метка склада — шарик на ножке над крышей, как булавка на карте
    var PIN_H = whTop + 36;
    var pin = new T.Mesh(new T.SphereGeometry(10, 32, 20), pinMat); pin.position.set(z.x, PIN_H, z.z); pin.castShadow = true; scene.add(pin);
    var stem = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, PIN_H - whTop, 10), pinMat); stem.position.set(z.x, whTop + (PIN_H - whTop) / 2, z.z); stem.castShadow = true; scene.add(stem);

    // ---------- свет: рассеянный «небесный» + мягкое солнце слева сверху ----------
    scene.add(new T.HemisphereLight(TH.sky, TH.gnd, TH.hemi));
    var sun = new T.DirectionalLight(0xffffff, TH.sun);
    sun.position.set(-S * 0.9, S * 1.3, S * 0.35); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 9; sun.shadow.blurSamples = 16; sun.shadow.bias = -0.0004;
    var sc = sun.shadow.camera; sc.left = -S * 1.6; sc.right = S * 1.6; sc.top = S * 1.6; sc.bottom = -S * 1.6; sc.near = 1; sc.far = S * 5;
    scene.add(sun);

    // ---------- камера: почти сверху, лёгкий наклон; от курсора — едва заметный параллакс ----------
    var cam = new T.PerspectiveCamera(22, W / H, 1, S * 20);
    var tx = 0, ty = 0, mx = 0, my = 0, fit = D.fit || S * 0.95;
    function place() {
      var dist = fit / Math.tan(T.MathUtils.degToRad(11)) * 0.98, tilt = T.MathUtils.degToRad(38 + my * 3), yaw = -0.18 + mx * 0.06;
      cam.position.set(D.cx + Math.sin(yaw) * Math.sin(tilt) * dist, Math.cos(tilt) * dist, -D.cy + Math.cos(yaw) * Math.sin(tilt) * dist);
      cam.lookAt(D.cx, 0, -D.cy);
    }
    cv.addEventListener('pointermove', function (e) { var r = cv.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width * 2 - 1; ty = (e.clientY - r.top) / r.height * 2 - 1; });
    cv.addEventListener('pointerleave', function () { tx = ty = 0; });
    var t0 = performance.now();
    (function loop(now) {
      requestAnimationFrame(loop);
      mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
      pin.position.y = PIN_H + Math.sin((now - t0) / 600) * 2.5;
      place(); renderer.render(scene, cam);
    })(t0);
    return { setAccent: function (c) { whMat.color.set(c); pinMat.color.set(c); pinMat.emissive.set(c); } };
  }
})();
