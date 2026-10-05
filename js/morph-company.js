/* Альфа-Стафф · генеративная графика на canvas.
   Morph      — частицы перетекают из сцены в сцену (тёмные панели сплит-секций); сцена — короткая история
                с подписями и итоговым кадром.
   TextFill   — живая заливка первой строки заголовка (видна только внутри букв).
   GeoMap     — точечная карта объектов: Москва, Подмосковье, Владимир.
   Earth      — Земля из точек суши в подвале (маска Natural Earth).
   DotWave    — волна из точек на фоне манифеста. */
(function () {
  'use strict';
  window.AS = window.AS || {};
  var TAU = Math.PI * 2;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ACCENT = [196, 23, 24];

  function dpr() { return Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2); }
  // масштаб сайта (1rem / 16px): размеры точек и подписей растут вместе с вёрсткой
  var KS = 1, F_MONO = '"JetBrains Mono", monospace', F_DISPLAY = '"Wix Madefor Display", sans-serif';
  function updK() {
    var cs = getComputedStyle(document.documentElement);
    KS = (parseFloat(cs.fontSize) || 16) / 16;
    F_MONO = cs.getPropertyValue('--f-mono').trim() || F_MONO;
    F_DISPLAY = cs.getPropertyValue('--f-display').trim() || F_DISPLAY;
  }
  updK(); window.addEventListener('resize', updK);
  function rand(seed) {
    // mulberry32 с перемешанным сидом: соседние сиды дают независимые ряды
    var a = Math.imul((seed | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ 0xC2B2AE35;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function sprite(r, g, b, soft) {
    var c = document.createElement('canvas'), s = 64; c.width = c.height = s;
    var x = c.getContext('2d'), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (soft) {
      gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
      gr.addColorStop(0.18, 'rgba(' + r + ',' + g + ',' + b + ',.85)');
      gr.addColorStop(0.42, 'rgba(' + r + ',' + g + ',' + b + ',.22)');
      gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    } else {
      gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
      gr.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ',1)');
      gr.addColorStop(0.62, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    }
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    return c;
  }
  var SPR_W = sprite(255, 255, 255, false), SPR_A = sprite(ACCENT[0], ACCENT[1], ACCENT[2], true), SPR_AH = sprite(ACCENT[0], ACCENT[1], ACCENT[2], false);

  function onVisible(el, cb) {
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(function (es) { cb(es[0].isIntersecting); }, { rootMargin: '100px' }).observe(el);
  }

  /* ---------- фигуры: pos(i, n, t, box, out) ---------- */
  // box: {cx, cy, s, w, h}; out: {x, y, a (акцент 0..1), r (радиус), o (непрозрачность)}
  var SHAPES = {};

  /* ---------- сцены тёмных панелей ----------
     Каждая сцена — короткая история на 2–4 с от входа в шаг (st — секунды с начала шага) и понятный итоговый
     кадр с лёгким «дыханием» (t — общее время). Сцена занимает область над заголовком панели:
     b.x0..b.x1 × b.y0..b.y1 (её считает вёрстка). Подписи — моно-шрифтом прямо в рисунке (LABELS). */
  function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function prog(st, a, d) { return reduce ? 1 : ease((st - a) / d); }
  function dust(i, b, o, t) {
    var rr = rand(i * 53 + 9);
    o.x = b.x0 - b.W * 0.04 + rr() * b.W * 1.08; o.y = b.y0 + rr() * b.H; o.a = 0; o.r = 0.55; o.o = 0.045 + 0.025 * Math.sin(t * 0.7 + i);
  }
  function off(o, x, y) { o.x = x; o.y = y; o.o = 0; o.a = 0; o.r = 0.6; }
  // точка на отрезке
  function onSeg(o, ax, ay, bx, by, u) { o.x = ax + (bx - ax) * u; o.y = ay + (by - ay) * u; }
  // распределить индексы по частям: parts — доли, возвращает границы
  function cuts(n, parts) { var r = [0], s = 0; parts.forEach(function (p) { s += p; r.push(Math.round(n * s)); }); return r; }
  function cache(b, key, make) { return b[key] || (b[key] = make()); }

  var LABELS = {};
  function label(ctx, text, x, y, align, color, alpha, size, weight) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    ctx.font = (weight || 600) + ' ' + ((size || 11) * KS).toFixed(1) + 'px ' + F_MONO;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = color || 'rgba(255,255,255,.7)';
    // подпись не выходит за край панели: сдвигаем внутрь
    var tw = ctx.measureText(text).width, cw = ctx.canvas.clientWidth || 1e4, m = 12 * KS;
    var lx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    ctx.fillText(text, Math.max(m, Math.min(cw - m - tw, lx)), y);
  }
  var C_W = 'rgba(255,255,255,.72)', C_DIM = 'rgba(255,255,255,.42)', C_A = '#C41718';

  /* Аутстаффинг: ваш склад со стеллажами, внутри работают люди; от каждого — линия к узлу «Альфа-Стафф» */
  SHAPES.outstaff = function (i, n, t, b, o, st) {
    var L = cache(b, '_os', function () {
      var wx0 = b.x0 + b.W * 0.06, wx1 = b.x1 - b.W * 0.06, wy0 = b.y0 + b.H * 0.4, wy1 = b.y1, ridge = wy0 - b.H * 0.12;
      var nx = b.cx, ny = b.y0 + b.H * 0.05, racks = 6, inner = (wx1 - wx0), rw = inner * 0.045;
      var rx = [], k; for (k = 0; k < racks; k++) rx.push(wx0 + inner * (0.1 + k * 0.16));
      var people = [];
      var aisles = [0.17, 0.25, 0.41, 0.49, 0.65, 0.73, 0.89];
      for (k = 0; k < aisles.length; k++) { var rr = rand(k * 7 + 3); people.push([wx0 + inner * (aisles[k] - 0.01 + rr() * 0.02), wy0 + (wy1 - wy0) * (0.48 + rr() * 0.34)]); }
      return { wx0: wx0, wx1: wx1, wy0: wy0, wy1: wy1, ridge: ridge, nx: nx, ny: ny, rx: rx, rw: rw, people: people, cu: cuts(n, [0.16, 0.28, 0.025, 0.02, 0.24]) };
    });
    var c = L.cu, rr = rand(i * 29 + 5);
    if (i < c[1]) { // контур склада: стены, пол, двускатная крыша
      var u = (i - c[0]) / (c[1] - c[0]), per = [[L.wx0, L.wy1, L.wx0, L.wy0], [L.wx0, L.wy0, b.cx, L.ridge], [b.cx, L.ridge, L.wx1, L.wy0], [L.wx1, L.wy0, L.wx1, L.wy1], [L.wx1, L.wy1, L.wx0, L.wy1]];
      var sIdx = Math.min(4, Math.floor(u * 5)), sg = per[sIdx]; onSeg(o, sg[0], sg[1], sg[2], sg[3], u * 5 - sIdx);
      o.a = 0; o.r = 1; o.o = 0.5;
    } else if (i < c[2]) { // стеллажи: две стойки и полки
      var j = i - c[1], m = c[2] - c[1], rack = j % L.rx.length, q = rr();
      var top = L.wy0 + (L.wy1 - L.wy0) * 0.14, x0 = L.rx[rack], x1 = x0 + L.rw;
      if (q < 0.55) { o.x = q < 0.27 ? x0 : x1; o.y = lerp(top, L.wy1 - 2, rr()); }
      else { var shelf = Math.floor(rr() * 5); o.x = lerp(x0, x1, rr()); o.y = lerp(top, L.wy1 - 2, shelf / 4); }
      o.a = 0; o.r = 0.8; o.o = 0.3;
    } else if (i < c[3]) { // люди: голова и три точки тела
      var j2 = i - c[2], p = j2 % L.people.length, seg = Math.floor(j2 / L.people.length) % 4, P = L.people[p];
      var show = prog(st, 0.8 + p * 0.12, 0.35), bob = Math.sin(t * 2 + p) * 1.2;
      o.x = P[0]; o.y = P[1] - seg * 5.5 * KS + bob - (1 - show) * 10;
      o.a = seg === 3 ? 1 : 0.7; o.r = seg === 3 ? 2.3 : 1.35; o.o = show;
    } else if (i < c[4]) { // узел «Альфа-Стафф»: кольцо и центр
      var j3 = i - c[3], m3 = c[4] - c[3], show2 = prog(st, 1.4, 0.4), ang = j3 / m3 * TAU + t * 0.4;
      var R = (j3 < 3 ? 0 : 9 * KS) * (0.92 + Math.sin(t * 1.6) * 0.08);
      o.x = L.nx + Math.cos(ang) * R; o.y = L.ny + Math.sin(ang) * R; o.a = 1; o.r = j3 < 3 ? 2.6 : 1.1; o.o = show2;
    } else if (i < c[5]) { // линии от людей к узлу; по ним бегут импульсы
      var j4 = i - c[4], m4 = c[5] - c[4], ln = j4 % L.people.length, u2 = Math.floor(j4 / L.people.length) / Math.floor(m4 / L.people.length);
      var P2 = L.people[ln], pr = prog(st, 1.7 + ln * 0.06, 1.1);
      onSeg(o, P2[0], P2[1] - 18 * KS, L.nx, L.ny, u2);
      var pulse = ((t * 0.45 + ln * 0.37) % 1), near = Math.abs(u2 - pulse) < 0.035 && st > 3;
      o.a = near ? 1 : 0; o.r = near ? 1.6 : 0.7; o.o = u2 <= pr ? (near ? 1 : 0.32) : 0;
    } else dust(i, b, o, t);
  };
  LABELS.outstaff = function (ctx, b, st) {
    var L = b._os; if (!L) return;
    label(ctx, 'ВАШ СКЛАД', L.wx0, L.wy0 - 10 * KS, 'left', C_W, prog(st, 0.4, 0.5));
    label(ctx, 'АЛЬФА-СТАФФ', L.nx + 18 * KS, L.ny + 4 * KS, 'left', C_A, prog(st, 1.5, 0.5), 12, 700);
    label(ctx, 'ДОКУМЕНТЫ · ВЫПЛАТЫ · ЗАМЕНЫ', L.nx + 18 * KS, L.ny + 18 * KS, 'left', C_DIM, prog(st, 2.2, 0.6), 10);
  };

  /* Рекрутинг: воронка этапов — много откликов сверху, вниз проходят те, кто вышел на смену */
  var FUN_STAGES = ['ОТКЛИК', 'ОТБОР', 'ДОКУМЕНТЫ', 'ВЫХОД'];
  SHAPES.recruit = function (i, n, t, b, o, st) {
    var L = cache(b, '_fn', function () {
      var cx = b.x0 + b.W * (b.W < 520 ? 0.4 : 0.42), y0 = b.y0 + b.H * 0.03, y1 = b.y0 + b.H * 0.76;
      return { cx: cx, y0: y0, y1: y1, hw0: b.W * (b.W < 520 ? 0.34 : 0.33), hw1: b.W * 0.055, cu: cuts(n, [0.15, 0.56, 0.014]) };
    });
    var c = L.cu, rr = rand(i * 41 + 3);
    function hw(v) { return lerp(L.hw0, L.hw1, v); }
    function yv(v) { return lerp(L.y0, L.y1, v); }
    if (i < c[1]) { // контур: края и границы этапов
      var j = i - c[0], m = c[1] - c[0], part = j % 3, u = rr();
      if (part < 2) { var side = part === 0 ? -1 : 1; o.x = L.cx + side * hw(u); o.y = yv(u); o.o = 0.45; }
      else { var lv = Math.floor(rr() * 5) / 4, sx = rr() * 2 - 1; o.x = L.cx + sx * hw(lv); o.y = yv(lv); o.o = lv === 0 || lv === 1 ? 0.35 : 0.2; }
      o.a = 0; o.r = 0.85;
    } else if (i < c[2]) { // кандидаты: падают по этапам, чем ниже — тем меньше
      var j2 = i - c[1], m2 = c[2] - c[1], f = j2 / m2;
      var stage = f < 0.5 ? 0 : f < 0.76 ? 1 : f < 0.91 ? 2 : 3;
      var go = st > 0.5 + stage * 0.55, s = go ? stage : 0;
      var v = (s + 0.12 + rr() * 0.76) / 4, sx2 = (rr() * 2 - 1) * 0.86;
      o.x = L.cx + sx2 * hw(v) + Math.sin(t * 1.1 + i) * 0.8; o.y = yv(v) + Math.cos(t + i) * 0.8;
      var lit = stage === 3 && go;
      o.a = lit ? 0.6 : 0; o.r = lit ? 1.3 : 0.95; o.o = lit ? 0.9 : 0.55 - s * 0.06;
    } else if (i < c[3]) { // вышли на смену: оранжевый столбик под воронкой
      var j3 = i - c[2], m3 = c[3] - c[2], out = prog(st, 2.7 + j3 * 0.04, 0.5);
      var ex = L.cx + ((j3 % 3) - 1) * 6 * KS, ey = lerp(yv(0.95), L.y1 + (b.y1 - L.y1) * (0.25 + Math.floor(j3 / 3) / Math.max(1, Math.ceil(m3 / 3)) * 0.7), out);
      o.x = ex; o.y = ey; o.a = 1; o.r = 1.8; o.o = 0.2 + out * 0.8;
    } else dust(i, b, o, t);
  };
  LABELS.recruit = function (ctx, b, st) {
    var L = b._fn; if (!L) return;
    FUN_STAGES.forEach(function (s, k) {
      var v = (k + 0.5) / 4, y = lerp(L.y0, L.y1, v), x = L.cx + lerp(L.hw0, L.hw1, v) + 14 * KS;
      label(ctx, (k ? '→ ' : '') + s, x, y + 4 * KS, 'left', k === 3 ? C_A : C_W, prog(st, 0.5 + k * 0.55, 0.45));
    });
    label(ctx, 'НА СМЕНЕ', L.cx + 16 * KS, L.y1 + (b.y1 - L.y1) * 0.62, 'left', C_A, prog(st, 3, 0.5), 12, 700);
  };

  /* Лизинг: шкала недель; команда приходит на неделе 3 и уходит на неделе 8 */
  SHAPES.lease = function (i, n, t, b, o, st) {
    var L = cache(b, '_ls', function () {
      var ax0 = b.x0 + b.W * 0.02, ax1 = b.x1 - b.W * 0.02, ay = b.y0 + b.H * 0.78, cw = (ax1 - ax0) / 10;
      var rows = 7, rs = Math.min(b.H * 0.075, cw * 0.4), gy0 = ay - 14 * KS - (rows - 1) * rs;
      return { ax0: ax0, ax1: ax1, ay: ay, cw: cw, rows: rows, rs: rs, gy0: gy0, cu: cuts(n, [0.08, 0.32, 0.014]) };
    });
    var c = L.cu, rr = rand(i * 23 + 1);
    var front = 2 + 6 * prog(st, 1.5, 1.8); // неделя, до которой дошла команда (2 = начало третьей)
    if (i < c[1]) { // ось с делениями
      var j = i - c[0], m = c[1] - c[0];
      if (j < 11) { o.x = L.ax0 + j * L.cw; o.y = L.ay + 5 * KS; o.r = 1.1; o.o = 0.55; }
      else { o.x = lerp(L.ax0, L.ax1, (j - 11) / (m - 11)); o.y = L.ay; o.r = 0.8; o.o = 0.4; }
      o.a = 0;
    } else if (i < c[2]) { // календарь: по 7 дней × 3 точки в неделе
      var j2 = (i - c[1]) % 210, wk = Math.floor(j2 / 21), d = j2 % 21, row = Math.floor(d / 3), col = d % 3;
      o.x = L.ax0 + wk * L.cw + L.cw * (0.3 + col * 0.2); o.y = L.gy0 + row * L.rs;
      var on = wk >= 2 && wk < 8 && wk + (col + 1) / 3 <= front + 0.001;
      o.a = on ? 1 : 0; o.r = on ? 1.5 : 0.85; o.o = on ? 0.85 + Math.sin(t * 1.5 + j2) * 0.1 : 0.16;
    } else if (i < c[3]) { // команда
      var j3 = i - c[2], m3 = c[3] - c[2], drop = prog(st, 0.6, 0.7), leave = prog(st, 3.5, 0.9);
      var gx = (j3 % 4) * 5 * KS, gy = Math.floor(j3 / 4) * 5 * KS;
      var x = L.ax0 + Math.min(front, 8) * L.cw - 10 * KS + gx, y = lerp(b.y0 + b.H * 0.02, L.gy0 - 16 * KS, drop) + gy - leave * b.H * 0.12;
      o.x = x + leave * L.cw * 0.6; o.y = y; o.a = 1; o.r = 1.7; o.o = (0.35 + drop * 0.65) * (1 - leave);
    } else dust(i, b, o, t);
  };
  LABELS.lease = function (ctx, b, st, t, w) {
    var L = b._ls; if (!L) return;
    var a = prog(st, 0.3, 0.5), small = b.W < 520;
    for (var k = 0; k < 10; k++) label(ctx, String(k + 1), L.ax0 + (k + 0.5) * L.cw, L.ay + 20 * KS, 'center', k >= 2 && k < 8 ? C_W : C_DIM, a, 10);
    label(ctx, 'НЕДЕЛИ', L.ax1, L.ay + 36 * KS, 'right', C_DIM, a, 10);
    label(ctx, small ? 'ПРИШЛИ' : 'ПРИШЛИ · НЕД. 3', L.ax0 + 2 * L.cw, L.gy0 - 26 * KS, 'left', C_A, prog(st, 1.2, 0.4), 11, 700);
    label(ctx, small ? 'УШЛИ' : 'УШЛИ · НЕД. 8', L.ax0 + 8 * L.cw, L.gy0 - 26 * KS, 'right', C_W, prog(st, 3.4, 0.5), 11, 700);
  };

  /* Аутсорсинг: цепочка участка от приёмки до отгрузки, по ней идут коробки; всё в скобке «Альфа-Стафф» */
  var OUT_NODES = ['ПРИЁМКА', 'ХРАНЕНИЕ', 'КОМПЛЕКТАЦИЯ', 'УПАКОВКА', 'ОТГРУЗКА'];
  SHAPES.outsource = function (i, n, t, b, o, st) {
    var L = cache(b, '_oc', function () {
      var y = b.y0 + b.H * 0.6, xs = [], k; for (k = 0; k < 5; k++) xs.push(b.x0 + b.W * (0.08 + k * 0.21));
      var rn = Math.min(b.W * 0.04, b.H * 0.09);
      return { y: y, xs: xs, rn: rn, by: b.y0 + b.H * 0.2, cu: cuts(n, [0.2, 0.14, 0.17, 0.012]) };
    });
    var c = L.cu, rr = rand(i * 37 + 2);
    if (i < c[1]) { // узлы-кольца
      var j = i - c[0], m = c[1] - c[0], nd = j % 5, q = Math.floor(j / 5) / Math.floor(m / 5), show = prog(st, 0.2 + nd * 0.18, 0.4);
      var ang = q * TAU; o.x = L.xs[nd] + Math.cos(ang) * L.rn; o.y = L.y + Math.sin(ang) * L.rn * (1 - (1 - show) * 0.6);
      o.a = 0; o.r = 1; o.o = 0.62 * show;
    } else if (i < c[2]) { // связи между узлами
      var j2 = i - c[1], lk = j2 % 4, u = rr(), show2 = prog(st, 0.5 + lk * 0.18, 0.5);
      var ax = L.xs[lk] + L.rn, bx = L.xs[lk + 1] - L.rn;
      o.x = lerp(ax, ax + (bx - ax) * show2, u); o.y = L.y; o.a = 0; o.r = 0.75; o.o = 0.35;
    } else if (i < c[3]) { // скобка «Альфа-Стафф» над цепочкой
      var j3 = i - c[2], m3 = c[3] - c[2], u3 = j3 / m3, gr = prog(st, 1.3, 0.8);
      var x0 = L.xs[0] - L.rn, x1 = L.xs[4] + L.rn, tick = (L.y - L.rn - 10 * KS) - L.by;
      if (u3 < 0.12) { o.x = x0; o.y = L.by + (u3 / 0.12) * tick; }
      else if (u3 > 0.88) { o.x = x1; o.y = L.by + ((u3 - 0.88) / 0.12) * tick; }
      else { var mid = (x0 + x1) / 2, half = (x1 - x0) / 2 * gr, uu = (u3 - 0.12) / 0.76; o.x = mid - half + uu * half * 2; o.y = L.by; }
      o.a = 1; o.r = 1.05; o.o = u3 < 0.12 || u3 > 0.88 ? gr * 0.75 : 0.8 * Math.min(1, gr * 2);
    } else if (i < c[4]) { // коробки на ленте
      var j4 = i - c[3], m4 = c[4] - c[3], run = st > 2.1, uu4 = ((t * 0.07) + j4 / m4) % 1;
      var xa = L.xs[0], xb = L.xs[4], x = lerp(xa, xb, uu4);
      // у узла коробка «задерживается» — обрабатывается
      o.x = x; o.y = L.y - 0.5; o.a = 1; o.r = 1.7; o.o = run ? 0.95 : 0;
    } else dust(i, b, o, t);
  };
  LABELS.outsource = function (ctx, b, st) {
    var L = b._oc; if (!L) return;
    var narrow = b.W < 620;
    OUT_NODES.forEach(function (s, k) {
      var up = narrow && k % 2 === 1, y = up ? L.y - L.rn - 12 * KS : L.y + L.rn + 20 * KS;
      label(ctx, s, L.xs[k], y, 'center', C_W, prog(st, 0.3 + k * 0.18, 0.4), narrow ? 9.5 : 11);
    });
    label(ctx, 'АЛЬФА-СТАФФ · УЧАСТОК ПОД КЛЮЧ', (L.xs[0] + L.xs[4]) / 2, L.by - 12 * KS, 'center', C_A, prog(st, 1.9, 0.5), narrow ? 10 : 12, 700);
  };

  /* Заявка: среди объектов на карте загорается подходящий, к нему тянется линия от «Вы» */
  SHAPES.pick = function (i, n, t, b, o, st) {
    var L = cache(b, '_pk', function () {
      var objs = [], k, rr = rand(77);
      for (k = 0; k < 34; k++) { var x = b.x0 + b.W * (0.06 + rr() * 0.88), y = b.y0 + b.H * (0.06 + rr() * 0.78); if (x < b.x0 + b.W * 0.3 && y > b.y0 + b.H * 0.62) { k--; continue; } objs.push([x, y]); }
      var me = [b.x0 + b.W * 0.1, b.y0 + b.H * 0.88], pick = [b.x0 + b.W * 0.72, b.y0 + b.H * 0.26];
      objs[0] = pick;
      return { objs: objs, me: me, pick: pick, hop: [5, 11, 17], cu: cuts(n, [0.2, 0.03, 0.02, 0.022, 0.12]) };
    });
    var c = L.cu, rr = rand(i * 17 + 4);
    if (i < c[1]) { // карта-сетка
      var gx = Math.floor(rr() * 26), gy = Math.floor(rr() * 14);
      o.x = b.x0 + b.W * (gx / 25); o.y = b.y0 + b.H * (gy / 13); o.a = 0; o.r = 0.6; o.o = 0.1;
    } else if (i < c[2]) { // объекты
      var j = i - c[1], k = j % L.objs.length, P = L.objs[k];
      var hopK = L.hop.indexOf(k), hot = hopK >= 0 && st > 0.5 + hopK * 0.4 && st < 0.9 + hopK * 0.4;
      var chosen = k === 0 && st > 1.7;
      o.x = P[0]; o.y = P[1]; o.a = hot || chosen ? 1 : 0; o.r = chosen ? 3.2 + Math.sin(t * 2.4) * 0.4 : hot ? 2.4 : 1.4; o.o = chosen || hot ? 1 : 0.6;
    } else if (i < c[3]) { // «Вы»: кольцо
      var j2 = i - c[2], m2 = c[3] - c[2], ang = j2 / m2 * TAU;
      o.x = L.me[0] + Math.cos(ang) * 8 * KS; o.y = L.me[1] + Math.sin(ang) * 8 * KS; o.a = 0; o.r = 1; o.o = 0.9;
      if (j2 < 2) { o.x = L.me[0]; o.y = L.me[1]; o.r = 2.4; }
    } else if (i < c[4]) { // ореол выбранного объекта
      var j3 = i - c[3], m3 = c[4] - c[3], a3 = j3 / m3 * TAU + t * 0.3, R = (12 + ((t * 9) % 10)) * KS;
      o.x = L.pick[0] + Math.cos(a3) * R; o.y = L.pick[1] + Math.sin(a3) * R; o.a = 1; o.r = 0.9; o.o = st > 1.8 ? 0.7 * (1 - ((t * 9) % 10) / 10) : 0;
    } else if (i < c[5]) { // линия от «Вы» к объекту
      var j4 = i - c[4], m4 = c[5] - c[4], u = j4 / m4, pr = prog(st, 1.9, 1);
      var mx = (L.me[0] + L.pick[0]) / 2 - b.W * 0.05, my = Math.min(L.me[1], L.pick[1]) + b.H * 0.12, m = 1 - u;
      o.x = m * m * L.me[0] + 2 * m * u * mx + u * u * L.pick[0]; o.y = m * m * L.me[1] + 2 * m * u * my + u * u * L.pick[1];
      o.a = 1; o.r = 0.9; o.o = u <= pr ? 0.55 : 0;
    } else dust(i, b, o, t);
  };
  LABELS.pick = function (ctx, b, st) {
    var L = b._pk; if (!L) return;
    label(ctx, 'ВЫ', L.me[0] + 16 * KS, L.me[1] + 4 * KS, 'left', C_W, prog(st, 0.2, 0.4), 12, 700);
    var right = L.pick[0] + 18 * KS < b.x1 - 120 * KS;
    label(ctx, 'ОБЪЕКТ ПОДОБРАН', right ? L.pick[0] + 18 * KS : L.pick[0], right ? L.pick[1] + 4 * KS : L.pick[1] - 20 * KS, right ? 'left' : 'center', C_A, prog(st, 2.6, 0.5), 12, 700);
  };

  /* Дорога: маршрут «Ваш город → объект», поезд из точек едет и прибывает */
  SHAPES.trip = function (i, n, t, b, o, st) {
    var L = cache(b, '_tr', function () {
      return { p0: [b.x0 + b.W * 0.08, b.y1 - b.H * 0.12], p1: [b.x0 + b.W * 0.35, b.y0 - b.H * 0.1], p2: [b.x0 + b.W * 0.62, b.y1 + b.H * 0.05], p3: [b.x1 - b.W * 0.1, b.y0 + b.H * 0.16], cu: cuts(n, [0.14, 0.26, 0.026, 0.03]) };
    });
    function at(u) {
      var m = 1 - u, A = L.p0, B = L.p1, C = L.p2, D = L.p3;
      return [m * m * m * A[0] + 3 * m * m * u * B[0] + 3 * m * u * u * C[0] + u * u * u * D[0], m * m * m * A[1] + 3 * m * m * u * B[1] + 3 * m * u * u * C[1] + u * u * u * D[1]];
    }
    var c = L.cu, rr = rand(i * 19 + 1), head = prog(st, 0.5, 2.8);
    if (i < c[1]) { var gx = Math.floor(rr() * 22), gy = Math.floor(rr() * 12); o.x = b.x0 + b.W * gx / 21; o.y = b.y0 + b.H * gy / 11; o.a = 0; o.r = 0.6; o.o = 0.09; }
    else if (i < c[2]) { // путь; пройденная часть — оранжевая
      var u = rr(), q = at(u); o.x = q[0] + (rr() - 0.5) * 2; o.y = q[1] + (rr() - 0.5) * 2;
      var done = u < head - 0.02; o.a = done ? 0.6 : 0; o.r = done ? 1 : 0.85; o.o = done ? 0.7 : 0.4;
    } else if (i < c[3]) { // поезд
      var k = i - c[2], uu = Math.max(0, head - k * 0.007), q2 = at(uu);
      o.x = q2[0]; o.y = q2[1]; o.a = 1; o.r = 2 - k * 0.03; o.o = head > 0.001 ? 1 - k * 0.025 : 0;
    } else if (i < c[4]) { // точки старта и прибытия
      var j = i - c[3], m = c[4] - c[3], end = j % 2 === 1, P = end ? L.p3 : L.p0, ang = j / m * TAU * 2 + t * 0.5;
      var R = (end ? 10 + Math.sin(t * 2) * 1.5 : 8) * KS, arrived = head > 0.98;
      o.x = P[0] + Math.cos(ang) * R; o.y = P[1] + Math.sin(ang) * R; o.a = end && arrived ? 1 : 0; o.r = 1; o.o = end ? (arrived ? 0.9 : 0.35) : 0.8;
    } else dust(i, b, o, t);
  };
  LABELS.trip = function (ctx, b, st) {
    var L = b._tr; if (!L) return;
    label(ctx, 'ВАШ ГОРОД', L.p0[0], L.p0[1] + 28 * KS, 'left', C_W, prog(st, 0.2, 0.4), 12, 700);
    label(ctx, 'ОБЪЕКТ', L.p3[0], L.p3[1] - 20 * KS, 'center', C_A, prog(st, 2.9, 0.5), 12, 700);
    label(ctx, 'ПОМОЖЕМ С БИЛЕТАМИ', L.p3[0], L.p3[1] + 32 * KS, 'center', C_DIM, prog(st, 3.2, 0.5), 10);
  };

  /* Заселение: хостел с окнами и путь до склада — 3–5 минут пешком */
  SHAPES.stay = function (i, n, t, b, o, st) {
    var L = cache(b, '_st', function () {
      var gy = b.y1 - b.H * 0.04, hx0 = b.x0 + b.W * 0.04, hx1 = b.x0 + b.W * 0.36, hy0 = b.y0 + b.H * 0.12;
      var sx0 = b.x1 - b.W * 0.3, sx1 = b.x1 - b.W * 0.02, sy0 = b.y0 + b.H * 0.52;
      return { gy: gy, hx0: hx0, hx1: hx1, hy0: hy0, sx0: sx0, sx1: sx1, sy0: sy0, cols: 4, rows: 6, cu: cuts(n, [0.1, 0.24, 0.1, 0.1, 0.006]) };
    });
    var c = L.cu, rr = rand(i * 13 + 8);
    if (i < c[1]) { // контур хостела и земля
      var u = rr(), part = i % 4;
      if (part === 0) { o.x = lerp(b.x0 - b.W * 0.02, b.x1 + b.W * 0.02, u); o.y = L.gy; o.o = 0.3; }
      else if (part === 1) { o.x = lerp(L.hx0, L.hx1, u); o.y = L.hy0; o.o = 0.55; }
      else { o.x = part === 2 ? L.hx0 : L.hx1; o.y = lerp(L.hy0, L.gy, u); o.o = 0.5; }
      o.a = 0; o.r = 0.9;
    } else if (i < c[2]) { // окна: по 4 точки, загораются по очереди
      var j = (i - c[1]) % (L.cols * L.rows * 4), win = Math.floor(j / 4), sub = j % 4, cl = win % L.cols, rw = Math.floor(win / L.cols);
      var cw = (L.hx1 - L.hx0) / L.cols, ch = (L.gy - L.hy0 - (L.gy - L.hy0) * 0.16) / L.rows, wr = rand(win * 5 + 2);
      o.x = L.hx0 + cw * (cl + 0.35 + (sub % 2) * 0.3); o.y = L.hy0 + ch * (rw + 0.4 + Math.floor(sub / 2) * 0.3);
      var lit = st > 0.6 + wr() * 1.6 && wr() < 0.82;
      o.a = lit ? 1 : 0; o.r = lit ? 1.4 : 0.85; o.o = lit ? 0.9 + Math.sin(t * 0.8 + win) * 0.08 : 0.2;
    } else if (i < c[3]) { // склад справа: контур и ворота
      var u2 = rr(), p2 = i % 5, show = prog(st, 1, 0.6);
      if (p2 === 0) { o.x = lerp(L.sx0, L.sx1, u2); o.y = L.sy0; }
      else if (p2 === 1) { o.x = L.sx0; o.y = lerp(L.sy0, L.gy, u2); }
      else if (p2 === 2) { o.x = L.sx1; o.y = lerp(L.sy0, L.gy, u2); }
      else { var gx0 = lerp(L.sx0, L.sx1, 0.3), gx1 = lerp(L.sx0, L.sx1, 0.7), gyy = lerp(L.sy0, L.gy, 0.4); if (p2 === 3) { o.x = rr() < 0.5 ? gx0 : gx1; o.y = lerp(gyy, L.gy, u2); } else { o.x = lerp(gx0, gx1, u2); o.y = gyy + Math.floor(rr() * 4) * (L.gy - gyy) / 4; } }
      o.a = 0; o.r = 0.9; o.o = 0.55 * show;
    } else if (i < c[4]) { // пунктир «хостел → склад»
      var j3 = i - c[3], m3 = c[4] - c[3], u3 = j3 / m3, pr = prog(st, 1.6, 0.9);
      var ax = (L.hx0 + L.hx1) / 2, bx = (L.sx0 + L.sx1) / 2, y = L.gy - 8 * KS;
      o.x = lerp(ax, bx, u3); o.y = y - Math.sin(u3 * Math.PI) * b.H * 0.16; o.a = 1; o.r = 0.9; o.o = u3 <= pr && Math.floor(j3 / 2) % 2 === 0 ? 0.7 : 0;
    } else if (i < c[5]) { // идущий человек
      var j4 = i - c[4], uu = ((t * 0.16) + j4 * 0.01) % 1, ax2 = (L.hx0 + L.hx1) / 2, bx2 = (L.sx0 + L.sx1) / 2;
      o.x = lerp(ax2, bx2, uu); o.y = L.gy - 8 * KS - Math.sin(uu * Math.PI) * b.H * 0.16 - 4; o.a = 1; o.r = j4 === 0 ? 2.2 : 1.2; o.o = st > 2.4 ? 1 - j4 * 0.15 : 0;
    } else dust(i, b, o, t);
  };
  LABELS.stay = function (ctx, b, st) {
    var L = b._st; if (!L) return;
    label(ctx, 'ХОСТЕЛ', L.hx0, L.hy0 - 12 * KS, 'left', C_W, prog(st, 0.3, 0.4), 12, 700);
    label(ctx, 'СКЛАД', L.sx0, L.sy0 - 12 * KS, 'left', C_W, prog(st, 1.1, 0.4), 12, 700);
    var ax = (L.hx0 + L.hx1) / 2, bx = (L.sx0 + L.sx1) / 2;
    label(ctx, '5–15 МИН ДО ОБЪЕКТА', (ax + bx) / 2, L.gy - 8 * KS - b.H * 0.16 - 14 * KS, 'center', C_A, prog(st, 2.3, 0.5), 12, 700);
  };

  /* Смены и выплаты: аванс каждую неделю и расчёт в конце */
  SHAPES.pay = function (i, n, t, b, o, st) {
    var L = cache(b, '_pb', function () {
      var base = b.y1 - b.H * 0.13, top = b.y0 + b.H * 0.04, bw = b.W * 0.11, gap = b.W * 0.065, x0 = b.cx - (5 * bw + 4 * gap) / 2;
      return { base: base, top: top, bw: bw, gap: gap, x0: x0, H: [0.3, 0.34, 0.31, 0.36, 1], cu: cuts(n, [0.06, 0.7]) };
    });
    var c = L.cu, rr = rand(i * 11 + 6);
    if (i < c[1]) { var u = (i - c[0]) / (c[1] - c[0]); o.x = lerp(L.x0 - L.gap, L.x0 + 5 * L.bw + 5 * L.gap, u); o.y = L.base + 6 * KS; o.a = 0; o.r = 0.8; o.o = 0.35; }
    else if (i < c[2]) {
      var j = i - c[1], bar = j % 5, k = Math.floor(j / 5), cols = 5, cl = k % cols, rw = Math.floor(k / cols);
      var step = 6 * KS, maxRows = Math.floor((L.base - L.top) / step), h = Math.round(L.H[bar] * maxRows * prog(st, 0.4 + bar * 0.38, 0.55));
      var on = rw < h, x = L.x0 + bar * (L.bw + L.gap) + cl * (L.bw / (cols - 1));
      o.x = x; o.y = L.base - (rw % Math.max(1, maxRows)) * step;
      var fin = bar === 4, topRow = rw === h - 1;
      o.a = fin && on ? 1 : 0; o.r = on ? (fin ? 1.6 : 1.2) : 0.5; o.o = on ? (fin ? 1 : 0.62 + (topRow ? Math.sin(t * 2 + bar) * 0.25 : 0)) : 0.05;
    } else dust(i, b, o, t);
  };
  LABELS.pay = function (ctx, b, st) {
    var L = b._pb; if (!L) return;
    for (var k = 0; k < 5; k++) {
      var cx = L.x0 + k * (L.bw + L.gap) + L.bw / 2, fin = k === 4;
      label(ctx, fin ? 'РАСЧЁТ' : 'АВАНС', cx, L.base + 26 * KS, 'center', fin ? C_A : C_W, prog(st, 0.5 + k * 0.38, 0.4), b.W < 520 ? 9.5 : 11, 700);
      if (!fin) label(ctx, 'НЕД. ' + (k + 1), cx, L.base + 42 * KS, 'center', C_DIM, prog(st, 0.5 + k * 0.38, 0.4), 9.5);
    }
    label(ctx, 'В КОНЦЕ ВАХТЫ', L.x0 + 4 * (L.bw + L.gap) + L.bw / 2, L.base + 42 * KS, 'center', C_DIM, prog(st, 2.1, 0.4), 9.5);
  };

  // Вопросы и знак: точки по маске
  function maskShape(drawFn, isReady) {
    var pts = null, w0 = 0, h0 = 0;
    return function (i, n, t, b, o) {
      // Do not cache an empty mask while the company SVG is loading.
      // The animation loop also runs with reduced motion, so it samples on load.
      if (isReady && !isReady()) { off(o, b.cx, b.cy); return; }
      if (!pts || w0 !== b.w || h0 !== b.h) {
        w0 = b.w; h0 = b.h; pts = [];
        var c = document.createElement('canvas'), S = 220; c.width = c.height = S;
        var x = c.getContext('2d'); drawFn(x, S);
        var d = x.getImageData(0, 0, S, S).data;
        var all = [];
        for (var yy = 0; yy < S; yy += 3) for (var xx = 0; xx < S; xx += 3) {
          var a = d[(yy * S + xx) * 4 + 3], red = d[(yy * S + xx) * 4];
          var green = d[(yy * S + xx) * 4 + 1], blue = d[(yy * S + xx) * 4 + 2];
          if (a > 128) all.push([xx / S - 0.5, yy / S - 0.5, red > green * 1.5 && red > blue * 1.5 ? 1 : 0]);
        }
        var budget = Math.floor(n * 0.82), stepK = Math.max(1, all.length / budget);
        for (var q = 0; q < all.length && pts.length < budget; q += stepK) pts.push(all[Math.floor(q)]);
      }
      var rr = rand(i * 11 + 2);
      if (i < pts.length) {
        var p = pts[i], wob = Math.sin(t * 1.3 + i * 0.37) * 1.2;
        var E = Math.min(b.W, b.H) * 1.08;
        o.x = b.cx + p[0] * E + wob; o.y = b.cy + p[1] * E + Math.cos(t + i) * 1.2;
        o.a = p[2]; o.r = p[2] ? 1.7 : 1.15; o.o = p[2] ? 1 : 0.7;
      } else {
        o.x = b.cx + (rr() - 0.5) * b.W * 1.2; o.y = b.cy + (rr() - 0.5) * b.H * 1.1; o.a = 0; o.r = 0.6; o.o = 0.08 + Math.sin(t + i) * 0.04;
      }
    };
  }
  SHAPES.question = maskShape(function (x, S) {
    x.fillStyle = '#fff'; x.font = '700 ' + (S * 0.95) + 'px ' + F_DISPLAY;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', S / 2, S * 0.52);
    x.fillStyle = 'rgb(196,23,24)'; x.beginPath(); x.arc(S / 2, S * 0.82, S * 0.075, 0, TAU); x.fill();
  });
  var brandMark = new Image(), brandMarkReady = false;
  brandMark.onload = function () { brandMarkReady = true; };
  brandMark.src = new URL('assets/brandbook/mark.svg', document.baseURI).href;
  SHAPES.mark = maskShape(function (x, S) {
    var k = Math.min(S / brandMark.naturalWidth, S / brandMark.naturalHeight);
    var w = brandMark.naturalWidth * k, h = brandMark.naturalHeight * k;
    x.drawImage(brandMark, (S - w) / 2, (S - h) / 2, w, h);
  }, function () { return brandMarkReady; });

  /* ---------- движок ---------- */
  function Morph(canvas, shapes, opts) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.shapes = shapes; this.opts = opts || {};
    this.n = this.opts.count || 1300;
    this.idx = 0; this.t0 = performance.now(); this.switchT = 0;
    this.p = new Float32Array(this.n * 2); this.v = new Float32Array(this.n * 2);
    this.delay = new Float32Array(this.n);
    this.out = { x: 0, y: 0, a: 0, r: 1, o: 1 };
    this.cur = new Float32Array(this.n * 3); // a, r, o — плавно
    this.visible = true;
    var self = this;
    this.resize();
    for (var i = 0; i < this.n; i++) {
      this.p[i * 2] = Math.random() * this.w; this.p[i * 2 + 1] = Math.random() * this.h;
      this.delay[i] = Math.random() * 0.45;
    }
    new ResizeObserver(function () { self.resize(); }).observe(canvas);
    // панель снова на экране — история шага проигрывается заново
    onVisible(canvas, function (v) { if (v && !self.visible) self.switchT = performance.now(); self.visible = v; });
    this.visible = false;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  Morph.prototype.resize = function () {
    var r = this.c.getBoundingClientRect(), d = dpr();
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.c.width = Math.round(this.w * d); this.c.height = Math.round(this.h * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    // область сцены — над заголовком панели (её отдаёт вёрстка), по ширине — почти вся панель
    var reg = this.opts.region ? this.opts.region() : null, top = reg ? reg[0] : this.h * 0.12, bot = reg ? reg[1] : this.h * 0.56;
    if (!(bot - top > 80)) { top = this.h * 0.12; bot = this.h * 0.56; }
    var pad = this.w * (this.w < 700 ? 0.07 : 0.085);
    this.box = { w: this.w, h: this.h, x0: pad, x1: this.w - pad, y0: top, y1: bot, W: this.w - pad * 2, H: bot - top, cx: this.w / 2, cy: (top + bot) / 2 };
    this.box.s = Math.min(this.box.W, this.box.H) * 0.5;
  };
  Morph.prototype.set = function (k) {
    if (k === this.idx) return;
    this.idx = k; this.switchT = performance.now();
    for (var i = 0; i < this.n; i++) this.delay[i] = Math.random() * 0.5;
  };
  Morph.prototype.loop = function (now) {
    requestAnimationFrame(this.loop);
    if (!this.visible || document.hidden) return;
    var t = reduce ? 2 : Math.max(0, (now - this.t0) / 1000), sinceSwitch = (now - this.switchT) / 1000;
    var ctx = this.ctx, w = this.w, h = this.h, b = this.box, o = this.out, shape = SHAPES[this.shapes[this.idx]];
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < this.n; i++) {
      shape(i, this.n, t, b, o, sinceSwitch);
      var ix = i * 2, iy = ix + 1, j = i * 3;
      var active = sinceSwitch > this.delay[i];
      if (active) {
        var k = 0.045, dmp = 0.8;
        this.v[ix] = (this.v[ix] + (o.x - this.p[ix]) * k) * dmp;
        this.v[iy] = (this.v[iy] + (o.y - this.p[iy]) * k) * dmp;
        this.p[ix] += this.v[ix]; this.p[iy] += this.v[iy];
        this.cur[j] += (o.a - this.cur[j]) * 0.08;
        this.cur[j + 1] += (o.r - this.cur[j + 1]) * 0.1;
        this.cur[j + 2] += (o.o - this.cur[j + 2]) * 0.1;
      }
      var a = this.cur[j], r = this.cur[j + 1], op = this.cur[j + 2];
      if (op < 0.02) continue;
      var x = this.p[ix], y = this.p[iy];
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      if (a > 0.5) {
        ctx.globalAlpha = op * 0.55 * a; var gs = r * 7 * KS; ctx.drawImage(SPR_A, x - gs, y - gs, gs * 2, gs * 2);
        ctx.globalAlpha = op; var hs = r * 1.6 * KS; ctx.drawImage(SPR_AH, x - hs, y - hs, hs * 2, hs * 2);
      } else {
        ctx.globalAlpha = op; var ws = r * 1.5 * KS; ctx.drawImage(SPR_W, x - ws, y - ws, ws * 2, ws * 2);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    var lab = LABELS[this.shapes[this.idx]];
    if (lab) { lab(ctx, b, reduce ? 9 : sinceSwitch, t); ctx.globalAlpha = 1; }
  };
  Morph.prototype.refit = function () { this.resize(); };
  AS.Morph = Morph;

  /* ---------- заливка заголовка ---------- */
  function TextFill(canvas) {
    var ctx = canvas.getContext('2d'), w = 1, h = 1, vis = true, t0 = performance.now();
    var pts = [];
    function resize() {
      var r = canvas.getBoundingClientRect(), d = dpr();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      pts = [];
      var rr = rand(42), count = Math.round(w * h / (90 * KS * KS));
      for (var i = 0; i < count; i++) pts.push({ u: rr(), v: rr(), s: 0.3 + rr() * 0.7, ph: rr() * TAU, hot: rr() < 0.32 });
    }
    resize();
    new ResizeObserver(resize).observe(canvas);
    onVisible(canvas, function (v) { vis = v; });
    // под курсором волна света следует за ним
    var host = canvas.closest('h1, h2') || canvas.parentNode, px = null, band = 0;
    host.addEventListener('pointermove', function (e) { var r = canvas.getBoundingClientRect(); px = (e.clientX - r.left) / r.width; });
    host.addEventListener('pointerleave', function () { px = null; });
    (function loop(now) {
      requestAnimationFrame(loop);
      if (!vis || document.hidden) return;
      var t = reduce ? 3 : Math.max(0, (now - t0) / 1000);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, w, h);
      // волна света, бегущая по буквам
      var auto = (t * 0.12) % 1.6 - 0.3;
      band += ((px == null ? auto : px) - band) * (px == null && Math.abs(auto - band) > 0.5 ? 1 : 0.12);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var x = ((p.u + t * 0.018 * p.s) % 1) * w;
        var wave = Math.sin(x / w * 7 + t * 1.4 + p.ph * 0.3) * h * 0.18;
        var y = p.v * h + wave * 0.35;
        var near = 1 - Math.min(1, Math.abs(x / w - band) * 3.2);
        var hot = p.hot ? 1 : 0;
        var r = (1 + p.s * 1.6) * (1 + near * 0.9) * KS;
        if (hot) {
          ctx.globalAlpha = 0.25 + near * 0.75;
          ctx.drawImage(SPR_A, x - r * 4, y - r * 4, r * 8, r * 8);
          ctx.globalAlpha = 0.3 + near * 0.7;
          ctx.drawImage(SPR_AH, x - r, y - r, r * 2, r * 2);
        } else {
          ctx.globalAlpha = 0.06 + near * 0.32;
          ctx.drawImage(SPR_W, x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
        }
      }
      ctx.globalAlpha = 1;
    })(t0);
  }
  AS.TextFill = TextFill;

  /* ---------- карта ---------- */
  function GeoMap(canvas, opts) {
    // Карта «География»: европейская Россия — регионы с объектами, офисы и пункт отправки (Уфа).
    // Из регионов к объектам стекаются частицы — люди едут к нам со всей страны; из Уфы — настоящие маршруты отправки.
    // Нажатие на регион (или кнопку над картой) приближает его: видны объекты, у Москвы — кольца 50/100/150 км.
    // Данные — AS.OBJECTS (geo, region), AS.OFFICES (geo, kind), AS.REGIONS (hub, label).
    opts = opts || {};
    var ctx = canvas.getContext('2d'), w = 1, h = 1, vis = true, t0 = performance.now(), D2R = Math.PI / 180;
    var OBJ = (AS.OBJECTS || []).filter(function (o) { return o.geo; });
    var OFF = (AS.OFFICES || []).filter(function (o) { return o.geo; });
    var REG = (AS.REGIONS || []).map(function (r) {
      var objs = OBJ.filter(function (o) { return o.region === r.key; });
      return { key: r.key, label: r.label, hub: r.hub, n: objs.length, objs: objs };
    }).filter(function (r) { return r.n; });
    var MSK = [55.756, 37.617], UFA = OFF.filter(function (o) { return o.kind === 'dispatch'; })[0];
    var view = { lat: 55, lon: 45, ls: 0 }, target = { lat: 55, lon: 45, sc: 1 }, overSc = 1, region = '';
    var hover = null, mouse = null, tourI = 0, tourT = 0, placed = [];

    function box(pts, minLat) {
      var la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
      pts.forEach(function (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); });
      var cl = (la0 + la1) / 2, k = Math.cos(cl * D2R), dl = Math.max(la1 - la0, minLat), dn = Math.max(lo1 - lo0, minLat / k);
      return { lat: cl, lon: (lo0 + lo1) / 2, dl: dl, dn: dn };
    }
    // свободная область холста: ниже кнопок регионов и выше легенды
    var top = 0, bot = 0;
    function insets() {
      var cr = canvas.getBoundingClientRect(), par = canvas.parentElement;
      var nav = par && par.querySelector('.geo__nav'), leg = par && par.querySelector('.geo__legend');
      top = nav ? Math.max(0, nav.getBoundingClientRect().bottom - cr.top) + 8 * KS : 0;
      bot = leg ? Math.max(0, cr.bottom - leg.getBoundingClientRect().top) + 8 * KS : 0;
    }
    function fit(b) {
      var k = Math.cos(b.lat * D2R), hh = Math.max(40, h - top - bot);
      return { lat: b.lat, lon: b.lon, sc: Math.min(w * 0.84 / (b.dn * k), hh * 0.72 / b.dl) };
    }
    function overviewBox() { return box(OBJ.map(function (o) { return o.geo; }).concat(OFF.map(function (o) { return o.geo; })), 2); }
    function regionBox(key) {
      var r = REG.filter(function (x) { return x.key === key; })[0]; if (!r) return overviewBox();
      var pts = r.objs.map(function (o) { return o.geo; });
      OFF.forEach(function (o) { if (Math.abs(o.geo[0] - r.hub[0]) < 1.2 && Math.abs(o.geo[1] - r.hub[1]) < 2 && o.kind !== 'dispatch') pts.push(o.geo); });
      return box(pts, key === 'Москва и МО' ? 1.1 : 0.7);
    }
    function proj(lat, lon) {
      var sc = Math.exp(view.ls), k = Math.cos(view.lat * D2R);
      return [w / 2 + (lon - view.lon) * k * sc, top + (h - top - bot) / 2 - (lat - view.lat) * sc];
    }
    function zoom(key, instant) {
      region = key || '';
      var f = fit(region ? regionBox(region) : overviewBox());
      target = f;
      if (instant) { view.lat = f.lat; view.lon = f.lon; view.ls = Math.log(f.sc); }
      tourI = 0; tourT = 0;
      if (opts.onZoom) opts.onZoom(region);
    }
    function resize() {
      var r = canvas.getBoundingClientRect(), d = dpr();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      insets();
      overSc = fit(overviewBox()).sc;
      zoom(region, true);
    }
    resize();
    new ResizeObserver(resize).observe(canvas);
    onVisible(canvas, function (v) { vis = v; });
    canvas.addEventListener('pointermove', function (e) { var r = canvas.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top]; });
    canvas.addEventListener('pointerleave', function () { mouse = null; hover = null; });
    canvas.addEventListener('click', function () {
      if (hover && hover.type === 'hub') zoom(hover.key);
      else if (region && !hover) zoom('');
    });

    // потоки: из случайных точек страны к регионам (чаще — туда, где больше объектов)
    var FLOWS = [], rr = rand(5), total = REG.reduce(function (s, r) { return s + r.n; }, 0);
    for (var i = 0; i < 70; i++) {
      var pick = rr() * total, reg = REG[0];
      for (var j = 0, acc = 0; j < REG.length; j++) { acc += REG[j].n; if (pick <= acc) { reg = REG[j]; break; } }
      var ang = rr() * TAU, dist = 3 + rr() * 9;
      FLOWS.push({ reg: reg, src: [reg.hub[0] + Math.sin(ang) * dist * 0.45, reg.hub[1] + Math.cos(ang) * dist], bend: (rr() - 0.5) * 0.5, ph: rr(), sp: 0.05 + rr() * 0.05 });
    }
    function bez(a, b, bend, u) {
      var mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend, m = 1 - u;
      return [m * m * a[0] + 2 * m * u * mx + u * u * b[0], m * m * a[1] + 2 * m * u * my + u * u * b[1]];
    }
    function arc(a, b, u) {
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.25, m = 1 - u;
      return [m * m * a[0] + 2 * m * u * mx + u * u * b[0], m * m * a[1] + 2 * m * u * my + u * u * b[1]];
    }

    // подписи-плашки без наложений: пробуем над точкой, под ней, справа, слева
    function pill(text, x, y, strong, accent) {
      ctx.font = (strong ? '700 ' : '600 ') + (10.5 * KS).toFixed(1) + 'px ' + F_MONO;
      var lw = ctx.measureText(text).width, px = 7 * KS, ph = 20 * KS, bw = lw + px * 2, g = 12 * KS;
      var cand = [[x - bw / 2, y - g - ph], [x - bw / 2, y + g], [x + g, y - ph / 2], [x - g - bw, y - ph / 2], [x - bw / 2, y + g + ph + 6], [x + g, y + g], [x - g - bw, y + g], [x + g, y - g - ph]], pos = null;
      for (var c = 0; c < cand.length && !pos; c++) {
        var bx = clamp(cand[c][0], 6, w - bw - 6), by = clamp(cand[c][1], top, h - bot - ph), ok = true;
        for (var q = 0; q < placed.length; q++) { var p = placed[q]; if (bx < p[0] + p[2] + 4 && bx + bw + 4 > p[0] && by < p[1] + p[3] + 3 && by + ph + 3 > p[1]) { ok = false; break; } }
        if (ok) pos = [bx, by];
      }
      if (!pos) return;
      placed.push([pos[0], pos[1], bw, ph]);
      ctx.fillStyle = accent ? 'rgba(196,23,24,.92)' : 'rgba(14,14,14,.88)'; ctx.strokeStyle = accent ? 'rgba(196,23,24,.6)' : 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(pos[0], pos[1], bw, ph, 6 * KS); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent || strong ? '#fff' : 'rgba(255,255,255,.62)';
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(text, pos[0] + px, pos[1] + ph / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
    }

    (function loop(now) {
      requestAnimationFrame(loop);
      if (!vis || document.hidden) return;
      var t = reduce ? 3 : Math.max(0, (now - t0) / 1000);
      // плавный перелёт камеры
      var e = reduce ? 1 : 0.075;
      view.lat += (target.lat - view.lat) * e; view.lon += (target.lon - view.lon) * e; view.ls += (Math.log(target.sc) - view.ls) * e;
      var sc = Math.exp(view.ls), zin = clamp(Math.log(sc / overSc) / Math.log(4), 0, 1); // 0 — вся карта, 1 — регион
      ctx.clearRect(0, 0, w, h); placed = [];
      // точечная сетка, ярче у регионов
      var step = (w < 600 ? 11 : 13) * KS, hubsPx = REG.map(function (r) { return proj(r.hub[0], r.hub[1]); });
      for (var y = 8; y < h; y += step) for (var x = 8; x < w; x += step) {
        var near = 1e9; for (var hI = 0; hI < hubsPx.length; hI++) near = Math.min(near, Math.hypot(x - hubsPx[hI][0], y - hubsPx[hI][1]));
        ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + Math.max(0, 0.11 - near / (w * 1.4))).toFixed(3) + ')';
        ctx.fillRect(x, y, 1.3 * KS, 1.3 * KS);
      }
      // кольца 50/100/150 км — при приближении Москвы
      if (region === 'Москва и МО' && zin > 0.3) {
        var hq = proj(MSK[0], MSK[1]);
        ctx.lineWidth = 1; ctx.setLineDash([2 * KS, 5 * KS]);
        [50, 100, 150].forEach(function (km) {
          var rad = km / 111.3 * sc;
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.13 * zin).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(hq[0], hq[1], rad, 0, TAU); ctx.stroke();
          if (hq[0] - rad > 40 * KS) { ctx.globalAlpha = zin; ctx.font = '600 ' + (10 * KS).toFixed(1) + 'px ' + F_MONO; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.textAlign = 'right'; ctx.fillText(km + ' КМ', hq[0] - rad - 6 * KS, hq[1] - 6 * KS); ctx.textAlign = 'left'; ctx.globalAlpha = 1; }
        });
        ctx.setLineDash([]);
      }
      // потоки людей к регионам
      FLOWS.forEach(function (f) {
        if (region && f.reg.key !== region) return;
        var u = (t * f.sp + f.ph) % 1, p = bez(f.src, f.reg.hub, f.bend, u), q = proj(p[0], p[1]);
        var a = Math.sin(u * Math.PI) * (region ? 0.55 : 0.8);
        for (var k = 0; k < 5; k++) {
          var u2 = u - k * 0.012; if (u2 < 0) break;
          var p2 = bez(f.src, f.reg.hub, f.bend, u2), q2 = proj(p2[0], p2[1]);
          ctx.globalAlpha = a * (1 - k / 5) * 0.8;
          ctx.drawImage(SPR_A, q2[0] - 5 * KS, q2[1] - 5 * KS, 10 * KS, 10 * KS);
        }
      });
      ctx.globalAlpha = 1;
      // Уфа — пункт отправки: маршруты в регионы
      if (UFA && !region) {
        var uq = proj(UFA.geo[0], UFA.geo[1]);
        ['Татарстан', 'Самарская обл.', 'Москва и МО'].forEach(function (key, n) {
          var r = REG.filter(function (x) { return x.key === key; })[0]; if (!r) return;
          var b = proj(r.hub[0], r.hub[1]);
          ctx.strokeStyle = 'rgba(196,23,24,.32)'; ctx.lineWidth = 1; ctx.setLineDash([3 * KS, 4 * KS]);
          ctx.beginPath();
          for (var u = 0; u <= 1.001; u += 0.025) { var c = arc(uq, b, u); if (u === 0) ctx.moveTo(c[0], c[1]); else ctx.lineTo(c[0], c[1]); }
          ctx.stroke(); ctx.setLineDash([]);
          var uu = (t * 0.12 + n / 3) % 1;
          for (var k = 0; k < 5; k++) { var u3 = uu - k * 0.015; if (u3 < 0) break; var c3 = arc(uq, b, u3); ctx.globalAlpha = 1 - k / 5; ctx.drawImage(SPR_A, c3[0] - 6 * KS, c3[1] - 6 * KS, 12 * KS, 12 * KS); }
          ctx.globalAlpha = 1;
        });
      }
      // наведение
      hover = null;
      if (mouse) {
        var best = 20 * KS;
        if (zin < 0.5) REG.forEach(function (r) { var q = proj(r.hub[0], r.hub[1]), d = Math.hypot(q[0] - mouse[0], q[1] - mouse[1]); if (d < best) { best = d; hover = { type: 'hub', key: r.key }; } });
        else OBJ.forEach(function (o, i) { if (region && o.region !== region) return; var q = proj(o.geo[0], o.geo[1]), d = Math.hypot(q[0] - mouse[0], q[1] - mouse[1]); if (d < best) { best = d; hover = { type: 'obj', i: i }; } });
      }
      canvas.style.cursor = hover && hover.type === 'hub' ? 'zoom-in' : region && !hover ? 'zoom-out' : hover ? 'pointer' : '';
      // автопоказ: по очереди регионы на общей карте, объекты — в регионе
      var list = region ? OBJ.map(function (o, i) { return i; }).filter(function (i) { return OBJ[i].region === region; }) : REG.map(function (r, i) { return i; });
      if (!reduce && now - tourT > 2600) { tourT = now; tourI = (tourI + 1) % Math.max(1, list.length); }
      var focusObj = hover && hover.type === 'obj' ? hover.i : region ? list[tourI] : -1;
      var focusHub = hover && hover.type === 'hub' ? hover.key : !region ? (REG[list[tourI]] || {}).key : '';
      // объекты (в регионе — крупно, на общей карте — мелкими точками)
      var labelObj = null;
      OBJ.forEach(function (o, i) {
        var q = proj(o.geo[0], o.geo[1]), on = i === focusObj, inR = !region || o.region === region;
        var tw = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.7), big = zin * (inR ? 1 : 0.3);
        ctx.globalAlpha = (on ? 1 : 0.5) * tw * (0.35 + big * 0.65);
        var g = (on ? 30 : 10 + 8 * big) * KS;
        ctx.drawImage(SPR_A, q[0] - g / 2, q[1] - g / 2, g, g);
        ctx.globalAlpha = 0.5 + 0.5 * big;
        ctx.fillStyle = on ? '#fff' : '#C41718';
        ctx.beginPath(); ctx.arc(q[0], q[1], (on ? 3.6 : 1.6 + big) * KS, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        if (on && zin > 0.5) labelObj = [o, q];
      });
      var regObjs = region ? OBJ.filter(function (o) { return o.region === region; }) : [];
      // офисы: головной — оранжевый с пульсом, остальные — кольца; пункт отправки — пунктирное кольцо
      OFF.forEach(function (o) {
        var q = proj(o.geo[0], o.geo[1]);
        if (o.kind === 'hq') {
          var pr = (9 + (t * 14) % 16) * KS;
          ctx.strokeStyle = 'rgba(196,23,24,' + (1 - (pr / KS - 9) / 16).toFixed(2) + ')'; ctx.lineWidth = 1.4 * KS;
          ctx.beginPath(); ctx.arc(q[0], q[1], pr, 0, TAU); ctx.stroke();
          ctx.fillStyle = '#C41718'; ctx.beginPath(); ctx.arc(q[0], q[1], 4.5 * KS, 0, TAU); ctx.fill();
        } else {
          ctx.strokeStyle = o.kind === 'dispatch' ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.3 * KS;
          if (o.kind === 'dispatch') ctx.setLineDash([2.5 * KS, 2.5 * KS]);
          ctx.beginPath(); ctx.arc(q[0], q[1], (o.kind === 'stay' ? 3.5 : 5) * KS, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
      });
      // регионы: свечение по числу объектов и подпись
      REG.forEach(function (r) {
        var q = proj(r.hub[0], r.hub[1]), on = r.key === focusHub, a = 1 - zin;
        if (a < 0.03) return;
        var g = (26 + Math.sqrt(r.n) * 14) * KS * (on ? 1.25 : 1);
        ctx.globalAlpha = a * (on ? 0.95 : 0.6); ctx.drawImage(SPR_A, q[0] - g / 2, q[1] - g / 2, g, g); ctx.globalAlpha = 1;
      });
      // подписи: сначала важные (головной офис, регион в фокусе), потом остальные
      var hqO = OFF.filter(function (o) { return o.kind === 'hq'; })[0];
      if (zin > 0.5 && regObjs.length && regObjs.length <= 6) regObjs.forEach(function (o) {
        if (labelObj && labelObj[0] === o) return;
        var q = proj(o.geo[0], o.geo[1]);
        if (!labelObj) return;
        placed.push([q[0] - 4, q[1] - 4, 8, 8]);
      });
      if (labelObj) { var lq = labelObj[1]; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lq[0], lq[1] - 6 * KS); ctx.lineTo(lq[0], lq[1] - 12 * KS); ctx.stroke(); pill(labelObj[0].short.toUpperCase(), lq[0], lq[1], true, true); }
      if (zin < 0.5) {
        var ord = REG.slice().sort(function (a, b) { return (b.key === focusHub) - (a.key === focusHub) || b.n - a.n; });
        ord.forEach(function (r) {
          var q = proj(r.hub[0], r.hub[1]), short = w < 700;
          pill((short ? r.label.replace(' обл.', '').replace('Нижегородская', 'Нижегор.').replace('Москва и МО', 'Москва') : r.label.toUpperCase()) + ' · ' + r.n, q[0], q[1], true, r.key === focusHub);
        });
        if (UFA) { var uq2 = proj(UFA.geo[0], UFA.geo[1]); pill(w < 700 ? 'УФА' : 'УФА · ПУНКТ ОТПРАВКИ', uq2[0], uq2[1], false); }
      } else {
        if (regObjs.length <= 6) regObjs.forEach(function (o) {
          if (labelObj && labelObj[0] === o) return;
          var q = proj(o.geo[0], o.geo[1]); pill(o.short.toUpperCase(), q[0], q[1], false);
        });
        if (hqO && region === 'Москва и МО') { var hq2 = proj(hqO.geo[0], hqO.geo[1]); pill(w < 600 ? 'МОСКВА' : 'МОСКВА · ГОЛОВНОЙ ОФИС', hq2[0], hq2[1], true); }
        OFF.forEach(function (o) {
          if (o.kind === 'hq' || o.kind === 'dispatch') return;
          var q = proj(o.geo[0], o.geo[1]); if (q[0] < 0 || q[0] > w || q[1] < 0 || q[1] > h) return;
          pill(o.city.toUpperCase() + (o.kind === 'stay' ? ' · ЗАСЕЛЕНИЕ' : ' · ОФИС'), q[0], q[1], false);
        });
      }
    })(t0);
    return { zoom: zoom };
  }
  AS.GeoMap = GeoMap;

  /* ---------- Земля в подвале ----------
     Точки суши на сфере, как у Agentory: равномерная решётка Фибоначчи, оставляем только точки над сушей.
     Маска суши — assets/img/land-mask.png (Natural Earth 1:50m, общественное достояние; 720×360, шаг 0,5°).
     Земля выглядывает снизу наполовину; при появлении повёрнута Евразией и медленно вращается, как настоящая
     (с запада на восток). Ореол вокруг — CSS (.earth::before), здесь — сам шар, свечение края и точки. */
  function Earth(canvas) {
    var ctx = canvas.getContext('2d'), w = 1, h = 1, R = 1, vis = false, hiddenAt = 0, t0 = performance.now();
    var mask = null, MW = 720, MH = 360, P = null, nP = 0, lastN = 0;
    var D2R = Math.PI / 180, TILT = 24 * D2R, START = 84, SPEED = 2.2; // градусы, градусы в секунду
    var BUCKETS = 9;
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = MW; c.height = MH;
      var x = c.getContext('2d'); x.drawImage(img, 0, 0, MW, MH);
      var d = x.getImageData(0, 0, MW, MH).data; mask = new Uint8Array(MW * MH);
      for (var i = 0; i < MW * MH; i++) mask[i] = d[i * 4] > 127 ? 1 : 0;
      build();
    };
    img.src = 'assets/img/land-mask.png';
    function land(lat, lon) {
      var u = Math.floor((lon + 180) / 360 * MW), v = Math.floor((90 - lat) / 180 * MH);
      u = ((u % MW) + MW) % MW; v = clamp(v, 0, MH - 1);
      return mask[v * MW + u];
    }
    // решётка Фибоначчи: число точек — от размера шара, чтобы шаг между точками был ~5.5px при любом экране
    function build() {
      if (!mask) return;
      var sp = 5.2 * KS, N = Math.round(clamp(4 * Math.PI * R * R / (sp * sp), 9000, 110000));
      if (P && Math.abs(N - lastN) / lastN < 0.08) return;
      lastN = N;
      var g = Math.PI * (3 - Math.sqrt(5)), arr = [];
      for (var i = 0; i < N; i++) {
        var y = 1 - (i + 0.5) * 2 / N, lat = Math.asin(y) / D2R, lon = ((g * i) / D2R) % 360 - 180;
        if (!land(lat, lon)) continue;
        var cl = Math.cos(lat * D2R);
        arr.push(cl * Math.cos(lon * D2R), cl * Math.sin(lon * D2R), y); // cosφ·cosλ, cosφ·sinλ, sinφ
      }
      P = new Float32Array(arr); nP = arr.length / 3;
    }
    function resize() {
      var r = canvas.getBoundingClientRect(), d = dpr();
      w = Math.max(1, r.width); h = Math.max(1, r.height); R = Math.min(w / 2, h);
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      build();
    }
    resize();
    new ResizeObserver(resize).observe(canvas);
    onVisible(canvas, function (v) {
      // ушла из вида надолго — при возвращении снова начинаем с Евразии
      if (v && !vis && hiddenAt && performance.now() - hiddenAt > 2500) t0 = performance.now();
      if (!v) hiddenAt = performance.now();
      vis = v;
    });
    var paths = [];
    (function loop(now) {
      requestAnimationFrame(loop);
      if (!vis || document.hidden) return;
      var t = reduce ? 0 : Math.max(0, (now - t0) / 1000);
      var cx = w / 2, cy = h;
      ctx.clearRect(0, 0, w, h);
      // шар: нейтральный тёмный; край светится фирменным красным
      var base = ctx.createRadialGradient(cx, cy - R * 0.25, R * 0.1, cx, cy, R);
      base.addColorStop(0, '#0c0c0c'); base.addColorStop(0.8, '#121212'); base.addColorStop(1, '#1f1f1f');
      ctx.fillStyle = base; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, TAU); ctx.closePath(); ctx.fill();
      var rim = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
      rim.addColorStop(0, 'rgba(196,23,24,0)'); rim.addColorStop(0.7, 'rgba(196,23,24,.06)'); rim.addColorStop(1, 'rgba(196,23,24,.38)');
      ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, TAU); ctx.closePath(); ctx.fill();
      if (!P) return;
      // поворот: долгота в центре уходит на запад — поверхность едет слева направо, как у настоящей Земли
      var l0 = (START - SPEED * t) * D2R, c0 = Math.cos(l0), s0 = Math.sin(l0), cb = Math.cos(TILT), sb = Math.sin(TILT);
      var dot = 1.2 * KS;
      for (var k = 0; k < BUCKETS; k++) { paths[k] = paths[k] || []; paths[k].length = 0; }
      for (var i = 0; i < nP; i++) {
        var A = P[i * 3], B = P[i * 3 + 1], Y = P[i * 3 + 2];
        // cosφ·sin(λ−λ0) и cosφ·cos(λ−λ0) без тригонометрии на каждой точке
        var X = B * c0 - A * s0, Z = A * c0 + B * s0;
        var Yt = Y * cb - Z * sb, Zt = Y * sb + Z * cb;
        if (Zt <= 0.02 || Yt < -0.004) continue;
        var bk = Math.min(BUCKETS - 1, Math.floor(Math.pow(Zt, 0.8) * BUCKETS));
        paths[bk].push(cx + X * R, cy - Yt * R);
      }
      // точки группами по яркости: к краю диска — темнее и мельче
      for (var q = 0; q < BUCKETS; q++) {
        var pts = paths[q]; if (!pts.length) continue;
        var f = (q + 0.5) / BUCKETS, rr = dot * (0.55 + 0.45 * f);
        ctx.fillStyle = 'rgba(196,23,24,' + (0.22 + 0.78 * Math.sqrt(f)).toFixed(3) + ')';
        ctx.beginPath();
        for (var j = 0; j < pts.length; j += 2) { ctx.moveTo(pts[j] + rr, pts[j + 1]); ctx.arc(pts[j], pts[j + 1], rr, 0, TAU); }
        ctx.fill();
      }
    })(t0);
  }
  AS.Earth = Earth;

  /* ---------- волна из точек на фоне манифеста ----------
     Как у референса (секция QTF® — 02): плоская сетка точек с шагом 10px, перспективная камера (75°, расстояние 40),
     каждая точка смещается по глубине суммой трёх синусоид от расстояния до левого нижнего угла —
     точки то сгущаются, то расходятся, и по полю бегут мягкие диагональные волны. Края гасит маска в CSS. */
  function DotWave(canvas) {
    var ctx = canvas.getContext('2d'), w = 1, h = 1, vis = false, t0 = performance.now();
    var CAM = 40, FOV = 75 * Math.PI / 180, STEP = 10, INT = 3.5, SP = 2.5 * 0.75, SPEED = 0.5;
    var cols = 0, rows = 0, foc = [0, 0], ppu = 1;
    function resize() {
      var r = canvas.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      var st = STEP * KS;
      cols = Math.floor(w / st); rows = Math.floor(h / st);
      foc = [-cols / 2, -rows / 2];                       // фокус волны — левый нижний угол сетки
      ppu = (h / 2) / Math.tan(FOV / 2);                  // пикселей на единицу при глубине CAM
    }
    resize();
    new ResizeObserver(resize).observe(canvas);
    onVisible(canvas, function (v) { vis = v; });
    function frame(t) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      var cx = w / 2, cy = h / 2, ds = 2 * KS, hs = ds / 2, s1 = SP, s2 = SP * 0.7, s3 = SP * 1.4;
      var a1 = t * SPEED, a2 = t * SPEED * 1.3, a3 = t * SPEED * 0.8;
      ctx.beginPath();
      for (var i = 0; i < cols; i++) {
        var gx = i - cols / 2, dx = gx - foc[0];
        for (var j = 0; j < rows; j++) {
          var gy = j - rows / 2, dy = gy - foc[1], d = Math.sqrt(dx * dx + dy * dy);
          var z = (Math.sin(d / s1 - a1) + Math.sin(d / s2 - a2) * 0.6 + Math.sin(d / s3 - a3) * 0.35) * INT;
          var k = ppu / (CAM - z), x = cx + gx * k, y = cy - gy * k;
          if (x < -2 || y < -2 || x > w + 2 || y > h + 2) continue;
          ctx.rect(x - hs, y - hs, ds, ds);
        }
      }
      ctx.fill();
    }
    (function loop(now) {
      requestAnimationFrame(loop);
      if (!vis || document.hidden) return;
      frame(reduce ? 0 : (now - t0) / 1000);
    })(t0);
  }
  AS.DotWave = DotWave;

})();
