/* Integration test: a real 3D map must leave the UI heartbeat running while
   loading both new and previously visited objects. No renderer mocks. */
(function () {
  'use strict';
  var map = AS.ClayMap(document.querySelector('.map'), { theme: 'dark' });
  map.resize(280, 406);
  var running = false, last = 0, gaps = [], errors = [], tasks = [], shown = [];
  var observer = new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (e) { tasks.push({ start: e.startTime, duration: e.duration }); });
  });
  observer.observe({ type: 'longtask' });
  window.addEventListener('error', function (e) { errors.push(e.message); });
  function frame(now) {
    if (!running) return;
    if (last) gaps.push(now - last);
    last = now;
    map.render(now);
    requestAnimationFrame(frame);
  }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  window.clayRegression = {
    map: map,
    run: async function (ids) {
      ids = ids || ['fm-elektrougli', 'wurth', 'fm-elektrougli'];
      errors = []; gaps = []; tasks = []; shown = []; last = 0; running = true;
      requestAnimationFrame(frame);
      await wait(150);
      for (var i = 0; i < ids.length; i++) {
        var start = performance.now(), data = await map.load(ids[i]);
        await wait(400);
        await new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); });
        var p = map.points();
        shown.push({ id: ids[i], ready: !!data, duration: performance.now() - start,
          hasMarker: !!(p && p.wh && p.wh.every(Number.isFinite)) });
      }
      running = false;
      var result = { shown: shown, maxFrameGap: Math.max.apply(null, gaps),
        maxTask: Math.max.apply(null, [0].concat(tasks.map(function (e) { return e.duration; }))), errors: errors };
      result.pass = shown.every(function (x) { return x.ready && x.hasMarker; }) && !errors.length && result.maxFrameGap < 150 && result.maxTask < 150;
      document.querySelector('#result').textContent = JSON.stringify(result, null, 2);
      if (!result.pass) throw new Error('Clay responsiveness regression: ' + JSON.stringify(result));
      return result;
    }
  };
})();
