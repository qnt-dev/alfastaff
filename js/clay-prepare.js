/* Build a clay district away from the UI thread. The renderer owns materials,
   lighting and animation; this module owns immutable geometry and ground pixels. */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var BLEED = { x: 0.11, t: 0.06, b: 0.06 };

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function serialize(geometry) {
    var out = {};
    ['position', 'normal', 'uv', 'color'].forEach(function (name) {
      if (geometry.attributes[name]) out[name] = geometry.attributes[name].array;
    });
    if (geometry.index) out.index = geometry.index.array;
    geometry.dispose();
    return out;
  }

  AS.prepareClay = async function (D, config) {
    var T = root.THREE;
    if (!T || typeof root.OffscreenCanvas !== 'function' || typeof root.createImageBitmap !== 'function') {
      throw new Error('Clay preparation requires Three.js, OffscreenCanvas and ImageBitmap');
    }
    var TH = config.theme, S = D.size, F = D.far || S * 2, f = config.frame;
    var groundCol = TH.ground ? new T.Color(TH.ground) : new T.Color(config.frameHex).lerp(new T.Color('#ffffff'), TH.lift);
    var rest = new T.PerspectiveCamera(22, f[0] / f[1], 1, S * 20);
    var asp = Math.min(1, f[0] / f[1]);
    var fit = D.fit || S * 0.92, dist = fit / asp / Math.tan(T.MathUtils.degToRad(11)) * 0.98;
    var tilt = T.MathUtils.degToRad(38), yaw = -0.18;
    rest.position.set(Math.sin(yaw) * Math.sin(tilt) * dist, Math.cos(tilt) * dist, Math.cos(yaw) * Math.sin(tilt) * dist);
    rest.lookAt(0, 0, 0); rest.updateMatrixWorld();
    var sd = hash(config.id || 'clay');
    var ph = [0, 1, 2].map(function (i) { return ((sd >>> (i * 8)) & 255) / 255 * Math.PI * 2; });
    function edge(an) {
      var r = 1 + 0.12 * (0.45 * Math.sin(2 * an + ph[0]) + 0.3 * Math.sin(3 * an + ph[1]) + 0.25 * Math.sin(7 * an + ph[2]));
      return r - 0.16 * Math.pow(Math.max(0, Math.sin(an)), 6);
    }
    function sq(u, v) { return Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25); }
    function ndc(x, y, z) { var v = new T.Vector3(x, y, z).project(rest); return [v.x, -v.y]; }
    var margin = 0.09, UX = 1 + 2 * BLEED.x - margin, VT = -(1 + 2 * BLEED.t - margin), VB = 1 + 2 * BLEED.b - margin;
    // The input is also used by other views and cached by the caller. Projected
    // centers/radii belong to this frame, so never attach them to the source data.
    var keep = D.b.map(function (source) {
      return { p: source.p, h: source.h, wh: source.wh, host: source.host };
    }).filter(function (b) {
      if (b.wh || b.host) return true;
      var h = Math.max(3, b.h), cx = 0, cy = 0, n = 0, fits = true, qs = [];
      b.p.forEach(function (p) {
        [0, h].forEach(function (y) {
          var q = ndc(p[0], y, -p[1]); qs.push(q); cx += q[0]; cy += q[1]; n++;
          if (Math.abs(q[0]) > UX || q[1] < VT || q[1] > VB) fits = false;
        });
      });
      cx /= n; cy /= n; b.c = [cx, cy];
      b.r = Math.max.apply(null, qs.map(function (q) { return Math.hypot(q[0] - cx, q[1] - cy); }));
      var jit = ((hash(b.p[0][0].toFixed(1) + ',' + b.p[0][1].toFixed(1)) & 1023) / 1023 - 0.5) * 0.2;
      return fits && sq(cx, cy) < edge(Math.atan2(cy, cx)) + jit;
    });
    keep = keep.filter(function (b) {
      if (!b.c || sq(b.c[0], b.c[1]) < 0.85) return true;
      return keep.some(function (o) { return o !== b && o.c && Math.hypot(o.c[0] - b.c[0], o.c[1] - b.c[1]) - o.r - b.r < 0.07; });
    });
    var ray = new T.Raycaster(), gp = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3(), rim = [];
    for (var i = 0; i < 120; i++) {
      var an = i / 120 * Math.PI * 2, er = (edge(an) - 0.07) / sq(Math.cos(an), Math.sin(an));
      ray.setFromCamera(new T.Vector2(Math.cos(an) * er, -Math.sin(an) * er), rest);
      if (ray.ray.intersectPlane(gp, hit)) rim.push([hit.x, -hit.z]);
    }

    var N = 2048, tex = new root.OffscreenCanvas(N, N);
    var g = tex.getContext('2d', { willReadFrequently: true });
    if (!g || !('filter' in g)) throw new Error('Clay preparation requires Canvas2D filters');
    var k = N / (2 * F);
    function P(p) { return [N / 2 + p[0] * k, N / 2 - p[1] * k]; }
    function path(ctx, pts, dx, dy) {
      ctx.beginPath();
      pts.forEach(function (p, i) {
        var q = P(p), x = q[0] - dx, y = q[1] - dy;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
    }
    function poly(pts) { path(g, pts, 0, 0); g.fill(); }
    g.fillStyle = '#' + groundCol.getHexString(); g.fillRect(0, 0, N, N);
    g.fillStyle = TH.green; D.green.forEach(poly);
    if (D.water && D.water.length) {
      g.save(); g.beginPath();
      D.water.forEach(function (pts) {
        pts.forEach(function (p, i) { var q = P(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
        g.closePath();
      });
      g.fillStyle = '#' + groundCol.clone().lerp(new T.Color(TH.ground ? '#7f99a8' : '#000000'), TH.ground ? 0.35 : 0.6).getHexString();
      g.fill('evenodd'); g.clip('evenodd');
      g.lineWidth = Math.max(3, 4 * k); g.strokeStyle = 'rgba(255,255,255,' + (TH.ground ? .5 : .22) + ')'; g.stroke();
      g.lineWidth = Math.max(1, 1.2 * k); g.strokeStyle = 'rgba(255,255,255,.05)';
      for (var wy = 0; wy < N; wy += Math.max(6, 9 * k)) { g.beginPath(); g.moveTo(0, wy); g.lineTo(N, wy); g.stroke(); }
      g.restore();
    }
    g.strokeStyle = '#' + groundCol.clone().lerp(new T.Color(TH.road > 0 ? '#ffffff' : '#000000'), Math.abs(TH.road)).getHexString();
    g.lineCap = g.lineJoin = 'round';
    D.roads.forEach(function (r) {
      g.lineWidth = r.w * k; g.beginPath();
      r.p.forEach(function (p, i) { var q = P(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
      g.stroke();
    });
    // A filter on the entire 2048px destination incurred a full-size CPU blur
    // for every footprint. Filter only the affected pixels, then composite each
    // footprint in the original order: overlapping AO keeps its original alpha.
    var blur = Math.max(3, Math.round(5 * k)), pad = Math.ceil(blur * 4) + 2;
    var scratch = new root.OffscreenCanvas(1, 1), sg = scratch.getContext('2d', { willReadFrequently: true });
    if (!sg || !('filter' in sg)) throw new Error('Clay preparation requires Canvas2D filters');
    keep.forEach(function (b) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      b.p.forEach(function (p) {
        var q = P(p);
        minX = Math.min(minX, q[0]); minY = Math.min(minY, q[1]); maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]);
      });
      var left = Math.max(-pad, Math.floor(minX) - pad), top = Math.max(-pad, Math.floor(minY) - pad);
      var right = Math.min(N + pad, Math.ceil(maxX) + pad), bottom = Math.min(N + pad, Math.ceil(maxY) + pad);
      if (right <= left || bottom <= top) return;
      scratch.width = right - left; scratch.height = bottom - top;
      sg.filter = 'blur(' + blur + 'px)'; sg.fillStyle = TH.ao;
      path(sg, b.p, left, top); sg.fill();
      g.drawImage(scratch, left, top);
    });
    if (rim.length > 8) {
      g.save(); g.globalCompositeOperation = 'destination-in'; g.filter = 'blur(' + Math.round(14 * k) + 'px)';
      g.fillStyle = '#000'; poly(rim); g.restore();
    }

    var groups = { block: [], wh: [], host: [] }, buildings = {};
    keep.forEach(function (b) {
      var sh = new T.Shape();
      b.p.forEach(function (p, i) { if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
      var h = Math.max(3, b.h), bev = Math.min(1.2, h * 0.15);
      var geo = new T.ExtrudeGeometry(sh, { depth: h - bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 2 });
      geo.rotateX(-Math.PI / 2);
      groups[b.wh ? 'wh' : b.host ? 'host' : 'block'].push(geo);
    });
    Object.keys(groups).forEach(function (name) {
      var list = groups[name]; if (!list.length) return;
      var n = 0; list.forEach(function (geo) { n += geo.attributes.position.count; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), offset = 0;
      list.forEach(function (geo) {
        pos.set(geo.attributes.position.array, offset * 3); nor.set(geo.attributes.normal.array, offset * 3);
        offset += geo.attributes.position.count; geo.dispose();
      });
      buildings[name] = { position: pos, normal: nor };
    });
    var mode = D.mode || 'walk', pts = (D.route || []).map(function (p) { return new T.Vector3(p[0], 1.8, -p[1]); });
    var routes = [], fd = mode === 'drive', hostAt = null, awayAt = null;
    if (pts.length > 1) {
      var curve = new T.CatmullRomCurve3(pts, false, 'centripetal', 0.2), segs = Math.max(120, pts.length * 8), ra = [];
      for (var ri = 0; ri <= segs; ri++) {
        var cq = curve.getPointAt(ri / segs), q = ndc(cq.x, 0, cq.z), rr = sq(q[0], q[1]) / edge(Math.atan2(q[1], q[0]));
        var ru = Math.max(0, Math.min(1, (1 - rr) / 0.28)); ra.push(fd ? ru * ru * (3 - 2 * ru) : 1);
      }
      if (fd) {
        for (var lz = segs; lz >= 0 && ra[lz] > 0; lz--);
        for (var zi = 0; zi < lz; zi++) ra[zi] = 0;
      }
      [[2.2, 12], [7, 10]].forEach(function (params) {
        var rs = params[1], geo = new T.TubeGeometry(curve, segs, params[0], rs, false);
        if (fd) {
          var col = new Float32Array((segs + 1) * (rs + 1) * 4);
          for (var i = 0; i <= segs; i++) for (var j = 0; j <= rs; j++) {
            var o = (i * (rs + 1) + j) * 4; col[o] = col[o + 1] = col[o + 2] = 1; col[o + 3] = ra[i];
          }
          geo.setAttribute('color', new T.BufferAttribute(col, 4));
        }
        routes.push(serialize(geo));
      });
      if (fd) {
        for (var ai = 0; ai <= segs && ra[ai] < 0.97; ai++);
        if (ai <= segs) { var ap = curve.getPointAt(Math.min(1, (ai + segs * 0.04) / segs)); awayAt = [ap.x, 2, ap.z]; }
      } else { var a = pts[0]; hostAt = [a.x, 2, a.z]; }
    }
    var z = D.pin ? new T.Vector3(D.pin[0], 0, -D.pin[1]) : pts[pts.length - 1];
    if (!z) throw new Error('Clay district has neither a warehouse pin nor a route endpoint');
    var whTop = Math.max.apply(null, D.b.filter(function (b) { return b.wh; }).map(function (b) { return b.h; }).concat([0]));
    var pinHeight = whTop + 34;
    // ImageBitmap uploads ignore Texture.flipY/premultiplyAlpha. Bake those
    // upload conventions into the bitmap so the existing ground orientation stays.
    var ground = await root.createImageBitmap(tex, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
    return {
      size: S, far: F, fit: fit, ground: ground, buildings: buildings, routes: routes,
      routeFade: fd, hostAt: hostAt, awayAt: awayAt, pinAt: [z.x, pinHeight, z.z], pinHeight: pinHeight
    };
  };
})(typeof self !== 'undefined' ? self : window);
