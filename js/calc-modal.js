/* Альфа-Стафф · калькулятор вахты во всплывающем окне — открывается кнопкой в кармашке первого экрана
   (на телефоне — кнопкой «Посчитать заработок» под «Подобрать вахту»).
   Условия задаются одной фразой: подчёркнутые слова — выбор. По нажатию от слова выезжает плашка с вариантами
   (у каждого — сколько объектов подойдёт), на телефоне — шторка снизу. Второстепенное спрятано под «Уточнить».
   «Ищу работу»: подбирает объекты под человека (регион, профессия, длительность, пол и возраст — требования вакансий)
   и для каждого считает, сколько он привезёт домой: стажировка по её ставке, остальные смены — по ставке должности
   (сдельная — при 100 % выработке), обучение не оплачивается; минус налог самозанятого, еда, где она не входит
   в условия, и дорога, плюс компенсация дороги; даты вахты, когда приходят аванс и остаток, сравнение с зарплатой дома.
   Ставки и условия — из AS.CALC (js/calc-data.js, собирает tools/build_calc.py из таблицы вакансий).
   «Нужен персонал»: сколько людей нужно в штате под смены и график и сколько в месяц стоит свой штат
   (оплата смен, взносы, найм взамен ушедших, обучение, жильё); цену «Альфа-Стафф» менеджер пришлёт по заявке. */
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
  var SCHED_TXT = { '6/1': 'выходной раз в неделю', '7/0': 'без выходных', '5/2': 'пять смен и два выходных', '2/2': 'два через два' };
  var CHEV = '<svg class="cm-tk__chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5L8 10l3.5-3.5" /></svg>';
  var ARROW = function (d) { return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + (d < 0 ? 'M10 3.5L5.5 8l4.5 4.5' : 'M6 3.5L10.5 8 6 12.5') + '" /></svg>'; };
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rub(n) { return money(Math.round(n)) + ' ₽'; }
  function num(el) { return parseInt(String(el.value).replace(/\D/g, ''), 10) || 0; }
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
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [role="button"][tabindex="0"]';
  function trap(e, box) {   // фокус по Tab не уходит из окна (или из открытой плашки)
    var f = $$(FOCUSABLE, box).filter(function (x) { return x.offsetParent !== null && !x.closest('[inert]'); });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', function (e) {
    if (cm.hidden) return;
    if (popBtn) {
      if (e.key === 'Escape') { e.preventDefault(); closePop(false, true); }
      else if (e.key === 'Tab') trap(e, pop);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') trap(e, $('.cm__panel', cm));
  });

  /* ---------- вкладки, «Уточнить», поля с суммами, строка итога на телефоне ---------- */
  var panel = $('.cm__panel', cm), barEl = $('[data-cm-bar]', cm), bar = { job: ['', '', ''], biz: ['', '', ''] }, barSeen = {};
  function drawBar() {
    var t = cm.dataset.tab || 'job', b = bar[t];
    $('[data-cm-bar-main]', cm).textContent = b[0]; $('[data-cm-bar-sub]', cm).textContent = b[1]; $('[data-cm-bar-btn]', cm).textContent = b[2];
    barEl.classList.toggle('is-off', !!barSeen[t]);
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
  // суммы — с пробелами между разрядами (после ввода), в поле только цифры; ширина поля — по тексту, как у слова во фразе
  var ruler = document.createElement('canvas').getContext('2d');
  function fitInput(inp) {
    var cs = getComputedStyle(inp);
    ruler.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    inp.style.width = Math.ceil(ruler.measureText(inp.value || inp.placeholder || '0').width + 2) + 'px';
  }
  function fitInputs() { $$('.cm-tk--in input', cm).forEach(fitInput); }
  $$('[data-cm-money], [data-cm-int]', cm).forEach(function (inp) {
    inp.addEventListener('input', function () { var v = inp.value.replace(/\D/g, '').slice(0, 9); if (inp.value !== v) inp.value = v; fitInput(inp); });
    if (inp.hasAttribute('data-cm-money')) inp.addEventListener('blur', function () { var v = num(inp); inp.value = v ? money(v) : ''; fitInput(inp); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitInputs);
  // на телефоне итог — ниже фразы: пока выбираешь, сумма видна в строке внизу шторки
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { barSeen[e.target.closest('[data-cm-pane]').dataset.cmPane] = e.isIntersecting; }); drawBar();
    }, { root: panel, threshold: 0.2 });
    $$('.cm__result', cm).forEach(function (r) { io.observe(r); });
  }
  $('[data-cm-bar-go]', cm).addEventListener('click', function () {
    var r = $('[data-cm-pane="' + (cm.dataset.tab || 'job') + '"] .cm__result', cm);
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
      b.setAttribute('aria-label', s.name + ': ' + l);
      b.setAttribute('aria-haspopup', 'dialog');
      if (b !== popBtn) b.setAttribute('aria-expanded', 'false');
    });
  }
  function refresh(s) { drawTokens(); if (s.pane === 'biz') drawBiz(); else drawJob(); place(); }
  function openPop(btn) {
    if (popBtn === btn) { closePop(false, true); return; }
    closePop(true);
    var s = SEL[btn.dataset.cmK];
    popBtn = btn; btn.setAttribute('aria-expanded', 'true'); btn.classList.add('is-open');
    pop.setAttribute('aria-label', s.title);
    pop.dataset.kind = s.kind; pop.dataset.k = btn.dataset.cmK;
    popIn.innerHTML = s.kind === 'step' ? stepHtml(s) : s.kind === 'cal' ? calHtml() : listHtml(s);
    $$('.cm-rng', popIn).forEach(fill);
    clearTimeout(popT);
    pop.hidden = false; scrim.hidden = !sheet.matches;
    pop.classList.remove('is-on'); scrim.classList.remove('is-on');
    place();
    void pop.offsetWidth;   // старт анимации выезда с закрытого положения
    pop.classList.add('is-on'); scrim.classList.add('is-on');
    var f = $('[aria-selected="true"], .cm-cal__d.is-on, [data-cm-nv]', popIn) || $(FOCUSABLE, popIn);
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
    return '<div class="cm-pop__h"><span class="mono">' + esc(s.title) + '</span>' + (s.head ? '<span class="mono mono--dim">' + esc(s.head) + '</span>' : '') + '</div>' +
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
  // календарь на пять недель вперёд — дата выезда
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function calHtml() {
    var start = addDays(today, -((today.getDay() + 6) % 7)), cells = '', i, d, last = addDays(start, 34);
    for (i = 0; i < 35; i++) {
      d = addDays(start, i);
      var on = +d === +job.start, past = d < today;
      cells += '<button type="button" class="cm-cal__d' + (on ? ' is-on' : '') + (+d === +today ? ' is-today' : '') + '" data-t="' + d.getTime() + '"' + (past ? ' disabled' : '') +
        ' aria-pressed="' + on + '" aria-label="' + d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) + '">' +
        (d.getDate() === 1 ? '<em>' + d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '') + '</em>' : '') + d.getDate() + '</button>';
    }
    var mon = function (x) { return x.toLocaleDateString('ru-RU', { month: 'long' }); };
    return '<div class="cm-pop__h"><span class="mono">Когда выезжаете</span><span class="mono mono--dim">' + mon(start) + (start.getMonth() !== last.getMonth() ? ' — ' + mon(last) : '') + '</span></div>' +
      '<div class="cm-cal">' + ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(function (w) { return '<span aria-hidden="true">' + w + '</span>'; }).join('') + cells + '</div>';
  }
  popIn.addEventListener('click', function (e) {
    var s = popBtn && SEL[popBtn.dataset.cmK]; if (!s) return;
    var o = e.target.closest('.cm-opt');
    var key = popBtn.dataset.cmK;
    if (o) { s.set(o.dataset.v); closePop(); refresh(s); refocus(key); return; }
    var d = e.target.closest('[data-cm-d]');
    if (d) { if (s === SEL.posts) B.mode = 'heads'; stepSet(s, s.cur() + (+d.dataset.cmD)); return; }
    var c = e.target.closest('.cm-cal__d');
    if (c && !c.disabled) { job.start = new Date(+c.dataset.t); closePop(); refresh(s); refocus(key); return; }
    if (e.target.closest('[data-cm-vol]')) { var n = volHeads(); if (n) { B.mode = 'volume'; stepSet(s, n); } }
  });
  popIn.addEventListener('input', function (e) {
    var s = popBtn && SEL[popBtn.dataset.cmK]; if (!s) return;
    if (e.target.matches('[data-cm-nr]')) { if (s === SEL.posts) B.mode = 'heads'; stepSet(s, +e.target.value); }
    else if (e.target.matches('[data-cm-nv]')) {
      var v = e.target.value.replace(/\D/g, ''); e.target.value = v;
      if (+v >= s.min && +v <= (s.hard || s.max)) { if (s === SEL.posts) B.mode = 'heads'; stepSet(s, +v, true); }
    } else if (e.target.matches('[data-cm-vin]')) {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 7);
      var n = volHeads(), go = $('[data-cm-vol]', popIn);
      go.disabled = !n; go.innerHTML = n ? 'Нужно <b>' + n + ' ' + plural(n, 'человек', 'человека', 'человек') + '</b> — взять' : 'Укажите объём и норму';
    }
  });
  popIn.addEventListener('change', function (e) {
    var s = popBtn && SEL[popBtn.dataset.cmK];
    if (s && e.target.matches('[data-cm-nv]')) stepSet(s, +e.target.value || s.cur());
  });
  popIn.addEventListener('keydown', function (e) {
    var items = $$('.cm-opt, .cm-cal__d:not(:disabled)', popIn), i = items.indexOf(document.activeElement);
    if (i < 0) { if (e.key === 'Enter' && e.target.matches('[data-cm-nv]')) { e.preventDefault(); closePop(false, true); } return; }
    var cal = items[i].classList.contains('cm-cal__d'), k = e.key, step = 0;
    if (k === 'ArrowDown') step = cal ? 7 : 1; else if (k === 'ArrowUp') step = cal ? -7 : -1;
    else if (cal && k === 'ArrowRight') step = 1; else if (cal && k === 'ArrowLeft') step = -1;
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
      foodShare: /обед и ужин/.test(meals) ? 0.3 : /обед/.test(meals) ? 0.6 : 1,
      foodNote: /обед и ужин/.test(meals) ? 'обед и ужин бесплатно' : /обед/.test(meals) ? 'обед бесплатно' : meals ? 'питание за свой счёт' : 'питание уточняется',
      weekly: /каждую неделю/.test(adv), advAfter: +((adv.match(/после\s+(\d+)/) || [])[1] || 7),
      road: (o.transport || '').replace(/\s*до объекта/, '').replace(' · ', ', ')
    });
  }
  // должность на объекте: выбранная профессия (без выбора — главная, первая в списке); у части объектов ставки для мужчин и женщин разные
  function posFor(o, I) {
    return o.positions.filter(function (p) { return (!p.sex || p.sex === I.sex) && (!I.prof || p.jobs.indexOf(I.prof) >= 0); })[0] || null;
  }
  function fits(o, I) {
    var t = terms(o), why = [];
    if (I.region && o.region !== I.region) return null;
    if (I.prof && (o.jobsFull || []).indexOf(I.prof) < 0) return null;
    if (I.shifts < (o.minShifts || 0)) why.push('вахта от ' + o.minShifts + ' смен');
    if (I.sex === 'm' ? !t.men : !t.women) why.push(t.men ? 'только мужчины' : 'только женщины');
    if (I.age < t.ageMin || I.age > t.ageMax) why.push(t.ageMax < 99 ? 'возраст ' + t.ageMin + '–' + t.ageMax : 'возраст от ' + t.ageMin);
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
    var days = Math.ceil(worked * 7 / week), food = Math.round(I.food * t.foodShare) * days;
    var comp = I.shifts >= ROAD_COMP_FROM ? Math.min(ROAD_COMP, I.road) : 0, home = gross - tax - food - I.road + comp;
    return { o: o, t: t, p: p, rate: r, inN: inN, regN: regN, paid: paid, worked: worked, gross: gross, tax: tax, days: days, food: food, comp: comp, home: home, sched: sched, week: week, own: sched !== I.sched };
  }

  var job = { region: '', prof: '', shifts: 30, sched: '6/1', sex: 'm', age: 30, road: 6000, food: 600, homePay: 0, start: addDays(today, 3), pick: '' };
  var jp = $('[data-cm-pane="job"]', cm), lastOk = [];
  var REGS = (AS.CALC.regions || []).filter(function (r) { return O.some(function (o) { return o.region === r.key; }); });
  // профессия во фразе «Ищу работу …» — в творительном падеже; для женщин — женская форма, где она есть
  var PROF_AS = {
    'Комплектовщик': ['комплектовщиком', 'комплектовщицей'], 'Упаковщик': ['упаковщиком', 'упаковщицей'], 'Сортировщик': ['сортировщиком', 'сортировщицей'],
    'Фасовщик / стикеровщик': ['фасовщиком / стикеровщиком', 'фасовщицей / стикеровщицей'], 'Оператор приёма возвратов': ['оператором приёма возвратов'],
    'Грузчик-разнорабочий': ['грузчиком-разнорабочим'], 'Водитель высотного штабелёра': ['водителем высотного штабелёра']
  };
  function profAs(p) { var f = PROF_AS[p]; return f ? (job.sex === 'f' && f[1]) || f[0] : p.toLowerCase(); }
  function profsIn(region) {
    var seen = {}, list = [];
    O.forEach(function (o) { if (!region || o.region === region) (o.jobsFull || []).forEach(function (j) { if (!seen[j]) { seen[j] = 1; list.push(j); } }); });
    return list;
  }
  // сколько объектов подойдёт, если поменять одно условие
  function fitList(over) { var I = Object.assign({}, job, over || {}); return O.filter(function (o) { var w = fits(o, I); return w && !w.length; }); }
  function fitN(over) { return fitList(over).length; }
  var AGE_MIN = Math.min.apply(null, O.map(function (o) { return terms(o).ageMin; }));
  var AGE_MAX = Math.max.apply(null, O.map(function (o) { return Math.min(terms(o).ageMax, 70); }));

  SEL.sex = { pane: 'job', kind: 'list', name: 'Пол', title: 'Вы', head: 'объектов',
    label: function () { return job.sex === 'm' ? 'мужчина' : 'женщина'; }, cur: function () { return job.sex; },
    opts: function () { return [{ v: 'm', label: 'Мужчина', n: fitN({ sex: 'm' }) }, { v: 'f', label: 'Женщина', n: fitN({ sex: 'f' }) }]; },
    set: function (v) { job.sex = v; job.pick = ''; } };
  SEL.age = { pane: 'job', kind: 'step', name: 'Возраст', title: 'Возраст', min: 18, max: 65,
    label: function () { return job.age + ' ' + plural(job.age, 'год', 'года', 'лет'); }, cur: function () { return job.age; },
    unit: function (n) { return plural(n, 'год', 'года', 'лет'); }, count: function (n) { return fitN({ age: n }); },
    note: 'Берём с ' + AGE_MIN + ' до ' + AGE_MAX + ' лет — у каждого объекта свои рамки.',
    set: function (v) { job.age = v; job.pick = ''; } };
  SEL.prof = { pane: 'job', kind: 'list', name: 'Профессия', title: 'Профессия', head: 'объектов',
    label: function () { return job.prof ? 'работу ' + profAs(job.prof) : 'любую работу'; }, cur: function () { return job.prof; },
    opts: function () {
      return [{ v: '', label: 'Любая профессия', n: fitN({ prof: '' }) }].concat(profsIn(job.region).map(function (j) { return { v: j, label: j, n: fitN({ prof: j }) }; }));
    },
    set: function (v) { job.prof = v; job.pick = ''; } };
  SEL.region = { pane: 'job', kind: 'list', name: 'Регион', title: 'Регион', head: 'объектов',
    label: function () { var r = REGS.filter(function (x) { return x.key === job.region; })[0]; return r ? r.in : 'в любом регионе'; }, cur: function () { return job.region; },
    opts: function () {
      return [{ v: '', label: 'Любой регион', n: fitN({ region: '' }) }].concat(REGS.map(function (r) {
        return { v: r.key, label: r.label, n: fitN({ region: r.key, prof: profsIn(r.key).indexOf(job.prof) >= 0 ? job.prof : '' }) };
      }));
    },
    set: function (v) { job.region = v; job.pick = ''; if (job.prof && profsIn(v).indexOf(job.prof) < 0) job.prof = ''; } };
  SEL.shifts = { pane: 'job', kind: 'list', name: 'Вахта', title: 'Вахта', head: 'объектов',
    label: function () { return job.shifts + ' смен'; }, cur: function () { return job.shifts; },
    opts: function () {
      return [15, 20, 30, 45, 60].map(function (n) {
        var d = Math.ceil(n * 7 / WEEK[job.sched]);
        return { v: n, label: n + ' смен', hint: '≈ ' + d + ' ' + plural(d, 'день', 'дня', 'дней') + ' на объекте' + (n >= ROAD_COMP_FROM ? ' · компенсация дороги' : ''), n: fitN({ shifts: n }) };
      });
    },
    note: 'При вахте от ' + ROAD_COMP_FROM + ' смен вернём стоимость дороги — до ' + rub(ROAD_COMP) + ' по билетам.',
    set: function (v) { job.shifts = +v; job.pick = ''; } };
  SEL.sched = { pane: 'job', kind: 'list', name: 'График', title: 'График', head: 'объектов',
    label: function () { return job.sched; }, cur: function () { return job.sched; },
    opts: function () {
      var ok = fitList();
      return [{ v: '6/1', label: '6/1', hint: 'шесть смен, выходной раз в неделю' }, { v: '7/0', label: '7/0', hint: 'без выходных — домой быстрее' }].map(function (x) {
        x.n = ok.filter(function (o) { return terms(o).scheds.indexOf(x.v) >= 0; }).length; return x;
      });
    },
    note: 'Где на объекте только один график, считаем по нему.',
    set: function (v) { job.sched = v; } };
  SEL.start = { pane: 'job', kind: 'cal', name: 'Дата выезда', title: 'Когда выезжаете',
    label: function () { return day(job.start); } };
  // объект в итоге — тоже выбор: все подходящие объекты с суммой «домой»
  SEL.obj = { pane: 'job', kind: 'list', name: 'Объект', head: 'домой',
    get title() { return 'Подходят ' + lastOk.length + ' ' + plural(lastOk.length, 'объект', 'объекта', 'объектов'); },
    cur: function () { return job.pick; },
    opts: function () {
      return lastOk.map(function (x) {
        return { v: x.o.id, label: x.o.short, hint: x.o.tag + ' · ' + rub(x.rate) + ' за смену' + (x.own ? ' · только ' + x.sched : ''), side: '≈ ' + rub(x.home) };
      });
    },
    set: function (v) { job.pick = v; } };

  function readJob() {
    job.road = num($('input[name="road"]', jp)); job.food = num($('input[name="food"]', jp)); job.homePay = num($('input[name="home"]', jp));
  }
  // откуда ставка — как в условиях объекта
  var BASIS = { '100': 'при 100 % выработке', given: 'сделка — по условиям объекта', fixed: 'фиксированная ставка' };
  function rateNote(p) { return esc(p.text) + '.'; }
  function drawJob() {
    readJob();
    var all = O.map(function (o) { return { o: o, why: fits(o, job) }; }).filter(function (x) { return x.why; });
    var ok = all.filter(function (x) { return !x.why.length; }).map(function (x) { return calc(x.o, job); }).sort(function (a, b) { return b.home - a.home; });
    var best = $('[data-cm-best]', cm), plan = $('[data-cm-plan]', cm);
    lastOk = ok;
    if (!ok.length) {
      // почему ничего не подошло: по порядку — пол, возраст, длительность вахты (среди объектов выбранного региона и профессии)
      var C = all.map(function (x) { return x.o; }), why;
      var bySex = C.filter(function (o) { return job.sex === 'm' ? terms(o).men : terms(o).women; });
      var byAge = bySex.filter(function (o) { return job.age >= terms(o).ageMin && job.age <= terms(o).ageMax; });
      if (!C.length) why = 'По этой профессии в выбранном регионе вакансий нет — выберите другой регион или «любую работу».';
      else if (!bySex.length) why = 'Здесь сейчас набирают только ' + (job.sex === 'm' ? 'женщин' : 'мужчин') + '. Выберите другой регион или профессию.';
      else if (!byAge.length) why = 'По возрасту здесь берут от ' + Math.min.apply(null, bySex.map(function (o) { return terms(o).ageMin; })) + ' до ' + Math.max.apply(null, bySex.map(function (o) { return terms(o).ageMax; })) + ' лет.';
      else if (!byAge.some(function (o) { return posFor(o, job); })) why = 'Эту работу здесь предлагают только ' + (job.sex === 'f' ? 'мужчинам' : 'женщинам') + '. Выберите другую профессию.';
      else why = 'Здесь вахта — от ' + Math.min.apply(null, byAge.map(function (o) { return o.minShifts || 0; })) + ' смен. Выберите вахту длиннее.';
      best.innerHTML = '<div class="cm-empty"><span class="mono mono--dim">Не нашли</span><p class="cm-obj__name">Под эти условия объектов нет</p><p class="cm__note">' + why + '</p></div>';
      plan.innerHTML = '';
      shown.job = null; bar.job = ['Нет объектов', 'измените условия', 'Подробнее']; drawBar(); return;
    }
    var cur = ok.filter(function (c) { return c.o.id === job.pick; })[0] || ok[0], idx = ok.indexOf(cur);
    job.pick = cur.o.id;
    var c = cur, t = c.t, o = c.o, end = addDays(job.start, c.days), off = c.days - c.worked, extra = c.worked - job.shifts;
    // полоса: из начисленного — что домой, что на налог, еду и дорогу (за вычетом компенсации)
    var segs = [['home', Math.max(0, c.home)], ['tax', c.tax], ['food', c.food], ['road', Math.max(0, job.road - c.comp)]];
    best.innerHTML =
      '<div class="cm-best">' +
        '<div class="cm-best__top"><span class="mono mono--dim">' + (ok.length === 1 ? 'Подходит один объект' : idx === 0 ? 'Больше всего — здесь' : (idx + 1) + '-й из ' + ok.length + ' по сумме') + '</span>' +
          (ok.length > 1 ? '<span class="cm-step"><button type="button" class="cm-step__b" data-cm-step="-1" aria-label="Предыдущий объект"' + (idx ? '' : ' disabled') + '>' + ARROW(-1) + '</button>' +
            '<span class="mono">' + (idx + 1) + ' / ' + ok.length + '</span>' +
            '<button type="button" class="cm-step__b" data-cm-step="1" aria-label="Следующий объект"' + (idx < ok.length - 1 ? '' : ' disabled') + '>' + ARROW(1) + '</button></span>' : '') + '</div>' +
        (ok.length > 1
          ? '<button type="button" class="cm-obj" data-cm-k="obj" aria-haspopup="dialog" aria-expanded="false" aria-label="Объект: ' + esc(o.short) + '. Все подходящие объекты"><span class="cm-obj__name">' + esc(o.short) + CHEV + '</span></button>'
          : '<p class="cm-obj"><span class="cm-obj__name">' + esc(o.short) + '</span></p>') +
        '<p class="mono mono--dim cm-best__meta">' + esc(o.region + ' · ' + o.tag) + ' · ' + rub(c.rate) + ' за смену' + (c.p.basis === '100' ? ' при 100 %' : '') + '</p>' +
        '<div class="cm-best__sum"><span class="mono mono--dim">Привезёте домой</span>' +
          '<span class="cm__sum"><span class="cm__approx">≈</span><span data-cm-num="' + c.home + '">' + money(shown.job == null ? c.home : shown.job) + '</span><small>₽</small></span>' +
          '<span class="mono cm__range">за ' + job.shifts + ' смен вахты · ' + c.days + ' ' + plural(c.days, 'день', 'дня', 'дней') + ' на объекте</span></div>' +
        '<div class="cm-bar" aria-hidden="true">' + segs.map(function (s) { return s[1] > 0 ? '<i class="is-' + s[0] + '" style="flex-grow:' + s[1] + '"></i>' : ''; }).join('') + '</div>' +
        '<ul class="cm-break">' +
          (t.unpaid ? '<li class="is-free"><span>Обучение: ' + (t.unpaid === 1 ? 'первая смена' : 'первые ' + t.unpaid + ' смены') + '<em>без оплаты, ' + (t.counted ? 'входит в срок вахты' : 'сверх срока вахты') + '</em></span><b>0 ₽</b></li>' : '') +
          (c.inN ? '<li class="is-home"><span>Стажировка: ' + c.inN + ' × ' + rub(c.p.intern.rate) + '</span><b>' + rub(c.inN * c.p.intern.rate) + '</b></li>' : '') +
          '<li class="is-home"><span>' + (c.inN ? 'Дальше: ' : 'Смены: ') + c.regN + ' × ' + rub(c.rate) + '<em>' + BASIS[c.p.basis] + '</em></span><b>' + rub(c.regN * c.rate) + '</b></li>' +
          '<li class="is-tax"><span>Налог самозанятого 6 %</span><b>−' + rub(c.tax) + '</b></li>' +
          '<li class="is-food"><span>Еда: ' + c.days + ' дн. × ' + rub(Math.round(job.food * t.foodShare)) + '<em>' + t.foodNote + '</em></span><b>' + (c.food ? '−' + rub(c.food) : '0 ₽') + '</b></li>' +
          '<li class="is-road"><span>Дорога туда и обратно</span><b>' + (job.road ? '−' + rub(job.road) : '0 ₽') + '</b></li>' +
          (c.comp ? '<li class="is-comp"><span>Компенсация дороги<em>до ' + rub(ROAD_COMP) + ' при вахте от ' + ROAD_COMP_FROM + ' смен</em></span><b class="is-plus">+' + rub(c.comp) + '</b></li>' : '') +
          '<li class="is-free"><span>Жильё</span><b>' + (/бесплатно/.test(o.housing || '') ? 'бесплатно' : 'уточняется') + '</b></li>' +
        '</ul>' +
        '<p class="cm-src">' + rateNote(c.p) + '</p>' +
        '<a class="btn btn--outline btn--block" href="#contact" data-cm-apply="' + esc(o.id) + '"><span>Хочу на этот объект</span><svg class="btn__arrow" viewBox="0 0 16 16"><path d="M4.5 11.5l7-7M5.5 4.5h6v6" /></svg></a>' +
      '</div>';
    tween('job', $('[data-cm-num]', best));

    // как пройдёт вахта: выезд (дату можно поменять прямо здесь) — аванс — домой
    var advAt = Math.ceil((t.advAfter + (t.counted ? 0 : t.unpaid)) * 7 / c.week), advPct = Math.round(Math.min(advAt / c.days, 1) * 100);
    var mon = job.homePay ? Math.round(c.home / job.homePay * 10) / 10 : 0;   // дробное число месяцев — «4,1 месяца», целое — по правилам
    plan.innerHTML =
      '<p class="mono mono--dim">Как пройдёт вахта</p>' +
      '<div class="cm-tl">' +
        (t.weekly
          ? '<span class="cm-tl__adv" style="left:50%"><b>' + rub(o.advance) + '</b> аванс каждую неделю</span>'
          : '<span class="cm-tl__adv" style="left:clamp(5rem, ' + advPct + '%, calc(100% - 5rem))"><b>≈ ' + day(addDays(job.start, advAt)) + '</b> аванс ' + rub(o.advance) + '</span>') +
        '<div class="cm-tl__track">' + (t.weekly
          ? Array.apply(null, { length: Math.floor((c.days - 1) / 7) }).map(function (_, k) { return '<i style="left:' + ((k + 1) * 7 / c.days * 100) + '%"></i>'; }).join('')
          : '<i style="left:' + advPct + '%"></i>') + '</div>' +
        '<div class="cm-tl__lbl"><span><span class="cm-tk" role="button" tabindex="0" data-cm-k="start"></span> выезд</span><span><b>≈ ' + day(end) + '</b> домой</span></div>' +
      '</div>' +
      '<ul class="cm-when">' +
        (o.note ? '<li><b>' + esc(o.note) + '</b></li>' : '') +
        '<li>' + (t.scheds.length > 1 && o.schedTBD ? 'График на объекте уточняется, считаем <b>' + c.sched + '</b>: ' : c.own ? 'На этом объекте только <b>' + c.sched + '</b> — ' + SCHED_TXT[c.sched] + ': ' : 'График <b>' + c.sched + '</b>: ') +
          job.shifts + ' смен' + (extra ? ' + ' + extra + ' ' + plural(extra, 'смена', 'смены', 'смен') + ' обучения' : '') + (off ? ' и ' + off + ' ' + plural(off, 'выходной', 'выходных', 'выходных') : ' подряд') + ' — <b>' + c.days + ' ' + plural(c.days, 'день', 'дня', 'дней') + '</b> на объекте, дни в дороге не входят</li>' +
        '<li>' + (t.weekly ? 'Аванс <b>' + rub(o.advance) + '</b> каждую неделю' : 'Аванс <b>' + rub(o.advance) + '</b> после ' + t.advAfter + ' смен') + ', остаток — в конце вахты</li>' +
        '<li>' + (job.homePay ? 'Дома на эти деньги ушло бы <b>≈ ' + String(mon).replace('.', ',') + ' ' + (mon % 1 ? 'месяца' : plural(mon, 'месяц', 'месяца', 'месяцев')) + '</b> работы'
          : 'В среднем <b>' + rub(c.home / c.days) + '</b> чистыми за день на объекте') + '</li>' +
        (t.road ? '<li>От жилья до работы — ' + esc(t.road) + '</li>' : '') +
      '</ul>';
    drawTokens();
    bar.job = ['≈ ' + rub(c.home) + ' домой', o.short + ' · ' + job.shifts + ' смен · ' + c.sched, 'Подробнее']; drawBar();
  }
  jp.addEventListener('input', function (e) { if (e.target.matches('.cm-tk--in input')) drawJob(); });
  jp.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cm-step]'); if (!b) return;
    var i = lastOk.map(function (x) { return x.o.id; }).indexOf(job.pick) + (+b.dataset.cmStep);
    if (lastOk[i]) { job.pick = lastOk[i].o.id; drawJob(); var nb = $('[data-cm-step="' + b.dataset.cmStep + '"]', jp); if (nb && !nb.disabled) nb.focus({ preventScroll: true }); }
  });
  // «Хочу на этот объект» — к общей заявке: объект, длительность и профессия уже выбраны
  var PROF_FORM = { 'Комплектовщик': 'Комплектовщик', 'Упаковщик': 'Упаковщик', 'Сортировщик': 'Сортировщик', 'Водитель высотного штабелёра': 'ВВШ' };
  cm.addEventListener('click', function (e) {
    var a = e.target.closest('[data-cm-apply]'); if (!a) return;
    var f = $('[data-form]'); if (!f) return;
    var tb = $('[data-tab-btn="job"]', f); if (tb) tb.click();
    var r = $('input[name="shifts"][value="' + job.shifts + '"]', f); if (r) r.checked = true;
    $$('input[name="prof"]', f).forEach(function (c) { c.checked = !!job.prof && c.value === PROF_FORM[job.prof]; });
    var sel = $('[data-object-select]', f); if (sel && sel.querySelector('option[value="' + a.dataset.cmApply + '"]')) sel.value = a.dataset.cmApply;
    close();   // до прокрутки к заявке (main.js прокручивает по ссылке #contact, когда окно уже закрыто)
  });

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
    var segs = [['home', pay], ['tax', contrib], ['food', hireCost], ['road', trainCost], ['stay', housing]];
    out.innerHTML =
      '<div class="cm-best">' +
        '<div class="cm-best__sum"><span class="mono mono--dim">Нужно в штате</span>' +
          '<span class="cm__sum cm__sum--md">' + staff + '<small>' + plural(staff, 'человек', 'человека', 'человек') + '</small></span></div>' +
        '<div class="cm-best__sum"><span class="mono mono--dim">Свой штат обойдётся в месяц</span>' +
          '<span class="cm__sum' + (total >= 1e7 ? ' cm__sum--md' : '') + '"><span class="cm__approx">≈</span><span data-cm-num="' + total + '">' + money(shown.biz == null ? total : shown.biz) + '</span><small>₽</small></span>' +
          '<span class="mono cm__range">≈ ' + rub(perHour) + ' за час работы одного человека</span></div>' +
        '<div class="cm-bar" aria-hidden="true">' + segs.map(function (x) { return x[1] > 0 ? '<i class="is-' + x[0] + '" style="flex-grow:' + x[1] + '"></i>' : ''; }).join('') + '</div>' +
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
    bar.biz = [people(staff) + ' · ≈ ' + rub(total), 'свой штат в месяц', 'К заявке']; drawBar();
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

  drawJob(); drawBiz();   // фразу рисует drawJob (в ней и дата выезда на линии вахты)
  tab('job');
})();
