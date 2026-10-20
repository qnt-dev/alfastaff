/* Shared candidate model and employer calculator modal. Goal renders candidates;
   eligibility, rates, calendar and finance remain in the shared AS.CalcModal API.
   Employer inputs, popups, focus handling and request form stay in this module. */
(function () {
  'use strict';
  var AS = window.AS || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cm = $('[data-cm]');
  var O = (AS.CALC && AS.CALC.objects) || [];
  if (!cm || !O.length) return;
  var money = AS.money || function (n) { return String(Math.round(n)); };
  var plural = AS.plural || function (n, a, b, c) { return c; };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ставки в таблице заказчика — до налога; оформление через самозанятость: налог на профессиональный доход 6 %
  var TAX = 0.06;
  // компенсация дороги (условия «Альфа-Стафф»): при вахте от 30 смен возвращаем стоимость дороги по билетам — до 10 000 ₽
  var ROAD_COMP = 10000, ROAD_COMP_FROM = 30;
  // свой штат: страховые взносы ≈ 30 % фонда оплаты; запас людей на невыходы (больничные, прогулы) — 8 %
  var CONTRIB = 0.3, ABSENCE = 0.08, TRAIN_SHIFTS = 2;

  // рабочих смен в неделю при графике: 6/1 — шесть смен и выходной, 7/0 — без выходных
  var WEEK = { '6/1': 6, '7/0': 7, '5/2': 5, '2/2': 3.5 };
  // календарь вахты: [смен подряд, выходных после них]. День заезда — первая смена; выходные — после каждых N смен;
  // после последней смены выходного нет — человек уезжает
  var CYCLE = { '6/1': [6, 1], '7/0': [7, 0], '5/2': [5, 2], '2/2': [2, 2] };
  function shiftDay(n, sched) { var c = CYCLE[sched] || CYCLE['7/0']; return n > 0 ? n - 1 + c[1] * Math.floor((n - 1) / c[0]) : 0; }   // n-я смена — в какой день от заезда (0 — день заезда)
  function daysOn(n, sched) { return n > 0 ? shiftDay(n, sched) + 1 : 0; }
  var CHEV = '<svg class="cm-tk__chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5L8 10l3.5-3.5" /></svg>';
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rub(n) { return money(Math.round(n)) + ' ₽'; }
  // число из поля — целые рубли (штуки): копейки и доли не считаем. «600», «600,00», «600.5» — 600; «6 000», «6.000», «6 000,50» — 6000.
  // Разделитель с одной-двумя цифрами в конце — дробная часть, с тремя — разряды
  function parseNum(s) {
    var d = String(s).replace(/[\s  ]/g, '').replace(/[.,]\d{0,2}$/, '').replace(/\D/g, '').slice(0, 9);
    return parseInt(d, 10) || 0;
  }
  function num(el) { return parseNum(el.value); }
  // при наборе в поле остаются только цифры, пробелы и разделители — набранное не переписываем, считаем по parseNum
  function cleanNum(inp, max) {
    var v = inp.value.replace(/[^\d\s .,]/g, '').slice(0, max || 14);
    if (v !== inp.value) inp.value = v;
  }
  var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function day(d) { return d.getDate() + '\u00a0' + MON[d.getMonth()]; }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- окно ---------- */
  var opener = null;
  function open(e) {
    opener = e && e.currentTarget || document.activeElement;
    cm.hidden = false;
    if (AS.lenis) AS.lenis.stop();
    document.documentElement.classList.add('cm-lock');
    fitInputs();
    requestAnimationFrame(function () { requestAnimationFrame(function () { cm.classList.add('is-open'); }); });
    setTimeout(function () { var c = $('.cm__close', cm); if (c) c.focus({ preventScroll: true }); }, 60);
  }
  function close() {
    if (cm.hidden) return;
    closePop(true);
    cm.classList.remove('is-open');
    document.documentElement.classList.remove('cm-lock');
    if (AS.lenis) AS.lenis.start();
    setTimeout(function () { cm.hidden = true; }, reduce ? 0 : 420);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  $$('[data-calc-open]').forEach(function (b) { b.addEventListener('click', open); });
  $$('[data-cm-close]', cm).forEach(function (b) { b.addEventListener('click', close); });
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';
  function trap(e, box) {   // фокус по Tab не уходит из окна (или из открытой плашки)
    var f = $$(FOCUSABLE, box).filter(function (x) {
      var closed = x.closest('details:not([open])');
      return x.offsetParent !== null && !x.closest('[inert]') && (!closed || closed.querySelector('summary').contains(x));
    });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', function (e) {
    if (cm.hidden) return;
    // Let an open native picker consume Escape/Tab before the modal handles them.
    if (e.defaultPrevented || (window.CSS && CSS.supports('selector(select:open)') && cm.querySelector('select:open'))) return;
    if (popBtn) {
      if (e.key === 'Escape') { e.preventDefault(); closePop(false, true); }
      else if (e.key === 'Tab') trap(e, pop);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') trap(e, $('.calc-workspace', cm) || $('.cm__panel', cm));
  });

  /* ---------- вкладки, «Уточнить», поля с суммами, строка итога на телефоне ---------- */
  var panel = $('.cm__panel', cm), barEl = $('[data-cm-bar]', cm), bar = ['', '', ''], barSeen = false;
  function drawBar() {
    barEl.hidden = cm.dataset.tab !== 'biz';
    if (barEl.hidden) return;
    $('[data-cm-bar-main]', cm).textContent = bar[0]; $('[data-cm-bar-sub]', cm).textContent = bar[1]; $('[data-cm-bar-btn]', cm).textContent = bar[2];
    barEl.classList.toggle('is-off', barSeen);
  }
  function tab(t) {
    closePop(true);
    cm.dataset.tab = t;
    $$('[data-cm-tab]', cm).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.cmTab === t ? 'true' : 'false'); });
    $$('[data-cm-pane]', cm).forEach(function (p) { p.hidden = p.dataset.cmPane !== t; });
    drawBar(); fitInputs();
  }
  $$('[data-cm-tab]', cm).forEach(function (b) { b.addEventListener('click', function () { tab(b.dataset.cmTab); }); });
  $$('[data-cm-more]', cm).forEach(function (m) {
    var btn = $('.cm-more__btn', m), body = $('.cm-more__body', m);
    btn.addEventListener('click', function () {
      var on = !m.hasAttribute('data-open');
      m.toggleAttribute('data-open', on); btn.setAttribute('aria-expanded', String(on));
      if (on) body.removeAttribute('inert'); else body.setAttribute('inert', '');
      fitInputs();
    });
  });
  // суммы — с пробелами между разрядами (после ввода); копейки можно набрать, но в расчёт и в поле после ввода идут целые рубли;
  // ширина поля — по тексту, как у слова во фразе
  var ruler = document.createElement('canvas').getContext('2d');
  function fitInput(inp) {
    var cs = getComputedStyle(inp);
    ruler.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    inp.style.width = Math.ceil(ruler.measureText(inp.value || inp.placeholder || '0').width + 2) + 'px';
  }
  function fitInputs() { $$('.cm-tk--in input', cm).forEach(fitInput); }
  $$('[data-cm-money], [data-cm-int]', cm).forEach(function (inp) {
    var max = +inp.getAttribute('maxlength') || 0;
    if (max) inp.removeAttribute('maxlength');   // «40,5» в поле из трёх цифр тоже должно набираться — длину держит cleanNum
    inp.addEventListener('input', function () { cleanNum(inp, max ? max + 3 : 0); fitInput(inp); });
    inp.addEventListener('blur', function () { var v = num(inp); inp.value = v ? (inp.hasAttribute('data-cm-money') ? money(v) : String(v)) : ''; fitInput(inp); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitInputs);
  // на телефоне итог — ниже фразы: пока выбираешь, сумма видна в строке внизу шторки
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { barSeen = e.isIntersecting; }); drawBar();
    }, { root: panel, threshold: 0.2 });
    $$('[data-cm-pane="biz"] .cm__result', cm).forEach(function (r) { io.observe(r); });
  }
  $('[data-cm-bar-go]', cm).addEventListener('click', function () {
    var r = $('[data-cm-pane="biz"] .cm__result', cm);
    if (r) panel.scrollTo({ top: r.offsetTop - 16, behavior: reduce ? 'auto' : 'smooth' });
  });
  // крупная сумма в итоге не прыгает, а докручивается до нового значения
  var shown = {}, raf = {};
  function tween(key, el) {
    if (!el) return;
    var to = +el.dataset.cmNum, from = shown[key];
    shown[key] = to; cancelAnimationFrame(raf[key]);
    if (reduce || from == null || from === to) { el.textContent = money(to); return; }
    var t0 = performance.now();
    (function f(now) {
      var p = Math.min(1, (now - t0) / 480), k = 1 - Math.pow(1 - p, 3);
      el.textContent = money(from + (to - from) * k);
      if (p < 1) raf[key] = requestAnimationFrame(f);
    })(t0);
  }

  /* ---------- плашка выбора: выезжает от слова во фразе (на телефоне — шторка снизу) ---------- */
  var pop = $('[data-cm-pop]', cm), popIn = $('.cm-pop__in', pop), scrim = $('[data-cm-scrim]', cm), popBtn = null, popT = 0;
  var sheet = window.matchMedia('(max-width: 900px)');
  var SEL = {};
  function drawTokens() {
    $$('.cm-tk[data-cm-k]', cm).forEach(function (b) {
      var s = SEL[b.dataset.cmK], l = s.label();
      // предлоги и союзы не отрываются от следующего слова в конце строки
      // галочка не отрывается ни от последнего слова, ни от запятой или точки после слова (U+2060 — «не переносить»)
      b.innerHTML = '<span class="cm-tk__t">' + esc(l).replace(/(^|\s)(в|во|и|на|по|с|до)\s/g, '$1$2\u00a0') + '</span>\u2060' + CHEV + '\u2060';
      b.classList.toggle('is-wrap', l.length > 24);   // короткий выбор переносится целиком, длинный — по словам
      b.classList.toggle('is-empty', !!(s.empty && s.empty()));   // не указано — пунктирная капсула
      b.setAttribute('aria-label', s.name + ': ' + l);
      b.setAttribute('aria-haspopup', 'dialog');
      if (b !== popBtn) b.setAttribute('aria-expanded', 'false');
    });
  }
  function refresh() { drawTokens(); drawBiz(); place(); }
  function openPop(btn) {
    if (popBtn === btn) { closePop(false, true); return; }
    var key0 = btn.dataset.cmK;
    closePop(true);
    if (!document.contains(btn)) btn = $('[data-cm-pane]:not([hidden]) [data-cm-k="' + key0 + '"]', cm);   // слово перерисовано вместе с итогом
    var s = SEL[btn.dataset.cmK];
    popBtn = btn; btn.setAttribute('aria-expanded', 'true'); btn.classList.add('is-open');
    pop.setAttribute('aria-label', s.title);
    pop.dataset.kind = s.kind; pop.dataset.k = btn.dataset.cmK;
    popIn.innerHTML = s.kind === 'step' ? stepHtml(s) : listHtml(s);
    $$('.cm-rng', popIn).forEach(fill);
    clearTimeout(popT);
    pop.hidden = false; scrim.hidden = !sheet.matches;
    pop.classList.remove('is-on'); scrim.classList.remove('is-on');
    place();
    void pop.offsetWidth;   // старт анимации выезда с закрытого положения
    pop.classList.add('is-on'); scrim.classList.add('is-on');
    var f = $('[aria-selected="true"], [data-cm-nv]', popIn) || $(FOCUSABLE, popIn);
    if (f) f.focus({ preventScroll: true });
  }
  function closePop(instant, refocus) {
    if (!popBtn) return;
    var b = popBtn; popBtn = null;
    b.setAttribute('aria-expanded', 'false'); b.classList.remove('is-open');
    pop.classList.remove('is-on'); scrim.classList.remove('is-on');
    clearTimeout(popT);
    if (instant || reduce) { pop.hidden = true; scrim.hidden = true; }
    else popT = setTimeout(function () { pop.hidden = true; scrim.hidden = true; }, 320);
    if (refocus && document.contains(b)) b.focus({ preventScroll: true });
  }
  function place() {
    if (!popBtn || pop.hidden) return;
    if (!document.contains(popBtn)) { closePop(true); return; }   // слово перерисовано вместе с итогом
    pop.style.maxHeight = '';
    if (sheet.matches) { pop.style.left = pop.style.top = ''; pop.removeAttribute('data-up'); return; }
    var r = popBtn.getClientRects(), vw = window.innerWidth, vh = window.innerHeight, m = 12, g = 8;
    var first = r[0], lastR = r[r.length - 1];   // слово могло разорваться на две строки — плашка у последней части
    var w = pop.offsetWidth, h = pop.scrollHeight + 2;
    var below = vh - lastR.bottom - m - g, above = first.top - m - g, up = h > below && above > below;
    var room = up ? above : below;
    if (h > room) { pop.style.maxHeight = room + 'px'; h = room; }
    var a = up ? first : lastR, left = clamp(a.left - 12, m, vw - w - m);
    pop.style.left = left + 'px';
    pop.style.top = (up ? a.top - g - h : a.bottom + g) + 'px';
    pop.toggleAttribute('data-up', up);
    pop.style.setProperty('--ox', clamp(a.left + Math.min(a.width, 160) / 2 - left, 16, w - 16) + 'px');
  }
  window.addEventListener('resize', place);
  panel.addEventListener('scroll', place, { passive: true });
  sheet.addEventListener && sheet.addEventListener('change', function () { closePop(true); });
  document.addEventListener('pointerdown', function (e) {
    if (!popBtn || pop.contains(e.target) || e.target.closest('[data-cm-k]')) return;
    closePop();
  });
  cm.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cm-k]');
    if (b && !pop.contains(b)) { e.preventDefault(); openPop(b); }
  });
  cm.addEventListener('keydown', function (e) {
    var b = e.target.closest && e.target.closest('.cm-tk[data-cm-k]');
    if (b && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); openPop(b); }
  });

  // список вариантов: справа — сколько объектов подойдёт с этим вариантом (или сумма — в списке объектов)
  function listHtml(s) {
    var cur = String(s.cur()), opts = s.opts();
    return '<div class="cm-pop__h"><span class="mono">' + esc(s.title) + '</span>' + (s.head ? '<span class="mono mono--dim">' + esc(s.head) + '</span>' : '') + '</div>' + (s.top ? s.top() : '') +
      '<div class="cm-pop__list" role="listbox" aria-label="' + esc(s.title) + '">' + opts.map(function (o, i) {
        return '<button type="button" role="option" class="cm-opt' + (o.n === 0 ? ' is-zero' : '') + '" aria-selected="' + (String(o.v) === cur) + '" data-v="' + esc(o.v) + '" style="--d:' + i + '">' +
          '<i aria-hidden="true"></i><span class="cm-opt__t"><b>' + esc(o.label) + '</b>' + (o.hint ? '<em>' + esc(o.hint) + '</em>' : '') + '</span>' +
          (o.n != null ? '<span class="cm-opt__n">' + o.n + '</span>' : o.side ? '<span class="cm-opt__side">' + esc(o.side) + '</span>' : '') + '</button>';
      }).join('') + '</div>' + (s.note ? '<p class="cm-pop__note">' + s.note + '</p>' : '');
  }
  // число: − / поле / + и бегунок; пересчёт сразу, плашка остаётся открытой
  function stepHtml(s) {
    var v = s.cur();
    return '<div class="cm-pop__h"><span class="mono">' + esc(s.title) + '</span>' + (s.count ? '<span class="mono mono--dim">объектов: <b data-cm-n>' + s.count(v) + '</b></span>' : '') + '</div>' +
      '<div class="cm-num"><button type="button" data-cm-d="-1" aria-label="Меньше">−</button>' +
        '<label><input type="text" inputmode="numeric" maxlength="3" value="' + v + '" aria-label="' + esc(s.title) + '" data-cm-nv><span data-cm-nu>' + esc(s.unit(v)) + '</span></label>' +
        '<button type="button" data-cm-d="1" aria-label="Больше">+</button></div>' +
      '<input class="cm-rng" type="range" min="' + s.min + '" max="' + s.max + '" value="' + Math.min(v, s.max) + '" aria-label="' + esc(s.title) + '" data-cm-nr>' +
      (s.note ? '<p class="cm-pop__note">' + s.note + '</p>' : '') + (s.extra ? s.extra() : '');
  }
  // после выбора фокус — снова на слове (итог перерисован — значит, на новом таком же)
  function refocus(key) { var b = $('[data-cm-pane]:not([hidden]) [data-cm-k="' + key + '"]', cm); if (b) b.focus({ preventScroll: true }); }
  function fill(r) { r.style.setProperty('--p', (r.value - r.min) / (r.max - r.min) * 100 + '%'); }
  function stepSet(s, v, typed) {
    v = clamp(Math.round(v) || s.min, s.min, s.hard || s.max);
    s.set(v); refresh(s);
    var nv = $('[data-cm-nv]', popIn), nr = $('[data-cm-nr]', popIn), nn = $('[data-cm-n]', popIn);
    if (!typed) nv.value = v;
    nr.value = Math.min(v, s.max); fill(nr);
    $('[data-cm-nu]', popIn).textContent = s.unit(v);
    if (nn) nn.textContent = s.count(v);
  }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  popIn.addEventListener('click', function (e) {
    var s = popBtn && SEL[popBtn.dataset.cmK]; if (!s) return;
    var o = e.target.closest('.cm-opt');
    var key = popBtn.dataset.cmK;
    if (o) { s.set(o.dataset.v); closePop(); refresh(s); refocus(key); return; }
    var d = e.target.closest('[data-cm-d]');
    if (d) { if (s === SEL.posts) B.mode = 'heads'; stepSet(s, s.cur() + (+d.dataset.cmD)); return; }
    if (e.target.closest('[data-cm-vol]')) { var n = volHeads(); if (n) { B.mode = 'volume'; stepSet(s, n); } }
  });
  popIn.addEventListener('input', function (e) {
    var s = popBtn && SEL[popBtn.dataset.cmK]; if (!s) return;
    if (e.target.matches('[data-cm-nr]')) { if (s === SEL.posts) B.mode = 'heads'; stepSet(s, +e.target.value); }
    else if (e.target.matches('[data-cm-nv]')) {
      cleanNum(e.target, 3); var v = num(e.target);   // «12,» — это 12
      if (v >= s.min && v <= (s.hard || s.max)) { if (s === SEL.posts) B.mode = 'heads'; stepSet(s, v, true); }
    } else if (e.target.matches('[data-cm-vin]')) {
      cleanNum(e.target, 12);
      var n = volHeads(), go = $('[data-cm-vol]', popIn);
      go.disabled = !n; go.innerHTML = n ? 'Нужно <b>' + n + ' ' + plural(n, 'человек', 'человека', 'человек') + '</b> — взять' : 'Укажите объём и норму';
    }
  });
  popIn.addEventListener('change', function (e) {
    var s = popBtn && SEL[popBtn.dataset.cmK];
    if (s && e.target.matches('[data-cm-nv]')) stepSet(s, num(e.target) || s.cur());
  });
  popIn.addEventListener('keydown', function (e) {
    var items = $$('.cm-opt', popIn), i = items.indexOf(document.activeElement);
    if (i < 0) { if (e.key === 'Enter' && e.target.matches('[data-cm-nv]')) { e.preventDefault(); closePop(false, true); } return; }
    var k = e.key, step = 0;
    if (k === 'ArrowDown') step = 1; else if (k === 'ArrowUp') step = -1;
    else if (k === 'Home') { e.preventDefault(); items[0].focus(); return; } else if (k === 'End') { e.preventDefault(); items[items.length - 1].focus(); return; }
    if (step) { e.preventDefault(); items[clamp(i + step, 0, items.length - 1)].focus(); }
  });
  scrim.addEventListener('click', function () { closePop(false, true); });

  /* ---------- «Ищу работу»: условия объекта из каталога ---------- */
  function terms(o) {
    if (o._t) return o._t;
    var who = (o.who || '').toLowerCase(), am = who.match(/(\d+)\s*[–-]\s*(\d+)/), up = who.match(/до\s*(\d+)/);
    var sf = o.shiftFull || '', meals = (o.mealsFull || '').toLowerCase(), adv = o.advanceText || '', tr = o.training || {};
    return (o._t = {
      men: /мужчин/.test(who), women: /женщин/.test(who),
      ageMin: am ? +am[1] : 18, ageMax: am ? +am[2] : up ? +up[1] : 99,
      // обучение: первые смены не оплачиваются; входят ли они в срок вахты — как в таблице
      unpaid: tr.unpaid || 0, counted: tr.counted !== false,
      // графики объекта из таблицы: «6/1 или 7/0», только «7/0», «5/2»…; где график уточняется — считаем по выбранному
      scheds: o.schedTBD ? ['6/1', '7/0'] : (sf.match(/\d\/\d/g) || ['7/0']).filter(function (g) { return WEEK[g]; }),
      // какая доля дневных трат на еду остаётся на работнике: обед и ужин за счёт объекта — завтрак; обед — завтрак и ужин
      // трёхразовое питание на объекте — своих трат на еду нет; где за питание удерживают сумму в день — считаем её
      foodShare: o.mealTimes >= 3 ? 0 : /обед и ужин/.test(meals) ? 0.3 : /обед/.test(meals) ? 0.6 : 1,
      foodPay: o.mealPay || 0,
      foodNote: o.mealPay ? 'питание ' + (o.mealTimes > 1 ? o.mealTimes + ' раза в день' : 'на объекте') + ' — ' + rub(o.mealPay) + ' в день'
        : o.mealTimes >= 3 ? 'питание 3 раза в день бесплатно' : /обед и ужин/.test(meals) ? 'обед и ужин бесплатно' : /обед/.test(meals) ? 'обед бесплатно' : meals ? 'питание за свой счёт' : 'питание уточняется',
      weekly: /каждую неделю/.test(adv), advAfter: +((adv.match(/после\s+(\d+)/) || [])[1] || 7),
      road: (o.transport || '').replace(/\s*до объекта/, '').replace(' · ', ', ')
    });
  }
  // должность на объекте: выбранная профессия (без выбора — главная, первая в списке); у части объектов ставки для мужчин и женщин разные
  function posFor(o, I) {
    return o.positions.filter(function (p) { return (!p.sex || !I.sex || p.sex === I.sex) && (!I.prof || p.jobs.indexOf(I.prof) >= 0); })[0] || null;
  }
  function fits(o, I) {
    var t = terms(o), why = [];
    if (I.region && o.region !== I.region) return null;
    if (I.prof && (o.jobsFull || []).indexOf(I.prof) < 0) return null;
    var lens = o.vakhta || [];
    if (lens.length ? lens.indexOf(I.shifts) < 0 : I.shifts < (o.minShifts || 0)) why.push('вахта ' + (lens.length ? lens.join(', ') : 'от ' + o.minShifts) + ' смен');
    if (I.sex && (I.sex === 'm' ? !t.men : !t.women)) why.push(t.men ? 'только мужчины' : 'только женщины');
    if (I.age && (I.age < t.ageMin || I.age > t.ageMax)) why.push(t.ageMax < 99 ? 'возраст ' + t.ageMin + '–' + t.ageMax : 'возраст от ' + t.ageMin);
    if (!why.length && !posFor(o, I)) why.push(I.sex === 'f' ? 'только мужчины' : 'только женщины');   // эта должность — только для другого пола
    return why;
  }
  function calc(o, I) {
    var t = terms(o), p = posFor(o, I), r = p.rate, U = t.unpaid;
    // смены обучения не оплачиваются; если в срок вахты не входят — человек работает их сверх вахты
    var worked = I.shifts + (t.counted ? 0 : U), paid = Math.max(0, t.counted ? I.shifts - U : I.shifts);
    // стажировка — первые оплачиваемые смены по её ставке, остальные — по ставке должности
    var inN = p.intern ? Math.min(p.intern.shifts, paid) : 0, regN = paid - inN;
    var gross = inN * (p.intern ? p.intern.rate : 0) + regN * r, tax = Math.round(gross * TAX);
    // график: выбранный человеком, если он есть на объекте, иначе — тот, что на объекте
    var sched = t.scheds.indexOf(I.sched) >= 0 ? I.sched : t.scheds[0], week = WEEK[sched];
    var days = daysOn(worked, sched), perDay = Math.round(I.food * t.foodShare) + t.foodPay, food = perDay * days;
    var comp = I.shifts >= ROAD_COMP_FROM ? Math.min(ROAD_COMP, I.road) : 0, home = gross - tax - food - I.road + comp;
    // сдельная выше нормы: те же смены по ставке при 150 % выработке (или по верхней цифре вилки из таблицы)
    var hi = null;
    if (p.high) {
      var gH = inN * (p.intern ? p.intern.rate : 0) + regN * p.high.rate, tH = Math.round(gH * TAX);
      hi = { rate: p.high.rate, label: p.high.label, gross: gH, tax: tH, home: gH - tH - food - I.road + comp };
    }
    return { o: o, t: t, p: p, rate: r, inN: inN, regN: regN, paid: paid, worked: worked, gross: gross, tax: tax, days: days, perDay: perDay, food: food, comp: comp, home: home, hi: hi, sched: sched, week: week, own: sched !== I.sched };
  }

  // пол и возраст не подставляем: пока человек их не указал, показываем все объекты, требования — в карточке объекта
  var job = { region: '', prof: '', shifts: 30, sched: '6/1', sex: '', age: 0, sort: 'home', view: 'calc', v: '100', auto: true, autoObj: '', road: 0, food: 0, start: addDays(today, 3), pick: '' };
  var lastCur = null;
  // Другие представления пользуются тем же подбором, ставками и состоянием.
  // В обратном расчёте проверяем реальные сроки объектов, а не делим цель на среднюю ставку.
  var modelListeners = [], modelUpdate = null;
  function modelState() {
    var copy = Object.assign({}, job);
    copy.start = new Date(job.start.getTime());
    return { job: copy, current: lastCur, objects: O };
  }
  function modelNotify() {
    modelListeners.slice().forEach(function (fn) { fn(modelState()); });
  }
  function modelInput(overrides) {
    var I = Object.assign({}, job, overrides || {});
    return ['shifts', 'road', 'food', 'age'].every(function (key) {
      return typeof I[key] === 'number' && isFinite(I[key]) && I[key] >= 0;
    }) && I.shifts > 0 && Math.floor(I.shifts) === I.shifts ? I : null;
  }
  function modelObject(id) { return O.filter(function (o) { return o.id === id; })[0] || null; }
  function modelPreview(id, overrides) {
    var o = modelObject(id || job.pick), I = modelInput(overrides);
    if (!o || !I) return null;
    var why = fits(o, I);
    return why && !why.length ? calc(o, I) : null;
  }
  function modelDurations(id, I) {
    var objects = id ? O.filter(function (o) { return o.id === id; }) : O, result = [];
    objects.forEach(function (o) {
      var lengths = (o.vakhta || []).slice();
      if (!lengths.length) {
        for (var n = Math.max(1, Math.ceil(o.minShifts || 1)); n <= 90; n++) lengths.push(n);
      }
      lengths.forEach(function (n) {
        if (typeof n !== 'number' || !isFinite(n) || n <= 0 || Math.floor(n) !== n) return;
        var why = fits(o, Object.assign({}, I, { shifts: n }));
        if (why && !why.length && result.indexOf(n) < 0) result.push(n);
      });
    });
    return result.sort(function (a, b) { return a - b; });
  }
  function modelSolve(target, options) {
    options = options || {};
    target = Number(target);
    var I = modelInput(options), candidates = [], validTarget = isFinite(target) && target >= 0;
    var empty = { quote: null, shifts: null, reached: false, home: null, target: validTarget ? target : null };
    if (!I || !validTarget) return empty;
    var objects = options.id ? O.filter(function (o) { return o.id === options.id; }) : O;
    objects.forEach(function (o) {
      modelDurations(o.id, I).forEach(function (shifts) {
        var quote = calc(o, Object.assign({}, I, { shifts: shifts }));
        var home = I.v === 'hi' && quote.hi ? quote.hi.home : quote.home;
        candidates.push({ quote: quote, shifts: shifts, reached: home >= target, home: home, target: target });
      });
    });
    var reached = candidates.filter(function (c) { return c.reached; });
    if (reached.length) {
      reached.sort(function (a, b) { return a.quote.days - b.quote.days || a.shifts - b.shifts || b.home - a.home; });
      return reached[0];
    }
    candidates.sort(function (a, b) { return b.home - a.home || a.quote.days - b.quote.days || a.shifts - b.shifts; });
    return candidates[0] || empty;
  }
  function modelSet(patch) {
    patch = patch || {};
    ['region', 'prof', 'pick'].forEach(function (key) { if (typeof patch[key] === 'string') job[key] = patch[key]; });
    if (patch.sex === '' || patch.sex === 'm' || patch.sex === 'f') job.sex = patch.sex;
    if (Object.prototype.hasOwnProperty.call(WEEK, patch.sched)) job.sched = patch.sched;
    if (patch.sort === 'home' || patch.sort === 'days' || patch.sort === 'fixed') job.sort = patch.sort;
    if (patch.view === 'calc' || patch.view === 'compare') job.view = patch.view;
    ['shifts', 'road', 'food', 'age'].forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      var n = Number(patch[key]);
      if (isFinite(n)) job[key] = Math.max(key === 'shifts' ? 1 : 0, Math.round(n));
    });
    if (patch.start && typeof patch.start.getTime === 'function' && isFinite(patch.start.getTime())) job.start = new Date(patch.start.getTime());
    modelUpdate = { auto: patch.auto === true, v: patch.v === 'hi' || patch.v === '100' ? patch.v : null };
    job.auto = modelUpdate.auto;
    if (modelUpdate.v) job.v = modelUpdate.v;
    try { refreshJobModel(); } finally { modelUpdate = null; }
    return modelState();
  }
  AS.CalcModal = {
    state: modelState,
    parseAmount: parseNum,
    set: modelSet,
    preview: modelPreview,
    durations: function (id) { return modelDurations(id, job); },
    solve: modelSolve,
    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      modelListeners.push(fn);
      return function () { var i = modelListeners.indexOf(fn); if (i >= 0) modelListeners.splice(i, 1); };
    },
    apply: applyJob
  };
  function refreshJobModel() {
    var matches = O.filter(function (o) { var why = fits(o, job); return why && !why.length; })
      .map(function (o) { return calc(o, job); }).sort(function (a, b) {
        if (job.sort === 'days') return a.days - b.days || b.home - a.home;
        if (job.sort === 'fixed') return (a.p.basis !== 'fixed') - (b.p.basis !== 'fixed') || b.home - a.home;
        return b.home - a.home;
      });
    lastCur = matches.filter(function (quote) { return quote.o.id === job.pick; })[0] || matches[0] || null;
    if (lastCur) {
      job.pick = lastCur.o.id;
      if (job.pick !== job.autoObj) { job.autoObj = job.pick; job.auto = true; job.v = '100'; }
      if (modelUpdate) { job.auto = modelUpdate.auto; if (modelUpdate.v) job.v = modelUpdate.v; }
    }
    modelNotify();
  }
  // сумма в итоге — до тысяч: это прогноз; точные строки — в расшифровке
  function round1k(n) { return Math.round(n / 1000) * 1000; }
  var liveEl = $('[data-cm-live]', cm), liveT = 0;
  function announce(s) { clearTimeout(liveT); liveT = setTimeout(function () { if (liveEl) liveEl.textContent = s; }, 700); }   // скринридеру — итог, без лишней частоты
  var CHIP = { '100': 'при 100 % выработке', given: 'сделка, цифра объекта', fixed: 'фикс' };
  // «Хочу на этот объект» — к общей заявке: объект, длительность и профессия уже выбраны.
  // Профессия в заявке — галочка с ключом профессии из каталога (полное название → ключ: js/objects.js, jobsFull/jobKeys)
  function profKey(full) {
    var k = '';
    (AS.OBJECTS || []).some(function (o) { var i = (o.jobsFull || []).indexOf(full); if (i >= 0) k = o.jobKeys[i]; return i >= 0; });
    return k;
  }
  function applyJob() {
    if (!lastCur) return false;
    var f = $('[data-form]'); if (!f) return false;
    if (job.view !== 'calc') { job.view = 'calc'; modelNotify(); }
    var tb = $('[data-tab-btn="job"]', f); if (tb) tb.click();
    var r = $('input[name="shifts"][value="' + job.shifts + '"]', f); if (r) r.checked = true;
    var pk = job.prof ? profKey(job.prof) : '';
    $$('input[name="prof"]', f).forEach(function (c) { c.checked = !!pk && c.value === pk; });
    var c = lastCur, sel = $('[data-object-select]', f);
    if (sel && c) { if (!sel.querySelector('option[value="' + c.o.id + '"]')) sel.add(new Option(c.o.short, c.o.id)); sel.value = c.o.id; }
    // строка расчёта — в комментарий: что человек написал сам, остаётся; прежняя строка калькулятора заменяется новой
    var msg = $('textarea[name="message"]', f);
    if (msg && c) {
      var line = 'Из калькулятора: ' + c.o.short + ', ' + (job.prof ? job.prof.toLowerCase() : 'любая работа (расчёт для: ' + c.p.jobs[0].toLowerCase() + ')') + ', ' + job.shifts + ' смен по графику ' + c.sched +
        ', заезд ' + day(job.start).replace(' ', ' ') + ', ≈ ' + money(round1k(c.home)) + ' ₽ домой (' + CHIP[c.p.basis] + ')' + (c.hi ? ', ' + c.hi.label + ' — ≈ ' + money(round1k(c.hi.home)) + ' ₽' : '') + '.';
      var own = msg.value.split('\n').filter(function (l) { return !/^\s*Из калькулятора:/.test(l); }).join('\n').trim();
      msg.value = own ? own + '\n\n' + line : line;
      msg.dispatchEvent(new Event('input', { bubbles: true }));
    }
    close();
    var contact = document.getElementById('contact') || f;
    if (AS.lenis) AS.lenis.scrollTo(contact);
    else window.scrollTo({ top: contact.getBoundingClientRect().top + window.scrollY, behavior: reduce ? 'auto' : 'smooth' });
    return true;
  }

  /* ---------- «Нужен персонал»: сколько людей и сколько стоит свой штат ---------- */
  var biz = $('[data-cm-pane="biz"]', cm);
  var BJOBS = []; O.forEach(function (o) { (o.jobsFull || []).forEach(function (j) { if (BJOBS.indexOf(j) < 0) BJOBS.push(j); }); });
  BJOBS.sort(function (a, b) { return (b === 'Комплектовщик') - (a === 'Комплектовщик'); });   // самая частая профессия — первой
  var B = { prof: BJOBS[0], posts: 20, mode: 'heads', vol: 6000, norm: 400, daily: 1, opdays: 7, sched: '2/2', where: 'Москва', stay: false, hours: 12 };
  // «Нужны …» — профессия во множественном числе
  var PROF_PL = {
    'Комплектовщик': 'комплектовщики', 'Упаковщик': 'упаковщики', 'Сортировщик': 'сортировщики', 'Фасовщик / стикеровщик': 'фасовщики / стикеровщики',
    'Оператор приёма возвратов': 'операторы приёма возвратов', 'Грузчик-разнорабочий': 'грузчики-разнорабочие', 'Водитель высотного штабелёра': 'водители высотного штабелёра'
  };
  var WHERE = { 'Москва': 'в Москве', 'Московская область': 'в Московской области', 'Другой регион': 'в другом регионе' };
  function people(n) { return n + ' ' + plural(n, 'человек', 'человека', 'человек'); }
  function volHeads() {
    var v = $('[data-cm-vin="vol"]', popIn), n = $('[data-cm-vin="norm"]', popIn);
    if (v) { B.vol = num(v); B.norm = num(n); }
    return B.vol && B.norm ? Math.ceil(B.vol / B.norm) : 0;
  }
  SEL.bjob = { pane: 'biz', kind: 'list', name: 'Кто нужен', title: 'Кто нужен', head: 'наших объектов',
    label: function () { return PROF_PL[B.prof] || B.prof.toLowerCase(); }, cur: function () { return B.prof; },
    opts: function () { return BJOBS.map(function (j) { return { v: j, label: j, n: O.filter(function (o) { return (o.jobsFull || []).indexOf(j) >= 0; }).length }; }); },
    note: 'Справа — на скольких наших объектах мы уже закрываем эту профессию.',
    set: function (v) { B.prof = v; wageTouched = false; } };
  SEL.posts = { pane: 'biz', kind: 'step', name: 'Людей на смене', title: 'Людей на смене', min: 1, max: 200, hard: 999,
    label: function () { return people(B.posts); }, cur: function () { return B.posts; },
    unit: function (n) { return plural(n, 'человек', 'человека', 'человек'); },
    extra: function () {
      var n = volHeads();
      return '<div class="cm-vol"><p class="mono mono--dim">Не знаете — посчитаем по объёму</p>' +
        '<label><span>Объём за смену</span><input type="text" inputmode="numeric" value="' + money(B.vol) + '" data-cm-vin="vol"><em>ед.</em></label>' +
        '<label><span>Норма на одного</span><input type="text" inputmode="numeric" value="' + money(B.norm) + '" data-cm-vin="norm"><em>ед.</em></label>' +
        '<button type="button" class="cm-vol__go" data-cm-vol>Нужно <b>' + people(n) + '</b> — взять</button></div>';
    },
    set: function (v) { B.posts = v; } };
  SEL.daily = { pane: 'biz', kind: 'list', name: 'Смен в сутки', title: 'Смен в сутки',
    label: function () { return B.daily === 2 ? 'в две смены' : 'в одну смену'; }, cur: function () { return B.daily; },
    opts: function () { return [{ v: 1, label: 'В одну смену', hint: B.hours + ' часов в сутки' }, { v: 2, label: 'В две смены', hint: 'круглосуточно, день и ночь' }]; },
    set: function (v) { B.daily = +v; } };
  SEL.opdays = { pane: 'biz', kind: 'list', name: 'Дней в неделю', title: 'Дней в неделю',
    label: function () { return B.opdays + ' ' + plural(B.opdays, 'день', 'дня', 'дней'); }, cur: function () { return B.opdays; },
    opts: function () { return [{ v: 5, label: '5 дней', hint: 'по будням' }, { v: 6, label: '6 дней', hint: 'кроме воскресенья' }, { v: 7, label: '7 дней', hint: 'без выходных' }]; },
    set: function (v) { B.opdays = +v; } };
  SEL.bsched = { pane: 'biz', kind: 'list', name: 'График сотрудника', title: 'График одного сотрудника',
    label: function () { return B.sched === 'Вахта 7/0' ? '7/0 (вахта)' : B.sched; }, cur: function () { return B.sched; },
    opts: function () {
      return [{ v: '2/2', label: '2/2', hint: 'два дня работы, два отдыха' }, { v: '5/2', label: '5/2', hint: 'пять смен, два выходных' },
        { v: '6/1', label: '6/1', hint: 'выходной раз в неделю' }, { v: 'Вахта 7/0', label: '7/0 — вахта', hint: 'без выходных, живут рядом с объектом' }];
    },
    note: 'От графика зависит, сколько людей держать в штате на одно место.',
    set: function (v) { B.sched = v; } };
  SEL.where = { pane: 'biz', kind: 'list', name: 'Где объект', title: 'Где объект',
    label: function () { return WHERE[B.where]; }, cur: function () { return B.where; },
    opts: function () { return Object.keys(WHERE).map(function (k) { return { v: k, label: k }; }); },
    set: function (v) { B.where = v; } };
  SEL.stay = { pane: 'biz', kind: 'list', name: 'Жильё сотрудникам', title: 'Жильё сотрудникам',
    label: function () { return B.stay ? 'нужно' : 'не нужно'; }, cur: function () { return B.stay ? 'yes' : 'no'; },
    opts: function () { return [{ v: 'no', label: 'Не нужно', hint: 'сотрудники местные' }, { v: 'yes', label: 'Нужно', hint: 'считаем койко-место на каждого' }]; },
    set: function (v) { B.stay = v === 'yes'; $('[data-cm-bed]', biz).hidden = !B.stay; fitInputs(); } };

  // оплата за смену по умолчанию — средняя ставка этой профессии на наших объектах (12 часов)
  function wageOf(prof) {
    var r = []; O.forEach(function (o) { o.positions.forEach(function (p) { if (p.jobs.indexOf(prof) >= 0) r.push(p.rate); }); });
    return Math.round(median(r) / 10) * 10 || 4000;
  }
  var wageIn = $('[data-cm-wage]', cm), wageTouched = false;
  wageIn.addEventListener('input', function () { wageTouched = !!wageIn.value; });
  function drawBiz() {
    if (!wageTouched) { wageIn.value = money(wageOf(B.prof)); fitInput(wageIn); }
    var posts = Math.max(1, B.posts), pdays = WEEK[B.sched.replace('Вахта ', '')];
    var staff = Math.ceil(posts * B.daily * B.opdays / pdays * (1 + ABSENCE));
    var shiftsMonth = Math.round(posts * B.daily * B.opdays * 4.345);
    var wage = num(wageIn), hire = num($('input[name="hire"]', biz)), turn = num($('input[name="turn"]', biz)), bed = num($('input[name="bed"]', biz));
    var pay = shiftsMonth * wage, contrib = Math.round(pay * CONTRIB), hiresYear = staff * turn / 100, hiresMonth = hiresYear / 12;
    var hireCost = Math.round(hiresMonth * hire), trainCost = Math.round(hiresMonth * TRAIN_SHIFTS * wage * (1 + CONTRIB)), housing = B.stay ? staff * bed : 0;
    var total = pay + contrib + hireCost + trainCost + housing, perHour = total / Math.max(1, shiftsMonth * B.hours);
    var out = $('[data-cm-bout]', cm), bplan = $('[data-cm-bplan]', cm);
    out.innerHTML =
      '<div class="cm-best">' +
        '<div class="cm-best__sum"><span class="mono mono--dim">Нужно в штате</span>' +
          '<span class="cm__sum cm__sum--md">' + staff + '<small>' + plural(staff, 'человек', 'человека', 'человек') + '</small></span></div>' +
        '<div class="cm-best__sum"><span class="mono mono--dim">Свой штат обойдётся в месяц</span>' +
          '<span class="cm__sum' + (total >= 1e7 ? ' cm__sum--md' : '') + '"><span class="cm__approx">≈</span><span data-cm-num="' + total + '">' + money(shown.biz == null ? total : shown.biz) + '</span><small>₽</small></span>' +
          '<span class="mono cm__range">≈ ' + rub(perHour) + ' за час работы одного человека</span></div>' +
        '<ul class="cm-break">' +
          '<li class="is-home"><span>Оплата смен: ' + money(shiftsMonth) + ' × ' + rub(wage) + '</span><b>' + rub(pay) + '</b></li>' +
          '<li class="is-tax"><span>Страховые взносы ≈ 30 %</span><b>' + rub(contrib) + '</b></li>' +
          '<li class="is-food"><span>Найм взамен ушедших<em>≈ ' + hiresMonth.toFixed(1).replace('.', ',') + ' чел. в месяц при текучке ' + turn + ' %</em></span><b>' + rub(hireCost) + '</b></li>' +
          '<li class="is-road"><span>Обучение новичков<em>' + TRAIN_SHIFTS + ' смены без выработки</em></span><b>' + rub(trainCost) + '</b></li>' +
          (B.stay ? '<li class="is-stay"><span>Жильё: ' + staff + ' × ' + rub(bed) + '</span><b>' + rub(housing) + '</b></li>' : '') +
        '</ul>' +
      '</div>';
    tween('biz', $('[data-cm-num]', out));
    // как посчитали людей — под фразой слева
    var perWeek = posts * B.daily * B.opdays, base = perWeek / pdays, fmt = function (x) { return String(Math.round(x * 10) / 10).replace('.', ','); };
    bplan.innerHTML =
      '<p class="mono mono--dim">Как посчитали</p>' +
      '<ul class="cm-when">' +
        '<li>' + posts + ' на смене × ' + B.daily + ' ' + plural(B.daily, 'смена', 'смены', 'смен') + ' в сутки × ' + B.opdays + ' ' + plural(B.opdays, 'день', 'дня', 'дней') + ' — <b>' + perWeek + ' ' + plural(perWeek, 'выход', 'выхода', 'выходов') + '</b> в неделю</li>' +
        '<li>Сотрудник ' + (B.sched === 'Вахта 7/0' ? 'на вахте 7/0' : 'по графику ' + B.sched) + ' выходит ' + fmt(pdays) + ' ' + (pdays % 1 ? 'раза' : plural(pdays, 'раз', 'раза', 'раз')) + ' в неделю: ' + perWeek + ' ÷ ' + fmt(pdays) + (base % 1 ? ' ≈ ' : ' = ') + '<b>' + fmt(base) + '&nbsp;чел.</b></li>' +
        '<li>Плюс ' + Math.round(ABSENCE * 100) + ' % на больничные и прогулы — <b>' + people(staff) + '</b> в штате</li>' +
        '<li>За год придётся нанять <b>≈ ' + people(Math.round(hiresYear)) + '</b> взамен ушедших</li>' +
      '</ul>' +
      '<p class="cm-src">Отпуска, больничные и работа отдела кадров сюда не входят — реальная цена своего штата выше.</p>';
    var brief = B.prof + ', ' + posts + ' на смене' + (B.mode === 'volume' ? ' — по объёму ' + money(B.vol) + ' ед. за смену при норме ' + money(B.norm) : '') + ', в штате ≈ ' + staff + ', ' + (B.daily === 2 ? '2 смены' : '1 смена') + ' по ' + B.hours + ' ч, ' + B.opdays + ' дн. в неделю, график ' + B.sched + ', ' + B.where + (B.stay ? ', с проживанием' : '') + '; свой штат ≈ ' + rub(total) + ' в месяц';
    $('input[name="brief"]', biz).value = brief; $('[data-cm-brief]', biz).textContent = brief;
    bar = [people(staff) + ' · ≈ ' + rub(total), 'свой штат в месяц', 'К заявке']; drawBar();
    if (cm.dataset.tab === 'biz') announce('Нужно в штате ' + people(staff) + ', свой штат — около ' + money(round1k(total)) + ' рублей в месяц.');
  }
  biz.addEventListener('input', function (e) { if (e.target.matches('.cm-tk--in input')) drawBiz(); });
  // заявка «Альфа-Стафф» выезжает на месте расчёта
  var res = $('[data-cm-bres]', cm), ask = $('[data-cm-ask]', cm);
  function askOn(on) {
    res.classList.toggle('is-ask', on); ask.hidden = !on;
    if (on) { ask.removeAttribute('inert'); $('input[name="name"]', ask).focus({ preventScroll: true }); }
    else { ask.setAttribute('inert', ''); $('[data-cm-ask-open]', res).focus({ preventScroll: true }); }
    if (on && res.getBoundingClientRect().top < panel.getBoundingClientRect().top) panel.scrollTo({ top: res.offsetTop - 16, behavior: reduce ? 'auto' : 'smooth' });
  }
  $('[data-cm-ask-open]', cm).addEventListener('click', function () { askOn(true); });
  $('[data-cm-ask-close]', cm).addEventListener('click', function () { askOn(false); });
  var phone = $('input[name="phone"]', biz);
  phone.addEventListener('input', function () {   // маска как у основной формы
    var d = phone.value.replace(/\D/g, '');
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d && d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var out = d ? '+7' : '';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    phone.value = out;
  });
  $$('.field input', biz).forEach(function (inp) { inp.addEventListener('input', function () { inp.closest('.field').classList.remove('is-error'); }); });
  biz.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true;
    [['name', function (v) { return v.trim().length > 1; }], ['phone', function (v) { return v.replace(/\D/g, '').length === 11; }]].forEach(function (c) {
      var inp = $('input[name="' + c[0] + '"]', biz), good = c[1](inp.value);
      inp.closest('.field').classList.toggle('is-error', !good);
      if (!good && ok) { inp.focus(); ok = false; }
    });
    if (!ok) return;
    $('.cm__done', biz).hidden = false;   // приём заявок подключим вместе с основной формой
  });
  $('[data-cm-again]', biz).addEventListener('click', function () { $$('.field input', biz).forEach(function (i) { i.value = ''; }); $('.cm__done', biz).hidden = true; askOn(false); });

  refreshJobModel(); drawTokens(); drawBiz();
  tab('job');
})();
