/* Shared candidate model and employer calculator modal. Goal renders candidates;
   eligibility, rates, calendar and finance remain in the shared AS.CalcModal API.
   Employer headcount and contact-form transfer are separate from candidate finance. */
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
  // рабочих смен в неделю при графике: 6/1 — шесть смен и выходной, 7/0 — без выходных
  var WEEK = { '6/1': 6, '7/0': 7, '5/2': 5, '2/2': 3.5 };
  // календарь вахты: [смен подряд, выходных после них]. День заезда — первая смена; выходные — после каждых N смен;
  // после последней смены выходного нет — человек уезжает
  var CYCLE = { '6/1': [6, 1], '7/0': [7, 0], '5/2': [5, 2], '2/2': [2, 2] };
  function shiftDay(n, sched) { var c = CYCLE[sched] || CYCLE['7/0']; return n > 0 ? n - 1 + c[1] * Math.floor((n - 1) / c[0]) : 0; }   // n-я смена — в какой день от заезда (0 — день заезда)
  function daysOn(n, sched) { return n > 0 ? shiftDay(n, sched) + 1 : 0; }
  function rub(n) { return money(Math.round(n)) + ' ₽'; }
  // число из поля — целые рубли (штуки): копейки и доли не считаем. «600», «600,00», «600.5» — 600; «6 000», «6.000», «6 000,50» — 6000.
  // Разделитель с одной-двумя цифрами в конце — дробная часть, с тремя — разряды
  function parseNum(s) {
    var d = String(s).replace(/[\s  ]/g, '').replace(/[.,]\d{0,2}$/, '').replace(/\D/g, '').slice(0, 9);
    return parseInt(d, 10) || 0;
  }
  var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function day(d) { return d.getDate() + '\u00a0' + MON[d.getMonth()]; }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  /* ---------- окно ---------- */
  var opener = null, opening = 0, closeTimer = 0;
  function open(e) {
    if (!cm.hidden && cm.classList.contains('is-open')) return;
    var version = ++opening;
    clearTimeout(closeTimer); closeTimer = 0;
    opener = e && e.currentTarget || document.activeElement;
    cm.classList.add('is-preparing');
    cm.hidden = false;
    if (AS.lenis) AS.lenis.stop();
    document.documentElement.classList.add('cm-lock');
    // Hidden calculators have not requested their fonts or measured their
    // controls yet. Lay out the active view, then reveal its settled geometry.
    void cm.offsetWidth;
    function reveal() {
      if (version !== opening) return;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        if (version !== opening) return;
        cm.classList.remove('is-preparing');
        cm.classList.add('is-open');
        var c = $('.cm__close', cm); if (c) c.focus({ preventScroll: true });
      }); });
    }
    if (document.fonts) document.fonts.ready.then(reveal, reveal);
    else reveal();
  }
  function close() {
    if (cm.hidden) return;
    ++opening;
    clearTimeout(closeTimer);
    var preparing = cm.classList.contains('is-preparing');
    cm.classList.remove('is-preparing');
    cm.classList.remove('is-open');
    document.documentElement.classList.remove('cm-lock');
    if (AS.lenis) AS.lenis.start();
    if (preparing || reduce) { cm.hidden = true; closeTimer = 0; }
    else closeTimer = setTimeout(function () { cm.hidden = true; closeTimer = 0; }, 420);
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
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') trap(e, $('.calc-workspace', cm) || $('.cm__panel', cm));
  });

  /* ---------- Shared audience tabs ---------- */
  function tab(t) {
    cm.dataset.tab = t === 'biz' ? 'biz' : 'job';
    $$('[data-cm-tab]', cm).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.cmTab === cm.dataset.tab ? 'true' : 'false'); });
    $$('[data-cm-pane]', cm).forEach(function (p) { p.hidden = p.dataset.cmPane !== cm.dataset.tab; });
  }
  $$('[data-cm-tab]', cm).forEach(function (b) { b.addEventListener('click', function () { tab(b.dataset.cmTab); }); });
  var today = new Date(); today.setHours(0, 0, 0, 0);

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
  function shiftBounds(o) {
    var lengths = (o.vakhta || []).filter(function (n) {
      return typeof n === 'number' && isFinite(n) && n > 0 && Math.floor(n) === n;
    });
    return lengths.length ? { min: Math.min.apply(null, lengths), max: Math.max.apply(null, lengths) }
      : { min: Math.max(1, Math.ceil(o.minShifts || 1)), max: 90 };
  }
  function fits(o, I) {
    var t = terms(o), why = [];
    if (I.region && o.region !== I.region) return null;
    if (I.prof && (o.jobsFull || []).indexOf(I.prof) < 0) return null;
    var bounds = shiftBounds(o);
    // A stay may be extended by whole shifts between the catalog milestones.
    // 20 + 10 uses the same 30-shift calculation, without restarting training.
    if (Math.floor(I.shifts) !== I.shifts || I.shifts < bounds.min || I.shifts > bounds.max) why.push('вахта от ' + bounds.min + ' до ' + bounds.max + ' смен');
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
  function modelShiftCounts(id, overrides) {
    var I = Object.assign({}, job, overrides || {});
    var objects = id ? O.filter(function (o) { return o.id === id; }) : O, result = [];
    objects.forEach(function (o) {
      var bounds = shiftBounds(o);
      for (var n = bounds.min; n <= bounds.max; n++) {
        var why = fits(o, Object.assign({}, I, { shifts: n }));
        if (why && !why.length && result.indexOf(n) < 0) result.push(n);
      }
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
      modelShiftCounts(o.id, I).forEach(function (shifts) {
        var quote = calc(o, Object.assign({}, I, { shifts: shifts }));
        if (I.v === 'hi' && !quote.hi) return;
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
    open: function () { open(); },   // «Калькулятор вахты» в меню и подвале (main.js)
    state: modelState,
    parseAmount: parseNum,
    set: modelSet,
    preview: modelPreview,
    durations: function (id) { return modelDurations(id, job); },
    shiftCounts: modelShiftCounts,
    solve: modelSolve,
    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      modelListeners.push(fn);
      return function () { var i = modelListeners.indexOf(fn); if (i >= 0) modelListeners.splice(i, 1); };
    },
    apply: applyJob,
    employerState: employerState,
    employerSet: employerSet,
    employerQuote: employerQuote,
    employerSubscribe: employerSubscribe,
    employerApply: employerApply
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
    $$('[data-calc-shift-choice]', f).forEach(function (choice) { choice.remove(); });
    var r = $('input[name="shifts"][value="' + job.shifts + '"]', f);
    if (!r) {
      var template = $('input[name="shifts"]', f), label = template && template.closest('label');
      if (label) {
        var choice = label.cloneNode(true);
        choice.setAttribute('data-calc-shift-choice', '');
        r = $('input[name="shifts"]', choice);
        r.value = String(job.shifts);
        r.removeAttribute('checked');
        $('span', choice).textContent = job.shifts + ' ' + plural(job.shifts, 'смена', 'смены', 'смен');
        label.parentNode.appendChild(choice);
      }
    }
    if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
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

  /* ---------- Employer headcount model ---------- */
  var employerRoles = [];
  O.forEach(function (o) { (o.jobsFull || []).forEach(function (role) {
    if (employerRoles.indexOf(role) < 0) employerRoles.push(role);
  }); });
  var employerRegions = (AS.REGIONS || []).map(function (region) { return region.key; });
  if (employerRegions.indexOf('Другой регион') < 0) employerRegions.push('Другой регион');
  var employer = {
    prof: employerRoles.indexOf('Комплектовщик') >= 0 ? 'Комплектовщик' : employerRoles[0] || '',
    region: employerRegions.indexOf('Москва и МО') >= 0 ? 'Москва и МО' : employerRegions[0],
    posts: 20, daily: 1, opdays: 7, sched: '2/2', stay: false, reservePct: 8
  };
  var employerListeners = [];
  function employerState() { return Object.assign({}, employer); }
  function employerInteger(value) {
    if (typeof value === 'string') {
      if (!/^\d+$/.test(value.trim())) return null;
      value = Number(value.trim());
    }
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value ? value : null;
  }
  function employerSet(patch) {
    patch = patch && typeof patch === 'object' ? patch : {};
    var next = employerState();
    if (employerRoles.indexOf(patch.prof) >= 0) next.prof = patch.prof;
    if (employerRegions.indexOf(patch.region) >= 0) next.region = patch.region;
    var schedule = patch.sched === 'Вахта 7/0' ? '7/0' : patch.sched;
    if (typeof schedule === 'string' && Object.prototype.hasOwnProperty.call(WEEK, schedule)) next.sched = schedule;
    if (typeof patch.stay === 'boolean') next.stay = patch.stay;
    ['posts', 'daily', 'opdays', 'reservePct'].forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return;
      var value = employerInteger(patch[key]);
      if (value === null) return;
      if (key === 'posts' && value >= 1 && value <= 200 ||
          key === 'daily' && (value === 1 || value === 2) ||
          key === 'opdays' && value >= 5 && value <= 7 ||
          key === 'reservePct' && value >= 0 && value <= 30) next[key] = value;
    });
    var changed = Object.keys(next).some(function (key) { return next[key] !== employer[key]; });
    if (changed) {
      employer = next;
      employerListeners.slice().forEach(function (listener) { listener(employerState()); });
    }
    return employerState();
  }
  function employerQuote() {
    var state = employerState(), weeklyPosts = state.posts * state.daily * state.opdays;
    // A fixed 2/2 cycle intersects half the object's open days over 28 days.
    // Other schedules cannot supply shifts on days when the object is closed.
    var weeklyCapacity = state.sched === '2/2' ? state.opdays / 2 : Math.min(state.opdays, WEEK[state.sched]);
    // First round required people up, then round the explicitly chosen reserve up.
    var base = Math.max(state.posts * state.daily, Math.ceil(weeklyPosts / weeklyCapacity));
    var reserve = Math.ceil(base * state.reservePct / 100);
    return { state: state, weeklyPosts: weeklyPosts, weeklyCapacity: weeklyCapacity,
      base: base, reserve: reserve, total: base + reserve, reservePct: state.reservePct };
  }
  function employerSubscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    employerListeners.push(listener);
    return function () {
      var index = employerListeners.indexOf(listener);
      if (index >= 0) employerListeners.splice(index, 1);
    };
  }

  /* ---------- Employer request transfer ---------- */
  function employerApply() {
    var form = $('[data-form]'); if (!form) return false;
    var quote = employerQuote(), state = quote.state;
    var businessTab = $('[data-tab-btn="business"]', form); if (businessTab) businessTab.click();
    var bucket = quote.total <= 10 ? 'до 10' : quote.total <= 50 ? '10–50' : quote.total <= 100 ? '50–100' : '100+';
    $$('input[name="headcount"]', form).forEach(function (radio) { radio.checked = radio.value === bucket; });
    var message = $('textarea[name="message"]', form);
    if (message) {
      var line = 'Из калькулятора персонала: ' + state.prof + ', ' + state.region + '; ' + state.posts +
        ' чел. на смене, смен в сутки: ' + state.daily + ', рабочих дней в неделю: ' + state.opdays +
        ', график сотрудника ' + state.sched + '; основная команда ' + quote.base + ' чел. + резерв ' +
        quote.reserve + ' чел. (' + state.reservePct + ' %) = ' + quote.total + ' чел. всего; проживание ' +
        (state.stay ? 'нужно' : 'не нужно') + '.';
      var own = message.value.split('\n').filter(function (text) { return !/^\s*Из калькулятора персонала:/.test(text); }).join('\n').trim();
      message.value = own ? own + '\n\n' + line : line;
      message.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var done = $('.form__done', form); if (done) done.hidden = true;
    close();
    var contact = document.getElementById('contact') || form;
    if (AS.lenis) AS.lenis.scrollTo(contact);
    else window.scrollTo({ top: contact.getBoundingClientRect().top + window.scrollY, behavior: reduce ? 'auto' : 'smooth' });
    return true;
  }

  refreshJobModel();
  tab('job');
})();
