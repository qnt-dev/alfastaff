/* Feasibility only: eligibility, rates, tax and expenses come from AlfaDesign.
 * Keep the user's target and yield choice independent of the available range. */
(function (host, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else host.AlfaGoalFeasibility = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function catalog(engine, state) {
    var result = Object.create(null);
    engine.durations('', state).forEach(function (shifts) {
      engine.list(Object.assign({}, state, { shifts: shifts })).forEach(function (quote) {
        if (!result[quote.o.id]) result[quote.o.id] = [];
        result[quote.o.id].push({ shifts: shifts, quote: quote });
      });
    });
    return result;
  }

  function income(trial, high) {
    if (high && !trial.quote.hi) return null;
    return high ? trial.quote.hi.home : trial.quote.home;
  }

  function best(trials, high) {
    return trials.reduce(function (previous, trial) {
      var value = income(trial, high);
      return value === null ? previous : !previous || value > income(previous, high) ? trial : previous;
    }, null);
  }

  function evaluate(trials, target, high) {
    var ordered = trials.slice().sort(function (a, b) { return a.shifts - b.shifts; });
    var baseBest = best(ordered, false), highBest = best(ordered, true);
    var baseMax = baseBest ? baseBest.quote.home : 0;
    var highMax = highBest ? highBest.quote.hi.home : null;
    var currentBest = high ? highBest : baseBest;
    var selected = ordered.filter(function (trial) {
      var value = income(trial, high);
      return value !== null && value >= target;
    })[0] || currentBest;
    var actual = selected ? income(selected, high) : 0;
    return {
      target: target, high: !!high, selected: selected, actual: actual,
      reachable: !!selected && actual >= target,
      baseBest: baseBest, highBest: highBest, currentBest: currentBest,
      baseMax: baseMax, highMax: highMax,
      maximum: Math.max(0, baseMax, highMax === null ? 0 : highMax),
      maxShifts: ordered.length ? ordered[ordered.length - 1].shifts : 0,
      highLabel: highBest ? highBest.quote.hi.label : '',
      canReachHigh: !high && highMax !== null && target > baseMax && target <= highMax
    };
  }

  function alternatives(quotesByObject, selectedId, target, high) {
    return Object.keys(quotesByObject).filter(function (id) { return id !== selectedId; })
      .map(function (id) {
        return { id: id, result: evaluate(quotesByObject[id], target, high) };
      }).filter(function (item) {
        return item.result.reachable;
      }).sort(function (a, b) {
        return a.result.selected.shifts - b.result.selected.shifts ||
          a.result.selected.quote.o.short.localeCompare(b.result.selected.quote.o.short, 'ru');
      });
  }

  function durationLayout(durations) {
    var values = durations.slice().sort(function (a, b) { return a - b; });
    var intervals = values.length - 1;
    // 80% is the usable rail; leave at least 8px between adjacent 44px buttons.
    var height = Math.max(190, Math.ceil(52 * intervals / 0.8));
    var ticks = [];
    values.forEach(function (value, i) {
      ticks.push(value);
      // These are decorative subdivisions of a discrete choice, not extra
      // offered contracts. Interpolate values so top() also serves tick nodes.
      if (i < intervals) {
        for (var step = 1; step <= 4; step++) ticks.push(value + (values[i + 1] - value) * step / 5);
      }
    });
    return {
      height: height, ticks: ticks,
      top: function (value) {
        if (intervals < 1) return 50;
        if (value <= values[0]) return 90;
        if (value >= values[intervals]) return 10;
        var i = 0;
        while (value > values[i + 1]) i++;
        var position = i + (value - values[i]) / (values[i + 1] - values[i]);
        return 90 - 80 * position / intervals;
      }
    };
  }

  return { catalog: catalog, evaluate: evaluate, alternatives: alternatives, durationLayout: durationLayout };
});
