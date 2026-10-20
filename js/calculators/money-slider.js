/* The native range owns input/accessibility; one short-lived animation moves
   the contour, ticks, knob and editable readout on a shared vertical axis. */
(function () {
  'use strict';
  window.AlfaMoneySlider = function (root, onChange, options) {
    options = options || {};
    var prefix = options.prefix || "ag", divisor = options.divisor || 1000, minimum = options.minimum || 0;
    function find(suffix) { return root.querySelector("#" + prefix + "-" + suffix); }
    var ns = 'http://www.w3.org/2000/svg';
    var range = find('target-range');
    var input = find('target');
    var scale = root.querySelector('.ag-money-scale');
    var svg = find('money-contour');
    var line = find('money-line');
    var light = find('money-light');
    var bloom = find('money-bloom');
    var fade = find('money-fade');
    var fadeMask = find('money-fade-mask');
    var leftShape = find('money-left-shape');
    var tickGroup = find('money-ticks');
    var labelGroup = find('money-labels');
    var sound = window.AlfaSliderSound ? window.AlfaSliderSound(find('sound-toggle')) : null;
    var readout = root.querySelector('.ag-money-readout');
    var unit = readout.querySelector('.ag-money-value-unit');
    var highZone = node('g', { id: prefix + '-money-high-zone', 'class': 'ag-money-high-zone',
      'clip-path': 'url(#' + prefix + '-money-left-clip)', visibility: 'hidden' });
    // The upper range is indicated by the existing ticks, without an added band.
    svg.insertBefore(highZone, svg.querySelector('.ag-money-line-base'));
    // Measure with the same tabular numeral features as the input; Canvas uses proportional glyphs.
    var metrics = document.createElement('span');
    metrics.className = 'ag-money-measure';
    metrics.setAttribute('aria-hidden', 'true');
    readout.appendChild(metrics);
    var motion = matchMedia('(prefers-reduced-motion: reduce)');
    var fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: options.integer ? 0 : 3 });
    var ticks = [], labels = [], height = 0, lastTickKey = '', maximum = 600000;
    var baseMaximum = maximum, highMaximum = maximum;
    var value = 0, position = null, target = 0, frame = 0, lastTime = 0, dragging = false, editing = false;
    var typingTimer = 0, measureFrame = 0, resolutionQuery = null;
    // Concentric circle + tangent circular shoulders keep the knob clearance at 5px.
    var knobX = 84, notchRadius = 25, railX = 69, shoulderRadius = 18;
    var shoulderX = railX - shoulderRadius;
    var shoulderY = Math.sqrt(Math.pow(notchRadius + shoulderRadius, 2) - Math.pow(knobX - shoulderX, 2));
    var joinY = notchRadius * shoulderY / (notchRadius + shoulderRadius);
    var joinX = knobX - notchRadius * (knobX - shoulderX) / (notchRadius + shoulderRadius);
    var raster = { x: 1, y: 1, left: 0, top: 0, shift: 0, minor: 1, major: 1, rail: 1 };

    // Exact limits need to remain reachable even when they are not multiples of 1000.
    // The interaction handlers below retain the thousand-ruble increment.
    range.step = '1'; range.min = minimum;

    function format(n) { return fmt.format(n / divisor); }
    function parse(s) {
      s = s.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
      if (!/^\d+(?:\.\d{0,3})?$/.test(s)) return null;
      if (options.integer && !/^\d+$/.test(s)) return null;
      var n = Number(s) * divisor;
      if (options.inputMaximum && (n < minimum || n > options.inputMaximum)) return null;
      return Number.isFinite(n) && n <= 999999999 ? Math.round(n) : null;
    }
    function node(tag, attrs) {
      var el = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
      return el;
    }
    function niceStep(raw) {
      if (!(raw > 0)) return 1;
      var power = Math.pow(10, Math.floor(Math.log10(raw))), factor = raw / power;
      return (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 2.5 ? 2.5 : factor <= 5 ? 5 : 10) * power;
    }
    function scaleText(n) {
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: options.integer ? 0 : maximum < 1000 ? 3 : 1 }).format(n / divisor);
    }
    function buildTicks() {
      var key = maximum + ':' + height;
      if (lastTickKey === key) return;
      lastTickKey = key; ticks = []; labels = [];
      tickGroup.replaceChildren(); labelGroup.replaceChildren();
      var major = Math.max(1, niceStep(maximum / 6)), minor = Math.max(1, major / 5);
      function tickAt(n, strong) {
        var tick = node('path', { 'class': strong ? 'ag-money-tick ag-money-tick--major' : 'ag-money-tick',
          'data-value': n });
        tickGroup.appendChild(tick); ticks.push({ el: tick, value: n, strong: strong });
      }
      function labelAt(n, endpoint) {
        var label = node('text', { 'text-anchor': 'end', 'dominant-baseline': 'middle', 'data-value': n });
        if (endpoint) label.setAttribute('data-endpoint', 'maximum');
        label.textContent = scaleText(n); labelGroup.appendChild(label); labels.push({ el: label, value: n });
      }
      if (!maximum) { tickAt(0, true); labelAt(0, true); return; }
      var count = Math.floor(maximum / minor);
      for (var i = 0; i <= count; i++) {
        var n = Math.round(i * minor * 1000) / 1000, strong = Math.abs(n / major - Math.round(n / major)) < .00001;
        // The exact limit replaces a nearby regular tick instead of doubling it.
        if (n >= maximum || (n > 0 && maximum - n < minor / 2)) continue;
        tickAt(n, strong);
        // Keep the tick even when its label would collide with the exact upper limit.
        if (strong && n < maximum && (n === 0 || (maximum - n) / maximum * (height - 60) >= 22)) labelAt(n, false);
      }
      tickAt(maximum, true);
      labelAt(maximum, true);
    }
    function fitNumber() {
      var available = readout.clientWidth - unit.offsetWidth - 8;
      if (available <= 0) return;
      metrics.textContent = input.value || '0';
      metrics.style.fontSize = '52px';
      var at52 = metrics.getBoundingClientRect().width;
      if (!at52) return;
      var size = Math.max(18, Math.min(52, (available - 3) / at52 * 52));
      metrics.style.fontSize = size + 'px';
      input.style.fontSize = size + 'px';
      input.style.width = Math.min(available, Math.ceil(metrics.getBoundingClientRect().width + 3)) + 'px';
    }
    function yFor(p) { return 30 + (height - 60) * (1 - p); }
    function fraction(n) { return maximum > 0 ? Math.max(0, Math.min(1, n / maximum)) : 0; }
    function snapCenter(n, axis, thickness) {
      var factor = axis === 'x' ? raster.x : raster.y, origin = axis === 'x' ? raster.left : raster.top;
      return (Math.round(n * factor + origin - thickness / 2) + thickness / 2 - origin) / factor;
    }
    function snapEdge(n) { return (Math.round(n * raster.x + raster.left) - raster.left) / raster.x; }
    function rasterMetrics() {
      var matrix = svg.getScreenCTM(), dpr = window.devicePixelRatio || 1;
      if (!matrix || matrix.a <= 0 || matrix.d <= 0 || Math.abs(matrix.b) > .00001 || Math.abs(matrix.c) > .00001) return;
      raster.x = matrix.a * dpr; raster.y = matrix.d * dpr;
      raster.left = matrix.e * dpr; raster.top = matrix.f * dpr;
      raster.rail = Math.max(1, Math.round(raster.x));
      raster.minor = Math.max(1, Math.round(raster.y));
      raster.major = Math.max(1, Math.round(1.4 * raster.y));
      raster.shift = snapCenter(railX, 'x', raster.rail) - railX;
      svg.style.setProperty('--ag-rail-stroke', raster.rail / raster.x);
      svg.style.setProperty('--ag-tick-stroke', raster.minor / raster.y);
      svg.style.setProperty('--ag-tick-major-stroke', raster.major / raster.y);
      scale.style.setProperty('--ag-slider-x', raster.shift + 'px');
    }
    function contourX(y, center) {
      var d = Math.abs(y - center);
      if (d >= shoulderY) return railX + raster.shift;
      if (d <= joinY) return knobX + raster.shift - Math.sqrt(notchRadius * notchRadius - d * d);
      return shoulderX + raster.shift + Math.sqrt(shoulderRadius * shoulderRadius - Math.pow(d - shoulderY, 2));
    }
    function contour(center) {
      return 'M' + (railX + raster.shift) + ' 0 V' + (center - shoulderY) +
        ' A18 18 0 0 1 ' + (joinX + raster.shift) + ' ' + (center - joinY) +
        ' A25 25 0 0 0 ' + (joinX + raster.shift) + ' ' + (center + joinY) +
        ' A18 18 0 0 1 ' + (railX + raster.shift) + ' ' + (center + shoulderY) + ' V' + height;
    }
    function paint() {
      if (!height || position === null) return;
      rasterMetrics();
      var center = yFor(position), path = contour(center);
      line.setAttribute('d', path);
      // The light fades to zero around the knob; the clip only chooses its side.
      // Do not terminate this shape at the scale ends: that cuts the halo flat.
      leftShape.setAttribute('d', path.replace(/^(M[^ ]+) 0/, '$1 -80') + ' V' + (height + 80) + ' H-60 V-80 Z');
      light.setAttribute('cx', 60 + raster.shift); bloom.setAttribute('cx', 59 + raster.shift);
      light.setAttribute('cy', center); bloom.setAttribute('cy', center);
      fade.setAttribute('y1', center - 30); fade.setAttribute('y2', center + 30);
      scale.style.setProperty('--ag-slider-y', center + 'px');
      var hasHighZone = highMaximum > baseMaximum && baseMaximum < maximum;
      highZone.setAttribute('visibility', hasHighZone ? 'visible' : 'hidden');
      ticks.forEach(function (item) {
        var isHigh = hasHighZone && item.value > baseMaximum;
        item.el.classList.toggle('ag-money-tick--high', isHigh);
        var y = snapCenter(yFor(fraction(item.value)), 'y', item.strong ? raster.major : raster.minor);
        var offset = railX + raster.shift - contourX(y, center);
        var end = snapEdge(railX + raster.shift - 7) - offset;
        var length = Math.round((item.strong ? 12 : 7) * raster.x) / raster.x;
        item.el.setAttribute('d', 'M' + (end - length) + ' ' + y + 'H' + end);
        item.el.style.opacity = isHigh ? 1 : Math.min(1, .5 + .45 * offset / 10);
      });
      labels.forEach(function (item) {
        var y = yFor(fraction(item.value)), offset = railX + raster.shift - contourX(y, center);
        item.el.setAttribute('x', 39 + raster.shift - offset * .45); item.el.setAttribute('y', y);
        item.el.style.opacity = Math.min(1, .68 + .32 * offset / 10);
      });
      if (!editing) {
        // A rescaled ruler must never invent intermediate monetary amounts.
        // The model and manual draft remain authoritative while the knob eases.
        input.value = format(value);
        fitNumber();
      }
    }
    function animate(now) {
      frame = 0;
      if (!height || root.hidden || root.closest('[hidden]') || document.hidden) { position = target; paint(); return; }
      var dt = lastTime ? Math.min(64, now - lastTime) : 16;
      lastTime = now;
      position += (target - position) * (1 - Math.exp(-dt / (dragging ? 35 : 70)));
      if (motion.matches || Math.abs(target - position) < .0001) position = target;
      paint();
      if (position !== target) frame = requestAnimationFrame(animate); else lastTime = 0;
    }
    function schedule() {
      if (position === null || motion.matches || !height || root.closest('[hidden]')) { position = target; paint(); return; }
      if (!frame && position !== target) { lastTime = 0; frame = requestAnimationFrame(animate); }
      else if (!frame) paint();
    }
    function measure() {
      height = scale.clientHeight;
      if (!height) return;
      svg.setAttribute('viewBox', '0 0 120 ' + height);
      svg.querySelectorAll('filter').forEach(function (filter) { filter.setAttribute('height', height + 160); });
      fadeMask.setAttribute('height', height + 160);
      fadeMask.querySelector('rect').setAttribute('height', height + 160);
      buildTicks();
      fitNumber(); paint();
    }
    function requestMeasure() {
      if (!measureFrame) measureFrame = requestAnimationFrame(function () { measureFrame = 0; measure(); });
    }
    function interactionStep() {
      if (options.step) return options.step;
      return maximum >= 1000 ? 1000 : Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(1, maximum) / 20))));
    }
    function audibleDivision(n) {
      // Follow visible divisions, including the nonuniform exact upper limit.
      // A regular tick omitted near that limit must not produce a phantom click.
      var division = 0;
      ticks.forEach(function (tick) { if (tick.value <= n) division++; });
      return division;
    }
    function selectRangeValue(n, event) {
      var previous = Math.max(0, Math.min(maximum, value));
      editing = false; showUnit();
      n = Math.max(minimum, Math.min(maximum, n));
      if (sound) sound.move(audibleDivision(previous), audibleDivision(n), 1, event);
      range.value = n; onChange(n);
    }
    range.addEventListener('pointerdown', function (event) {
      dragging = true;
      if (sound) sound.unlock(event);
    });
    function released() { dragging = false; }
    function hideUnit() {
      clearTimeout(typingTimer);
      readout.dataset.typing = 'true';
    }
    function showUnit() { clearTimeout(typingTimer); delete readout.dataset.typing; }
    range.addEventListener('pointerup', released);
    range.addEventListener('pointercancel', released);
    range.addEventListener('lostpointercapture', released);
    range.addEventListener('input', function (event) {
      var n = +range.value, step = interactionStep();
      selectRangeValue(n >= maximum - step / 2 ? maximum : Math.round(n / step) * step, event);
    });
    range.addEventListener('keydown', function (e) {
      var next = +range.value, step = interactionStep();
      if (e.key === 'Home') next = minimum;
      else if (e.key === 'End') next = maximum;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next += step;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next -= step;
      else if (e.key === 'PageUp') next += step * 10;
      else if (e.key === 'PageDown') next -= step * 10;
      else return;
      e.preventDefault();
      if (sound) sound.unlock(e);
      selectRangeValue(next, e);
    });
    input.addEventListener('focus', function () { editing = true; hideUnit(); input.value = format(value); fitNumber(); });
    input.addEventListener('select', function () {
      // Browsers may also emit select when typing collapses the caret.
      if (input.selectionStart !== input.selectionEnd) hideUnit();
    });
    input.addEventListener('pointerdown', hideUnit);
    input.addEventListener('input', function () {
      editing = true; hideUnit(); fitNumber();
      var n = parse(input.value);
      input.setAttribute('aria-invalid', String(n === null || n <= 0));
      find('target-error').hidden = n !== null && n > 0;
      if (n !== null) onChange(n);
      if (n !== null && n > 0) typingTimer = setTimeout(showUnit, 900);
    });
    input.addEventListener('blur', function () { editing = false; showUnit(); input.value = format(value); input.setAttribute('aria-invalid', String(value <= 0)); find('target-error').hidden = value > 0; fitNumber(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.blur(); }
    });
    if (window.ResizeObserver) new ResizeObserver(measure).observe(scale);
    window.addEventListener('resize', requestMeasure);
    document.addEventListener('scroll', requestMeasure, true);
    document.addEventListener('transitionend', function (e) { if (e.target.contains(root)) requestMeasure(); }, true);
    if (window.MutationObserver) {
      var placementObserver = new MutationObserver(requestMeasure);
      for (var ancestor = root; ancestor; ancestor = ancestor.parentElement)
        placementObserver.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
    function watchResolution() {
      if (resolutionQuery) resolutionQuery.removeEventListener('change', resolutionChanged);
      resolutionQuery = matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
      resolutionQuery.addEventListener('change', resolutionChanged);
    }
    function resolutionChanged() { watchResolution(); requestMeasure(); }
    watchResolution();
    motion.addEventListener('change', schedule);
    document.fonts.ready.then(requestMeasure);
    document.fonts.addEventListener('loadingdone', requestMeasure);
    return { sync: function (next, max, limits) {
      value = Number.isFinite(next) ? Math.max(0, next) : 0;
      maximum = Number.isFinite(max) ? Math.max(0, max) : 0;
      limits = limits || {};
      baseMaximum = Number.isFinite(limits.baseMax) ? Math.max(0, limits.baseMax) : maximum;
      highMaximum = Number.isFinite(limits.highMax) ? Math.max(0, limits.highMax) : maximum;
      target = maximum ? fraction(value) : value > 0 ? 1 : 0;
      range.max = maximum; range.value = Math.min(value, maximum); range.disabled = maximum <= 0;
      var amountText = new Intl.NumberFormat('ru-RU').format(value) + ' ' + (options.ariaUnit || 'рублей');
      if (value > maximum) amountText += ', выше максимума шкалы ' + new Intl.NumberFormat('ru-RU').format(maximum) + ' рублей';
      range.setAttribute('aria-valuetext', amountText);
      measure(); schedule();
    } };
  };
})();
