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
    pad: function (n, w) { return ('000' + n).slice(-w); },
    // The cockpit's contacts, in key order (1-5, Q/E): the one table the sub-page scope, the
    // number keys and the shutter labels read. index.html's .target data-yaw/data-label must match
    // (tests/hub.test.js holds them together).
    contacts: [
      { id: 't-pilot', page: 'pilot', code: 'PIL', label: 'PILOT', yaw: -52, rng: '0.4 KM' },
      { id: 't-missions', page: 'missions', code: 'MIS', label: 'MISSIONS', yaw: 0, rng: '1.2 KM' },
      { id: 't-hangar', page: 'hangar', code: 'HGR', label: 'HANGAR', yaw: 52, rng: '0.1 KM' },
      { id: 't-manual', page: 'manual', code: 'MAN', label: 'FIELD MANUAL', yaw: 104, rng: '0.2 KM' },
      { id: 't-unknown', page: null, code: 'UNK', label: 'UNKNOWN', yaw: 180 }
    ],
    // Whether a keydown is the page's to handle: no modifier, nobody handled it, not typing.
    keyable: function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return false;
      var t = e.target;
      return !(t && t.closest && t.closest('input, textarea, select, [contenteditable]'));
    },
    // The pilot log: badges a visitor earns by exploring, kept in their browser (pagehud.js shows them).
    // log(id) records one and says whether it was new; logged() lists them.
    logged: function () { try { return JSON.parse(localStorage.getItem('bunnys-log') || '[]'); } catch (e) { return []; } },
    log: function (id) {
      var got = window.BUNNYS.logged();
      if (got.indexOf(id) >= 0) return false;
      got.push(id);
      try { localStorage.setItem('bunnys-log', JSON.stringify(got)); } catch (e) { return false; }
      return true;
    },
    on: function (type, fn) { document.addEventListener('bunnys:' + type, function (e) { fn(e.detail || {}); }); },
    emit: function (type, detail) { document.dispatchEvent(new CustomEvent('bunnys:' + type, { detail: detail || {} })); }
  };
})();
