/* Альфа-Стафф · панель «География объектов» справа от сферы (вместо списка объектов).
   Под заголовком — кадр текущего объекта с уголками видоискателя: 3D-квартал (js/clay-map.js), а если данных
   квартала для объекта нет — плоская карта региона: трассы (OpenStreetMap, js/roads.js), объекты региона и офисы,
   трасса к объекту подсвечена, край неровный и уходит в фон до рамки. Объект — тот же, что показывает сфера:
   панель получает его через show(i). Данные: AS.OBJECTS (geo, region, route), AS.OFFICES, AS.ROADS, AS.ROUTE_NAMES. */
(function () {
  'use strict';
  var AS = window.AS = window.AS || {};
  var TAU = Math.PI * 2, D2R = Math.PI / 180;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ROADKEY = { 'Москва и МО': 'msk', 'Татарстан': 'tat', 'Нижегородская обл.': 'nn', 'Владимир': 'vld', 'Самарская обл.': 'sam', 'Рязанская обл.': 'ryz' };

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
    // 3D-квартал объекта (js/clay-map.js), если для объекта собраны данные; плоская карта региона у такого объекта
    // не показывается вовсе. Слой — под холстом панели, поэтому уголки кадра, подписи и «пилюли» рисуются поверх него.
    // Тема: тёмная (сайт тёмный); светлая — data-clay="light" на панели или ?clay=light в адресе
    var clayEl = null, clay = null, clayData = null, clayFor = -1, clayMix = 0, clayWant = -1, flatA = 1;
    // квартал, который сейчас построен на экране (подписи и нижняя строка — от него, а не от уже выбранного следующего объекта)
    var clayOnI = -1, clayOnD = null;
    if (AS.ClayMap) {
      clayEl = document.createElement('div'); clayEl.className = 'hero-geo__clay'; clayEl.setAttribute('aria-hidden', 'true');
      var clayTheme = (location.search.match(/[?&]clay=(light|dark)/) || [])[1] || root.getAttribute('data-clay') || 'dark';
      clayEl.setAttribute('data-clay-theme', clayTheme);
      root.insertBefore(clayEl, cv);
      // квартал — WebGL: если браузер его не даёт, у всех объектов плоская карта региона (она рисуется без WebGL)
      try { clay = AS.ClayMap(clayEl, { theme: clayTheme }); } catch (err) { clay = null; if (window.console && console.warn) console.warn('Альфа-Стафф: 3D-кварталы без WebGL —', err && err.message || err); }
      if (!clay) { clayEl.remove(); clayEl = null; }
    }
    var O = (AS.OBJECTS || []).filter(function (o) { return o.geo; });
    var OFF = AS.OFFICES || [], HQ = (OFF.filter(function (o) { return o.kind === 'hq'; })[0] || { geo: [55.75, 37.62] }).geo;
    var ROADS = AS.ROADS || {}, NAMES = AS.ROUTE_NAMES || {};
    var q = function (k) { return root.querySelector('[data-geo-' + k + ']'); };
    var W = 1, H = 1, K = 1, Hm = 1, GAP = 1, FH = 1, FM = 'monospace', cur = -1, vis = true, t0 = performance.now();
    // акцент дизайна: в «Оранжевом» — оранжевый, в «Брендбуке» — красный; светлый оттенок — для мягкого свечения и подписей
    var ACC = [255, 90, 31], LIG = [255, 139, 95];
    var A = function (a) { return 'rgba(' + ACC.join(',') + ',' + a + ')'; }, L = function (a) { return 'rgba(' + LIG.join(',') + ',' + a + ')'; };
    var DARK = function () { return 'rgb(' + ACC.map(function (c) { return Math.round(16 + c * .06); }).join(',') + ')'; };
    // view — что сейчас на увеличенной карте, target — куда нужно; shown — объект, чей регион нарисован;
    // fade — прозрачность плоской карты при смене региона
    var view = null, target = null, shown = -1, fade = 1, last = 0, hit = [], started = false;   // started — панель уже нарисовала кадр
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
      // схемы регионов сверху больше нет: кадр квартала занимает всю панель под заголовком (высота панели прежняя);
      // GAP — запас под заголовком для домов, выступающих за верх кадра
      Hm = 0; GAP = Math.round(W * 0.1); H = Math.round(W * 1.55); FH = H - GAP;
      var d = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
      cv.style.height = H + 'px';
      cv.width = Math.round(W * d); cv.height = Math.round(H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (clayEl) {   // слой 3D-карты: кадр нижней карты + поля, в которые выступают здания с края квартала
        var bl = clay ? clay.bleed(W, FH) : { x: 0, t: 0, b: 0 };
        clayEl.style.left = (cv.offsetLeft - bl.x) + 'px'; clayEl.style.top = (cv.offsetTop + Hm + GAP - bl.t) + 'px';
        clayEl.style.width = (W + 2 * bl.x) + 'px'; clayEl.style.height = (FH + bl.t + bl.b) + 'px';
        if (clay) { clay.resize(W, FH); clayEl.firstChild.style.transformOrigin = (bl.x + W / 2) + 'px ' + (bl.t + FH / 2) + 'px'; }
      }
    }
    function show(i) {
      if (i == null || !O[i] || (i === cur && target)) return;   // тот же объект ещё раз (сфера подтверждает показ) — без перезапуска квартала
      cur = i;
      var o = O[i];
      q('idx').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(O.length).padStart(2, '0');
      // подписи под картой нет (название и адрес — на карточке сферы); для экранных дикторов — в описании карты
      cv.setAttribute('aria-label', 'Карта: ' + o.short + ', ' + o.region + (o.route ? ', по трассе ' + (NAMES[o.route] || o.route) : ''));
      target = regionView(o);
      clayData = null; clayFor = -1; clayWant = clay && clay.has(o.id) ? i : -1;
      // тот же регион — карта остаётся, меняется только подсветка; другой — карта гаснет и проявляется на новом месте
      // до первого кадра (стартовый объект уточняет сфера) — без перехода; у объекта с 3D плоская карта не мелькает
      if (!view || reduce || !started) { view = copy(target); shown = i; flatA = hasClay(i) ? 0 : 1; }
      else if (shown < 0 || O[shown].region === o.region) shown = i;
    }

    // у объекта есть 3D-квартал — плоская карта региона для него не показывается вовсе (сразу квартал)
    function hasClay(i) { return !!(clay && O[i] && clay.has(O[i].id)); }
    function clayLoad(i) {
      clay.load(O[i].id).then(function (dd) {
        if (cur !== i || !dd) return;
        clayData = dd; clayFor = i; clayOnI = i; clayOnD = dd;
        cv.setAttribute('aria-label', 'Карта квартала: ' + dd.to + ', жильё — ' + dd.from + ', ' + clayLine(dd));
      });
    }
    function clayLine(d) { return d.line || 'Пешком до склада ' + d.rows[0][1] + ' · ' + d.rows[1][1]; }
    // плашки подписей без наложений
    function pill(text, x, y, style, placed, bounds, fs) {
      ctx.font = '600 ' + ((fs || 10) * K).toFixed(1) + 'px ' + FM;
      var lw = ctx.measureText(text).width, px = 5 * K, ph = (fs ? fs + 6 : 17) * K, dotW = style === 'obj' ? 9 * K : 0, bw = lw + px * 2 + dotW, g = 8 * K;
      var shield = style === 'shield' || style === 'shield-on';
      var cand = shield ? [[x - bw / 2, y - ph / 2]] : [[x - bw / 2, y - g - ph], [x - bw / 2, y + g], [x + g, y - ph / 2], [x - g - bw, y - ph / 2], [x + g, y - g - ph], [x - g - bw, y + g], [x + g, y + g], [x - g - bw, y - g - ph]];
      // подпись текущего объекта обязательна: если свободного места нет — туда, где наложение меньше;
      // подписи офисов допускают лишь касание соседей (до 8% площади)
      var least = null, la = 1e9;
      for (var c = 0; c <= cand.length; c++) {
        if (c === cand.length) { if (!least || !(style === 'accent' || style === 'obj' || (style === 'plain' && la < bw * ph * .08))) break; bx = least[0]; by = least[1]; }
        else {
          var bx = Math.max(bounds[0], Math.min(bounds[2] - bw, cand[c][0])), by = Math.max(bounds[1], Math.min(bounds[3] - ph, cand[c][1])), ov = 0;
          for (var i = 0; i < placed.length; i++) {
            var p = placed[i], ix = Math.min(bx + bw + 3, p[0] + p[2] + 3) - Math.max(bx, p[0]), iy = Math.min(by + ph + 3, p[1] + p[3] + 3) - Math.max(by, p[1]);
            if (ix > 0 && iy > 0) ov += ix * iy;
          }
          if (ov > 0) { if (ov < la) { la = ov; least = [bx, by]; } continue; }
        }
        placed.push([bx, by, bw, ph]);
        // obj — подпись объекта над 3D-кварталом: тёмная плашка, белый текст и красная точка (читается и на красной крыше)
        var obj = style === 'obj', acc = style === 'accent', on = style === 'shield-on';
        ctx.fillStyle = acc ? A(.95) : on ? DARK() : obj ? 'rgba(10,10,10,.94)' : 'rgba(14,14,14,.92)';
        ctx.strokeStyle = acc ? L(.7) : on ? L(.95) : obj ? A(.85) : shield ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.16)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(bx, by, bw, ph, (shield ? 3 : 5) * K); ctx.fill(); ctx.stroke();
        if (obj) { ctx.fillStyle = A(1); ctx.beginPath(); ctx.arc(bx + px + 2.5 * K, by + ph / 2, 2.5 * K, 0, TAU); ctx.fill(); }
        ctx.fillStyle = acc || obj ? '#fff' : on ? L(1) : shield ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.85)';
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(text, bx + px + dotW, by + ph / 2 + .5); ctx.textBaseline = 'alphabetic';
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
    // край увеличенной карты — неровный, как у 3D-квартала, и целиком внутри кадра: дороги уходят в фон до рамки,
    // рамка их не режет. Форма — «скруглённый квадрат» кадра с волной (своя у каждого региона), в долях полукадра
    function ragEdge(reg) {
      var h = 2166136261; for (var i = 0; i < reg.length; i++) { h ^= reg.charCodeAt(i); h = Math.imul(h, 16777619); } h >>>= 0;
      var ph = [0, 1, 2].map(function (k) { return ((h >>> (k * 8)) & 255) / 255 * TAU; });
      return function (an) { return 0.9 + 0.05 * (0.5 * Math.sin(2 * an + ph[0]) + 0.3 * Math.sin(3 * an + ph[1]) + 0.2 * Math.sin(5 * an + ph[2])); };
    }
    function sq4(u, v) { return Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25); }
    var maskCv = document.createElement('canvas'), maskKey = '';
    // маска: 16 вложенных контуров от края (прозрачно) к 0.68 края (непрозрачно) — плавный спад без фильтров
    function ragMask(edge, fw, fh, d, key) {
      if (maskKey === key) return maskCv;
      maskKey = key; maskCv.width = Math.round(fw * d); maskCv.height = Math.round(fh * d);
      var m = maskCv.getContext('2d'), n = 16;
      m.setTransform(d, 0, 0, d, 0, 0); m.clearRect(0, 0, fw, fh);
      for (var k = 0; k < n; k++) {
        var sc = 1 - 0.32 * k / (n - 1);
        m.fillStyle = 'rgba(0,0,0,' + (1 / (n - k)).toFixed(4) + ')'; m.beginPath();
        for (var i = 0; i <= 120; i++) {
          var an = i / 120 * TAU, c = Math.cos(an), sn = Math.sin(an), r = edge(an) * sc / sq4(c, sn);
          var x = fw / 2 + c * r * fw / 2, y = fh / 2 + sn * r * fh / 2;
          if (i) m.lineTo(x, y); else m.moveTo(x, y);
        }
        m.fill();
      }
      return maskCv;
    }

    function draw(t) {
      if (cur < 0 || !view || shown < 0) return;
      var reg = O[cur].region, route = O[cur].route, placed = [];
      hit = [];
      ctx.clearRect(0, 0, W, H);
      // ---------- кадр: 3D-квартал объекта или (если квартала нет) плоская карта региона ----------
      var o = O[shown]; reg = o.region; route = o.route;
      var fx = 0, fy = Hm + GAP, fw = W, fh = FH, lcx = fw / 2, lcy = fy + fh / 2, s2 = Math.min(fw, fh) / 2 / view.rad * (1 + .07 * (1 - fade));
      var ctr = [view.lat, view.lon];
      var ce = clayMix * clayMix * (3 - 2 * clayMix);   // видимость 3D-квартала
      var P2 = function (g) { var d = km(ctr, g); return [lcx + d[0] * s2, lcy - d[1] * s2]; };
      var edgeR = ragEdge(reg), vis = function (p) { var u = (p[0] - lcx) / (fw / 2), v = (p[1] - lcy) / (fh / 2); return sq4(u, v) / edgeR(Math.atan2(v, u)); };

      // плоская карта — только у объектов без 3D-квартала; когда она не видна, не рисуем её вовсе
      // (раньше рисовалась прозрачной на каждом кадре — тысячи лишних команд для видеокарты)
      if (fade * flatA > 0.004) {
      ctx.save();
      ctx.globalAlpha = fade * flatA;
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
      // карта уходит в фон к неровному краю (точки, кружки и подписи ниже — поверх, целиком)
      var ga = ctx.globalAlpha; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(ragMask(edgeR, fw, fh, cv.width / W, reg + '|' + fw + '|' + fh + '|' + cv.width), fx, fy, fw, fh);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ga;
      var inside = function (p) { return vis(p) < .82; };   // в видимой части карты — не у растворённого края
      var offSq = [];
      OFF.forEach(function (f, j) {
        if (f.kind === 'dispatch') return;
        var p = P2(f.geo); if (!inside(p)) return;
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
        if (!on && !inside(p)) return;   // у края — не рисуем вовсе, а не «обрезком»
        glow(p[0], p[1], (on ? 18 : 9) * K, on ? .95 : .5 * tw);
        dot(p[0], p[1], (on ? 3.6 : 2.3) * K, on ? '#fff' : L(1));
        placed.push(on ? [p[0] - 4 * K, p[1] - 4 * K, 8 * K, 8 * K] : [p[0] - 5 * K, p[1] - 5 * K, 10 * K, 10 * K]);
        if (flatA > .5) hit.push({ x: p[0], y: p[1], r: 12 * K, i: i });   // точки нажимаются, только пока плоская карта видна
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
        var f = OFF[j], p = P2(f.geo), k = placed.indexOf(offSq[j]); if (f.kind === 'dispatch' || !inside(p)) return;
        if (k >= 0) placed[k] = [p[0] - 4 * K, p[1] - 4 * K, 8 * K, 8 * K];
        pill(f.kind === 'hq' ? 'МОСКВА' : f.kind === 'stay' ? 'ЗАСЕЛЕНИЕ' : f.city.toUpperCase(), p[0], p[1], 'plain', placed, bounds);
        if (k >= 0) placed[k] = offSq[j];
      });
      // таблички трасс — там, где дорога подходит к краю видимой части карты; трасса к объекту — первой
      // не больше шести табличек — трассы с самым длинным видимым участком (без нагромождения у края)
      var refsIn = {}, seen = {};
      ways.forEach(function (w) { refsOf(w).forEach(function (r) { (refsIn[r] = refsIn[r] || []).push(w); }); });
      Object.keys(refsIn).forEach(function (r) {
        var L = 0;
        refsIn[r].forEach(function (w) { for (var i = 1; i < w.p.length; i++) { var a = P2(w.p[i - 1]), b = P2(w.p[i]); if (vis(a) < .9 && vis(b) < .9) L += Math.hypot(b[0] - a[0], b[1] - a[1]); } });
        seen[r] = L;
      });
      Object.keys(refsIn).filter(function (r) { return seen[r] > 30 * K || r === route; })
        .sort(function (a, b) { return (b === route) - (a === route) || seen[b] - seen[a]; }).slice(0, 6).forEach(function (r) {
        var best = null, bd = -1;
        refsIn[r].forEach(function (w) { w.p.forEach(function (g) {
          var p = P2(g), vv = vis(p);
          if (vv < .74 && vv > bd) { bd = vv; best = p; }
        }); });
        if (best) pill(r, best[0], best[1], r === route ? 'shield-on' : 'shield', placed, bounds, 8.5);
      });
      ctx.restore();
      }
      ctx.globalAlpha = 1;
      // подписи над 3D-кварталом — те же «пилюли», что на плоской карте: склад цветом дизайна, жильё — «заселение»
      var cp = ce > .02 && clay && clayOnI >= 0 ? clay.points() : null;
      if (cp) {
        ctx.save(); ctx.globalAlpha = ce;
        var cpl = [[fx, fy + fh - 22 * K, fw, 22 * K]], cb = [fx + 10 * K, fy + 10 * K, fx + fw - 10 * K, fy + fh - 10 * K];
        var pw = [fx + cp.wh[0], fy + cp.wh[1]], ph = cp.host && [fx + cp.host[0], fy + cp.host[1]], pa = cp.away && [fx + cp.away[0], fy + cp.away[1]];
        cpl.push([pw[0] - 8 * K, pw[1] - 8 * K, 16 * K, 16 * K]);
        if (ph) cpl.push([ph[0] - 7 * K, ph[1] - 7 * K, 14 * K, 14 * K]);
        pill(O[clayOnI].short.toUpperCase(), pw[0], pw[1] - 6 * K, 'obj', cpl, cb);
        if (ph) pill('ЗАСЕЛЕНИЕ', ph[0], ph[1], 'plain', cpl, cb);
        if (pa && clayOnD && clayOnD.away) pill(clayOnD.away.toUpperCase(), pa[0], pa[1], 'plain', cpl, cb);   // дорога от дальнего жилья
        ctx.restore();
      }
      // уголки видоискателя — общие для плоской карты и 3D-квартала
      var c = 16 * K; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.4;
      [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]].forEach(function (k) {
        ctx.beginPath(); ctx.moveTo(k[0] + k[2] * .7, k[1] + k[3] * c); ctx.lineTo(k[0] + k[2] * .7, k[1] + k[3] * .7); ctx.lineTo(k[0] + k[2] * c, k[1] + k[3] * .7); ctx.stroke();
      });
      // подпись внизу кадра: у плоской карты — радиус, у квартала — дорога от жилья до объекта
      ctx.font = '600 ' + (8.5 * K).toFixed(1) + 'px ' + FM; ctx.textAlign = 'left';
      if (flatA > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (.4 * fade * flatA).toFixed(3) + ')'; ctx.fillText('РАДИУС ' + Math.round(view.rad) + ' КМ', fx + 10 * K, fy + fh - 9 * K); }
      if (ce > 0 && clayOnD) { ctx.fillStyle = 'rgba(255,255,255,' + (.62 * ce).toFixed(3) + ')'; ctx.fillText(clayLine(clayOnD).toUpperCase(), fx + 10 * K, fy + fh - 9 * K); }
      // источник картографических данных (OpenStreetMap, лицензия ODbL) указан в подвале сайта, не в кадре
    }

    // нажатия: точка объекта — к объекту, регион на мини-карте — к первому объекту региона
    function pick(e) {
      var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 1e9;
      hit.forEach(function (h) { var d = Math.hypot(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h; } });
      return best;
    }
    cv.addEventListener('pointermove', function (e) {
      cv.style.cursor = pick(e) ? 'pointer' : '';
      if (clay) { var r = cv.getBoundingClientRect(), y = e.clientY - r.top - Hm - GAP; if (y >= 0 && y <= FH) clay.pointer((e.clientX - r.left) / W * 2 - 1, y / FH * 2 - 1); }
    });
    cv.addEventListener('pointerleave', function () { if (clay) clay.pointer(0, 0); });
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
      if (!vis || document.hidden || root.hidden || !target) { last = now; return; }
      if (now - last < 1000 / 60 - 2) return;   // не чаще 60 кадров (мониторы 120–240 Гц)
      var dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      // смена региона: кадр гаснет (0,18 с), карта переставляется на новый регион и проявляется с лёгким приближением (0,4 с);
      var away = shown !== cur;
      if (reduce) { view = copy(target); shown = cur; fade = 1; }
      else if (away) { fade = Math.max(0, fade - dt / 0.18); if (!fade) { view = copy(target); shown = cur; } }
      else fade = Math.min(1, fade + dt / 0.4);
      var flatT = shown >= 0 && hasClay(shown) ? 0 : 1;
      flatA = reduce ? flatT : flatT > flatA ? Math.min(flatT, flatA + dt / 0.35) : flatT < flatA ? Math.max(flatT, flatA - dt / 0.25) : flatA;
      if (clayEl) {
        if (clayWant >= 0 && clayMix === 0) { var cw = clayWant; clayWant = -1; if (cw === cur) clayLoad(cw); }
        var want = clayData && clayFor === cur && shown === cur ? 1 : 0;
        clayMix = reduce ? want : want ? Math.min(1, clayMix + dt / 0.7) : Math.max(0, clayMix - dt / 0.3);
        var cm = clayMix * clayMix * (3 - 2 * clayMix);
        clayEl.style.opacity = cm.toFixed(3);
        // квартал «приземляется» навстречу приближению (от центра кадра)
        if (clayEl.firstChild) clayEl.firstChild.style.transform = 'scale(' + (1.12 - .12 * cm).toFixed(4) + ')';
        if (clayMix > 0) clay.render(now);
      }
      draw(Math.max(0, (now - t0) / 1000)); started = true;   // первый кадр может прийти со временем чуть раньше t0
    })(t0);
    show(0);
    // предпросмотр: ?clay — сразу объект с 3D-данными и пауза автопоказа; ?clay&clayid=<id> — конкретный объект
    if (/[?&]clay\b/.test(location.search) && opts.onPick && AS.CLAY_IDS) setTimeout(function () {
      var want = (location.search.match(/[?&]clayid=([\w-]+)/) || [])[1];
      var k = O.findIndex(function (x) { return want ? x.id === want : AS.CLAY_IDS.indexOf(x.id) >= 0; });
      if (k < 0) return;
      opts.onPick(k);
      var pz = document.querySelector('[data-geo-pause]'); if (pz && !pz.classList.contains('is-paused')) pz.click();
    }, 900);
    return { show: show, resize: resize, current: function () { return cur; } };
  };
})();
