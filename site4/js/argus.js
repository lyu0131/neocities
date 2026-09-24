/* argus.js: shared state and a tiny event bus for the ARGUS cockpit */
(function () {
  'use strict';
  var mq = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  window.ARGUS = {
    state: { yaw: 0, pitch: 0, booted: false },
    reduce: mq('(prefers-reduced-motion: reduce)'),
    fine: mq('(pointer: fine)'),
    on: function (type, fn) { document.addEventListener('argus:' + type, function (e) { fn(e.detail || {}); }); },
    emit: function (type, detail) { document.dispatchEvent(new CustomEvent('argus:' + type, { detail: detail || {} })); }
  };
})();
