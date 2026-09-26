/* bunnys.js: shared state and a tiny event bus for the BUNNyS cockpit */
(function () {
  'use strict';
  var mq = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  window.BUNNYS = {
    state: { yaw: 0, pitch: 0, booted: false, dragging: false },
    reduce: mq('(prefers-reduced-motion: reduce)'),
    fine: mq('(pointer: fine)'),
    wrap360: function (a) { return ((a % 360) + 360) % 360; },
    shortestDelta: function (from, to) { var d = window.BUNNYS.wrap360(to - from); return d > 180 ? d - 360 : d; },
    clamp: function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
    on: function (type, fn) { document.addEventListener('bunnys:' + type, function (e) { fn(e.detail || {}); }); },
    emit: function (type, detail) { document.dispatchEvent(new CustomEvent('bunnys:' + type, { detail: detail || {} })); }
  };
})();
