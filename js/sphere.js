/* Альфа-Стафф · сфера объектов.
   Частицы и шейдеры перенесены из оранжевой версии первого экрана без изменений внешнего вида.
   Добавлено: у каждого склада своя точка на сфере, поворот сферы к выбранному складу,
   метка-кольцо на точке и карточка, привязанная к точке выноской. */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;

  var VERTEX = [
    'attribute vec3 a_instancePos;',
    'attribute float a_highlight;',
    'uniform float u_time;',
    'uniform float u_highlight_scale;',
    'uniform float u_noise_scale;',
    'uniform float u_noise_speed;',
    'uniform vec3 u_hover_position;',
    'varying vec2 v_uv;',
    'varying float v_highlight;',
    'varying float v_noise;',
    'varying float v_reference_colour_mix;',
    'varying float v_scale;',
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);',
    '  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_); vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy;',
    '  vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 g0=vec3(a0.xy,h.x); vec3 g1=vec3(a0.zw,h.y); vec3 g2=vec3(a1.xy,h.z); vec3 g3=vec3(a1.zw,h.w);',
    '  vec4 norm=taylorInvSqrt(vec4(dot(g0,g0),dot(g1,g1),dot(g2,g2),dot(g3,g3)));',
    '  g0*=norm.x; g1*=norm.y; g2*=norm.z; g3*=norm.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(g0,x0),dot(g1,x1),dot(g2,x2),dot(g3,x3)));',
    '}',
    'void main(){',
    '  v_uv=uv;',
    '  vec4 cvp=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);',
    '  v_reference_colour_mix=smoothstep(-0.3,2.1,cvp.x);',
    '  v_highlight=a_highlight;',
    '  vec3 p=a_instancePos*u_noise_scale+u_time*u_noise_speed;',
    '  float n=snoise(p)*0.5+0.5;',
    '  v_noise=smoothstep(0.35,1.0,n);',
    '  float dist=distance(a_instancePos,u_hover_position);',
    '  v_scale=1.0+(u_highlight_scale*v_noise*a_highlight);',
    '  float hover=mix(0.0,0.25,clamp(1.0-dist,0.0,1.0));',
    '  float noise=mix(-0.1,0.25,v_noise);',
    '  vec3 transformed=position;',
    '  transformed.xy*=(v_scale+(hover+noise));',
    '  gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(transformed,1.0);',
    '}'
  ].join('\n');

  var FRAGMENT = [
    'varying float v_highlight;',
    'varying vec2 v_uv;',
    'varying float v_noise;',
    'varying float v_reference_colour_mix;',
    'varying float v_scale;',
    'uniform vec3 u_color;',
    'uniform vec3 u_reference_accent;',
    'uniform float u_reference_palette;',
    'uniform float u_radius;',
    'uniform float u_thickness;',
    'uniform float u_highlight_intensity;',
    'float circleSDF(in vec2 v){ v-=0.5; return length(v)*2.0; }',
    '#if defined(GL_OES_standard_derivatives)',
    '#extension GL_OES_standard_derivatives : enable',
    '#endif',
    'float aastep(float threshold,float value){',
    '#if !defined(GL_ES) || __VERSION__ >= 300 || defined(GL_OES_standard_derivatives)',
    '  float afwidth=0.7*length(vec2(dFdx(value),dFdy(value)));',
    '  return smoothstep(threshold-afwidth,threshold+afwidth,value);',
    '#else',
    '  return step(threshold,value);',
    '#endif',
    '}',
    'float stroke(float x,float size,float w){ float d=aastep(size,x+w*0.5)-aastep(size,x-w*0.5); return clamp(d,0.0,1.0); }',
    'float fill(float x,float size){ return 1.0-aastep(size,x); }',
    'void main(){',
    '  vec3 effective_color=u_color.rgb;',
    '  vec3 reference_color=mix(u_color.rgb,u_reference_accent.rgb,v_reference_colour_mix);',
    '  effective_color=mix(effective_color,reference_color,u_reference_palette);',
    '  float circle=circleSDF(v_uv);',
    '  float outline=stroke(circle,u_radius,u_thickness);',
    '  vec4 outline_color=vec4(effective_color,outline);',
    '  vec3 glow_target=mix(vec3(0.78,1.0,0.9),reference_color,u_reference_palette);',
    '  vec3 glow_color=mix(effective_color,glow_target,0.16);',
    '  vec4 background=vec4(glow_color,((1.0-circle)*v_noise)*u_highlight_intensity);',
    '  float solid=fill(circle,(u_radius)*(1.0/v_scale));',
    '  vec4 solid_color=background+vec4(effective_color,solid);',
    '  float hl=max(v_highlight,0.0);',
    '  vec3 color=mix(outline_color.rgb,solid_color.rgb,hl);',
    '  float alpha=mix(outline_color.a,solid_color.a,hl);',
    '  gl_FragColor=vec4(color,alpha);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  var COUNT = 2200, RADIUS = 3, PARTICLE = 0.125, HL_CHANCE = 0.075;
  var FAR = new THREE.Vector3(1e6, 1e6, 1e6);
  var Y_AXIS = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0);
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fib(i, n) {
    var golden = Math.PI * (3 - Math.sqrt(5));
    var y = 1 - ((i + 0.5) * 2) / n;
    var r = Math.sqrt(Math.max(0, 1 - y * y));
    var t = golden * i;
    return new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r).normalize();
  }

  // детерминированный «рандом», чтобы точки складов не прыгали между загрузками
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function siteK() { return (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16; }

  function nbsp(s) { return String(s).replace(/ /g, ' '); }

  function Sphere(root, opts) {
    this.root = root;
    this.opts = opts || {};
    this.mode = this.opts.mode || 'hero';
    this.objects = this.opts.objects || [];
    this.wrap = root.querySelector('.sphere-wrap');
    this.canvas = root.querySelector('.sphere-canvas');
    this.card = root.querySelector('.sphere-card');
    this.leader = root.querySelector('.sphere-leader');
    this.leaderLine = this.leader ? this.leader.querySelector('path') : null;
    this.state = { inside: false, ndc: new THREE.Vector2(-10, -10), w: 1, h: 1, visible: true };
    this.controls = { dragging: false, pid: null, lx: 0, ly: 0, vx: 0, vy: 0, autoSpeed: 0.000162, autoTarget: 0.000162 };
    this.prompt = { visible: false, mode: 'manual', order: [], cursor: 0, typeTimer: 0, typeToken: 0, timer: 0, detailsTimer: 0, pointLocal: null, index: -1 };
    this.focusAnim = null;
    this.init();
  }

  Sphere.prototype.init = function () {
    var self = this;
    var renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    this.camera.position.set(0, 0, 6);
    this.raycaster = new THREE.Raycaster();

    var globe = this.globe = new THREE.Group();
    this.scene.add(globe);

    var sGeo = new THREE.SphereGeometry(RADIUS, 64, 32);
    this.hitSphere = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ opacity: 0, transparent: true, depthWrite: false }));
    globe.add(this.hitSphere);

    var geo = new THREE.PlaneGeometry(PARTICLE, PARTICLE);
    var mat = this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        u_color: { value: new THREE.Color(this.opts.color || '#ff4100') },
        u_reference_accent: { value: new THREE.Color(this.opts.accent || '#ff414f') },
        u_reference_palette: { value: 1 },
        u_radius: { value: 0.8 }, u_thickness: { value: 0.1 },
        u_time: { value: 0 },
        u_hover_position: { value: FAR.clone() },
        u_highlight_intensity: { value: 0.7 },
        u_highlight_scale: { value: 4 },
        u_noise_scale: { value: 0.5 }, u_noise_speed: { value: 0.2 },
      },
    });
    var mesh = this.particles = new THREE.InstancedMesh(geo, mat, COUNT);
    var pos = new Float32Array(COUNT * 3), hl = new Float32Array(COUNT);
    var m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1), q = new THREE.Quaternion();
    var rnd = mulberry(this.opts.seed || 20150101);
    this.dirs = [];
    for (var i = 0; i < COUNT; i++) {
      var dir = fib(i, COUNT), p = dir.clone().multiplyScalar(RADIUS);
      this.dirs.push(dir);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      hl[i] = rnd() < HL_CHANCE ? 1 : 0;
      q.setFromUnitVectors(up, dir);
      m4.compose(p, q, one);
      mesh.setMatrixAt(i, m4);
    }
    // точки складов: равномерно по широтам, без полюсов
    this.objectIndex = [];
    var n = this.objects.length;
    for (var k = 0; k < n; k++) {
      var idx = Math.round(COUNT * (0.16 + 0.68 * (k + 0.5) / n));
      hl[idx] = 1;
      this.objectIndex.push(idx);
    }
    this.highlightIdx = [];
    for (var h = 0; h < COUNT; h++) if (hl[h] > 0.5) this.highlightIdx.push(h);
    geo.setAttribute('a_instancePos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('a_highlight', new THREE.InstancedBufferAttribute(hl, 1));
    mesh.instanceMatrix.needsUpdate = true;
    globe.add(mesh);
    this.hlAttr = geo.getAttribute('a_highlight');

    // стартовый наклон
    globe.quaternion.setFromEuler(new THREE.Euler(0.32, -0.6, 0));

    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(this.wrap);
    this.resize();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { self.state.visible = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(this.root);
    }
    this.bindEvents();
    this.last = 0;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);

    if (this.mode === 'hero') this.queueAutoplay(1200);
  };

  Sphere.prototype.resize = function () {
    this.state.w = this.wrap.offsetWidth || 1;
    this.state.h = this.wrap.offsetHeight || 1;
    this.k = siteK();
    this.renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2));
    this.renderer.setSize(this.state.w, this.state.h, false);
    this.camera.aspect = this.state.w / this.state.h;
    this.camera.updateProjectionMatrix();
    this.updateClip();
    // карточка соразмерна сфере: ≈ половина диаметра, но не мельче 0.85 (читаемость)
    if (this.card) {
      var base = 21.25 * 16 * this.k;                       // ширина карточки при --card-k = 1
      var floor = this.k >= 1.15 ? 0.78 : 0.85;           // на больших экранах шрифт и так крупный
      var ck = window.innerWidth <= 900 ? 1 : Math.max(floor, Math.min(1, 0.5 * this.state.w / base));
      this.card.style.setProperty('--card-k', ck.toFixed(3));
    }
  };

  // видимая часть сферы (сцена обрезает обёртку) в координатах обёртки
  Sphere.prototype.updateClip = function () {
    var w = this.state.w, h = this.state.h, r = { x0: 0, y0: 0, x1: w, y1: h };
    var c = this.opts.clipRect ? this.opts.clipRect() : this.opts.clip ? this.opts.clip.getBoundingClientRect() : null;
    if (c) {
      var b = this.wrap.getBoundingClientRect();
      r.x0 = Math.max(0, c.left - b.left); r.y0 = Math.max(0, c.top - b.top);
      r.x1 = Math.min(w, c.right - b.left); r.y1 = Math.min(h, c.bottom - b.top);
    }
    this.clipRect = r;
  };

  /* ---------- поворот ---------- */
  Sphere.prototype.rotateWorld = function (axis, angle) {
    var q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    this.globe.quaternion.premultiply(q);
  };

  Sphere.prototype.targetQuatFor = function (localDir) {
    // точка смотрит на камеру, чуть выше центра; «север» сферы остаётся сверху
    var target = new THREE.Vector3(this.opts.focusX || 0, this.opts.focusY || 0.18, 1).normalize();
    var q = new THREE.Quaternion().setFromUnitVectors(localDir.clone().normalize(), target);
    var upAfter = Y_AXIS.clone().applyQuaternion(q);
    var proj = upAfter.clone().sub(target.clone().multiplyScalar(upAfter.dot(target)));
    var want = Y_AXIS.clone().sub(target.clone().multiplyScalar(Y_AXIS.dot(target)));
    if (proj.lengthSq() > 1e-6 && want.lengthSq() > 1e-6) {
      proj.normalize(); want.normalize();
      var ang = Math.acos(Math.max(-1, Math.min(1, proj.dot(want))));
      var cross = new THREE.Vector3().crossVectors(proj, want);
      if (cross.dot(target) < 0) ang = -ang;
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(target, ang * 0.85));
    }
    return q;
  };

  Sphere.prototype.focus = function (index, opts) {
    opts = opts || {};
    if (index < 0 || index >= this.objects.length) return;
    var pi = this.objectIndex[index];
    var dir = this.dirs[pi];
    var from = this.globe.quaternion.clone();
    var to = this.targetQuatFor(dir);
    this.prompt.index = index;
    this.prompt.pointLocal = dir.clone().multiplyScalar(RADIUS);
    this.controls.autoTarget = 0;
    this.controls.autoSpeed = 0;
    this.controls.vx = this.controls.vy = 0;
    var dur = reduceMotion || opts.instant ? 1 : 1300;
    this.focusAnim = { from: from, to: to, t0: performance.now(), dur: dur };
    this.hideCard(true);
    var self = this;
    clearTimeout(this.prompt.timer);
    this.prompt.timer = setTimeout(function () {
      self.renderCard(self.objects[index]);
      self.revealCard('focus');
    }, Math.min(dur * 0.7, 900));
  };

  /* ---------- карточка ---------- */
  Sphere.prototype.typeText = function (el, text) {
    var self = this, P = this.prompt;
    clearTimeout(P.typeTimer); P.typeToken++;
    var token = P.typeToken, chars = Array.from(String(text || '')), i = 0;
    if (reduceMotion) { el.textContent = text; return; }
    var step = Math.max(14, Math.floor(1000 / Math.max(1, chars.length)));
    el.textContent = '|';
    (function tick() {
      if (token !== P.typeToken) return;
      i++;
      if (i >= chars.length) { el.textContent = text; return; }
      el.textContent = chars.slice(0, i).join('') + '|';
      P.typeTimer = setTimeout(tick, step);
    })();
  };

  Sphere.prototype.renderCard = function (o) {
    if (!o || !this.card) return;
    var q = function (s) { return this.card.querySelector(s); }.bind(this);
    this.typeText(q('[data-f="name"]'), o.name);
    q('[data-f="location"]').textContent = o.location;
    q('[data-f="region"]').textContent = o.region;
    var rateEl = q('[data-f="rate"]');
    if (o.rateLines) rateEl.innerHTML = o.rateLines.map(function (l) { return '<span class="sc-rate-line">' + l.replace(/^([МЖ]) /, '<i>$1</i> ') + '</span>'; }).join('');
    else rateEl.textContent = nbsp(o.rateCard || (o.rate + ' ₽'));
    q('[data-f="shift"]').textContent = o.shift;
    q('[data-f="count"]').textContent = String(o.jobs.length);
    q('[data-f="meals"]').textContent = o.meals.join(', ');
    q('[data-f="jobs"]').textContent = o.jobs.join(' · ');
    q('[data-f="hostel"]').textContent = o.hostel;
  };

  // Последовательность как у референса: шапка появляется белой и печатает название (~1 с),
  // затем персиковая с обходящей обводкой (1 с), затем заливка оранжевым и подробности.
  var RING_AT = 1000, FILL_AT = 2100;
  Sphere.prototype.revealCard = function (mode) {
    var c = this.card, P = this.prompt;
    if (!c) return;
    c.classList.toggle('is-auto', mode === 'autoplay');
    c.classList.remove('is-details', 'is-ring', 'is-filled');
    void c.offsetWidth;
    c.classList.add('is-visible');
    c.setAttribute('aria-hidden', 'false');
    clearTimeout(P.detailsTimer); clearTimeout(P.ringTimer);
    // пунктир к точке появляется вместе с белым окном подробностей, а не раньше
    var leader = this.leader;
    if (leader) leader.classList.remove('is-on');
    if (reduceMotion) {
      c.classList.add('is-filled', 'is-details');
      if (leader) leader.classList.add('is-on');
    } else {
      P.ringTimer = setTimeout(function () { if (P.visible) c.classList.add('is-ring'); }, RING_AT);
      P.detailsTimer = setTimeout(function () { if (P.visible) { c.classList.add('is-filled', 'is-details'); c.classList.remove('is-ring'); if (leader) leader.classList.add('is-on'); } }, FILL_AT);
    }
    P.visible = true; P.mode = mode;
    this.syncSpeed();
    if (this.opts.onShow) this.opts.onShow(P.index);
  };

  Sphere.prototype.hideCard = function (keepPoint) {
    var c = this.card, P = this.prompt;
    if (!c) return;
    c.classList.remove('is-visible', 'is-details', 'is-auto', 'is-ring', 'is-filled');
    c.setAttribute('aria-hidden', 'true');
    clearTimeout(P.detailsTimer); clearTimeout(P.ringTimer);
    clearTimeout(P.typeTimer); P.typeToken++;
    P.visible = false;
    if (this.leader) this.leader.classList.remove('is-on');
    if (!keepPoint) {
      P.pointLocal = null;
    }
    this.syncSpeed();
  };

  Sphere.prototype.syncSpeed = function () {
    if (this.mode === 'map' && this.prompt.pointLocal) { this.controls.autoTarget = 0; return; }
    if (this.prompt.visible) { this.controls.autoTarget = 0; return; }
    this.controls.autoTarget = this.state.inside ? 0.0001 : 0.000162;
  };

  // экранные координаты точки сферы (локальные координаты группы)
  Sphere.prototype.project = function (local) {
    var w = local.clone().applyQuaternion(this.globe.quaternion);
    var p = w.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.state.w, y: (-p.y * 0.5 + 0.5) * this.state.h, front: w.z > 0.2 };
  };

  Sphere.prototype.placeCard = function () {
    var P = this.prompt;
    if (!P.pointLocal || !this.card) return;
    var pt = this.project(P.pointLocal), C = this.clipRect || { x0: 0, y0: 0, x1: this.state.w, y1: this.state.h }, k = this.k || 1, m = 12 * k;
    P.screen = pt;
    var cw = this.card.offsetWidth, ch = this.card.offsetHeight, cx, cy, ex, ey, d;
    if (this.mode === 'map' && (C.x1 - C.x0) < cw * 1.75) {
      // узкая сцена (телефон): карточка внизу, выноска вертикальная
      cx = Math.max(C.x0 + m, Math.min(C.x1 - cw - m, (C.x0 + C.x1) / 2 - cw / 2));
      cy = C.y1 - ch - m;
      ex = Math.max(cx + 22 * k, Math.min(cx + cw - 22 * k, pt.x));
      ey = cy;
      d = 'M' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ' L' + ex.toFixed(1) + ' ' + ey.toFixed(1);
    } else if (this.mode === 'map') {
      // карточка справа (или слева) от точки, выноска — ломаная
      var dx = (this.opts.cardDX != null ? this.opts.cardDX : 46) * k, dy = (this.opts.cardDY != null ? this.opts.cardDY : -40) * k;
      var side = pt.x + dx + cw > C.x1 - m ? -1 : 1;
      cx = side > 0 ? pt.x + dx : pt.x - dx - cw;
      cx = Math.max(C.x0 + m, Math.min(C.x1 - cw - m, cx));
      cy = Math.max(C.y0 + m, Math.min(C.y1 - ch - m, pt.y + dy - ch * 0.5));
      ex = side > 0 ? cx : cx + cw;
      ey = Math.max(cy + 18 * k, Math.min(cy + ch - 18 * k, pt.y + dy * 0.2));
      var mx = pt.x + (ex - pt.x) * 0.55;
      d = 'M' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ' L' + mx.toFixed(1) + ' ' + ey.toFixed(1) + ' L' + ex.toFixed(1) + ' ' + ey.toFixed(1);
    } else {
      // карточка над точкой; если не помещается — под ней
      var gap = 26 * k;
      cx = Math.max(C.x0 + m, Math.min(C.x1 - cw - m, pt.x - cw / 2));
      cy = pt.y - ch - gap;
      var below = cy < C.y0 + m;
      if (below) cy = Math.min(C.y1 - ch - m, pt.y + gap);
      ex = Math.max(cx + 22 * k, Math.min(cx + cw - 22 * k, pt.x));
      ey = below ? cy : cy + ch;
      d = 'M' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ' L' + ex.toFixed(1) + ' ' + ey.toFixed(1);
    }
    this.card.style.transform = 'translate(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px)';
    if (this.leaderLine) this.leaderLine.setAttribute('d', d);
  };

  /* ---------- hero: автопоказ и наведение ---------- */
  Sphere.prototype.nextObject = function () {
    var P = this.prompt, n = this.objects.length;
    if (!P.order.length || P.cursor >= P.order.length) {
      P.order = Array.from({ length: n }, function (_, i) { return i; });
      for (var i = n - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = P.order[i]; P.order[i] = P.order[j]; P.order[j] = t; }
      P.cursor = 0;
    }
    return P.order[P.cursor++];
  };

  // видимая подсвеченная точка ближе к центру — карточка «садится» на реальную точку сферы
  Sphere.prototype.pickFrontPoint = function () {
    // точка должна быть видна в сцене, а над ней — оставаться место под карточку
    var C = this.clipRect || { x0: 0, y0: 0, x1: this.state.w, y1: this.state.h };
    var cw = this.card ? this.card.offsetWidth : 340, ch = this.card ? this.card.offsetHeight : 180;
    var best = [], fallback = [], q = this.globe.quaternion;
    for (var i = 0; i < this.highlightIdx.length; i++) {
      var idx = this.highlightIdx[i], local = this.dirs[idx].clone().multiplyScalar(RADIUS);
      var d = this.dirs[idx].clone().applyQuaternion(q);
      if (d.z < 0.55) continue;
      var pt = this.project(local);
      var okX = pt.x > C.x0 + cw * 0.3 && pt.x < C.x1 - cw * 0.3;
      var okY = pt.y > C.y0 + ch + 60 && pt.y < C.y1 - 90;
      if (okX && okY) best.push(local); else if (d.z > 0.75) fallback.push(local);
    }
    var pool = best.length ? best : fallback.length ? fallback : [this.dirs[this.highlightIdx[0]].clone().multiplyScalar(RADIUS)];
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // пауза автопоказа (кнопка в панели «География объектов»): карточка текущего объекта остаётся, сфера стоит;
  // автопоказ не возобновляется ни от мыши, ни от стрелок — только повторным нажатием
  Sphere.prototype.setPaused = function (on, index) {
    var P = this.prompt;
    this.paused = !!on;
    if (this.mode !== 'hero') return;
    if (!on) { this.queueAutoplay(1500); return; }
    if (P.mode !== 'autoplay') return;
    clearTimeout(P.timer);
    if (P.visible) { P.mode = 'focus'; if (this.card) this.card.classList.remove('is-auto'); }
    else if (index != null && index >= 0) this.focus(index);   // между карточками — показываем объект, что на карте
  };

  Sphere.prototype.queueAutoplay = function (delay) {
    var self = this, P = this.prompt;
    if (this.mode !== 'hero' || this.paused || this.state.inside || this.controls.dragging) return;
    clearTimeout(P.timer);
    P.mode = 'autoplay';
    P.timer = setTimeout(function () {
      if (self.state.inside || self.controls.dragging || P.mode !== 'autoplay') return;
      if (P.visible) { self.hideCard(); self.queueAutoplay(260); return; }
      var idx = self.nextObject();
      P.index = idx;
      P.pointLocal = self.pickFrontPoint();
      self.renderCard(self.objects[idx]);
      self.placeCard();
      self.revealCard('autoplay');
      self.queueAutoplay(FILL_AT + 4200);
    }, delay == null ? 4000 : delay);
  };

  Sphere.prototype.updateHover = function () {
    var u = this.material.uniforms;
    if (!this.state.inside) { u.u_hover_position.value.copy(FAR); return; }
    this.raycaster.setFromCamera(this.state.ndc, this.camera);
    var hit = this.raycaster.intersectObject(this.hitSphere, false)[0];
    if (hit) u.u_hover_position.value.copy(this.globe.worldToLocal(hit.point.clone()));
    else u.u_hover_position.value.copy(FAR);
    if (this.mode !== 'hero') return;
    if (this.prompt.visible && this.prompt.mode === 'manual' && !this.controls.dragging && !this.overCard && this.prompt.screen) {
      var px = (this.state.ndc.x + 1) / 2 * this.state.w, py = (1 - this.state.ndc.y) / 2 * this.state.h;
      if (Math.hypot(px - this.prompt.screen.x, py - this.prompt.screen.y) > 70) this.hideCard();
    }
    if (this.controls.dragging || (this.prompt.visible && this.prompt.mode === 'manual')) { this.wrap.style.cursor = this.controls.dragging ? 'grabbing' : 'pointer'; return; }
    var hits = this.raycaster.intersectObject(this.particles, false);
    var found = null;
    for (var i = 0; i < hits.length; i++) {
      var id = hits[i].instanceId;
      if (id != null && this.hlAttr.getX(id) > 0.5) { found = id; break; }
    }
    if (found != null) {
      this.wrap.style.cursor = 'pointer';
      clearTimeout(this.prompt.timer);
      var idx = this.nextObject();
      this.prompt.index = idx;
      this.prompt.pointLocal = this.dirs[found].clone().multiplyScalar(RADIUS);
      this.renderCard(this.objects[idx]);
      this.placeCard();
      this.revealCard('manual');
    } else {
      this.wrap.style.cursor = 'grab';
    }
  };

  /* ---------- события ---------- */
  Sphere.prototype.bindEvents = function () {
    var self = this, C = this.controls, S = this.state, wrap = this.wrap;
    function setNDC(e) {
      var r = wrap.getBoundingClientRect();
      S.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      S.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    }
    wrap.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.sphere-card')) return;
      C.dragging = true; C.pid = e.pointerId; C.lx = e.clientX; C.ly = e.clientY; C.vx = C.vy = 0;
      self.focusAnim = null;
      if (self.mode === 'hero') { clearTimeout(self.prompt.timer); if (self.prompt.mode === 'autoplay') self.hideCard(); }
      if (self.mode === 'map') { self.hideCard(true); if (self.opts.onUserDrag) self.opts.onUserDrag(); }
      wrap.style.cursor = 'grabbing';
    });
    window.addEventListener('pointermove', function (e) {
      if (S.inside) setNDC(e);
      if (!C.dragging || (C.pid != null && e.pointerId !== C.pid)) return;
      var dx = e.clientX - C.lx, dy = e.clientY - C.ly;
      C.lx = e.clientX; C.ly = e.clientY;
      self.rotateWorld(Y_AXIS, dx * 0.0025);
      self.rotateWorld(X_AXIS, dy * 0.0025);
      C.vx = dx * 0.0025; C.vy = dy * 0.0025;
    }, { passive: true });
    window.addEventListener('pointerup', function () {
      if (!C.dragging) return;
      C.dragging = false; C.pid = null;
      wrap.style.cursor = 'grab';
      if (self.mode === 'map' && self.opts.onUserRelease) self.opts.onUserRelease();
    });
    wrap.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'touch') return;
      setNDC(e); S.inside = true;
      if (self.mode === 'hero') {
        clearTimeout(self.prompt.timer);
        if (self.prompt.mode === 'autoplay') {
          // курсор вошёл прямо на карточку — оставляем её, чтобы по ней можно было кликнуть
          var r = self.card ? self.card.getBoundingClientRect() : null;
          var onCard = r && self.prompt.visible && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (onCard) { self.prompt.mode = 'manual'; self.overCard = true; self.card.classList.remove('is-auto'); }
          else self.hideCard();
        }
      }
      self.syncSpeed();
    });
    wrap.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'touch') return;
      S.inside = false;
      self.material.uniforms.u_hover_position.value.copy(FAR);
      if (self.mode === 'hero') {
        if (self.prompt.visible && self.prompt.mode === 'manual') self.hideCard();
        self.queueAutoplay(900);
      }
      self.syncSpeed();
    });
    if (this.card) {
      if (this.opts.onCardClick) {
        this.card.classList.add('is-link');
        this.card.addEventListener('click', function () { if (self.prompt.index >= 0) self.opts.onCardClick(self.prompt.index); });
      }
      this.card.addEventListener('pointerenter', function () { self.overCard = true; });
      this.card.addEventListener('pointerleave', function () { self.overCard = false; });
    }
    window.addEventListener('resize', function () { self.updateClip(); });
    wrap.addEventListener('touchend', function () {
      if (self.mode === 'hero') { self.hideCard(); self.queueAutoplay(900); }
    }, { passive: true });
    document.addEventListener('visibilitychange', function () { self.last = 0; });
  };

  Sphere.prototype.loop = function (now) {
    requestAnimationFrame(this.loop);
    if (!this.state.visible || document.hidden) { this.last = 0; return; }
    var dt = this.last ? Math.min(64, now - this.last) : 16.7;
    this.last = now;
    var C = this.controls;
    this.material.uniforms.u_time.value = now * 0.001;
    C.autoSpeed += (C.autoTarget - C.autoSpeed) * 0.06;
    if (this.focusAnim) {
      var f = this.focusAnim, t = Math.min(1, (now - f.t0) / f.dur);
      var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.globe.quaternion.copy(f.from).slerp(f.to, e);
      if (t >= 1) this.focusAnim = null;
    } else if (!C.dragging) {
      if (Math.abs(C.vx) > 1e-5) this.rotateWorld(Y_AXIS, C.vx);
      if (Math.abs(C.vy) > 1e-5) this.rotateWorld(X_AXIS, C.vy);
      C.vx *= 0.9; C.vy *= 0.9;
      if (!reduceMotion && C.autoSpeed > 1e-7) this.rotateWorld(Y_AXIS, C.autoSpeed * dt);
    }
    this.updateHover();
    if (this.prompt.pointLocal) this.placeCard();
    this.renderer.render(this.scene, this.camera);
  };

  window.AS = window.AS || {};
  AS.Sphere = Sphere;
})();
