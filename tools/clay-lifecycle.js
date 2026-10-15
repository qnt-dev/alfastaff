/* Real worker / renderer checks. Only network timing and worker failure are
   controlled; geometry, rasterisation, caching and resource release are real. */
(function () {
  'use strict';
  function assert(ok, message) { if (!ok) throw new Error(message); }
  window.clayLifecycle = async function () {
    var map = clayRegression.map, NativeWorker = window.Worker, nativePost = NativeWorker.prototype.postMessage;
    var nativeClose = ImageBitmap.prototype.close, nativeFetch = window.fetch;
    var jobs = [], alive = new Set(), attached = new WeakSet(), maxAlive = 0, posted = null, checks = [];
    NativeWorker.prototype.postMessage = function (message) {
      if (message.config) {
        jobs.push(message.config);
        if (!attached.has(this)) {
          attached.add(this);
          this.addEventListener('message', function (event) {
            var bmp = event.data.prepared && event.data.prepared.ground;
            if (bmp && bmp.width) { alive.add(bmp); maxAlive = Math.max(maxAlive, alive.size); }
          });
        }
      }
      var out = nativePost.apply(this, arguments);
      if (posted) { var resolve = posted; posted = null; resolve(); }
      return out;
    };
    ImageBitmap.prototype.close = function () { alive.delete(this); return nativeClose.apply(this, arguments); };
    try {
      assert(await map.load('fm-chekhov'), 'First load failed');
      var count = jobs.length;
      assert(await map.load('fm-chekhov'), 'Repeat load failed');
      assert(jobs.length === count, 'Repeat load rebuilt the same resources');
      checks.push('warm resource reuse');
      for (var id of ['ym-tarny', 'wurth', 'major']) assert(await map.load(id), 'Cache fill failed: ' + id);
      assert(maxAlive <= 3, 'Prepared image cache grew without bound: ' + maxAlive);
      count = jobs.length;
      assert(await map.load('fm-chekhov'), 'Evicted district did not reload');
      assert(jobs.length === count + 1, 'Oldest inactive resources were not evicted');
      checks.push('bounded cache and bitmap disposal');

      var release;
      var held = new Promise(function (resolve) { release = resolve; });
      window.fetch = function (url) {
        var args = arguments;
        if (String(url).includes('/ym-sofyino.json')) return held.then(function () { return nativeFetch.apply(window, args); });
        return nativeFetch.apply(window, args);
      };
      var slow = map.load('ym-sofyino');
      assert(await map.load('wurth'), 'New selection failed');
      release();
      assert(await slow === null, 'Late network reply replaced the newer selection');
      window.fetch = nativeFetch;
      checks.push('late network response discarded');

      var started = new Promise(function (resolve) { posted = resolve; });
      slow = map.load('fm-elektrougli');
      await started;
      var latest = map.load('ym-tarny');
      assert(await slow === null, 'Superseded worker result was committed');
      assert(await latest, 'Selection after cancelling a worker failed');
      checks.push('in-flight worker cancellation');

      started = new Promise(function (resolve) { posted = resolve; });
      var resized = map.load('lemana-kinel');
      await started;
      map.resize(300, 390);
      assert(await resized, 'Resize during preparation failed');
      var last = jobs[jobs.length - 1];
      assert(last.frame[0] === 300 && last.frame[1] === 390, 'Old frame committed after resize');
      checks.push('resize during preparation');
      assert(await map.setTheme('light'), 'Light theme preparation failed');
      assert(jobs[jobs.length - 1].theme.ground === '#e8e2d7', 'Wrong theme prepared');
      assert(await map.setTheme('dark'), 'Dark theme restoration failed');
      checks.push('theme cache separation');

      window.fetch = function (url) {
        if (String(url).includes('/splat.json')) return Promise.resolve(new Response('', { status: 503 }));
        return nativeFetch.apply(window, arguments);
      };
      assert(await map.load('splat') === null && !map.has('splat'), 'Missing data cannot fall back to the flat map');
      assert(await map.load('fm-chekhov'), 'Failed load poisoned other objects');
      checks.push('network failure fallback and recovery on another object');
      window.fetch = nativeFetch;

      window.Worker = undefined;
      var host = document.createElement('div');
      var unsupported = AS.ClayMap(host);
      assert(!unsupported.has('fm-chekhov') && await unsupported.load('fm-chekhov') === null, 'Unsupported worker path does not expose flat-map fallback');
      window.Worker = NativeWorker;
      checks.push('unsupported worker fallback');
      return { pass: true, checks: checks, preparedJobs: jobs.length, maxTrackedBitmaps: maxAlive };
    } finally {
      window.fetch = nativeFetch; window.Worker = NativeWorker;
      NativeWorker.prototype.postMessage = nativePost; ImageBitmap.prototype.close = nativeClose;
    }
  };
})();
