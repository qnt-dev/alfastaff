/* Альфа-Стафф · калькулятор во всплывающем окне — открывается кнопкой в кармашке первого экрана
   (на телефоне — кнопкой «Посчитать заработок» под «Подобрать вахту»).
   Вкладка «Ищу работу» — заработок за вахту по реальным ставкам объектов из каталога (AS.OBJECTS):
   регион → профессия → длительность; «Выбрать эту вахту» ведёт к общей заявке с подставленными сменами и профессией.
   Вкладка «Нужен персонал» — параметры запроса бизнеса; цены заказчик ещё не дал, поэтому без выдуманной цифры:
   параметры собираются в краткое описание и уходят с заявкой «Получить расчёт». */
(function () {
  'use strict';
  var AS = window.AS || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cm = $('[data-cm]');
  if (!cm || !AS.OBJECTS) return;
  var O = AS.OBJECTS.filter(function (o) { return o.rateMin; });
  var money = AS.money || function (n) { return String(Math.round(n)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SHIFTS = [15, 20, 30, 45, 60];
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chip(name, value, label, checked, type, extra) {
    return '<label><input type="' + (type || 'radio') + '" name="' + name + '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + '><span>' + esc(label) + (extra ? '<em class="mono">' + esc(extra) + '</em>' : '') + '</span></label>';
  }

  /* ---------- окно ---------- */
  var opener = null;
  function open(e) {
    opener = e && e.currentTarget || document.activeElement;
    cm.hidden = false;
    if (AS.lenis) AS.lenis.stop();
    document.documentElement.classList.add('cm-lock');
    requestAnimationFrame(function () { requestAnimationFrame(function () { cm.classList.add('is-open'); }); });
    setTimeout(function () { var c = $('.cm__close', cm); if (c) c.focus({ preventScroll: true }); }, 60);
  }
  function close() {
    if (cm.hidden) return;
    cm.classList.remove('is-open');
    document.documentElement.classList.remove('cm-lock');
    if (AS.lenis) AS.lenis.start();
    setTimeout(function () { cm.hidden = true; }, reduce ? 0 : 420);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  $$('[data-calc-open]').forEach(function (b) { b.addEventListener('click', open); });
  $$('[data-cm-close]', cm).forEach(function (b) { b.addEventListener('click', close); });
  document.addEventListener('keydown', function (e) {
    if (cm.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {   // фокус не уходит из окна
      var f = $$('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea', $('.cm__panel', cm)).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- вкладки ---------- */
  function tab(t) {
    cm.dataset.tab = t;
    $$('[data-cm-tab]', cm).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.cmTab === t ? 'true' : 'false'); });
    $$('[data-cm-pane]', cm).forEach(function (p) { p.hidden = p.dataset.cmPane !== t; });
    if (typeof drawBar === 'function' && barEl) drawBar();
  }
  $$('[data-cm-tab]', cm).forEach(function (b) { b.addEventListener('click', function () { tab(b.dataset.cmTab); }); });
  tab('job');

  /* ---------- сегменты (длительность вахты, длина смены) ---------- */
  function seg(el, onChange) {
    var btns = $$('button', el);
    el.style.setProperty('--n', btns.length);
    function set(i) {
      btns.forEach(function (b, k) { b.setAttribute('aria-checked', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
      el.style.setProperty('--i', i); onChange(btns[i].dataset.v);
    }
    btns.forEach(function (b, i) { b.addEventListener('click', function () { set(i); }); });
    el.addEventListener('keydown', function (e) {
      var i = btns.findIndex(function (b) { return b.getAttribute('aria-checked') === 'true'; });
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); i = (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length; set(i); btns[i].focus(); }
    });
    set(Math.max(0, btns.findIndex(function (b) { return b.hasAttribute('data-on'); })));
  }

  /* ---------- строка-итог внизу шторки на телефоне: прячется, когда карточка итога в кадре ---------- */
  var panel = $('.cm__panel', cm), barEl = $('[data-cm-bar]', cm), bar = { job: ['', '', ''], biz: ['', '', ''] }, barSeen = {};
  function drawBar() {
    var b = bar[cm.dataset.tab || 'job'];
    $('[data-cm-bar-main]', cm).textContent = b[0]; $('[data-cm-bar-sub]', cm).textContent = b[1]; $('[data-cm-bar-btn]', cm).textContent = b[2];
    barEl.classList.toggle('is-off', !!barSeen[cm.dataset.tab || 'job']);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { barSeen[e.target.closest('[data-cm-pane]').dataset.cmPane] = e.isIntersecting; }); drawBar();
    }, { root: panel, threshold: 0.35 });
    $$('.cm__result', cm).forEach(function (r) { io.observe(r); });
  }
  $('[data-cm-bar-go]', cm).addEventListener('click', function () {
    var r = $('[data-cm-pane="' + (cm.dataset.tab || 'job') + '"] .cm__result', cm);
    if (r) panel.scrollTo({ top: r.offsetTop - 16, behavior: reduce ? 'auto' : 'smooth' });
  });

  /* ---------- «Ищу работу» ---------- */
  var job = { region: (AS.REGIONS && AS.REGIONS[0] && AS.REGIONS[0].key) || O[0].region, prof: '', shifts: 30 };
  var regBox = $('[data-cm-region]', cm), profBox = $('[data-cm-job]', cm), sumEl = $('[data-cm-sum]', cm), shownSum = 0;
  regBox.innerHTML = (AS.REGIONS || []).map(function (r) {
    var n = O.filter(function (o) { return o.region === r.key; }).length;
    return n ? chip('cm-region', r.key, r.label, r.key === job.region, 'radio', String(n)) : '';
  }).join('');
  function profsOf(region) {
    var seen = {}, out = [];
    O.forEach(function (o) { if (o.region === region) (o.jobsFull || []).forEach(function (j) { if (!seen[j]) { seen[j] = 1; out.push(j); } }); });
    return out;
  }
  function drawProfs() {
    var list = profsOf(job.region);
    if (job.prof && list.indexOf(job.prof) < 0) job.prof = '';
    profBox.innerHTML = chip('cm-prof', '', 'Любая', !job.prof) + list.map(function (j) { return chip('cm-prof', j, j, j === job.prof); }).join('');
  }
  function animSum(to) {
    if (reduce) { shownSum = to; sumEl.textContent = money(to); return; }
    var from = shownSum, t0 = performance.now();
    // пока цифра бежит — круглые сотни, в конце — точная сумма (совпадает со строкой «от … до …»)
    (function s(n) { var p = Math.min(1, (n - t0) / 600), e = 1 - Math.pow(1 - p, 3); shownSum = from + (to - from) * e; sumEl.textContent = money(p < 1 ? Math.round(shownSum / 100) * 100 : to); if (p < 1) requestAnimationFrame(s); })(t0);
  }
  function matches() {
    return O.filter(function (o) { return o.region === job.region && (!job.prof || (o.jobsFull || []).indexOf(job.prof) >= 0); });
  }
  function calcJob() {
    var M = matches(), v = job.shifts;
    if (!M.length) return;
    var lo = Math.min.apply(null, M.map(function (o) { return o.rateMin; })), hi = Math.max.apply(null, M.map(function (o) { return o.rateTop; }));
    var mid = median(M.map(function (o) { return (o.rateMin + o.rateTop) / 2; }));
    animSum(mid * v);
    $('[data-cm-range]', cm).textContent = lo === hi ? 'ставка фиксированная — ' + money(lo * v) + ' ₽ за ' + v + ' смен' : 'от ' + money(lo * v) + ' до ' + money(hi * v) + ' ₽ за ' + v + ' смен';
    $('[data-cm-rate]', cm).innerHTML = 'Ставка за смену: <b>' + (lo === hi ? money(lo) : 'от ' + money(lo) + ' до ' + money(hi)) + ' ₽</b>' + (M.some(function (o) { return o.piece; }) ? ', на части объектов — сдельно' : '');
    $('[data-cm-count]', cm).innerHTML = 'Подходит <b>' + M.length + ' ' + (AS.plural ? AS.plural(M.length, 'объект', 'объекта', 'объектов') : 'объектов') + '</b>: ' + esc(M.slice(0, 3).map(function (o) { return o.short; }).join(', ')) + (M.length > 3 ? ' и др.' : '');
    var adv = M.map(function (o) { return o.advance; }).filter(Boolean);
    $('[data-cm-adv]', cm).innerHTML = adv.length ? 'Аванс <b>' + (Math.min.apply(null, adv) === Math.max.apply(null, adv) ? money(adv[0]) : money(Math.min.apply(null, adv)) + '–' + money(Math.max.apply(null, adv))) + ' ₽</b> — после 7 смен или каждую неделю, остальное — в конце вахты' : 'Аванс — по условиям объекта';
    $('[data-cm-road]', cm).hidden = v < 30;
    $('[data-cm-shifts-lbl]', cm).textContent = v;
    bar.job = ['≈ ' + money(mid * v) + ' ₽', 'за ' + v + ' смен · ' + (job.prof || 'любая профессия').toLowerCase(), 'Подробнее']; drawBar();
  }
  regBox.addEventListener('change', function (e) { job.region = e.target.value; drawProfs(); calcJob(); });
  profBox.addEventListener('change', function (e) { job.prof = e.target.value; calcJob(); });
  drawProfs();
  seg($('[data-cm-shifts]', cm), function (v) { job.shifts = parseInt(v, 10); calcJob(); });
  // на кнопке в кармашке — та же сумма, с которой открывается окно (первый регион, любая профессия, 30 смен)
  var teaser = median(matches().map(function (o) { return (o.rateMin + o.rateTop) / 2; })) * 30;
  $$('[data-calc-teaser]').forEach(function (el) { el.textContent = money(Math.round(teaser / 1000) * 1000); });
  // «Выбрать эту вахту» — к общей заявке: подставляем длительность и профессию (вкладку «Ищу работу» включает main.js по data-tab)
  var PROF_FORM = { 'Комплектовщик': 'Комплектовщик', 'Упаковщик': 'Упаковщик', 'Сортировщик': 'Сортировщик', 'Водитель высотного штабелёра': 'ВВШ' };
  $('[data-cm-apply]', cm).addEventListener('click', function () {
    var r = $('[data-form] input[name="shifts"][value="' + job.shifts + '"]'); if (r) r.checked = true;
    $$('[data-form] input[name="prof"]').forEach(function (c) { c.checked = !!job.prof && c.value === PROF_FORM[job.prof]; });
    var M = matches(), sel = $('[data-form] [data-object-select]'); if (sel) sel.value = M.length === 1 ? M[0].id : '';
    close();
  });

  /* ---------- «Нужен персонал» ---------- */
  var biz = $('[data-cm-pane="biz"]', cm), bHours = '12';
  var BJOBS = ['Комплектовщик', 'Упаковщик', 'Сортировщик', 'Водитель штабелёра', 'Грузчик', 'Стикеровщик', 'Оператор возвратов'];
  $('[data-cm-bjobs]', cm).innerHTML = BJOBS.map(function (j, i) { return chip('cm-bjob', j, j, i === 0, 'checkbox'); }).join('');
  var heads = $('[data-cm-heads]', cm), headsOut = $('[data-cm-heads-out]', cm);
  function val(name) { var x = $('input[name="' + name + '"]:checked', biz); return x ? x.value : ''; }
  function vals(name) { return $$('input[name="' + name + '"]:checked', biz).map(function (x) { return x.value; }); }
  function brief() {
    var n = parseInt(heads.value, 10), jobs = vals('cm-bjob'), extra = vals('cm-extra');
    headsOut.textContent = n >= 200 ? '200+' : n;
    var parts = [(n >= 200 ? '200+' : n) + ' ' + (AS.plural ? AS.plural(n, 'человек', 'человека', 'человек') : 'человек') + (jobs.length ? ': ' + jobs.join(', ').toLowerCase() : '')];
    parts.push('смена ' + bHours + ' ч', 'график ' + val('cm-sched'), val('cm-where'));
    parts.push(val('cm-stay') === 'Нужно' ? 'с проживанием' : 'без проживания');
    if (extra.length) parts.push(extra.join(', ').toLowerCase());
    var t = parts.filter(Boolean).join(' · ');
    bar.biz = [(n >= 200 ? '200+' : n) + ' ' + (AS.plural ? AS.plural(n, 'человек', 'человека', 'человек') : 'человек'), 'смена ' + bHours + ' ч · ' + val('cm-where'), 'К заявке']; drawBar();
    $('[data-cm-brief]', cm).textContent = t; $('input[name="brief"]', biz).value = t;
    heads.style.setProperty('--p', ((n - heads.min) / (heads.max - heads.min) * 100).toFixed(1) + '%');
  }
  seg($('[data-cm-hours]', cm), function (v) { bHours = v; brief(); });
  biz.addEventListener('input', brief); biz.addEventListener('change', brief);
  brief();
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
  $('[data-cm-again]', biz).addEventListener('click', function () { $$('.field input', biz).forEach(function (i) { i.value = ''; }); $('.cm__done', biz).hidden = true; });
})();
