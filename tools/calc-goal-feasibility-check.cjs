'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Reuse the existing source-model loader and its financial checks. This avoids
// maintaining a second financial model or browser/DOM substitutes.
const loader = path.join(__dirname, 'calc-source-model-check.cjs');
const { E } = new Function('require', '__dirname',
  fs.readFileSync(loader, 'utf8') + '\nreturn { E, context };'
)(require, __dirname);
const F = require('../js/calculators/goal-feasibility.js');
const baseState = {
  region: '', prof: 'Комплектовщик', pick: 'ym-sofyino',
  shifts: 30, sched: '6/1', sex: '', age: 0, food: 0, road: 0,
  v: '100', high: false, auto: false
};
const state = patch => Object.assign({}, baseState, patch);
const solve = (input, target, high = false) => {
  const catalog = F.catalog(E, input);
  return { catalog, result: F.evaluate(catalog[input.pick] || [], target, high) };
};
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log('PASS ' + name);
}

check('reachable target chooses the shortest real contract', () => {
  const { result } = solve(state(), 180000);
  assert.equal(result.reachable, true);
  assert.equal(result.selected.shifts, 30);
  assert.equal(result.actual, 195407);
  assert.equal(result.baseMax, 392807);
  assert.equal(result.highMax, 583627);
  assert.equal(result.maximum, 583627);
});

check('600k stays a 600k target, while the real maximum is 392807 in base mode', () => {
  const { result } = solve(state(), 600000);
  assert.equal(result.target, 600000);
  assert.equal(result.high, false);
  assert.equal(result.reachable, false);
  assert.equal(result.selected.shifts, 60);
  assert.equal(result.maxShifts, 60);
  assert.equal(result.selected.quote.days, 71);
  assert.equal(result.actual, 392807);
  assert.equal(result.maximum, 583627);
  assert.equal(result.canReachHigh, false);
});

check('high earnings require an explicit mode choice, preserving the target', () => {
  const input = state();
  const { catalog, result } = solve(input, 450000);
  assert.equal(result.high, false);
  assert.equal(result.actual, 392807);
  assert.equal(result.reachable, false);
  assert.equal(result.canReachHigh, true);
  assert.equal(input.v, '100');
  assert.equal(input.high, false);
  const chosen = F.evaluate(catalog[input.pick], 450000, true);
  assert.equal(chosen.target, 450000);
  assert.equal(chosen.high, true);
  assert.equal(chosen.reachable, true);
  assert.equal(chosen.actual, 583627);
});

check('fixed-rate packaging keeps the real 30-shift maximum and has no high offer', () => {
  const { result } = solve(state({ pick: 'starodvorskie', prof: 'Упаковщик', sex: 'f' }), 180000);
  assert.equal(result.maxShifts, 30);
  assert.equal(result.selected.shifts, 30);
  assert.equal(result.baseMax, 107160);
  assert.equal(result.highMax, null);
  assert.equal(result.maximum, 107160);
  assert.equal(result.canReachHigh, false);
});

check('expenses and schedule change both real maxima without changing the target', () => {
  const input = state({ food: 500, road: 12000 });
  const { result } = solve(input, 600000);
  assert.equal(result.target, 600000);
  assert.equal(result.baseMax, 369507);
  assert.equal(result.highMax, 560327);
  const seven = solve(Object.assign({}, input, { sched: '7/0' }), 600000).result;
  assert.equal(seven.baseMax, 372507);
  assert.equal(seven.highMax, 563327);
});

check('profession and object determine the range, not a global 600k cap', () => {
  const { result } = solve(state({ prof: 'Водитель высотного штабелёра' }), 600000);
  assert.equal(result.baseMax, 479400);
  assert.equal(result.highMax, 719100);
  assert.equal(result.maximum, 719100);
  assert.equal(result.reachable, false);
  assert.equal(result.canReachHigh, true);
});

check('non-150 high tariffs retain their actual label', () => {
  const { result } = solve(state({ pick: 'lemana-kinel', prof: 'Водитель высотного штабелёра' }), 440000);
  assert.equal(result.baseMax, 423000);
  assert.equal(result.highMax, 451200);
  assert.equal(result.highLabel, 'при высокой выработке');
  assert.equal(result.canReachHigh, true);
});

