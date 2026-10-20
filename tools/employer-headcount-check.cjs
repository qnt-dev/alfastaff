/* node tools/employer-headcount-check.cjs — executes the employer model and
 * request transfer from the shipped source, without reproducing its formulas. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/calc-modal.js'), 'utf8');
const modelStart = source.indexOf('  /* ---------- Employer headcount model ---------- */');
const transferStart = source.indexOf('  /* ---------- Employer request transfer ---------- */');
assert.ok(modelStart >= 0 && transferStart > modelStart,
  'The employer calculator must expose an independent headcount model');
const init = source.indexOf('  refreshJobModel();', transferStart);
assert.ok(init > transferStart, 'The request transfer is separate from startup');
const context = { console, Date, Math, Event };
context.window = context;
context.AS = {};
vm.createContext(context);
['js/objects.js', 'js/data.js', 'js/calc-data.js'].forEach(file => {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
});
vm.runInContext(
  "var O=AS.CALC.objects,WEEK={'2/2':3.5,'5/2':5,'6/1':6,'7/0':7};\n" +
  source.slice(modelStart, init), context
);
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const state = () => plain(context.employerState());
const quote = () => plain(context.employerQuote());

check('default weekly staffing and explicit reserve are separate', () => {
  assert.deepEqual(quote(), {
    state: { prof: 'Комплектовщик', region: 'Москва и МО', posts: 20,
      daily: 1, opdays: 7, sched: '2/2', stay: false, reservePct: 8 },
    weeklyPosts: 140, weeklyCapacity: 3.5, base: 40, reserve: 4, total: 44,
    reservePct: 8
  });
});
check('round base up before independently rounding reserve up', () => {
  context.employerSet({ posts: 1, daily: 1, opdays: 5, sched: '6/1', reservePct: 8 });
  assert.deepEqual([quote().base, quote().reserve, quote().total], [1, 1, 2]);
  context.employerSet({ reservePct: 0 });
  assert.deepEqual([quote().base, quote().reserve, quote().total], [1, 0, 1]);
});
check('closed object days cannot reduce a team below simultaneous demand', () => {
  context.employerSet({ posts: 20, daily: 1, opdays: 5, sched: '7/0', reservePct: 0 });
  assert.deepEqual([quote().weeklyCapacity, quote().base, quote().reserve, quote().total],
    [5, 20, 0, 20]);
  context.employerSet({ daily: 2, reservePct: 8 });
  assert.deepEqual([quote().base, quote().reserve, quote().total], [40, 4, 44]);
});
check('fixed 2/2 cycle keeps two alternating teams on a five-day object', () => {
  context.employerSet({ posts: 20, daily: 1, opdays: 5, sched: '2/2', reservePct: 0 });
  assert.deepEqual([quote().weeklyCapacity, quote().base, quote().total], [2.5, 40, 40]);
  context.employerSet({ daily: 2 });
  assert.equal(quote().base, 80);
});
check('bounds, shifts, schedule and enum values are validated', () => {
  const before = state();
  context.employerSet({ posts: 0, daily: 3, opdays: 4, reservePct: 31,
    sched: '9/1', stay: 'false', region: 'Mars', prof: 'Unknown', wage: 999 });
  assert.deepEqual(state(), before);
  for (const value of [null, '', ' ', NaN, Infinity, -1, 2.5, 201, '1e2', true]) {
    context.employerSet({ posts: value });
    assert.equal(state().posts, before.posts, 'Reject non-integer/plain/range input ' + value);
  }
  context.employerSet({ posts: '200', daily: '2', opdays: '7', sched: 'Вахта 7/0',
    reservePct: '30', stay: true, region: 'Другой регион' });
  assert.deepEqual([state().posts, state().sched, quote().base, quote().reserve, quote().total],
    [200, '7/0', 400, 120, 520]);
});
check('every supported operational schedule produces safe staffing', () => {
  for (const sched of ['2/2', '5/2', '6/1', '7/0']) {
    for (const daily of [1, 2]) for (const opdays of [5, 6, 7]) {
      context.employerSet({ posts: 19, daily, opdays, sched, reservePct: 8 });
      const q = quote();
      assert.ok(q.base >= 19 * daily, 'Each daily shift needs the requested people');
      assert.ok(q.weeklyCapacity <= opdays, 'A closed object day cannot supply a shift');
      if (sched === '2/2') {
        for (let phase = 0; phase < 4; phase++) {
          let worked = 0;
          for (let day = 0; day < 28; day++) {
            if (day % 7 < opdays && (day + phase) % 4 < 2) worked++;
          }
          assert.equal(q.weeklyCapacity, worked / 4,
            'Weekly capacity matches the complete 28-day calendar for every 2/2 phase');
        }
        assert.equal(q.base, 19 * daily * 2);
      } else {
        assert.ok(q.weeklyCapacity <= Number(sched[0]), 'Capacity respects employee days');
      }
      assert.ok(q.base * q.weeklyCapacity >= q.weeklyPosts);
      assert.ok((q.base - 1) * q.weeklyCapacity < q.weeklyPosts);
      assert.ok(q.reserve >= q.base * .08 && q.reserve - 1 < q.base * .08);
      assert.equal(q.total, q.base + q.reserve);
    }
  }
});
check('state snapshots and listeners are isolated from candidate state', () => {
  const original = state(), external = context.employerState();
  external.posts = 0;
  assert.deepEqual(state(), original);
  let calls = 0;
  const unsubscribe = context.employerSubscribe(s => {
    calls++;
    s.posts = 0;
  });
  context.employerSet({ posts: 20 });
  assert.equal(calls, 1);
  assert.equal(state().posts, 20);
  context.employerSet({ posts: 20, wage: 10 });
  assert.equal(calls, 1);
  unsubscribe();
  context.employerSet({ posts: 21 });
  assert.equal(calls, 1);
});
check('handoff fills the real business form and retains the user comment', () => {
  const fields = {
    message: { value: 'Нужен запуск в понедельник.', dispatchEvent() {} },
    radios: ['до 10', '10–50', '50–100', '100+'].map(value => ({ value, checked: false })),
    done: { hidden: false }
  };
  let selectedMode = '', closed = 0, scrollTarget = null;
  const form = {}, contact = {};
  context.$ = selector => {
    if (selector === '[data-form]') return form;
    if (selector === '[data-tab-btn="business"]') return { click() { selectedMode = 'business'; } };
    if (selector === 'textarea[name="message"]') return fields.message;
    if (selector === '.form__done') return fields.done;
    return null;
  };
  context.$$ = selector => selector === 'input[name="headcount"]' ? fields.radios : [];
  context.close = () => { closed++; };
  context.document = { getElementById: () => contact };
  context.AS.lenis = { scrollTo: target => { scrollTarget = target; } };
  context.employerSet({ posts: 20, daily: 1, opdays: 7, sched: '2/2', reservePct: 8 });
  assert.equal(context.employerApply(), true);
  assert.equal(selectedMode, 'business');
  assert.equal(fields.radios.find(r => r.checked).value, '10–50');
  assert.match(fields.message.value, /^Нужен запуск в понедельник\./);
  assert.match(fields.message.value, /44/);
  assert.match(fields.message.value, /резерв 4/);
  assert.equal(fields.done.hidden, true);
  assert.equal(closed, 1);
  assert.equal(scrollTarget, contact);
  context.employerSet({ posts: 200, daily: 2, reservePct: 30 });
  context.employerApply();
  assert.equal(fields.radios.find(r => r.checked).value, '100+');
  assert.equal((fields.message.value.match(/Из калькулятора персонала:/g) || []).length, 1);
  assert.doesNotMatch(fields.message.value, /₽|стоимость|Цена/);
  assert.match(fields.message.value, /^Нужен запуск в понедельник\./);
});
check('missing form fails safely without closing the calculator', () => {
  context.$ = () => null;
  context.close = () => { throw new Error('Must not close'); };
  assert.equal(context.employerApply(), false);
});
check('complete modal initializes without legacy employer DOM or candidate side effects', () => {
  const modal = { dataset: {}, querySelector: () => null, querySelectorAll: () => [] };
  const document = {
    querySelector: selector => selector === '[data-cm]' ? modal : null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const app = { console, Date, Math, Event, document, AS: {} };
  app.window = app;
  app.matchMedia = () => ({ matches: false });
  vm.createContext(app);
  ['js/objects.js', 'js/data.js', 'js/calc-data.js'].forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), app);
  });
  vm.runInContext(source, app);
  const api = app.AS.CalcModal;
  for (const method of ['state', 'set', 'preview', 'durations', 'solve', 'subscribe', 'apply',
    'employerState', 'employerSet', 'employerQuote', 'employerSubscribe', 'employerApply']) {
    assert.equal(typeof api[method], 'function', method + ' remains available');
  }
  const before = JSON.stringify(api.state().job);
  let notifications = 0;
  api.subscribe(() => notifications++);
  api.employerSet({ posts: 200, daily: 2 });
  assert.equal(JSON.stringify(api.state().job), before);
  assert.equal(notifications, 0, 'Employer changes must not trigger candidate hydration');
  assert.equal(modal.dataset.tab, 'job');
});
console.log('Employer headcount checks: ' + checks + '/' + checks);
