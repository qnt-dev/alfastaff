/* One worker prepares geometry and the full-resolution ground texture; only
   transferables cross back to the renderer, avoiding another large memory copy. */
'use strict';
var startupError = null;
try {
  importScripts(
    new URL('../assets/vendor/three.min.js', self.location.href).href,
    new URL('clay-prepare.js' + self.location.search, self.location.href).href
  );
} catch (error) { startupError = error; }

self.onmessage = async function (event) {
  var request = event.data, prepared = null;
  try {
    if (startupError) throw startupError;
    prepared = await self.AS.prepareClay(request.data, request.config);
    var transfer = [prepared.ground], buffers = new Set();
    Object.keys(prepared.buildings).map(function (key) { return prepared.buildings[key]; }).concat(prepared.routes).forEach(function (geometry) {
      Object.keys(geometry).forEach(function (key) {
        var buffer = geometry[key].buffer;
        if (buffer && !buffers.has(buffer)) { buffers.add(buffer); transfer.push(buffer); }
      });
    });
    self.postMessage({ id: request.id, prepared: prepared }, transfer);
  } catch (error) {
    if (prepared && prepared.ground) prepared.ground.close();
    self.postMessage({ id: request.id, error: error && error.message ? error.message : String(error) });
  }
};
