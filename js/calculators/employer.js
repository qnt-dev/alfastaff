/* A business task becomes a staffing estimate and a brief for a price request. */
(function () {
  'use strict';
  var root = document.getElementById('alfa-employer'), api = window.AS && AS.CalcModal;
  if (!root || !api || !api.employerQuote) return;
  var $ = function (id) { return root.querySelector('#ec-' + id); };
  var fmt = new Intl.NumberFormat('ru-RU');
  function plural(n, one, few, many) {
    return n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;
  }
  function options(select, entries) {
    entries.forEach(function (entry) {
      var option = document.createElement('option');
      option.value = typeof entry === 'string' ? entry : entry.key;
      option.textContent = typeof entry === 'string' ? entry : entry.label;
      select.appendChild(option);
    });
  }
  var jobs = [];
  (AS.OBJECTS || []).forEach(function (object) {
    (object.jobsFull || []).forEach(function (job) { if (jobs.indexOf(job) < 0) jobs.push(job); });
  });
  jobs.sort(function (a, b) { return (b === 'Комплектовщик') - (a === 'Комплектовщик') || a.localeCompare(b, 'ru'); });
  options($('role'), jobs);
  options($('region'), (AS.REGIONS || []).map(function (r) { return { key: r.key, label: r.label }; }).concat('Другой регион'));
  var slider = window.AlfaMoneySlider(root, function (posts) {
    api.employerSet({ posts: posts });
  }, { prefix: 'ec', divisor: 1, step: 1, minimum: 1, inputMaximum: 200, integer: true, ariaUnit: 'человек на смене' });
  function row(list, label, value) {
    var div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value; div.append(dt, dd); list.append(div);
  }
  function render() {
    var q = api.employerQuote(), s = q.state;
    $('role').value = s.prof; $('region').value = s.region;
    $('daily').value = s.daily; $('opdays').value = s.opdays;
    $('reserve').value = s.reservePct; $('stay').checked = s.stay;
    root.querySelectorAll('[data-ec-sched]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.ecSched === s.sched));
    });
    slider.sync(s.posts, 200);
    $('total').textContent = fmt.format(q.total);
    $('people-unit').textContent = plural(q.total, 'человек', 'человека', 'человек');
    $('base').textContent = fmt.format(q.base);
    $('reserve-count').textContent = fmt.format(q.reserve);
    $('reserve-label').textContent = 'резерв ' + s.reservePct + ' %';
    $('coverage').textContent = s.posts + ' ' + plural(s.posts, 'человек', 'человека', 'человек') + ' на каждой смене';
    $('summary').textContent = s.daily + ' ' + plural(s.daily, 'смена', 'смены', 'смен') + ' в сутки · ' + s.opdays + ' дней в неделю · график ' + s.sched;
    $('reserve-note').textContent = s.reservePct === 0
      ? 'Резерв выключен. Итог учитывает только покрытие рабочего графика.'
      : 'Резерв ' + s.reservePct + ' % — выбранный запас на замены. Его можно изменить; это не статистика невыходов.';
    var list = $('breakdown'); list.replaceChildren();
    row(list, 'Выходов на объект за неделю', s.posts + ' × ' + s.daily + ' × ' + s.opdays + ' = ' + fmt.format(q.weeklyPosts));
    row(list, 'В среднем смен на объекте у сотрудника за неделю', String(q.weeklyCapacity).replace('.', ',') + ' по графику ' + s.sched);
    row(list, 'Команда для покрытия графика', fmt.format(q.base) + ' чел.');
    row(list, 'Резерв на замены · ' + s.reservePct + ' %', '+ ' + fmt.format(q.reserve) + ' чел.');
    row(list, 'Всего в команде', fmt.format(q.total) + ' чел.');
  }
  [['role', 'prof'], ['region', 'region'], ['daily', 'daily'], ['opdays', 'opdays'], ['reserve', 'reservePct']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function () {
      var patch = {}; patch[pair[1]] = this.value; api.employerSet(patch);
    });
  });
  $('stay').addEventListener('change', function () { api.employerSet({ stay: this.checked }); });
  root.addEventListener('click', function (event) {
    var button = event.target.closest('[data-ec-sched]');
    if (button) api.employerSet({ sched: button.dataset.ecSched });
  });
  $('request').addEventListener('click', function () { api.employerApply(); });
  api.employerSubscribe(render);
  root.querySelectorAll('button,select,summary').forEach(function (el) { el.classList.add('cursor-interaction'); });
  render();
})();