check('alternatives really meet the goal under the same mode and current filters', () => {
  const input = state({ pick: 'starodvorskie', prof: 'Упаковщик', sex: 'f' });
  const catalog = F.catalog(E, input);
  const alternatives = F.alternatives(catalog, input.pick, 180000, false);
  assert.ok(alternatives.length > 0, 'Fixture must include actual matching objects');
  alternatives.forEach(item => {
    assert.notEqual(item.id, input.pick);
    assert.ok(item.result.reachable);
    assert.ok(item.result.actual >= 180000);
    assert.equal(item.result.high, false);
    assert.ok(item.result.selected.quote.p.jobs.includes('Упаковщик'));
    assert.ok(!item.result.selected.quote.p.sex || item.result.selected.quote.p.sex === 'f');
  });
  assert.equal(F.alternatives(catalog, input.pick, 600000, false).length, 0);
  const expensive = F.catalog(E, Object.assign({}, input, { food: 10000, road: 200000 }));
  assert.equal(F.alternatives(expensive, input.pick, 180000, false).length, 0);
  const restricted = F.catalog(E, Object.assign({}, input, { region: 'Владимир' }));
  assert.deepEqual(Object.keys(restricted), ['starodvorskie']);
  assert.equal(F.alternatives(restricted, input.pick, 180000, false).length, 0);
});

check('high-mode alternatives cannot silently fall back to fixed-rate earnings', () => {
  const catalog = F.catalog(E, state({ prof: 'Водитель высотного штабелёра' }));
  const alternatives = F.alternatives(catalog, 'ym-sofyino', 300000, true);
  assert.ok(alternatives.length > 0);
  alternatives.forEach(item => {
    assert.ok(item.result.selected.quote.hi);
    assert.equal(item.result.actual, item.result.selected.quote.hi.home);
  });
});

check('extreme expenses retain the best real result even when a longer contract loses more', () => {
  const { result } = solve(state({ food: 50000, road: 200000 }), 600000);
  assert.equal(result.target, 600000);
  assert.equal(result.high, false);
  assert.equal(result.maxShifts, 60);
  assert.equal(result.selected.shifts, 20);
  assert.ok(result.baseMax < 0);
  assert.ok(result.highMax < 0);
  assert.equal(result.maximum, 0);
  assert.equal(result.reachable, false);
  assert.equal(result.canReachHigh, false);
});

check('offered durations have equal spacing, four subticks per interval and room for 44px controls', () => {
  const offered = [20, 30, 45, 60];
  const layout = F.durationLayout(offered);
  assert.equal(layout.top(20), 90);
  assert.equal(layout.top(60), 10);
  offered.slice(0, -1).forEach((value, i) => {
    const next = offered[i + 1];
    const distance = layout.top(value) - layout.top(next);
    assert.ok(Math.abs(distance - 80 / 3) < 1e-8, 'All contract choices need the same visual interval');
    assert.ok(distance * layout.height / 100 >= 52 - 1e-8);
    assert.equal(layout.ticks.filter(tick => tick > value && tick < next).length, 4);
    assert.ok(layout.ticks.includes(value), 'The active tick must align with its offered duration');
  });
  assert.ok(layout.ticks.includes(60));
  assert.equal(layout.ticks.length, 16);
  layout.ticks.slice(1).forEach((value, i) => {
    assert.ok(Math.abs(layout.top(layout.ticks[i]) - layout.top(value) - 80 / 15) < 1e-8,
      'Interpolated decorative ticks must also remain equally spaced');
  });
  assert.ok(Math.abs(layout.top(25) - (layout.top(20) + layout.top(30)) / 2) < 1e-8);
  const close = F.durationLayout([15, 20, 30]);
  assert.equal(close.top(20), 50);
  assert.equal(close.ticks.filter(tick => tick > 15 && tick < 20).length, 4);
  assert.equal(close.ticks.filter(tick => tick > 20 && tick < 30).length, 4);
  assert.ok((close.top(15) - close.top(20)) * close.height / 100 >= 52 - 1e-8);
  const single = F.durationLayout([30]);
  assert.equal(single.top(30), 50);
  assert.deepEqual(single.ticks, [30]);
});

console.log('Goal feasibility: ' + checks + ' checks passed.');
