/* Shared source-design API. All eligibility, rates and financial/calendar
 * calculations remain in AS.CalcModal; the downloaded demo engine is not used. */
(function () {
  'use strict';
  var AS = window.AS, model = AS && AS.CalcModal;
  if (!model) return;
  var formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  var months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  function initial() { return model.state().job; }
  function objects() { return model.state().objects; }
  function list(state) {
    return objects().map(function (object) { return model.preview(object.id, state); })
      .filter(Boolean).sort(function (a, b) { return b.home - a.home; });
  }
  function current(state) {
    var matches = list(state), pick = state && state.pick;
    return matches.filter(function (quote) { return quote.o.id === pick; })[0] || matches[0] || null;
  }
  function durations(id, state) {
    var result = [];
    objects().filter(function (object) { return !id || object.id === id; }).forEach(function (object) {
      var values = object.vakhta && object.vakhta.length ? object.vakhta : model.durations(object.id);
      values.forEach(function (shifts) {
        if (result.indexOf(shifts) < 0 && model.preview(object.id, Object.assign({}, state, { shifts: shifts }))) result.push(shifts);
      });
    });
    return result.sort(function (a, b) { return a - b; });
  }
  function money(value) {
    value = Number(value);
    return formatter.format(isFinite(value) ? Math.round(value) || 0 : 0);
  }
  function date(start, offset) {
    var value, parts = typeof start === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
    if (parts) {
      value = new Date(+parts[1], +parts[2] - 1, +parts[3]);
      if (value.getFullYear() !== +parts[1] || value.getMonth() !== +parts[2] - 1 || value.getDate() !== +parts[3]) return '—';
    } else if (start && typeof start.getTime === 'function') value = new Date(start.getTime());
    else return '—';
    offset = Number(offset || 0);
    if (!isFinite(offset)) return '—';
    value.setDate(value.getDate() + Math.trunc(offset));
    return isFinite(value.getTime()) ? value.getDate() + '\u00a0' + months[value.getMonth()] : '—';
  }

  var engine = {
    initial: initial, list: list, current: current, durations: durations,
    money: money,
    rounded: function (value) { return money(Math.round(Number(value) / 1000) * 1000); },
    parseMoney: function (value) { return model.parseAmount(value); },
    date: date,
    end: function (quote, state) { return quote ? date((state || initial()).start, quote.days - 1) : '—'; }
  };
  Object.defineProperties(engine, {
    regions: { get: function () {
      var catalog = objects();
      return (AS.REGIONS || []).filter(function (region) { return catalog.some(function (object) { return object.region === region.key; }); })
        .map(function (region) { return { key: region.key, label: region.label }; });
    } },
    roles: { get: function () {
      var roles = [];
      objects().forEach(function (object) { (object.jobsFull || []).forEach(function (role) { if (roles.indexOf(role) < 0) roles.push(role); }); });
      return roles;
    } }
  });
  window.AlfaDesign = engine;
})();
