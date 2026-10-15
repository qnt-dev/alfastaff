/* Independent visual-data regression against the archived implementation.
   The fixture is an unmodified byte copy; SHA256:
   7504d6b1a51549dfe1e289c7cb7a8d0bf31c640dce47d5cdc9b26583d8df3a91.

   Ground comparison reverses the ImageBitmap's baked upload flipY. Compare
   premultiplied colour as well as raw pixels: RGB in almost transparent pixels
   may differ substantially when a bitmap is round-tripped through Canvas2D.
   Geometry positions/normals/UVs/indices are checked against real legacy scene
   meshes. This catches missing buildings, changed culling, and altered routes.
   Full WebGL frames additionally verify the actual ImageBitmap upload, material
   bindings, lighting, camera and shadow behaviour. Only the independently timed
   pin bob is normalized to the documented rest Y, before each real render call.
   Pixels are copied synchronously after rendering because the WebGL contexts do
   not preserve their drawing buffers. Both images remain visible for review. */
(function () {
  'use strict';
  var W = 2048, H = 2048;
  var theme = {
    relief: true, host: .22, road: .07, green: 'rgba(0,0,0,0)',
    ao: 'rgba(0,0,0,.6)', shadow: .45, gnd: 0, hemi: 1.15,
    sun: 2, lift: 0, blockLift: .1
  };
  var report = document.getElementById('report');

  function publish(result) {
    window.clayParityResult = result;
    report.dataset.status = result.pass ? 'pass' : 'fail';
    report.textContent = JSON.stringify(result, null, 2);
    return result;
  }
  function put(id, pixels) {
    var c = document.getElementById(id);
    c.width = pixels.width; c.height = pixels.height;
    c.getContext('2d').putImageData(pixels, 0, 0);
  }
  function bounds(pixels) {
    var p = pixels.data, b = [W, H, -1, -1], mass = 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var a = p[(y * W + x) * 4 + 3]; mass += a;
      if (a < 8) continue;
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    }
    return { alpha8Bounds: b, alphaMass: mass };
  }
  function difference(a, b, withImage) {
    if (a.width !== b.width || a.height !== b.height) throw new Error('Pixel comparison dimensions differ');
    var x = a.data, y = b.data, raw = 0, premul = 0, max = 0, maxPremul = 0;
    var alpha = 0, over8 = 0, pixels = a.width * a.height;
    var out = withImage ? new ImageData(a.width, a.height) : null;
    for (var i = 0; i < x.length; i += 4) {
      var aa = x[i + 3] / 255, ba = y[i + 3] / 255, pixelMax = 0;
      for (var c = 0; c < 4; c++) {
        var d = Math.abs(x[i + c] - y[i + c]);
        var dp = c === 3 ? d : Math.abs(x[i + c] * aa - y[i + c] * ba);
        raw += d; premul += dp; max = Math.max(max, d);
        maxPremul = Math.max(maxPremul, dp); pixelMax = Math.max(pixelMax, dp);
        if (c === 3) alpha += d;
        if (out && c < 3) out.data[i + c] = Math.min(255, Math.round(dp * 16));
      }
      if (pixelMax > 8) over8++;
      if (out) {
        var ad = Math.min(255, Math.abs(x[i + 3] - y[i + 3]) * 16);
        out.data[i] = Math.max(out.data[i], ad);
        out.data[i + 1] = Math.max(out.data[i + 1], ad);
        out.data[i + 2] = Math.max(out.data[i + 2], ad);
        out.data[i + 3] = 255;
      }
    }
    if (out) put(typeof withImage === 'string' ? withImage : 'difference-texture', out);
    return {
      rawRgbaMae: raw / (pixels * 4), rawRgbaMax: max,
      premultipliedRgbaMae: premul / (pixels * 4), premultipliedRgbaMax: maxPremul,
      alphaMae: alpha / pixels, pixelsOver8Fraction: over8 / pixels
    };
  }
  function compareArray(a, b) {
    if (!a || !b) return { pass: !a && !b, lengthBefore: a ? a.length : 0, lengthAfter: b ? b.length : 0 };
    var max = 0;
    if (a.length === b.length) for (var i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
    return { pass: a.length === b.length && Number.isFinite(max) && max <= 1e-4, lengthBefore: a.length, lengthAfter: b.length, maxAbs: max };
  }
  function compareGeometry(scene, prepared) {
    var checks = {}, meshes = scene.children.filter(function (o) { return o.isMesh; });
    var buildings = meshes.filter(function (m) { return m.geometry.type === 'BufferGeometry' && !m.geometry.attributes.uv; });
    var names = ['block', 'wh', 'host'].filter(function (k) { return prepared.buildings[k]; });
    checks.buildingGroups = { pass: buildings.length === names.length, before: buildings.length, after: names.length };
    names.forEach(function (name, i) {
      var before = buildings[i] && buildings[i].geometry.attributes, after = prepared.buildings[name];
      ['position', 'normal'].forEach(function (key) { checks[name + '.' + key] = compareArray(before && before[key] && before[key].array, after[key]); });
    });
    var routes = meshes.filter(function (m) { return m.geometry.type === 'TubeGeometry'; });
    checks.routeCount = { pass: routes.length === prepared.routes.length, before: routes.length, after: prepared.routes.length };
    prepared.routes.forEach(function (after, i) {
      var before = routes[i] && routes[i].geometry;
      ['position', 'normal', 'uv', 'color', 'index'].forEach(function (key) {
        var attr = before && (key === 'index' ? before.index : before.attributes[key]);
        checks['route' + i + '.' + key] = compareArray(attr && attr.array, after[key]);
      });
    });
    // The render observer restores the documented rest Y before rendering.
    var pin = meshes.find(function (m) { return m.geometry.type === 'SphereGeometry'; });
    checks.pinPosition = compareArray(pin && pin.position.toArray(), prepared.pinAt);
    return checks;
  }

  async function run(id) {
    id = id || new URLSearchParams(location.search).get('id') || 'fm-chekhov';
    if (AS.CLAY_IDS.indexOf(id) < 0) throw new Error('Unknown clay fixture: ' + id);
    if (typeof AS.prepareClay !== 'function') throw new Error('AS.prepareClay is unavailable');
    report.dataset.status = 'running'; report.textContent = 'Comparing ' + id + '…';
    var config = { id: id, frame: [280, 406], theme: theme, frameHex: '#111111' };
    var data = await fetch('data/clay/' + id + '.json').then(function (r) { if (!r.ok) throw new Error('Missing fixture ' + id); return r.json(); });
    var beforeData = JSON.stringify(data), beforeConfig = JSON.stringify(config);
    var originalGetContext = HTMLCanvasElement.prototype.getContext;
    var OriginalRenderer = THREE.WebGLRenderer, capturedGround = null, legacyScene = null, renderer = null;
    var currentRenderer = null, legacyRenderPixels = null, currentRenderPixels = null;
    var prepared = null, map = null, currentMap = null;
    var oldTop = Math.max.apply(null, data.b.filter(function (b) { return b.wh; }).map(function (b) { return b.h; }).concat([0]));

    function observingRenderer(current) {
      return function (opts) {
        var observed = new OriginalRenderer(opts);
        if (current) currentRenderer = observed; else renderer = observed;
        var realRender = observed.render;
        observed.render = function (scene, camera) {
          if (!current) legacyScene = scene;
          var pin = scene.children.find(function (m) { return m.isMesh && m.geometry.type === 'SphereGeometry'; });
          if (pin) pin.position.y = oldTop + 34;
          var result = realRender.call(observed, scene, camera);
          var copy = document.createElement('canvas');
          copy.width = observed.domElement.width; copy.height = observed.domElement.height;
          var context = copy.getContext('2d', { willReadFrequently: true });
          context.drawImage(observed.domElement, 0, 0);
          var pixels = context.getImageData(0, 0, copy.width, copy.height);
          if (current) currentRenderPixels = pixels; else legacyRenderPixels = pixels;
          return result;
        };
        return observed;
      };
    }
    try {
      HTMLCanvasElement.prototype.getContext = function (kind, opts) {
        var context = originalGetContext.apply(this, arguments);
        if (kind === '2d' && this.width === W && this.height === H && opts && opts.willReadFrequently) capturedGround = context;
        return context;
      };
      THREE.WebGLRenderer = observingRenderer(false);
      var legacyStart = performance.now();
      map = AS.LegacyClayMap(document.getElementById('legacy-host'), { theme: 'dark' });
      THREE.WebGLRenderer = OriginalRenderer;
      map.resize(280, 406);
      await map.load(id);
      if (!capturedGround) throw new Error('Archived 2048px ground canvas was not captured');
      var legacyPixels = capturedGround.getImageData(0, 0, W, H);
      var legacyMs = performance.now() - legacyStart;
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      put('legacy-texture', legacyPixels);

      var prepareStart = performance.now();
      prepared = await AS.prepareClay(data, config);
      var prepareMs = performance.now() - prepareStart;
      if (!prepared.ground || prepared.ground.width !== W || prepared.ground.height !== H) throw new Error('Unexpected prepared ground size');
      var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(prepared.ground, 0, 0);
      var bitmapPixels = ctx.getImageData(0, 0, W, H), normalPixels = new ImageData(W, H);
      for (var row = 0; row < H; row++) {
        var from = (H - row - 1) * W * 4;
        normalPixels.data.set(bitmapPixels.data.subarray(from, from + W * 4), row * W * 4);
      }
      put('prepared-texture', normalPixels);
      var metrics = difference(legacyPixels, normalPixels, true);
      var unflipped = difference(legacyPixels, bitmapPixels, false);
      var oldBounds = bounds(legacyPixels), newBounds = bounds(normalPixels);

      THREE.WebGLRenderer = observingRenderer(true);
      currentMap = AS.ClayMap(document.getElementById('current-host'), { theme: 'dark' });
      THREE.WebGLRenderer = OriginalRenderer;
      currentMap.resize(280, 406);
      var currentData = await currentMap.load(id);
      if (!currentData) throw new Error('Current ClayMap could not load ' + id);
      map.pointer(0, 0); currentMap.pointer(0, 0);
      var renderNow = performance.now();
      map.render(renderNow); currentMap.render(renderNow);
      if (!legacyRenderPixels || !currentRenderPixels) throw new Error('A real WebGL render was not captured');
      put('legacy-render', legacyRenderPixels); put('current-render', currentRenderPixels);
      var renderMetrics = difference(legacyRenderPixels, currentRenderPixels, 'render-difference');
      var geometry = compareGeometry(legacyScene, prepared);
      var checks = {
        inputDataUnchanged: JSON.stringify(data) === beforeData,
        inputConfigUnchanged: JSON.stringify(config) === beforeConfig,
        // Limits are fixed ahead of the run: <0.5/255 average visible drift,
        // <0.1% pixels differing by more than 8/255 in visible RGBA channels.
        visiblePixelFidelity: metrics.premultipliedRgbaMae <= .5 && metrics.pixelsOver8Fraction <= .001,
        alphaFidelity: metrics.alphaMae <= .5,
        edgeBounds: oldBounds.alpha8Bounds.every(function (v, i) { return Math.abs(v - newBounds.alpha8Bounds[i]) <= 2; }),
        alphaCoverage: Math.abs(oldBounds.alphaMass - newBounds.alphaMass) / Math.max(1, oldBounds.alphaMass) <= .005,
        orientation: metrics.premultipliedRgbaMae < unflipped.premultipliedRgbaMae,
        geometry: Object.keys(geometry).every(function (k) { return geometry[k].pass; }),
        fullRenderFidelity: renderMetrics.premultipliedRgbaMae <= .5 && renderMetrics.pixelsOver8Fraction <= .001,
        fullRenderAlpha: renderMetrics.alphaMae <= .5
      };
      return publish({
        pass: Object.keys(checks).every(function (k) { return checks[k]; }), id: id,
        frame: config.frame, checks: checks, metrics: metrics,
        uncorrectedFlipMae: unflipped.premultipliedRgbaMae,
        legacyAlpha: oldBounds, preparedAlpha: newBounds, geometry: geometry,
        fullRender: { width: legacyRenderPixels.width, height: legacyRenderPixels.height, metrics: renderMetrics },
        legacyBuildAndRasterMs: legacyMs, prepareMs: prepareMs,
        limits: { visibleMae: .5, alphaMae: .5, fractionOver8: .001, edgePixels: 2, relativeAlphaMass: .005 }
      });
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      THREE.WebGLRenderer = OriginalRenderer;
      if (prepared && prepared.ground) prepared.ground.close();
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
      if (currentRenderer) { currentRenderer.dispose(); currentRenderer.forceContextLoss(); }
      document.getElementById('legacy-host').replaceChildren();
      document.getElementById('current-host').replaceChildren();
    }
  }
  window.clayParity = { run: run };
  window.clayParityPromise = run().catch(function (error) {
    return publish({ pass: false, error: String(error), stack: error.stack });
  });
})();
