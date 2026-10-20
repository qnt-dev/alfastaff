/* Run with node tools/calc-extension-shifts-check.cjs.
 * The preview treats 20 + 10 as 30 total shifts. It reuses the existing financial
 * model for each integer total, never interpolates quoted milestones. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loader = path.join(__dirname, 'calc-source-model-check.cjs');
const { E, context } = new Function('require', '__dirname',
  fs.readFileSync(loader, 'utf8') + '\nreturn { E, context };'
)(require, __dirname);
const F = require('../js/calculators/goal-feasibility.js');
const model = context.AS.CalcModal;
const state = {
  region: 'Москва и МО', prof: 'Комплектовщик', pick: 'ym-sofyino',
  shifts: 30, sched: '6/1', sex: '', age: 0, food: 0, road: 0,
  v: '100', auto: false
};
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run(); checks++;
  console.log('PASS ' + name);
}
function preview(shifts, patch = {}) {
  return model.preview('ym-sofyino', Object.assign({}, state, patch, { shifts }));
}

check('milestone API stays discrete while candidate totals include every bounded integer', () => {
  assert.equal(typeof E.shiftCounts, 'function');
  assert.deepEqual(plain(E.durations('ym-sofyino', state)), [20, 30, 45, 60]);
  assert.deepEqual(plain(E.shiftCounts('ym-sofyino', state)), Array.from({ length: 41 }, (_, i) => i + 20));
  [19, 61, 24.5].forEach(n => assert.equal(preview(n), null));
  [20, 21, 25, 29, 30, 31, 60].forEach(n => assert.ok(preview(n)));
  const fixedState = { ...state, region: '', prof: 'Упаковщик', sex: 'f' };
  assert.deepEqual(plain(E.shiftCounts('starodvorskie', fixedState)), Array.from({ length: 16 }, (_, i) => i + 15));
  assert.equal(model.preview('starodvorskie', { ...fixedState, shifts: 31 }), null);
});

check('intermediate quotes use total-shift rates and never repeat training', () => {
  [20, 21, 25, 29, 30, 31, 60].forEach(n => {
    const q = preview(n);
    const gross = 2 * 5940 + (n - 2) * 7000;
    assert.equal(q.paid, n);
    assert.equal(q.worked, n + 1, 'One unpaid training shift for the whole stay');
    assert.equal(q.inN, 2, 'Two initial intern shifts, including when crossing a milestone');
    assert.equal(q.regN, n - 2);
    assert.equal(q.gross, gross);
    assert.equal(q.tax, Math.round(gross * .06));
    assert.equal(q.home, gross - Math.round(gross * .06));
    assert.equal(q.days, n + 1 + Math.floor(n / 6));
    const highGross = 2 * 5940 + (n - 2) * 10500;
    assert.equal(q.hi.gross, highGross);
    assert.equal(q.hi.home, highGross - Math.round(highGross * .06));
  });
  assert.equal(preview(25).home - preview(20).home, 5 * 7000 * .94);
  assert.equal(preview(30).home, 195407, 'The 20 + 10 endpoint exactly matches the original 30-shift quote');
  const lemana = model.preview('lemana-north', { ...state, shifts: 35 });
  assert.ok(lemana);
  assert.equal(lemana.inN, 5, 'A different actual internship tier remains five shifts');
  assert.equal(lemana.gross, 5 * lemana.p.intern.rate + 30 * lemana.rate);
});

check('daily food and road compensation follow real calendar and the 30-shift threshold', () => {
  [21, 25, 29, 30, 31].forEach(n => {
    ['6/1', '7/0'].forEach(sched => {
      const q = preview(n, { food: 500, road: 12000, sched });
      const days = n + 1 + (sched === '6/1' ? Math.floor(n / 6) : 0);
      assert.equal(q.days, days);
      assert.equal(q.food, days * 300);
      assert.equal(q.comp, n >= 30 ? 10000 : 0);
      assert.equal(q.home, q.gross - q.tax - days * 300 - 12000 + (n >= 30 ? 10000 : 0));
    });
  });
  const a = preview(29, { food: 500, road: 12000 });
  const b = preview(30, { food: 500, road: 12000 });
  assert.equal(b.home - a.home, 15980, 'Actual extra shift, two calendar days and reimbursement; not linear interpolation');
});

check('shared refresh keeps the selected object and explicit yield at intermediate totals', () => {
  const saved = model.state().job;
  [21, 25, 29, 30, 31].forEach(shifts => {
    const result = model.set({ ...state, shifts, v: 'hi', auto: false });
    assert.equal(result.job.pick, 'ym-sofyino');
    assert.equal(result.job.shifts, shifts);
    assert.equal(result.job.v, 'hi');
    assert.equal(result.job.auto, false);
    assert.equal(result.current.home, preview(shifts).home);
  });
  model.set(saved);
});

check('catalog and both solvers select the shortest sufficient integer total', () => {
  const trials = F.catalog(E, state)['ym-sofyino'];
  assert.equal(trials.length, 41);
  [21, 25, 29, 30, 31].forEach(n => {
    const target = preview(n - 1).home + 1;
    const f = F.evaluate(trials, target, false);
    const m = model.solve(target, { ...state, id: 'ym-sofyino' });
    assert.equal(f.selected.shifts, n);
    assert.equal(m.shifts, n);
    assert.equal(m.home, f.actual);
    assert.equal(F.evaluate(trials, preview(n).home, false).selected.shifts, n);
  });
  assert.equal(F.evaluate(trials, 180000, false).selected.shifts, 28);
  const high = F.evaluate(trials, 450000, true);
  assert.equal(high.selected.shifts, 47);
  assert.equal(model.solve(450000, { ...state, id: 'ym-sofyino', v: 'hi' }).shifts, 47);
  assert.equal(F.evaluate(trials, 600000, false).selected.shifts, 60);
});

check('eligibility and explicit high mode are preserved for full candidate ranges', () => {
  assert.deepEqual(plain(E.shiftCounts('ym-sofyino', { ...state, sex: 'f', age: 46 })), []);
  assert.deepEqual(plain(E.shiftCounts('ym-sofyino', { ...state, prof: 'Несуществующая профессия' })), []);
  assert.equal(preview(25, { age: 46 }), null);
  const fixed = { ...state, id: 'starodvorskie', pick: 'starodvorskie', region: '', prof: 'Упаковщик', sex: 'f', v: 'hi' };
  assert.equal(model.solve(100000, fixed).quote, null, 'Explicit high mode cannot silently use a fixed-rate quote');
  assert.equal(F.evaluate(F.catalog(E, fixed).starodvorskie, 100000, true).selected, null);
});

console.log('Extension shifts: ' + checks + ' checks passed.');
