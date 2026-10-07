/* Варианты оплаты (offer2-7k2m.html): слово из точек на первом экране («СМЕТА» / «СТАВКА»)
   и сравнение двух вариантов за три месяца. Цены — в разметке (data-price) и в RATE ниже. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; };

  /* ================= ПЕРВЫЙ ЭКРАН: слово из точек =================
     Слово рисуется во внеэкранном холсте, из его пикселей берутся точки-цели; частицы летят к ним на пружине.
     При смене слова — новые цели и лёгкий разлёт. Курсор раздвигает точки, щелчок — следующее слово. */
  var hero = $('[data-hero]'), cv = $('[data-cv]'), stage = $('[data-stage]'), ctx = cv.getContext('2d');
  var WORDS = ['СМЕТА', 'СТАВКА'], TARGETS = [], P = [], wi = 0;
  var W = 0, H = 0, dpr = 1, gap = 6, size = 2.4, mouse = { x: -1e4, y: -1e4 }, visible = true, holdT = 0;
  var opts = $$('.opt');
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function sample(word) {
    var off = document.createElement('canvas'), o = off.getContext('2d');
    off.width = W; off.height = H;
    o.font = '900 100px Montserrat';
    // слово — по центру сцены (верхняя часть экрана над заголовком и суммами)
    var sr = stage.getBoundingClientRect(), hr = hero.getBoundingClientRect(), sh = sr.height, cy = sr.top - hr.top + sh * 0.56;
    var fs = Math.min(sh * 0.62, W * 0.86 / o.measureText(word).width * 100);
    o.font = '900 ' + fs + 'px Montserrat'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    o.fillText(word, W / 2, cy);
    var data = o.getImageData(0, 0, W, H).data, pts = [];
    for (var y = 0; y < H; y += gap) for (var x = 0; x < W; x += gap) {
      if (data[(y * W + x) * 4 + 3] > 140) pts.push([x + (Math.random() - .5) * gap * .5, y + (Math.random() - .5) * gap * .5]);
    }
    return shuffle(pts);
  }
  function build() {
    W = hero.clientWidth; H = hero.clientHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gap = Math.max(3, Math.round(Math.min(W, H) / 175)); size = Math.max(1.6, gap * 0.42);
    TARGETS = WORDS.map(sample);
    var n = Math.max.apply(null, TARGETS.map(function (t) { return t.length; }));
    while (P.length < n) P.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, tx: 0, ty: 0, red: Math.random() < 0.07, ph: Math.random() * 6.28 });
    P.length = n;
    aim(false);
  }
  function aim(kick) {
    var t = TARGETS[wi];
    P.forEach(function (p, i) {
      var q = t[i % t.length], extra = i >= t.length;   // лишние частицы ложатся почти точно на чужую цель
      p.tx = q[0] + (extra ? (Math.random() - .5) * gap * 0.25 : 0); p.ty = q[1] + (extra ? (Math.random() - .5) * gap * 0.25 : 0);
      if (kick) { p.vx += (Math.random() - .5) * 14; p.vy += (Math.random() - .5) * 14; }
    });
  }
  function setWord(i, hold) { if (hold) holdT = performance.now(); if (i === wi) return; wi = i; aim(true); }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    ctx.clearRect(0, 0, W, H);
    var R = Math.min(W, H) * 0.12, R2 = R * R, t = now * 0.001;
    for (var pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? '#e3393a' : 'rgba(255,255,255,.88)';
      for (var i = 0; i < P.length; i++) {
        var p = P[i];
        if (p.red !== !!pass) continue;
        // пружина к цели (с лёгким «дыханием») + отталкивание от курсора
        var tx = p.tx + Math.sin(t * 1.3 + p.ph) * 0.6, ty = p.ty + Math.cos(t * 1.1 + p.ph) * 0.6;
        p.vx += (tx - p.x) * 0.055; p.vy += (ty - p.y) * 0.055;
        var mx = p.x - mouse.x, my = p.y - mouse.y, d2 = mx * mx + my * my;
        if (d2 < R2) { var d = Math.sqrt(d2) || 1, f = (1 - d / R) * 3.2; p.vx += mx / d * f; p.vy += my / d * f; }
        p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy;
        var s = p.red ? size * 1.25 : size;
        ctx.fillRect(p.x, p.y, s, s);
      }
    }
  }
  // слово сменяется само; наведение на вариант внизу — показывает его слово
  if (!reduce) setInterval(function () { if (performance.now() - holdT > 5000) setWord((wi + 1) % WORDS.length); }, 3600);
  opts.forEach(function (o) {
    o.addEventListener('pointerenter', function () { setWord(+o.dataset.word, true); });
    o.addEventListener('focus', function () { setWord(+o.dataset.word, true); });
  });
  hero.addEventListener('pointermove', function (e) { var r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  hero.addEventListener('pointerleave', function () { mouse.x = mouse.y = -1e4; });
  cv.addEventListener('click', function () { setWord((wi + 1) % WORDS.length, true); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(hero);
  var rT = 0;
  window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(build, 200); });
  (document.fonts && document.fonts.load ? document.fonts.load('900 100px Montserrat') : Promise.resolve()).then(function () {
    build();
    if (reduce) P.forEach(function (p) { p.x = p.tx; p.y = p.ty; });
    requestAnimationFrame(frame);
  });

  /* ================= СРАВНЕНИЕ ЗА ТРИ МЕСЯЦА ================= */
  var RATE = 75000, MONTHS = 3, RATE_SUM = RATE * MONTHS;
  var items = $$('[data-item]'), sups = $$('[data-sup]');
  var tg = $('[data-item="tg"]'), max = $('[data-item="max"]'), rowMax = $('[data-row-max]'), maxNote = $('[data-max-note]'), maxNoteDef = maxNote.textContent;
  var devEl = $('[data-dev]'), supLine = $('[data-sup-line]'), supV = $('[data-sup-v]'), dockA = $('[data-dock-a]'), dockSup = $('[data-dock-sup]'), barA = $('[data-bar-a]'), barB = $('[data-bar-b]'), barAV = $('[data-bar-a-v]'), diffEl = $('[data-diff-text]'), diffSup = $('[data-diff-sup]');
  var barsOn = !('IntersectionObserver' in window) || reduce;
  function update() {
    // MAX — второй канал к боту: без бота в Telegram не заказывается
    if (!tg.checked) { max.checked = false; max.disabled = true; rowMax.classList.add('is-lock'); maxNote.textContent = 'подключается только вместе с ботом в Telegram — сначала отметьте его'; }
    else { max.disabled = false; rowMax.classList.remove('is-lock'); maxNote.textContent = maxNoteDef; }
    var dev = 0, sup = 0;
    items.forEach(function (c) { var on = c.checked; c.closest('.row').classList.toggle('is-off', !on); if (on) dev += +c.dataset.price; });
    sups.forEach(function (c) { c.closest('.row').classList.toggle('is-off', !c.checked); if (c.checked) sup += +c.dataset.price; });
    devEl.textContent = fmt(dev); dockA.textContent = fmt(dev);
    supLine.hidden = !sup; supV.textContent = fmt(sup);
    dockSup.textContent = sup ? '+ ' + fmt(sup) + ' в месяц' : '';
    var top = Math.max(dev, RATE_SUM, 1);
    if (barsOn) { barA.style.setProperty('--w', (dev / top * 100).toFixed(1) + '%'); barB.style.setProperty('--w', (RATE_SUM / top * 100).toFixed(1) + '%'); }
    barAV.textContent = fmt(dev);
    var d = dev - RATE_SUM, supTxt = '.';
    diffSup.hidden = !sup; diffSup.textContent = 'По смете к этому добавляется сопровождение — ' + fmt(sup) + ' в месяц после запуска; в ставку оно уже входит.';
    if (!dev) diffEl.innerHTML = 'Ничего не отмечено — по смете платить не за что; ставка — <em>' + fmt(RATE_SUM) + '</em> за три месяца.';
    else if (d > 0) diffEl.innerHTML = 'За три месяца ставка обходится на <em>' + fmt(d) + '</em> меньше' + supTxt;
    else if (d < 0) diffEl.innerHTML = 'При таком объёме смета дешевле на <em>' + fmt(-d) + '</em>.';
    else diffEl.innerHTML = 'При таком объёме варианты стоят одинаково — <em>' + fmt(dev) + '</em>.';
  }
  items.concat(sups).forEach(function (c) { c.addEventListener('change', function () {
    if (c === max && max.checked && !tg.checked) tg.checked = true;
    update();
  }); });
  update();
  // полосы разницы вырастают, когда блок появился на экране
  if (!barsOn) {
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); barsOn = true; update(); } }, { threshold: 0.4 });
    io.observe($('[data-diff]'));
  }

  // итог внизу экрана: пока видна таблица и ещё не видны итоги под ней
  var dockbar = $('[data-dockbar]'), cmpIn = false, sumIn = false;
  function dockSync() { dockbar.classList.toggle('is-on', cmpIn && !sumIn); }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { cmpIn = es[0].isIntersecting; dockSync(); }, { rootMargin: '0px 0px -30% 0px' }).observe($('[data-cmp]'));
    new IntersectionObserver(function (es) { sumIn = es[0].isIntersecting; dockSync(); }, { threshold: 0.2 }).observe($('.cmp__sum'));
  }

  // «← К сайту»: если пришли со страницы сайта — возвращаемся туда же
  var back = $('[data-back]');
  try { var ref = new URL(document.referrer); if (ref.origin === location.origin && !/offer/.test(ref.pathname)) back.href = ref.href; } catch (e) {}

  $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
})();
