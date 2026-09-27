/* boot.js: the index-only boot sequence. Drives BUNNYS.state.yaw/booted and #boot's own
   contents while state.booted is false; cockpit.js takes over once bunnys:boot-done fires. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var overlay = document.getElementById('boot');
  if (!BUNNYS || !overlay) { if (BUNNYS) BUNNYS.state.booted = true; return; }
  var logEl = document.getElementById('boot-log');
  var lines = [];
  var timers = [];
  var raf = null;
  var done = false;

  // .hud-draw is one-shot: hud.js adds heading-tape ticks on every view event, and any
  // tick created while the class is still on replays the draw-in, so it must come off.
  function drawHudOnce() {
    var hud = document.getElementById('hud');
    if (!hud) return;
    hud.classList.add('hud-draw');
    if (BUNNYS.reduce) { hud.classList.remove('hud-draw'); return; }
    setTimeout(function () { hud.classList.remove('hud-draw'); }, 1400);
  }

  // ONE boot clock drives the bar, the log and every scene effect. It advances with real
  // frames but never by more than CLOCK_MAX_STEP per frame, so a main-thread stall (a cold
  // open still rasterising the panorama) pauses the whole sequence instead of letting the
  // bar run on while the log's timers pile up and then fire as one block.
  var clock = 0, lastFrame = null, CLOCK_MAX_STEP = 50;
  function at(ms, fn) { timers.push({ t: clock + ms, fn: fn }); }
  function clearTimers() { timers = []; }
  function runClock(now) {
    if (done) return;
    if (lastFrame != null) clock += Math.min(CLOCK_MAX_STEP, now - lastFrame);
    lastFrame = now;
    var bar = overlay.querySelector('.boot-bar i');
    if (bar) bar.style.transform = 'scaleX(' + Math.min(1, clock / BAR_MS).toFixed(4) + ')';
    var due = timers.filter(function (t) { return t.t <= clock; });
    timers = timers.filter(function (t) { return t.t > clock; });
    due.forEach(function (t) { t.fn(); });
    requestAnimationFrame(runClock);
  }
  function render() { if (logEl) logEl.textContent = lines.join('\n'); }

  function onSkip() { finish(true); }

  function finish(instant) {
    if (done) return;
    done = true;
    clearTimers();
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onSkip);
    document.removeEventListener('click', onSkip);
    var ring = document.querySelector('.pano-ring');
    if (ring) ring.style.filter = '';
    var frameEl = document.getElementById('frame');
    if (frameEl) frameEl.classList.remove('seam-glow');
    var flickering = document.querySelectorAll('.pano-slice.boot-flicker');
    for (var i = 0; i < flickering.length; i++) flickering[i].classList.remove('boot-flicker');
    var hud = document.getElementById('hud');
    drawHudOnce();
    BUNNYS.state.yaw = 0;
    BUNNYS.state.booted = true;
    try { sessionStorage.setItem('bunnys-booted', '1'); } catch (e) {}
    BUNNYS.emit('boot-done', {});
    if (overlay.parentNode) {
      if (instant || BUNNYS.reduce) overlay.remove();
      else { overlay.classList.add('boot-out'); setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 350); }
    }
  }

  var already = false;
  // Skip only when returning from our own pages; sessionStorage alone would also skip
  // the intro on a plain reload from an external referrer.
  var fromInside = /\/(pilot|missions|hangar|index)\.html/.test(document.referrer || '');
  try { already = fromInside && sessionStorage.getItem('bunnys-booted') === '1'; } catch (e) {}
  if (BUNNYS.reduce || already) { finish(true); return; }

  // BAR_MS must match cockpit.css's `#boot.is-booting .boot-bar i` animation-duration.
  var BAR_MS = 3000;
  // 16 log lines but 15 gaps between them, so line 15 (DEPLOYMENT READY) lands exactly
  // at BAR_MS -- the moment the bar reaches 100%.
  var LOG_STEP = BAR_MS / 15;
  var FLICKER_AT = 1050;
  var WHIP_AT = 1750;
  var HUD_AT = 2550;
  var LOCK_AT = 3050;
  var CALLSIGN_AT = 3300;
  var FINISH_AT = 3800;

  // Start once the page has loaded and painted twice, so the heaviest first-frame work is
  // behind us; until then the splash shows with an empty bar.
  function start() {
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      try { run(); requestAnimationFrame(runClock); } catch (e) { finish(true); }
    }); });
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', start);

  function run() {
    document.addEventListener('keydown', onSkip);
    document.addEventListener('click', onSkip);

    // Added here, not at first paint, so the bar and the log both run on this
    // function's clock and stay in sync with each other.
    overlay.classList.add('is-booting');

    var cursor = document.createElement('span');
    cursor.className = 'boot-cursor';
    cursor.style.cssText = 'position:fixed;left:24px;bottom:24px;width:10px;height:18px;background:var(--hud,#8CFFC1);';
    overlay.appendChild(cursor);

    var LOG = [
      'BUNNyS OS 2.6.1 // SYSTEM BOOT',
      'CORE BLOCK ........... LOCKED',
      'LINEAR SEAT .......... LOCKED',
      'REACTOR STATUS ....... {P}% ▲',
      'PARTICLE INTERFERENCE  0.2%',
      'PANORAMIC MONITOR .... INIT',
      'SENSOR ARRAY ......... 11,200 M',
      'THRUSTER VECTOR ...... ALIGNED',
      'FRAME INTEGRITY ...... 84%',
      'WEAPON LINK .......... SAFE',
      'HARDPOINT STATUS ..... 2 OF 4',
      'IFF STATUS ........... ACTIVE',
      'COMBAT SYSTEM ........ STANDBY',
      'CALIBRATION .......... COMPLETE',
      'PILOT ID ............. SYLAS LYU',
      'DEPLOYMENT READY'
    ];
    LOG.forEach(function (line, i) {
      at(i * LOG_STEP, function () {
        var idx = lines.length;
        lines.push(line.indexOf('{P}') > -1 ? line.replace('{P}', '12') : line);
        render();
        if (line.indexOf('{P}') > -1) countReactor(idx, line);
      });
    });
    function countReactor(idx, template) {
      var t0 = clock;
      var dur = 1200;   // its own window, on the boot clock like everything else
      (function step() {
        if (done) return;
        var p = Math.min(1, (clock - t0) / dur);
        lines[idx] = template.replace('{P}', String(Math.round(12 + p * 88)));
        render();
        if (p < 1) requestAnimationFrame(step);
      })();
    }

    at(FLICKER_AT, function () {
      var frameEl = document.getElementById('frame');
      if (frameEl) frameEl.classList.add('seam-glow');
      // Only a scattered subset of slices, never all ~360: animating a filter across
      // the whole tile stalls the main thread, and a partial scatter reads the same.
      var slices = Array.prototype.slice.call(
        document.querySelectorAll('.pano-slice:not(.pole-top):not(.pole-bot)'));
      var order = slices.map(function (_, i) { return i; });
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      }
      order = order.slice(0, 56);
      var span = 700, n = order.length;
      order.forEach(function (idx, k) {
        at(Math.floor(k * span / n), function () {
          var el = slices[idx];
          if (!el) return;
          el.classList.add('boot-flicker');
          at(220, function () { el.classList.remove('boot-flicker'); });
        });
      });
    });

    at(WHIP_AT, function () {
      // No blur() on .pano-ring: it re-rasterises the whole 360-tile sphere every frame
      // and stalls the main thread; a 300deg/s whip already reads as fast without it.
      var t0 = clock, dur = 800;
      function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
      function step() {
        var p = Math.min(1, (clock - t0) / dur);
        BUNNYS.state.yaw = ease(p) * 360;
        if (p < 1) raf = requestAnimationFrame(step);
        else { BUNNYS.state.yaw = 0; raf = null; }
      }
      raf = requestAnimationFrame(step);
    });

    at(HUD_AT, function () {
      var hud = document.getElementById('hud');
      drawHudOnce();
    });

    at(LOCK_AT, function () {
      BUNNYS.emit('face', { yaw: 0 });
      var t = document.getElementById('t-missions');
      BUNNYS.emit('lock', { id: 't-missions', label: t ? t.dataset.label : 'MISSIONS', readout: t ? t.dataset.readout : '' });
    });
    at(CALLSIGN_AT, function () {
      BUNNYS.emit('lock', { id: null, label: '', readout: '' });
      var cs = document.createElement('p');
      cs.className = 'boot-callsign';
      cs.textContent = 'SYLAS LYU';
      cs.style.cssText = 'position:fixed;right:24px;bottom:24px;margin:0;font:700 20px "B612",sans-serif;' +
        'color:var(--hud,#8CFFC1);opacity:0;transition:opacity .15s;';
      overlay.appendChild(cs);
      requestAnimationFrame(function () {
        cs.style.opacity = '1';
        setTimeout(function () { cs.style.opacity = '0'; }, 260);
      });
    });
    at(FINISH_AT, function () { finish(false); });
  }
})();
