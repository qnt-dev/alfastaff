/* Альфа-Стафф · предложение по цифровому развитию (скрытая страница offer-7k2m.html).
   Плашка меню (как на сайте: врезка, импульс), живая полоса состава проектов, график сравнения во времени,
   «удар сердца» по линии плана. Все цены — в PRICES/PLAN ниже: поменять цифру можно в одном месте. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var plural = function (n, a, b, c) { var m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
  var accent = function () { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c41718'; };

  // ---------- цены и план (₽) ----------
  var MONTHLY = 75000;                                   // постоянное развитие
  // проекты по плану на 3 месяца: сайты № 1 и № 2 — 1-й месяц, № 3 — 2-й, боты — 3-й;
  // сопровождение сайтов — со 2-го месяца, ботов — с 4-го (по 10 000 ₽)
  var V1 = [0]; (function () {
    var sum = 0;
    for (var m = 1; m <= 12; m++) {
      if (m === 1) sum += 200000;
      if (m === 2) sum += 100000;
      if (m === 3) sum += 90000;
      if (m >= 2) sum += 10000;
      if (m >= 4) sum += 10000;
      V1.push(sum);
    }
  })();
  var V2 = []; for (var i = 0; i <= 12; i++) V2.push(MONTHLY * i);
  var WHAT1 = ['', 'Сайты № 1 и № 2.', 'Сайты № 1–3, сопровождение сайтов.', 'Сайты № 1–3, боты Telegram и MAX, сопровождение сайтов.'];
  var WHAT2 = ['', 'Сайты № 1 и № 2, список задач для автоматизации.', 'Сайты № 1–3, сценарии ботов, сопровождение.', 'Сайты № 1–3, боты Telegram и MAX, пилот автоматизации или ИИ.'];

  // ---------- «удар сердца» — развёртка, как на кардиомониторе (общая для плашки и плана) ----------
  function wave(u) {
    var g = function (c, w, a) { var d = (u - c) / w; return a * Math.exp(-d * d); };
    return g(-1.9, 0.38, 0.16) + g(-0.62, 0.11, -0.14) + g(-0.36, 0.12, 1) + g(-0.1, 0.11, -0.42) + g(1.05, 0.5, 0.26);
  }
  // луч идёт по холсту (rtl — справа налево, ltr — слева направо) и рисует линию; в точках centers — удар сердца; след гаснет
  function sweep(cv, o) {
    var W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1), ctx = cv.getContext('2d');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var acc = accent(), mid = H / 2, amp = H * 0.44, unit = H * 0.72, ltr = o.dir === 'ltr';
    var TRAVEL = o.travel || 700, TAU = o.tau || 170, END = TRAVEL + 5 * TAU, t0 = performance.now();
    var ease = function (p) { return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; };
    var unease = function (e) { return e < .5 ? Math.sqrt(e / 2) : 1 - Math.sqrt(2 * (1 - e)) / 2; };
    var y = function (x) { var s = 0; o.centers.forEach(function (c) { s += wave(ltr ? (x - c) / unit : (c - x) / unit); }); return mid - amp * s; };
    var pos = function (e) { return ltr ? W * e : W * (1 - e); };          // где луч при доле пути e
    cancelAnimationFrame(cv._raf);
    (function frame() {
      var t = performance.now() - t0;
      ctx.clearRect(0, 0, W, H);
      if (t >= END || (o.stop && o.stop())) return;
      var p = Math.min(1, t / TRAVEL), head = pos(ease(p));
      for (var pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass ? 1.5 : 4; ctx.lineCap = 'round'; ctx.strokeStyle = acc;
        for (var k = 0; k < W; k++) {
          var x = ltr ? k : W - k, x2 = ltr ? x + 1 : x - 1;
          if (ltr ? x >= head : x <= head) break;
          var age = t - unease(ltr ? x / W : 1 - x / W) * TRAVEL, a = Math.exp(-age / TAU);
          if (a < .02) continue;
          ctx.globalAlpha = pass ? a : a * 0.18;
          ctx.beginPath(); ctx.moveTo(x, y(x)); ctx.lineTo(ltr ? Math.min(head, x2) : Math.max(head, x2), y(ltr ? Math.min(head, x2) : Math.max(head, x2))); ctx.stroke();
        }
      }
      if (p < 1) {
        var hy = y(head), env = Math.min(1, p / 0.08, (1 - p) / 0.12), r = H * 0.55;
        var gr = ctx.createRadialGradient(head, hy, 0, head, hy, r);
        gr.addColorStop(0, acc); gr.addColorStop(1, 'transparent');
        ctx.globalAlpha = 0.55 * env; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(head, hy, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = env; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(head, hy, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      cv._raf = requestAnimationFrame(frame);
    })();
  }

  // ---------- плашка меню (поведение как на сайте) ----------
  var nav = $('[data-nav]'), trig = $('.nav__trigger', nav), menu = $('#nav-menu'), cap = $('.hero__cap');
  var open = false, intentT = 0, leaveT = 0;
  function setOpen(v) {
    open = v; menu.hidden = !v;
    nav.classList.toggle('is-open', v); nav.classList.toggle('is-menu', v);
    trig.setAttribute('aria-expanded', v ? 'true' : 'false');
  }
  trig.addEventListener('click', function () { setOpen(!open); });
  trig.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'mouse') return; clearTimeout(intentT); intentT = setTimeout(function () { setOpen(true); }, 140); });
  trig.addEventListener('pointerleave', function () { clearTimeout(intentT); });
  nav.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && open) leaveT = setTimeout(function () { setOpen(false); }, 260); });
  nav.addEventListener('pointerenter', function () { clearTimeout(leaveT); });
  document.addEventListener('pointerdown', function (e) { if (open && !nav.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) { setOpen(false); trig.focus(); } });
  // тон: светлая над белым листом, тёмная над тёмным
  var dark = null;
  function tone() {
    var r = $('.nav__bar', nav).getBoundingClientRect(), els = document.elementsFromPoint(r.left + 6, r.top + r.height / 2), d = true;
    for (var i = 0; i < els.length; i++) {
      if (nav.contains(els[i])) continue;
      for (var el = els[i]; el && el.nodeType === 1; el = el.parentElement) {
        var m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
        if (m && (m.length < 4 || +m[3] > 0.5)) { d = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2] < 128; break; }
      }
      break;
    }
    if (d !== dark) { dark = d; nav.classList.toggle('is-dark', d); }
  }
  // наверху плашка сидит во врезке листа и уезжает вместе с ней
  var docked = false;
  function dock() {
    var y = window.scrollY, lim = cap && cap.offsetParent ? cap.getBoundingClientRect().bottom + y : 0, on = y < lim;
    if (on) nav.style.setProperty('--dock-y', y.toFixed(1));
    if (on === docked) return;
    docked = on; nav.classList.toggle('is-docked', on); nav.classList.remove('is-float-in');
    if (!on) { void nav.offsetWidth; nav.classList.add('is-float-in'); }
  }
  nav.addEventListener('animationend', function (e) { if (e.animationName === 'nav-float-in') { nav.classList.remove('is-float-in'); tone(); } });
  var toneT = 0;
  window.addEventListener('scroll', function () { dock(); tone(); clearTimeout(toneT); toneT = setTimeout(tone, 180); }, { passive: true });
  window.addEventListener('resize', function () { dock(); tone(); });
  dock(); tone();
  // импульс от знака к точкам: дважды после загрузки, потом раз в 11 с
  var trace = $('.nav__trace', nav), pulseT = 0;
  function pulse() {
    if (reduce || open || document.hidden) return;
    nav.classList.remove('is-pulse'); void nav.offsetWidth; nav.classList.add('is-pulse');
    clearTimeout(pulseT); pulseT = setTimeout(function () { nav.classList.remove('is-pulse'); }, 1700);
    setTimeout(function () { if (trace) sweep(trace, { dir: 'rtl', centers: [trace.clientWidth * 0.5], stop: function () { return open; } }); }, 450);
  }
  if (!reduce) (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(pulse, 1200); setTimeout(pulse, 3200); setInterval(pulse, 11000); });

  // ---------- плавный переход по разделам ----------
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var t = document.getElementById(a.getAttribute('href').slice(1)); if (!t) return;
      e.preventDefault(); setOpen(false);
      window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - (t.id === 'variants' ? 0 : 12), behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  // ---------- появление при прокрутке ----------
  function onView(el, fn, th) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: th || 0.3 });
    io.observe(el);
  }
  function countTo(el, to, from) {
    if (reduce) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), d = 900; from = from == null ? 0 : from;
    (function f() { var p = Math.min(1, (performance.now() - t0) / d), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(f); })();
  }
  $$('[data-count]').forEach(function (el) { onView(el, function () { countTo(el, +el.getAttribute('data-count')); }, 0.6); });

  // ---------- 01 · полоса состава проектов ----------
  var bar = $('[data-bar]'), totalEl = $('[data-total]'), hint = $('[data-bar-hint]'), hintDef = hint ? hint.textContent : '';
  if (bar) {
    var segs = $$('.of-bar__seg', bar), full = 0, last = 0;
    segs.forEach(function (s) { full += +s.dataset.price; });
    segs.forEach(function (s) {
      var p = +s.dataset.price;
      s.style.setProperty('--g', p / 1000); s.style.setProperty('--pct', (p / full * 100).toFixed(1) + '%');
      s.addEventListener('click', function () { s.setAttribute('aria-pressed', s.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); upd(); });
      var show = function () { hint.textContent = s.dataset.name + ': ' + fmt(p) + ' ₽ — ' + s.dataset.detail + (s.getAttribute('aria-pressed') === 'true' ? '' : ' (выключено)'); };
      s.addEventListener('pointerenter', show); s.addEventListener('focus', show);
      s.addEventListener('pointerleave', function () { hint.textContent = hintDef; });
    });
    var upd = function () {
      var sum = 0; segs.forEach(function (s) { if (s.getAttribute('aria-pressed') === 'true') sum += +s.dataset.price; });
      countTo(totalEl, sum, last); last = sum;
    };
    last = full;
  }

  // ---------- 02 · сравнение во времени ----------
  var chart = $('[data-chart]'), svg = chart && $('svg', chart), range = $('[data-month]');
  if (svg) {
    var NS = 'http://www.w3.org/2000/svg', L = 78, R = 30, T = 22, B = 44, VW = 1000, VH = 440, PW = VW - L - R, PH = VH - T - B, YMAX = 1000000;
    var X = function (m) { return L + m / 12 * PW; }, Y = function (v) { return T + PH - v / YMAX * PH; };
    var el = function (name, attrs, parent) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; };
    var crossTag = null, crossM = 0;
    var defs = el('defs', {}), lg = el('linearGradient', { id: 'of-g2', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': accent(), 'stop-opacity': 0.16 }, lg); el('stop', { offset: 1, 'stop-color': accent(), 'stop-opacity': 0 }, lg);
    for (var v = 0; v <= YMAX; v += 200000) {
      el('line', { class: 'ch-grid', x1: L, x2: VW - R, y1: Y(v), y2: Y(v) });
      el('text', { class: 'ch-ax', x: L - 12, y: Y(v) + 4, 'text-anchor': 'end' }).textContent = String(v / 1000);
    }
    el('text', { class: 'ch-ax', x: L - 12, y: T - 24, 'text-anchor': 'end' }).textContent = 'тыс ₽';   // единица — один раз над осью
    [0, 3, 6, 9, 12].forEach(function (m) { el('text', { class: 'ch-ax', x: X(m), y: VH - 14, 'text-anchor': 'middle' }).textContent = m ? m + ' мес' : 'старт'; });
    var pts = function (A) { return A.map(function (v, m) { return X(m).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' L '); };
    el('path', { class: 'ch-area', d: 'M ' + pts(V2) + ' L ' + X(12) + ' ' + Y(0) + ' L ' + X(0) + ' ' + Y(0) + ' Z' });
    var p1 = el('path', { class: 'ch-v1 ch-draw', d: 'M ' + pts(V1) }), p2 = el('path', { class: 'ch-v2 ch-draw', d: 'M ' + pts(V2) });
    [p1, p2].forEach(function (p) { var len = p.getTotalLength(); p.style.setProperty('--len', len); p.style.strokeDasharray = len; });
    V1.forEach(function (v, m) { if (m) el('circle', { class: 'ch-pt ch-pt--v1', cx: X(m), cy: Y(v), r: 4 }); });
    // точка, где затраты сравниваются
    for (var m = 1; m <= 12; m++) {
      if (V2[m] >= V1[m] && V2[m - 1] < V1[m - 1]) {
        var t = (V1[m - 1] - V2[m - 1]) / ((V2[m] - V2[m - 1]) - (V1[m] - V1[m - 1])), cm = m - 1 + t, cv = V2[m - 1] + (V2[m] - V2[m - 1]) * t;
        el('circle', { cx: X(cm), cy: Y(cv), r: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, style: 'color: var(--ink-3)' });
        // подпись — под точкой пересечения, справа; прячется, когда отметка месяца рядом (чтобы подписи не налезали)
        crossTag = el('text', { class: 'ch-cross', x: X(cm) + 14, y: Y(cv) + 30, 'text-anchor': 'start' });
        crossTag.textContent = 'затраты равны ≈ ' + String(cm.toFixed(1)).replace('.', ',') + ' мес';
        crossM = cm;
        break;
      }
    }
    var hov = el('line', { class: 'ch-hover', y1: T, y2: T + PH });
    var cur = el('line', { class: 'ch-cur', y1: T, y2: T + PH }), d1 = el('circle', { class: 'ch-dot--v1', r: 6 }), d2 = el('circle', { class: 'ch-dot--v2', r: 6 });
    var tag1 = el('text', { class: 'ch-tag ch-tag--v1' }), tag2 = el('text', { class: 'ch-tag ch-tag--v2' });
    var v1El = $('[data-v1]'), v2El = $('[data-v2]'), w1 = $('[data-v1-what]'), w2 = $('[data-v2-what]'), word = $('[data-month-word]'), marks = $$('[data-goto]');
    var prevM = 0;
    var setMonth = function (mm) {
      var x = X(mm), y1 = Y(V1[mm]), y2 = Y(V2[mm]), right = mm > 9;
      cur.setAttribute('x1', x); cur.setAttribute('x2', x);
      d1.setAttribute('cx', x); d1.setAttribute('cy', y1); d2.setAttribute('cx', x); d2.setAttribute('cy', y2);
      var up = y1 < y2;   // подписи не налезают: верхняя — выше точки, нижняя — ниже
      [[tag1, y1, V1[mm], up], [tag2, y2, V2[mm], !up]].forEach(function (a) {
        a[0].setAttribute('x', right ? x - 12 : x + 12); a[0].setAttribute('text-anchor', right ? 'end' : 'start');
        a[0].setAttribute('y', a[3] ? a[1] - 12 : a[1] + 22); a[0].textContent = fmt(a[2]) + ' ₽';
      });
      if (prevM) { countTo(v1El, V1[mm], V1[prevM]); countTo(v2El, V2[mm], V2[prevM]); } else { v1El.textContent = fmt(V1[mm]); v2El.textContent = fmt(V2[mm]); }
      prevM = mm;
      w1.textContent = mm <= 3 ? WHAT1[mm] : WHAT1[3].replace('сопровождение сайтов.', 'сопровождение сайтов и ботов (до 10 часов в месяц).');
      w2.textContent = mm <= 3 ? WHAT2[mm] : WHAT2[3].replace(/\.$/, '') + ' — и ещё ' + (mm - 3) + ' ' + plural(mm - 3, 'месяц', 'месяца', 'месяцев') + ' разработки, автоматизации и внедрения ИИ.';
      word.textContent = mm + ' ' + plural(mm, 'месяц', 'месяца', 'месяцев');
      range.style.setProperty('--f', ((mm - 1) / 11).toFixed(4));
      if (crossTag) crossTag.style.opacity = Math.abs(mm - crossM) < 1.6 ? 0 : 1;
      marks.forEach(function (b) { b.classList.toggle('is-on', +b.dataset.goto === mm); });
    };
    range.addEventListener('input', function () { setMonth(+range.value); });
    // месяцы на графике кликабельны: нажатие или протяжка по графику переносит отметку (и ползунок) на ближайший месяц
    var hitMonth = function (e) {
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * VW;
      return Math.max(1, Math.min(12, Math.round((x - L) / PW * 12)));
    };
    var go = function (mm) { if (+range.value !== mm) { range.value = mm; setMonth(mm); } };
    var dragging = false;
    for (var hm = 1; hm <= 12; hm++) el('rect', { class: 'ch-hit', x: X(hm - 0.5), y: T, width: PW / 12, height: PH });
    svg.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') e.preventDefault(); dragging = true; svg.setPointerCapture(e.pointerId); go(hitMonth(e)); });
    svg.addEventListener('pointermove', function (e) {
      var mm = hitMonth(e);
      hov.setAttribute('x1', X(mm)); hov.setAttribute('x2', X(mm)); hov.classList.toggle('is-on', !dragging && e.pointerType === 'mouse');
      if (dragging) go(mm);
    });
    svg.addEventListener('pointerup', function () { dragging = false; });
    svg.addEventListener('pointercancel', function () { dragging = false; });
    svg.addEventListener('pointerleave', function () { hov.classList.remove('is-on'); });
    marks.forEach(function (b) { b.addEventListener('click', function () { range.value = b.dataset.goto; setMonth(+b.dataset.goto); }); });
    setMonth(+range.value);
    onView(chart, function () { chart.classList.add('is-drawn'); }, 0.35);
  }

  // ---------- 03 · «удар сердца» по линии плана: месяц за месяцем ----------
  var plan = $('[data-plan]'), pcv = $('[data-plan-pulse]');
  if (plan && pcv && !reduce) {
    var planOn = false, planT = 0;
    var run = function () {
      if (!planOn || document.hidden) return;
      var pr = pcv.getBoundingClientRect();
      var cs = $$('.of-step__dot', plan).map(function (d) { var r = d.getBoundingClientRect(); return r.left + r.width / 2 - pr.left; });
      sweep(pcv, { dir: 'ltr', centers: cs, travel: 2200, tau: 420 });
      // точки месяцев вспыхивают, когда до них доходит луч
      $$('.of-step__dot', plan).forEach(function (d, k) {
        var e = cs[k] / pr.width, p = e < .5 ? Math.sqrt(e / 2) : 1 - Math.sqrt(2 * (1 - e)) / 2;
        setTimeout(function () { d.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.7)', boxShadow: '0 0 0 0.6rem rgba(196,23,24,.25)' }, { transform: 'scale(1)' }], { duration: 600, easing: 'ease-out' }); }, p * 2200);
      });
    };
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) {
      planOn = es[0].isIntersecting; clearInterval(planT);
      if (planOn) { run(); planT = setInterval(run, 5200); }
    }, { threshold: 0.4 }).observe(plan);
  }

  // ---------- PDF ----------
  $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
})();
