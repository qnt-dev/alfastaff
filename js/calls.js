/* Страница «Контроль звонков» (calls.html). Данные зашифрованы общим паролем (js/calls-data.enc.js,
   tools/encrypt_calls.py): после пароля WebCrypto расшифровывает их, и блоки рисуются здесь же.
   Блоки появляются уже после main.js, поэтому появление (.is-in) и счётчики data-count для них запускает этот скрипт;
   строку «Итог» печатает main.js — она на странице с самого начала. */
(function () {
  'use strict';
  var ENC = window.AS_CALLS_ENC;
  if (!ENC) return;
  var D, T, S;
  var doc = document, root = doc.documentElement;
  var KEY = 'cx-key-' + ENC.salt.slice(0, 12);   // ключ этой версии данных — на время вкладки

  function $(s, r) { return (r || doc).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sp(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function plural(n, a, b, c) { n = Math.abs(n) % 100; if (n > 10 && n < 15) return c; n %= 10; return n === 1 ? a : n > 1 && n < 5 ? b : c; }
  function dur(s) { var m = Math.floor(s / 60), r = Math.round(s % 60); return m + ' мин ' + (r < 10 ? '0' : '') + r + ' с'; }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function grade(s) { return s >= 85 ? ['good', 'Отлично'] : s >= 70 ? ['mid', 'Хорошо'] : ['bad', 'Нужно внимание']; }
  var ROLE = { m: 'Менеджер', c: 'Собеседник' };
  var ICO = {
    phone: '<path d="M5.5 3.5h2l1 3-1.5 1a7 7 0 003.5 3.5l1-1.5 3 1v2a1.5 1.5 0 01-1.5 1.5A10.5 10.5 0 014 5a1.5 1.5 0 011.5-1.5z"/>',
    wave: '<path d="M2 10h1.5M5 7v6M8 4v12M11 6v8M14 8v4M17 10h1"/>',
    text: '<path d="M3 5h14M3 9h14M3 13h9M3 17h6"/>',
    check: '<path d="M3 5.5l1.5 1.5 3-3M10 5.5h7M3 11.5l1.5 1.5 3-3M10 11.5h7M3 17h4M10 17h7"/>',
    chart: '<path d="M3 17h14M5 14V9M9 14V5M13 14v-3M17 14V7"/>'
  };
  function ico(k) { return '<svg viewBox="0 0 20 20" aria-hidden="true">' + ICO[k] + '</svg>'; }

  /* волна звука на первом экране; реплики из разговора — только после пароля */
  function wave() {
    var host = $('[data-cx-wave]'); if (!host) return;
    var bars = '', seed = 7;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 56; i++) {
      var env = Math.sin(i / 55 * Math.PI) * .75 + .25;
      bars += '<i style="--h:' + (.12 + env * rnd()).toFixed(2) + ';--d:' + (rnd() * 1.6).toFixed(2) + 's"></i>';
    }
    var demo = D && D.convs.filter(function (c) { return c.dialog && c.dialog.length; })[0];
    var lines = demo ? demo.dialog.slice(0, 5) : [];
    host.innerHTML = '<div class="cx-wave__bars">' + bars + '</div><span class="cx-wave__scan"></span>' +
      '<div class="cx-wave__text">' + lines.map(function (l, k) {
        return '<p class="cx-wave__line cx-wave__line--' + l.role + '" style="--k:' + k + '"><b class="mono">' + (l.role === 'm' ? 'М' : 'К') + '</b><span>' + esc(l.text.length > 74 ? l.text.slice(0, 72) + '…' : l.text) + '</span></p>';
      }).join('') + '</div>';
  }

  function render(data) {
  D = data; T = D.totals; S = D.sample;

  /* ---------- первый экран ---------- */
  $('[data-cx-period]').textContent = 'Реальные данные Битрикс24 · ' + D.period.text + ' · имена и номера скрыты';
  wave();

  /* ---------- цифры за период ---------- */
  (function kpis() {
    var host = $('[data-cx-kpis]'); if (!host) return;
    var max = Math.max.apply(null, D.daily.map(function (d) { return d.o + d.i; }));
    var spark = D.daily.map(function (d, k) { return '<i' + (d.we ? ' class="we"' : '') + ' style="--h:' + ((d.o + d.i) / max).toFixed(3) + ';--k:' + k + '"></i>'; }).join('');
    var r = 52, len = 2 * Math.PI * r, share = pct(T.long, T.calls);
    host.innerHTML =
      '<article class="b-card cx-kpi">' +
        '<div class="b-card__head"><span class="mono mono--dim">Звонков</span><span class="b-card__title">за ' + D.period.days + '&nbsp;' + plural(D.period.days, 'день', 'дня', 'дней') + '</span></div>' +
        '<div class="cx-spark" aria-hidden="true">' + spark + '</div>' +
        '<div class="b-card__num"><span data-count="' + T.calls + '" data-format="space">' + sp(T.calls) + '</span></div>' +
        '<p class="mono mono--dim cx-kpi__sub">исходящих ' + sp(T.outbound) + ' · входящих ' + sp(T.inbound) + '</p>' +
      '</article>' +
      '<article class="b-card cx-kpi">' +
        '<div class="b-card__head"><span class="mono mono--dim">Разговоры</span><span class="b-card__title">дольше<br>' + D.longSec + ' секунд</span></div>' +
        '<div class="cx-share" aria-hidden="true"><i style="--p:' + (share / 100) + '"></i></div>' +
        '<p class="mono cx-share__cap"><span>' + share + '% звонков</span><span class="mono--dim">остальные — недозвон и короткие</span></p>' +
        '<div class="b-card__num"><span data-count="' + T.long + '" data-format="space">' + sp(T.long) + '</span></div>' +
        '<p class="mono mono--dim cx-kpi__sub">' + sp(T.talkMin) + ' минут · в среднем ' + dur(T.avgLongSec) + '</p>' +
      '</article>' +
      '<article class="b-card b-card--statement cx-kpi">' +
        '<p class="b-card__big">' + Math.round(S.audioMin) + ' ' + plural(Math.round(S.audioMin), 'минута', 'минуты', 'минут') + ' записи<br><span>в текст за ' + S.gpuSec + '&nbsp;' + plural(S.gpuSec, 'секунду', 'секунды', 'секунд') + '</span></p>' +
        '<p class="mono mono--dim">' + S.calls + ' ' + plural(S.calls, 'звонок', 'звонка', 'звонков') + ' · ' + esc(S.model) + ' на своём компьютере — записи никуда не отправлялись</p>' +
        '<div class="pill-stat"><span class="pill-stat__dot" aria-hidden="true"></span><span class="mono">Расшифровка без облака</span></div>' +
      '</article>' +
      '<article class="b-card cx-kpi cx-kpi--score">' +
        '<div class="b-card__head"><span class="mono mono--dim">Оценка</span><span class="b-card__title">по чек-листу<br>из 8 пунктов</span></div>' +
        '<div class="cx-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="cx-ring__track" cx="60" cy="60" r="' + r + '"/>' +
          '<circle class="cx-ring__val" cx="60" cy="60" r="' + r + '" style="--len:' + len.toFixed(1) + ';--val:' + (len * S.avgScore / 100).toFixed(1) + '"/></svg></div>' +
        '<div class="b-card__num"><span data-count="' + S.avgScore + '">' + S.avgScore + '</span><small>/100</small></div>' +
        '<p class="mono mono--dim cx-kpi__sub">средняя по ' + S.conversations + ' разобранным разговорам</p>' +
      '</article>';
  })();

  /* ---------- как это работает ---------- */
  (function flow() {
    var host = $('[data-cx-flow]'); if (!host) return;
    var steps = [
      ['phone', 'Звонок', 'Менеджер звонит из Битрикс24, телефония Exolve записывает разговор.', 'Битрикс24 · Exolve'],
      ['wave', 'Запись', 'Система сама забирает записи: ссылка на файл приходит вместе со статистикой звонка.', 'API телефонии'],
      ['text', 'Текст', 'Нейросеть Whisper расшифровывает речь на компьютере компании. Записи не уходят в чужие облака.', Math.round(S.audioMin) + ' мин → ' + S.gpuSec + ' с'],
      ['check', 'Проверка', 'ИИ проверяет разговор по чек-листу и отмечает риски: личный номер, лишние вопросы, нет следующего шага.', '8 пунктов'],
      ['chart', 'Отчёт', 'Руководитель видит оценку, цитаты и совет по каждому звонку и сводку по отделу.', 'Сводка по отделу']
    ];
    host.innerHTML = steps.map(function (s, k) {
      return '<li class="cx-step reveal" style="--k:' + k + '"><span class="cx-step__top"><span class="mono mono--dim">00' + (k + 1) + '.</span><span class="cx-step__ico">' + ico(s[0]) + '</span></span>' +
        '<h3 class="cx-step__t">' + s[1] + '</h3><p class="cx-step__x">' + s[2] + '</p><span class="cx-chip mono">' + esc(s[3]) + '</span></li>';
    }).join('');
    $('[data-cx-output]').setAttribute('data-type', 'Итог: ' + S.calls + ' ' + plural(S.calls, 'звонок', 'звонка', 'звонков') + ' — расшифрованы и оценены без ручной работы.');
  })();

  /* ---------- статистика ---------- */
  $('[data-cx-stats-lead]').textContent = sp(T.calls) + ' ' + plural(T.calls, 'звонок', 'звонка', 'звонков') + ' менеджеров за ' + D.period.days + ' ' + plural(D.period.days, 'день', 'дня', 'дней') +
    '. Автообзвон и техническая учётная запись не учитываются. Разговор — звонок дольше ' + D.longSec + ' секунд.';
  var WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  (function days() {
    var host = $('[data-cx-days]'), info = $('[data-cx-days-info]'); if (!host) return;
    var max = 0, top = D.daily[0], sum = 0;
    D.daily.forEach(function (d) { var v = d.o + d.i; sum += v; if (v > max) { max = v; top = d; } });
    var base = 'В среднем ' + sp(sum / D.daily.length) + ' в день · пик — ' + top.label + ': ' + sp(max);
    info.textContent = base;
    host.innerHTML = D.daily.map(function (d, k) {
      var wd = WD[(new Date(d.d + 'T12:00:00').getDay() + 6) % 7];
      var tip = d.label + ', ' + wd + ' · ' + sp(d.o + d.i) + ' ' + plural(d.o + d.i, 'звонок', 'звонка', 'звонков') + ': исходящих ' + sp(d.o) + ', входящих ' + sp(d.i);
      var lab = wd === 'пн' || k === 0 ? d.label : '';
      return '<button type="button" class="cx-day' + (d.we ? ' is-we' : '') + '" style="--k:' + k + '" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '">' +
        '<span class="cx-day__bar"><i class="i" style="--h:' + (d.i / max).toFixed(3) + '"></i><i class="o" style="--h:' + (d.o / max).toFixed(3) + '"></i></span>' +
        '<span class="cx-day__d mono">' + lab + '</span></button>';
    }).join('');
    function show(e) { var b = e.target.closest('.cx-day'); info.textContent = b ? b.getAttribute('data-tip') : base; }
    host.addEventListener('mouseover', show); host.addEventListener('focusin', show);
    host.addEventListener('mouseleave', function () { info.textContent = base; });
    host.addEventListener('focusout', function () { info.textContent = base; });
  })();

  (function heat() {
    var host = $('[data-cx-heat]'), info = $('[data-cx-heat-info]'); if (!host) return;
    var H0 = 7, H1 = 22, max = 0, best = [0, 0];
    D.heat.forEach(function (row, w) { for (var h = H0; h < H1; h++) if (row[h] > max) { max = row[h]; best = [w, h]; } });
    var base = 'Пик — ' + WD[best[0]] + ', ' + best[1] + ':00–' + (best[1] + 1) + ':00: ' + sp(max) + ' ' + plural(max, 'звонок', 'звонка', 'звонков') + ' за месяц';
    info.textContent = base;
    var html = '<span></span>';
    for (var h = H0; h < H1; h++) html += '<span class="cx-heat__h mono">' + (h % 2 ? '' : h) + '</span>';
    D.heat.forEach(function (row, w) {
      html += '<span class="cx-heat__w mono">' + WD[w] + '</span>';
      for (var h = H0; h < H1; h++) {
        var v = row[h], tip = WD[w] + ', ' + h + ':00–' + (h + 1) + ':00 · ' + sp(v) + ' ' + plural(v, 'звонок', 'звонка', 'звонков');
        html += '<i class="cx-heat__c" style="--a:' + (max ? (v / max).toFixed(3) : 0) + ';--k:' + (w * 3 + h - H0) + '" title="' + esc(tip) + '" data-tip="' + esc(tip) + '"></i>';
      }
    });
    host.innerHTML = html;
    host.addEventListener('mouseover', function (e) { var c = e.target.closest('.cx-heat__c'); info.textContent = c ? c.getAttribute('data-tip') : base; });
    host.addEventListener('mouseleave', function () { info.textContent = base; });
  })();

  (function managers() {
    var host = $('[data-cx-managers]'); if (!host) return;
    var max = D.managers[0].calls;
    var rows = D.managers.map(function (m) {
      return '<tr' + (m.sample ? ' class="is-sample"' : '') + '><th scope="row"><span class="cx-mgr">' + esc(m.name) + (m.sample ? '<em class="mono">разобраны звонки</em>' : '') + '</span></th>' +
        '<td><span class="cx-bar"><i style="--p:' + (m.calls / max).toFixed(3) + '"></i></span><span class="cx-num">' + sp(m.calls) + '</span></td>' +
        '<td class="cx-num">' + pct(m.long, m.calls) + '%</td><td class="cx-num">' + sp(m.talkMin) + '</td></tr>';
    }).join('');
    if (D.rest && D.rest.n) rows += '<tr class="is-rest"><th scope="row">Ещё ' + D.rest.n + ' ' + plural(D.rest.n, 'сотрудник', 'сотрудника', 'сотрудников') + '</th><td><span class="cx-num">' + sp(D.rest.calls) + '</span></td><td class="cx-num">' + pct(D.rest.long, D.rest.calls) + '%</td><td class="cx-num">' + sp(D.rest.talkMin) + '</td></tr>';
    host.innerHTML = '<table class="cx-table"><thead><tr><th scope="col" class="mono">Менеджер</th><th scope="col" class="mono">Звонков</th><th scope="col" class="mono">Разговоров</th><th scope="col" class="mono">Минут</th></tr></thead><tbody>' + rows + '</tbody></table>';
  })();

  /* ---------- разбор разговоров ---------- */
  (function review() {
    var list = $('[data-cx-list]'), box = $('[data-cx-detail]'); if (!list || !box) return;
    $('[data-cx-review-lead]').textContent = S.calls + ' ' + plural(S.calls, 'запись', 'записи', 'записей') + ' (' + Math.round(S.audioMin) + ' ' + plural(Math.round(S.audioMin), 'минута', 'минуты', 'минут') + ') расшифрованы и проверены по чек-листу. Это звонки одного менеджера — ' + S.manager +
      ': сейчас доступны только его записи. Выберите разговор слева.';
    var crit = D.criteria, cur = 0, tabs = [];
    var shown = D.convs.filter(function (c) { return c.show; }), more = D.convs.filter(function (c) { return !c.show; });
    function item(c, k) {
      var g = grade(c.score);
      return '<button type="button" class="cx-item" role="tab" id="cx-tab-' + k + '" aria-controls="cx-pane" aria-selected="false" tabindex="-1" data-k="' + k + '">' +
        '<span class="cx-score cx-score--' + g[0] + '">' + c.score + '</span>' +
        '<span class="cx-item__t">' + esc(c.topic) + '</span><span class="cx-item__x mono mono--dim">' + esc(c.date) + ' · ' + Math.round(c.sec / 60) + '&nbsp;мин</span></button>';
    }
    var all = shown.concat(more);
    list.innerHTML = shown.map(item).join('') + (more.length ? '<p class="cx-list__sep mono mono--dim">Ещё ' + more.length + ' ' + plural(more.length, 'разговор', 'разговора', 'разговоров') + ' · кратко</p>' : '') +
      more.map(function (c, k) { return item(c, k + shown.length); }).join('');
    tabs = [].slice.call(list.querySelectorAll('.cx-item'));
    box.id = 'cx-pane'; box.setAttribute('role', 'tabpanel');

    function status(v) { return v == null ? ['na', '—', 'не применимо'] : v === 1 ? ['ok', '✓', 'выполнено'] : v > 0 ? ['part', '½', 'частично'] : ['no', '✕', 'не выполнено']; }
    function bubble(q) { return '<p class="cx-bubble cx-bubble--' + q.role + '"><b class="mono">' + ROLE[q.role] + '</b>' + esc(q.text) + '</p>'; }
    function render(k) {
      var c = all[k], g = grade(c.score), r = 46, len = 2 * Math.PI * r;
      var checks = crit.map(function (it) {
        var st = status(c.scores[it.key]);
        return '<li class="cx-check cx-check--' + st[0] + '"><span class="cx-check__i" aria-label="' + st[2] + '">' + st[1] + '</span><span><b>' + esc(it.title) + '</b>' + (it.critical ? '<em class="mono">критичный</em>' : '') + '<small>' + esc(it.hint) + '</small></span></li>';
      }).join('');
      var flags = c.flags.map(function (f) { return '<li class="cx-flag cx-flag--' + f.kind + '">' + esc(f.text) + '</li>'; }).join('');
      box.innerHTML =
        '<div class="cx-detail__top">' +
          '<div><p class="mono mono--dim">' + c.dir + (c.calls > 1 ? ' · ' + c.calls + ' звонка' : '') + ' · ' + esc(c.date) + ' · ' + dur(c.sec) + ' · ' + esc(c.manager) + '</p>' +
          '<h3 class="cx-detail__t">' + esc(c.topic) + '</h3><p class="cx-detail__who">' + esc(c.who) + '</p></div>' +
          '<div class="cx-big cx-big--' + g[0] + '"><svg viewBox="0 0 110 110" aria-hidden="true"><circle class="cx-ring__track" cx="55" cy="55" r="' + r + '"/>' +
            '<circle class="cx-ring__val" cx="55" cy="55" r="' + r + '" style="--len:' + len.toFixed(1) + ';--val:' + (len * c.score / 100).toFixed(1) + '"/></svg>' +
            '<span class="cx-big__n">' + c.score + '</span><span class="cx-big__l mono">' + g[1] + '</span></div>' +
        '</div>' +
        (c.critical.length ? '<p class="cx-crit-note mono">Критичное нарушение — оценка не выше 60 (без него было бы ' + c.raw + ')</p>' : '') +
        '<div class="cx-detail__grid">' +
          '<div><p class="mono cx-cap">Чек-лист</p><ol class="cx-checks">' + checks + '</ol></div>' +
          '<div>' +
            '<p class="mono cx-cap">Кратко</p><p class="cx-summary">' + esc(c.summary) + '</p>' +
            (flags ? '<ul class="cx-flags">' + flags + '</ul>' : '') +
            (c.quotes.length ? '<p class="mono cx-cap">Из разговора</p><div class="cx-quotes">' + c.quotes.map(bubble).join('') + '</div>' : '') +
            (c.advice ? '<p class="cx-advice"><span class="mono">Совет</span>' + esc(c.advice) + '</p>' : '') +
            (c.outcome ? '<p class="cx-outcome mono mono--dim">Стадия лида в CRM сейчас: «' + esc(c.outcome) + '»</p>' : '') +
            (c.dialog.length ? '<button type="button" class="cx-more mono" aria-expanded="false">Показать расшифровку</button>' +
              '<div class="cx-dialog" hidden><p class="mono mono--dim cx-dialog__cap">Сокращено · имена скрыты · роли определены автоматически</p>' + c.dialog.map(bubble).join('') + '</div>' : '') +
          '</div>' +
        '</div>';
      var more = box.querySelector('.cx-more');
      if (more) more.addEventListener('click', function () {
        var d = box.querySelector('.cx-dialog'), open = d.hidden;
        d.hidden = !open; more.setAttribute('aria-expanded', String(open)); more.textContent = open ? 'Скрыть расшифровку' : 'Показать расшифровку';
      });
      box.classList.remove('is-anim'); void box.offsetWidth; box.classList.add('is-anim');
    }
    function select(k, focus) {
      tabs[cur].setAttribute('aria-selected', 'false'); tabs[cur].tabIndex = -1;
      cur = (k + tabs.length) % tabs.length;
      tabs[cur].setAttribute('aria-selected', 'true'); tabs[cur].tabIndex = 0;
      box.setAttribute('aria-labelledby', tabs[cur].id);
      if (focus) tabs[cur].focus();
      render(cur);
    }
    list.addEventListener('click', function (e) { var b = e.target.closest('.cx-item'); if (b) select(+b.getAttribute('data-k')); });
    list.addEventListener('keydown', function (e) {
      var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); select(cur + d, true); }
      else if (e.key === 'Home') { e.preventDefault(); select(0, true); }
      else if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
    });
    select(0);
  })();

  /* ---------- выводы ---------- */
  (function findings() {
    var host = $('[data-cx-findings]'); if (host) host.innerHTML = D.findings.map(function (f, k) {
      return '<article class="cx-fcard cx-fcard--' + f.kind + ' reveal" style="--k:' + k + '"><span class="mono mono--dim">' + { risk: 'Риск', warn: 'Внимание', good: 'Сильная сторона' }[f.kind] + '</span>' +
        '<p class="cx-fcard__big">' + esc(f.big) + '</p><p class="cx-fcard__t">' + esc(f.title) + '</p><p class="cx-fcard__x">' + esc(f.text) + '</p></article>';
    }).join('');
    var list = $('[data-cx-criteria]');
    if (list) list.innerHTML = D.criteria.map(function (c, k) {
      return '<li class="cx-crit__row" style="--k:' + k + '"><span class="cx-crit__t">' + esc(c.title) + (c.critical ? '<em class="mono">критичный</em>' : '') + '</span>' +
        '<span class="cx-crit__bar' + (c.rate < 60 ? ' is-low' : '') + '"><i style="--p:' + (c.rate / 100) + '"></i></span>' +
        '<span class="cx-crit__v mono">' + c.rate + '%</span></li>';
    }).join('');
    var cap = $('[data-cx-crit-cap]');
    if (cap) cap.textContent = S.conversations + ' разговоров · «частично» = половина';
    var note = $('[data-cx-note]');
    if (note) note.textContent = 'Имена, телефоны и ID сотрудников скрыты. Роли «менеджер / собеседник» в расшифровке определены автоматически. ' +
      'Оценка — подсказка руководителю: решение о сотруднике принимает человек. Перезвон на пропущенный считается по той же карточке CRM — звонок по карточке-дублю сюда не попадает.';
  })();
  }

  /* ---------- появление и счётчики блоков, нарисованных после main.js ---------- */
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function count(el) {
    var target = parseFloat(el.getAttribute('data-count')), spaced = el.getAttribute('data-format') === 'space';
    if (reduce) { el.textContent = spaced ? sp(target) : String(target); return; }
    var t0 = performance.now();
    (function step(n) {
      var p = Math.min(1, (n - t0) / 1400), v = target * (1 - Math.pow(1 - p, 3));
      el.textContent = spaced ? sp(v) : String(Math.round(v));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  function appear() {
    var els = [].slice.call(doc.querySelectorAll('.cx-data .reveal, .cx-data .b-card'));
    function show(el) { el.classList.add('is-in'); [].forEach.call(el.querySelectorAll('[data-count]'), count); }
    els.forEach(function (el) { [].forEach.call(el.querySelectorAll('[data-count]'), function (c) { c.textContent = '0'; }); });
    if (!('IntersectionObserver' in window)) { els.forEach(show); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- доступ по паролю ---------- */
  var form = $('[data-cx-lock-form]'), pass = $('[data-cx-pass]'), err = $('[data-cx-lock-err]'), btn = $('[data-cx-lock-btn]');
  var subtle = window.crypto && window.crypto.subtle;
  function bytes(s) { s = atob(s); var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function base64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function store(v) {   // ключ на время вкладки: без аргумента — прочитать, null — удалить
    try {
      if (v === undefined) return sessionStorage.getItem(KEY);
      if (v === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, v);
    } catch (e) { /* приватный режим или запрет хранилища — просто спросим пароль снова */ }
    return null;
  }
  function derive(password) {
    return subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return subtle.deriveKey({ name: 'PBKDF2', salt: bytes(ENC.salt), iterations: ENC.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    });
  }
  function decrypt(key) {   // неверный ключ — AES-GCM не сходится, промис отклоняется
    return subtle.decrypt({ name: 'AES-GCM', iv: bytes(ENC.iv) }, key, bytes(ENC.data)).then(function (buf) {
      var data = JSON.parse(new TextDecoder().decode(buf));
      return subtle.exportKey('raw', key).then(function (raw) { store(base64(raw)); return data; });
    });
  }
  function unlock(data) {
    try { render(data); } catch (e) { console.error(e); fail('Не удалось показать данные — обновите страницу'); return; }
    root.classList.add('cx-open');
    appear();
  }
  function fail(text) { err.textContent = text; form.classList.remove('is-shake'); void form.offsetWidth; form.classList.add('is-shake'); }
  function busy(on) { btn.disabled = on; btn.firstElementChild.textContent = on ? 'Проверяю…' : 'Открыть'; }

  wave();
  $('[data-cx-period]').textContent = 'Реальные данные Битрикс24 · доступ по паролю';
  if (!subtle) {
    fail('Браузер расшифровывает данные только на сайте с HTTPS. Откройте страницу по адресу, который начинается с https://');
    pass.disabled = true; btn.disabled = true;
  } else {
    var saved = store();
    if (saved) {   // пароль уже вводили в этой вкладке
      root.classList.add('cx-trying');
      subtle.importKey('raw', bytes(saved), { name: 'AES-GCM' }, true, ['decrypt']).then(decrypt).then(unlock, function () { store(null); })
        .then(function () { root.classList.remove('cx-trying'); });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!pass.value) { fail('Введите пароль'); pass.focus(); return; }
      busy(true); err.textContent = '';
      derive(pass.value).then(decrypt).then(function (data) { pass.value = ''; unlock(data); }, function () { fail('Неверный пароль'); pass.select(); })
        .then(function () { busy(false); });
    });
  }
  var out = $('[data-cx-logout]');
  if (out) out.addEventListener('click', function () { store(null); location.reload(); });
})();
