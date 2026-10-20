/* Run on the real index.html page after loading this file:
   window.runCalcModelRegression(). No packages or synthetic DOM required.
   The original calculator state is restored after the checks. */
(function (root) {
  'use strict';
  root.runCalcModelRegression = function () {
    var api = root.AS && root.AS.CalcModal;
    var report = { passed: 0, failed: 0, checks: [] };
    function check(name, actual, expected) {
      var pass = JSON.stringify(actual) === JSON.stringify(expected);
      report[pass ? 'passed' : 'failed']++;
      report.checks.push({ name: name, pass: pass, actual: actual, expected: expected });
    }
    check('The real page exposes the shared calculator API', !!api, true);
    if (!api) return report;
    var original = api.state().job, unsubscribe = function () {};
    var document = root.document, goal = document.querySelector('#alfa-goal');
    var originalGoal = goal && goal.alfaGoal.state(), modal = document.querySelector('[data-cm]'), originalTab = modal.dataset.tab;
    try {
      // Isolate the API's requested contract from Goal's independent target
      // solver while verifying the numerical model. Exercise Goal inputs below.
      document.querySelector('[data-cm-tab="biz"]').click();
      api.set({ region: '', prof: '', sex: '', age: 0, pick: 'ym-sofyino', shifts: 30, sched: '6/1', road: 12000, food: 500, v: '100', auto: false, view: 'calc' });
      var snap = api.state(), q = snap.current;
      check('Net includes training, tax, all calendar food days and capped road compensation', [q.gross, q.tax, q.days, q.food, q.comp, q.home], [207880, 12473, 36, 10800, 10000, 182607]);
      check('The shared API retains the supplied expense values', [snap.job.road, snap.job.food], [12000, 500]);
      check('A copied state cannot mutate calculator shifts', (function () { snap.job.shifts = 60; return api.state().job.shifts; })(), 30);
      check('The catalog milestones remain 20, 30, 45 and 60', api.durations('ym-sofyino'), [20, 30, 45, 60]);
      var totals = []; for (var n = 20; n <= 60; n++) totals.push(n);
      check('Extensions cover every whole total within the catalog bounds', api.shiftCounts('ym-sofyino'), totals);
      q = api.preview('ym-sofyino', { shifts: 21 });
      // 2 * 5940 + 19 * 7000 = 144880 gross; tax 8693; 25 food days
      // at 300/day; road 12000 with no reimbursement before 30 shifts.
      check('A 21-shift extension uses actual total-shift rates and one training period',
        [q.paid, q.worked, q.inN, q.days, q.gross, q.tax, q.home],
        [21, 22, 2, 25, 144880, 8693, 116687]);
      check('Totals below 20 or above 60 remain unavailable',
        [api.preview('ym-sofyino', { shifts: 19 }), api.preview('ym-sofyino', { shifts: 61 })], [null, null]);
      check('An unsupported profession cannot be previewed', api.preview('ym-sofyino', { prof: 'Несуществующая профессия' }), null);
      check('An unknown object cannot be previewed', api.preview('unknown-object'), null);
      var before = JSON.stringify(api.state().job);
      q = api.preview('ym-sofyino', { shifts: 20 });
      check('Travel compensation starts at eligible 30-shift contracts', [q.comp, q.home], [0, 110407]);
      check('Preview does not change current inputs', JSON.stringify(api.state().job), before);
      q = api.preview('fm-tolbino');
      check('Training counted inside the contract reduces paid shifts', [q.worked, q.paid, q.days, q.home], [30, 28, 34, 81894]);
      q = api.preview('wurth');
      check('Actual 5/2 schedule overrides preferred 6/1 and charges all days', [q.sched, q.days, q.home], ['5/2', 44, 81468]);
      q = api.preview('forum-auto');
      check('Mandatory daily meal charge applies even with three meals', [q.perDay, q.food, q.home], [200, 7200, 123340]);
      q = api.preview('starodvorskie', { sex: 'f', prof: 'Упаковщик' });
      check('Selected sex and profession select the matching pay rate', [q.rate, q.home], [3800, 94360]);
      var solution = api.solve(200000, { id: 'ym-sofyino' });
      // 33 shifts: gross 228880 - tax 13733 - 39 * 300 food
      // - 12000 road + 10000 reimbursement = 201447.
      check('Goal search selects the shortest sufficient whole total using actual rates', [solution.shifts, solution.quote.days, solution.home, solution.reached], [33, 39, 201447, true]);
      check('One fewer shift still misses the 200000-ruble base target', api.preview('ym-sofyino', { shifts: 32 }).home, 195167);
      solution = api.solve(182607, { id: 'ym-sofyino' });
      check('An exact net target is reached at the same duration', [solution.shifts, solution.reached], [30, true]);
      solution = api.solve(182608, { id: 'ym-sofyino' });
      check('Goal comparison uses exact rubles before presentation rounding', [solution.shifts, solution.home], [31, 188887]);
      solution = api.solve(1000000, { id: 'ym-sofyino' });
      check('An unreachable goal reports the maximum without claiming success', [solution.shifts, solution.home, solution.reached], [60, 369507, false]);
      solution = api.solve(1, { id: 'ym-sofyino', prof: 'Несуществующая профессия' });
      check('No eligible candidate yields an empty solution', [solution.quote, solution.shifts, solution.reached], [null, null, false]);
      check('Goal search does not alter selected inputs', JSON.stringify(api.state().job), before);
      api.set({ pick: 'ym-kazan', v: 'hi', auto: false });
      check('Explicit performance survives switching objects', [api.state().job.v, api.state().job.auto], ['hi', false]);
      solution = api.solve(200000, { id: 'ym-sofyino' });
      // 24 shifts: 2 * 5940 + 22 * 10500 = 242880 gross; tax 14573;
      // 29 food days * 300 and road 12000, without reimbursement.
      check('High output uses authoritative high rates and normal internship rates', [solution.shifts, solution.home, solution.reached], [24, 207607, true]);
      check('One fewer shift still misses the 200000-ruble high-output target', api.preview('ym-sofyino', { shifts: 23 }).hi.home, 198337);
      var notifications = [];
      unsubscribe = api.subscribe(function (state) { notifications.push(state.current ? state.current.home : null); });
      api.set({ pick: 'ym-sofyino', v: '100', food: 0 });
      check('API state changes notify subscribers', notifications.length > 0, true);
      notifications = [];
      document.querySelector('[data-cm-tab="job"]').click();
      goal.alfaGoal.setState({ region: 'Москва и МО', prof: 'Комплектовщик', pick: 'ym-sofyino', shifts: 30, sched: '6/1', food: 0, road: 12000, v: '100', target: 180000 });
      notifications = [];
      var food = document.querySelector('#ag-food');
      food.value = '500'; food.dispatchEvent(new root.Event('input', { bubbles: true }));
      check('The Goal expense field updates the shared model and subscribers', [api.state().job.food, notifications.length > 0], [500, true]);
      notifications = [];
      document.querySelector('[data-ag-yield="hi"]').click();
      check('Goal performance buttons update the shared model and notify subscribers', [api.state().job.v, notifications.length > 0], ['hi', true]);
      var form = document.querySelector('[data-form]');
      var formState = Array.prototype.map.call(form.querySelectorAll('input, textarea, select'), function (el) { return { el: el, value: el.value, checked: el.checked }; });
      try {
        var message = form.querySelector('textarea[name="message"]');
        message.value = 'Личный комментарий';
        api.set({ pick: 'ym-sofyino', prof: 'Комплектовщик', shifts: 30 });
        check('Apply uses the existing contact-form transfer', api.apply(), true);
        check('Apply transfers the selected object and contract duration', [form.querySelector('[data-object-select]').value, form.querySelector('input[name="shifts"]:checked').value], ['ym-sofyino', '30']);
        check('Apply retains the candidate comment while adding the calculation', message.value.indexOf('Личный комментарий') === 0 && message.value.indexOf('Из калькулятора:') >= 0, true);
      } finally {
        formState.forEach(function (item) { item.el.value = item.value; if (typeof item.checked === 'boolean') item.el.checked = item.checked; });
      }
      notifications = [];
      document.querySelector('[data-cm-tab="biz"]').click();
      api.set({ prof: 'Несуществующая профессия', v: '100', auto: false });
      check('An empty result clears the shared quote and notifies', [api.state().current, notifications.indexOf(null) >= 0], [null, true]);
      check('Explicit performance is saved even when filters have no results', [api.state().job.v, api.state().job.auto], ['100', false]);
      unsubscribe(); unsubscribe = function () {};
    } catch (error) {
      report.failed++;
      report.checks.push({ name: 'Unexpected regression-test error', pass: false, actual: error && error.stack || String(error) });
    } finally {
      unsubscribe();
      api.set(original);
      if (originalGoal) goal.alfaGoal.setState(originalGoal);
      document.querySelector('[data-cm-tab="' + (originalTab || 'job') + '"]').click();
    }
    return report;
  };
})(window);
