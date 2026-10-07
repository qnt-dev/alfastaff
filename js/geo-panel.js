/* Альфа-Стафф · панель «География объектов» справа от сферы (вместо списка объектов).
   Сверху — мини-карта европейской России: регионы, схема трасс М-7 и М-5, Уфа — пункт отправки.
   Ниже — увеличенный регион текущего объекта: карта без рамки, растворяется в фоне, по углам — уголки
   видоискателя. На ней трассы (OpenStreetMap, js/roads.js), объекты региона и офисы; трасса к текущему
   объекту подсвечена. Объект — тот же, что показывает сфера: панель получает его через show(i).
   Данные: AS.OBJECTS (geo, region, route), AS.REGIONS, AS.OFFICES, AS.ROADS, AS.ROUTE_NAMES. */
(function () {
  'use strict';
  var AS = window.AS = window.AS || {};
  var TAU = Math.PI * 2, D2R = Math.PI / 180;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // схема федеральных трасс на мини-карте — через города (М-7 и М-5 соединяют все наши регионы)
  var SCHEME = {
    'М-7': [[55.75, 37.62], [56.13, 40.41], [56.30, 43.94], [56.13, 47.25], [55.79, 49.12], [55.74, 52.40], [54.74, 55.97]],
    'М-5': [[55.75, 37.62], [54.63, 39.74], [53.20, 45.00], [53.16, 48.47], [53.51, 49.42], [53.20, 50.15], [53.23, 50.6], [54.74, 55.97]]
  };
  var SCHEME_LABEL = { 'М-7': [55.77, 50.9], 'М-5': [53.18, 46.6] };
  var ROADKEY = { 'Москва и МО': 'msk', 'Татарстан': 'tat', 'Нижегородская обл.': 'nn', 'Владимир': 'vld', 'Самарская обл.': 'sam' };
  var CITY = [['МОСКВА', 'Москва и МО', -1], ['ВЛАДИМИР', 'Владимир', 2], ['Н. НОВГОРОД', 'Нижегородская обл.', -1], ['КАЗАНЬ', 'Татарстан', -1], ['САМАРА', 'Самарская обл.', 1]];
  var BOX = { la0: 52.7, la1: 58.6, lo0: 35.2, lo1: 57.6 };   // мини-карта: от Смоленска до Уфы

  // цвет из CSS («#c41718», «rgb(…)») → [r, g, b]
  function rgbOf(v, fb) {
    v = (v || '').trim();
    var m = v.match(/^#([0-9a-f]{6})$/i);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = v.match(/^#([0-9a-f]{3})$/i);
    if (m) return m[1].split('').map(function (c) { return parseInt(c + c, 16); });
    m = v.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(',').slice(0, 3).map(function (x) { return parseFloat(x); });
    return fb;
  }
  function km(a, b) { var k = Math.cos(a[0] * D2R); return [(b[1] - a[1]) * k * 111.3, (b[0] - a[0]) * 111.3]; }
  function refsOf(w) { return (w.r || '').split(';').filter(Boolean); }

  AS.HeroGeo = function (root, opts) {
    opts = opts || {};
    var cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
    var O = (AS.OBJECTS || []).filter(function (o) { return o.geo; });
    var OFF = AS.OFFICES || [], HQ = (OFF.filter(function (o) { return o.kind === 'hq'; })[0] || { geo: [55.75, 37.62] }).geo;
    var UFA = OFF.filter(function (o) { return o.kind === 'dispatch'; })[0];
    var ROADS = AS.ROADS || {}, NAMES = AS.ROUTE_NAMES || {};
    var q = function (k) { return root.querySelector('[data-geo-' + k + ']'); };
    var W = 1, H = 1, K = 1, Hm = 1, GAP = 1, FH = 1, FM = 'monospace', cur = -1, vis = true, t0 = performance.now();
    // акцент дизайна: в «Оранжевом» — оранжевый, в «Брендбуке» — красный; светлый оттенок — для мягкого свечения и подписей
    var ACC = [255, 90, 31], LIG = [255, 139, 95];
    var A = function (a) { return 'rgba(' + ACC.join(',') + ',' + a + ')'; }, L = function (a) { return 'rgba(' + LIG.join(',') + ',' + a + ')'; };
    var DARK = function () { return 'rgb(' + ACC.map(function (c) { return Math.round(16 + c * .06); }).join(',') + ')'; };
    // view — что сейчас на увеличенной карте, target — куда нужно; shown — объект, чей регион нарисован;
    // ring — кружок области на мини-карте (плавно переезжает); fade — прозрачность увеличенной карты при смене региона
    var view = null, target = null, ring = null, shown = -1, fade = 1, last = 0, hit = [];
    var copy = function (v) { return { lat: v.lat, lon: v.lon, rad: v.rad }; };

    // регион текущего объекта: центр и радиус увеличенной карты (км)
    function regionView(o) {
      var RO = O.filter(function (x) { return x.region === o.region; }), c = [0, 0];
      RO.forEach(function (x) { c[0] += x.geo[0] / RO.length; c[1] += x.geo[1] / RO.length; });
      if (o.region === 'Москва и МО') c = [55.62, 37.68];
      var rad = 35;
      RO.forEach(function (x) { var d = km(c, x.geo); rad = Math.max(rad, Math.hypot(d[0], d[1]) * 1.18); });
      return { lat: c[0], lon: c[1], rad: rad };
    }
    function resize() {
      var css = getComputedStyle(document.documentElement);
      K = (parseFloat(css.fontSize) || 16) / 16;
      FM = css.getPropertyValue('--f-mono').trim() || 'monospace';
      ACC = rgbOf(css.getPropertyValue('--accent'), ACC);
      LIG = rgbOf(css.getPropertyValue('--accent-3'), ACC.map(function (c) { return Math.round(c + (255 - c) * .45); }));
      // ширину берём из CSS: панель может быть скрыта (раскладка первого экрана измеряет её до показа)
      W = Math.max(200, Math.round(parseFloat(getComputedStyle(root).width) || cv.getBoundingClientRect().width || 300));
      Hm = Math.round(W * 0.46); GAP = Math.round(W * 0.19); FH = Math.round(W * 0.9); H = Hm + GAP + FH;
      var d = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
      cv.style.height = H + 'px';
      cv.width = Math.round(W * d); cv.height = Math.round(H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    function show(i) {
      if (i == null || !O[i]) return;
      cur = i;
      var o = O[i];
      q('idx').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(O.length).padStart(2, '0');
      // подписи под картой нет (название и адрес — на карточке сферы); для экранных дикторов — в описании карты
      cv.setAttribute('aria-label', 'Карта: ' + o.short + ', ' + o.region + (o.route ? ', по трассе ' + (NAMES[o.route] || o.route) : ''));
      target = regionView(o);
      // тот же регион — карта остаётся, меняется только подсветка; другой — карта гаснет и проявляется на новом месте
      if (!view || reduce) { view = copy(target); ring = copy(target); shown = i; }
      else if (shown < 0 || O[shown].region === o.region) shown = i;
    }

    // плашки подписей без наложений
    function pill(text, x, y, style, placed, bounds, fs) {
      ctx.font = '600 ' + ((fs || 10) * K).toFixed(1) + 'px ' + FM;
      var lw = ctx.measureText(text).width, px = 5 * K, ph = (fs ? fs + 6 : 17) * K, bw = lw + px * 2, g = 8 * K;
      var shield = style === 'shield' || style === 'shield-on';
      var cand = shield ? [[x - bw / 2, y - ph / 2]] : [[x - bw / 2, y - g - ph], [x - bw / 2, y + g], [x + g, y - ph / 2], [x - g - bw, y - ph / 2], [x + g, y - g - ph], [x - g - bw, y + g], [x + g, y + g], [x - g - bw, y - g - ph]];
      // подпись текущего объекта обязательна: если свободного места нет — туда, где наложение меньше;
      // подписи офисов допускают лишь касание соседей (до 8% площади)
      var least = null, la = 1e9;
      for (var c = 0; c <= cand.length; c++) {
        if (c === cand.length) { if (!least || !(style === 'accent' || (style === 'plain' && la < bw * ph * .08))) break; bx = least[0]; by = least[1]; }
        else {
          var bx = Math.max(bounds[0], Math.min(bounds[2] - bw, cand[c][0])), by = Math.max(bounds[1], Math.min(bounds[3] - ph, cand[c][1])), ov = 0;
          for (var i = 0; i < placed.length; i++) {
            var p = placed[i], ix = Math.min(bx + bw + 3, p[0] + p[2] + 3) - Math.max(bx, p[0]), iy = Math.min(by + ph + 3, p[1] + p[3] + 3) - Math.max(by, p[1]);
            if (ix > 0 && iy > 0) ov += ix * iy;
          }
          if (ov > 0) { if (ov < la) { la = ov; least = [bx, by]; } continue; }
        }
        placed.push([bx, by, bw, ph]);
        var acc = style === 'accent', on = style === 'shield-on';
        ctx.fillStyle = acc ? A(.95) : on ? DARK() : 'rgba(14,14,14,.92)';
        ctx.strokeStyle = acc ? L(.7) : on ? L(.95) : shield ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.16)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(bx, by, bw, ph, (shield ? 3 : 5) * K); ctx.fill(); ctx.stroke();
        ctx.fillStyle = acc ? '#111' : on ? L(1) : shield ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.85)';
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(text, bx + px, by + ph / 2 + .5); ctx.textBaseline = 'alphabetic';
        return true;
      }
      return false;
    }
    function glow(x, y, r, a) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, L(a)); g.addColorStop(.35, A(a * .45)); g.addColorStop(1, A(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    function dot(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

    function draw(t) {
      if (cur < 0 || !view || shown < 0) return;
      var reg = O[cur].region, route = O[cur].route, placed = [];
      hit = [];
      ctx.clearRect(0, 0, W, H);
      // ---------- мини-карта ----------
      var kx = Math.cos(55.6 * D2R), sc = Math.min(W / ((BOX.lo1 - BOX.lo0) * kx), Hm / (BOX.la1 - BOX.la0));
      var ox = (W - (BOX.lo1 - BOX.lo0) * kx * sc) / 2, oy = (Hm - (BOX.la1 - BOX.la0) * sc) / 2;
      var P1 = function (g) { return [ox + (g[1] - BOX.lo0) * kx * sc, oy + (BOX.la1 - g[0]) * sc]; };
      var st = 7 * K;
      for (var y = st / 2; y < Hm; y += st) for (var x = st / 2; x < W; x += st) {
        var e = Math.min(x, W - x, y, Hm - y) / (Hm * .32);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.1 * Math.min(1, e)).toFixed(3) + ')'; ctx.fillRect(x, y, 1.2 * K, 1.2 * K);
      }
      Object.keys(SCHEME).forEach(function (ref) {
        var on = route === ref;
        ctx.strokeStyle = on ? L(.85) : 'rgba(255,255,255,.2)'; ctx.lineWidth = on ? 1.5 : 1;
        ctx.beginPath(); SCHEME[ref].forEach(function (g, i) { var p = P1(g); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
        var m = P1(SCHEME_LABEL[ref]); pill(ref, m[0], m[1], on ? 'shield-on' : 'shield', placed, [0, 0, W, Hm], 8.5);
      });
      (AS.REGIONS || []).forEach(function (r) {
        var p = P1(r.hub), on = r.key === reg, n = O.filter(function (x) { return x.region === r.key; }).length;
        glow(p[0], p[1], (10 + Math.sqrt(n) * 5) * K * (on ? 1.4 : 1), on ? .95 : .45);
        dot(p[0], p[1], (on ? 3 : 2) * K, on ? '#fff' : L(1));
        hit.push({ x: p[0], y: p[1], r: 14 * K, region: r.key });
      });
      if (UFA) { var pu = P1(UFA.geo); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(pu[0], pu[1], 4 * K, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.font = '600 ' + (9 * K).toFixed(1) + 'px ' + FM; ctx.textAlign = 'center';
      CITY.forEach(function (c) {
        var r = (AS.REGIONS || []).filter(function (x) { return x.key === c[1]; })[0]; if (!r) return;
        var p = P1(r.hub); ctx.fillStyle = c[1] === reg ? '#fff' : 'rgba(255,255,255,.4)';
        // Владимир рядом с Москвой — подпись снизу и правее, чтобы не наезжать на кольцо Москвы
        if (c[2] === 2) { ctx.textAlign = 'left'; ctx.fillText(c[0], p[0] - 4 * K, p[1] + 18 * K); ctx.textAlign = 'center'; return; }
        ctx.fillText(c[0], p[0], p[1] + c[2] * 12 * K + (c[2] > 0 ? 6 * K : 0));
      });
      if (UFA) { var pu2 = P1(UFA.geo); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillText('УФА', pu2[0], pu2[1] - 12 * K); }
      ctx.textAlign = 'left';

      // ---------- увеличенный регион ----------
      var o = O[shown]; reg = o.region; route = o.route;
      var fx = 0, fy = Hm + GAP, fw = W, fh = FH, lcx = fw / 2, lcy = fy + fh / 2, s2 = Math.min(fw, fh) / 2 / view.rad * (1 + .07 * (1 - fade));
      var ctr = [view.lat, view.lon];
      var P2 = function (g) { var d = km(ctr, g); return [lcx + d[0] * s2, lcy - d[1] * s2]; };
      // выноска: кружок области на мини-карте и линии к верхним уголкам кадра
      var pc = P1([ring.lat, ring.lon]), pr = Math.max(5 * K, ring.rad / 111.3 * sc);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(pc[0], pc[1], pr, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.beginPath(); ctx.moveTo(pc[0] - pr, pc[1]); ctx.lineTo(fx + 1, fy + 1); ctx.moveTo(pc[0] + pr, pc[1]); ctx.lineTo(fx + fw - 1, fy + 1); ctx.stroke();

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
      var st2 = 9 * K;
      for (var y2 = fy; y2 < fy + fh; y2 += st2) for (var x2 = fx; x2 < fx + fw; x2 += st2) { ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x2, y2, 1.3 * K, 1.3 * K); }
      var ways = ROADS[ROADKEY[reg]] || [];
      function path(w) { ctx.beginPath(); w.p.forEach(function (g, i) { var p = P2(g); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); }
      ways.forEach(function (w) {
        var refs = refsOf(w), on = route && refs.indexOf(route) >= 0, ring = refs.indexOf('МКАД') >= 0 || refs.indexOf('ЦКАД') >= 0;
        // классы: m/t — магистрали и трассы, p — основные дороги, s — второстепенные (в регионах: сетка городов)
        ctx.strokeStyle = on ? L(.9) : ring ? 'rgba(255,255,255,.26)' : w.h === 's' ? 'rgba(255,255,255,.075)' : w.h === 'p' ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.2)';
        ctx.lineWidth = on ? 1.8 : w.h === 's' ? .6 : w.h === 'p' ? .8 : 1.05;
        path(w); ctx.stroke();
      });
      if (route) {
        ctx.save(); ctx.filter = 'blur(' + (3 * K).toFixed(1) + 'px)'; ctx.strokeStyle = A(.55); ctx.lineWidth = 4 * K;
        ways.forEach(function (w) { if (refsOf(w).indexOf(route) >= 0) { path(w); ctx.stroke(); } });
        ctx.restore();
      }
      if (reg === 'Москва и МО') {
        var hqp = P2(HQ); ctx.setLineDash([2 * K, 4 * K]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.09)';
        [50, 100].forEach(function (r) { ctx.beginPath(); ctx.arc(hqp[0], hqp[1], r * s2, 0, TAU); ctx.stroke(); });
        ctx.setLineDash([]);
      }
      var inside = function (p, m) { return p[0] > fx + m && p[0] < fx + fw - m && p[1] > fy + m && p[1] < fy + fh - m; };
      var offSq = [];
      OFF.forEach(function (f, j) {
        if (f.kind === 'dispatch') return;
        var p = P2(f.geo); if (!inside(p, 4)) return;
        if (f.kind === 'hq') {
          var prr = (6 + (reduce ? 4 : (t * 12) % 14)) * K;
          ctx.strokeStyle = A((1 - (prr / K - 6) / 14).toFixed(2)); ctx.lineWidth = 1.3 * K; ctx.beginPath(); ctx.arc(p[0], p[1], prr, 0, TAU); ctx.stroke();
          dot(p[0], p[1], 4 * K, A(1));
        } else { ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2 * K; ctx.beginPath(); ctx.arc(p[0], p[1], (f.kind === 'stay' ? 3 : 4) * K, 0, TAU); ctx.stroke(); } // офис; заселение — кружок меньше, как на карте «Как проходит вахта»
        placed.push(offSq[j] = [p[0] - 6 * K, p[1] - 6 * K, 12 * K, 12 * K]);
      });
      O.forEach(function (x, i) {
        if (x.region !== reg) return;
        var p = P2(x.geo), on = i === cur, tw = reduce ? 1 : .75 + .25 * Math.sin(t * 2 + x.geo[1] * 9);
        glow(p[0], p[1], (on ? 18 : 9) * K, on ? .95 : .5 * tw);
        dot(p[0], p[1], (on ? 3.6 : 2.3) * K, on ? '#fff' : L(1));
        placed.push(on ? [p[0] - 4 * K, p[1] - 4 * K, 8 * K, 8 * K] : [p[0] - 5 * K, p[1] - 5 * K, 10 * K, 10 * K]);
        hit.push({ x: p[0], y: p[1], r: 12 * K, i: i });
      });
      var bounds = [fx + 10 * K, fy + 10 * K, fx + fw - 10 * K, fy + fh - 10 * K];
      placed.push([fx, fy + fh - 22 * K, fw, 22 * K]); // место под подписи внизу кадра
      var po = P2(o.geo);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(po[0], po[1] - 6 * K); ctx.lineTo(po[0], po[1] - 11 * K); ctx.stroke();
      pill(o.short.toUpperCase(), po[0], po[1], 'accent', placed, bounds);
      // подпись офиса — рядом с его же кружком: на время подбора места свой кружок занимает только себя (без запаса),
      // чтобы подпись встала вплотную, но не легла на него у края кадра
      // у края кадра вариантов меньше — такие подписи ставим первыми
      var edge = function (p) { return Math.min(p[0] - fx, fx + fw - p[0], p[1] - fy, fy + fh - p[1]); };
      OFF.map(function (f, j) { return j; }).sort(function (a, b) { return edge(P2(OFF[a].geo)) - edge(P2(OFF[b].geo)); }).forEach(function (j) {
        var f = OFF[j], p = P2(f.geo), k = placed.indexOf(offSq[j]); if (f.kind === 'dispatch' || !inside(p, 8)) return;
        if (k >= 0) placed[k] = [p[0] - 4 * K, p[1] - 4 * K, 8 * K, 8 * K];
        pill(f.kind === 'hq' ? 'МОСКВА' : f.kind === 'stay' ? 'ЗАСЕЛЕНИЕ' : f.city.toUpperCase(), p[0], p[1], 'plain', placed, bounds);
        if (k >= 0) placed[k] = offSq[j];
      });
      // таблички трасс — там, где дорога подходит к краю кадра; трасса к объекту — первой
      var refsIn = {};
      ways.forEach(function (w) { refsOf(w).forEach(function (r) { (refsIn[r] = refsIn[r] || []).push(w); }); });
      Object.keys(refsIn).sort(function (a, b) { return (b === route) - (a === route); }).forEach(function (r) {
        var best = null, bd = -1;
        refsIn[r].forEach(function (w) { w.p.forEach(function (g) {
          var p = P2(g), ix = Math.min(p[0] - fx, fx + fw - p[0]), iy = Math.min(p[1] - fy, fy + fh - p[1]);
          if (ix > 18 * K && iy > 14 * K) { var d = Math.hypot(p[0] - lcx, (p[1] - lcy) * fw / fh); if (d > bd) { bd = d; best = p; } }
        }); });
        if (best) pill(r, best[0], best[1], r === route ? 'shield-on' : 'shield', placed, bounds, 8.5);
      });
      // карта растворяется к краям
      ctx.globalCompositeOperation = 'destination-in';
      var mk = ctx.createRadialGradient(lcx, lcy, Math.min(fw, fh) * .36, lcx, lcy, Math.max(fw, fh) * .62);
      mk.addColorStop(0, 'rgba(0,0,0,1)'); mk.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mk; ctx.fillRect(fx, fy, fw, fh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      ctx.globalAlpha = 1;
      // уголки видоискателя
      var c = 16 * K; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.4;
      [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]].forEach(function (k) {
        ctx.beginPath(); ctx.moveTo(k[0] + k[2] * .7, k[1] + k[3] * c); ctx.lineTo(k[0] + k[2] * .7, k[1] + k[3] * .7); ctx.lineTo(k[0] + k[2] * c, k[1] + k[3] * .7); ctx.stroke();
      });
      ctx.font = '600 ' + (8.5 * K).toFixed(1) + 'px ' + FM; ctx.fillStyle = 'rgba(255,255,255,' + (.4 * fade).toFixed(3) + ')'; ctx.textAlign = 'left';
      ctx.fillText('РАДИУС ' + Math.round(view.rad) + ' КМ', fx + 10 * K, fy + fh - 9 * K);
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillText('© OPENSTREETMAP', fx + fw - 10 * K, fy + fh - 9 * K);
      ctx.textAlign = 'left';
    }

    // нажатия: точка объекта — к объекту, регион на мини-карте — к первому объекту региона
    function pick(e) {
      var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 1e9;
      hit.forEach(function (h) { var d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h; } });
      return best;
    }
    cv.addEventListener('pointermove', function (e) { cv.style.cursor = pick(e) ? 'pointer' : ''; });
    cv.addEventListener('click', function (e) {
      var h = pick(e); if (!h || !opts.onPick) return;
      if (h.i != null) opts.onPick(h.i);
      else { var i = O.findIndex(function (x) { return x.region === h.region; }); if (i >= 0 && O[cur].region !== h.region) opts.onPick(i); }
    });
    var prev = q('prev'), next = q('next');
    if (prev) prev.addEventListener('click', function () { if (opts.onPick) opts.onPick((cur - 1 + O.length) % O.length); });
    if (next) next.addEventListener('click', function () { if (opts.onPick) opts.onPick((cur + 1) % O.length); });

    resize();
    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); }).observe(root);
    window.addEventListener('resize', resize); // раньше раскладки первого экрана — она меряет высоту панели
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }).observe(root);
    (function loop(now) {
      requestAnimationFrame(loop);
      var dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      if (!vis || document.hidden || root.hidden || !target) return;
      // смена региона: кадр гаснет (0,18 с), карта переставляется на новый регион и проявляется с лёгким приближением (0,4 с);
      // кружок на мини-карте тем временем плавно переезжает — по времени, а не по кадрам
      var away = shown !== cur;
      if (reduce) { view = copy(target); ring = copy(target); shown = cur; fade = 1; }
      else if (away) { fade = Math.max(0, fade - dt / 0.18); if (!fade) { view = copy(target); shown = cur; } }
      else fade = Math.min(1, fade + dt / 0.4);
      var e = reduce ? 1 : 1 - Math.exp(-dt * 7);
      ring.lat += (target.lat - ring.lat) * e; ring.lon += (target.lon - ring.lon) * e; ring.rad += (target.rad - ring.rad) * e;
      draw((now - t0) / 1000);
    })(t0);
    show(0);
    return { show: show, resize: resize, current: function () { return cur; } };
  };
})();
