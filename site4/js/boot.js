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

  // .hud-draw is a ONE-SHOT intro: it animates every stroke inside #hud. hud.js rebuilds
  // the heading ticks and ladder rungs on every view event, so if the class is left on,
  // each newly created element re-matches the rule and restarts the 1.1s draw-in -- the
  // tape and ladder then look like they are perpetually reloading. Drop it once it ends.
  function drawHudOnce() {
    var hud = document.getElementById('hud');
    if (!hud) return;
    hud.classList.add('hud-draw');
    if (BUNNYS.reduce) { hud.classList.remove('hud-draw'); return; }
    setTimeout(function () { hud.classList.remove('hud-draw'); }, 1400);
  }

  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function render() { if (logEl) logEl.textContent = lines.join('\n'); }

  function onSkip() { finish(true); }

  // t=FINISH_AT (or immediately): hand the page over to cockpit.js/fx.js
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
  // Only skip when arriving back from one of our own pages. Gating on the session key
  // alone meant the sequence played once per tab and never again on reload, which reads
  // as "the boot does not work".
  var fromInside = /\/(pilot|missions|hangar|index)\.html/.test(document.referrer || '');
  try { already = fromInside && sessionStorage.getItem('bunnys-booted') === '1'; } catch (e) {}
  if (BUNNYS.reduce || already) { finish(true); return; }

  // One clock, owned entirely by run(): the splash+bar play alone, then the log phase.
  // BAR_MS must match cockpit.css's `#boot.is-booting .boot-bar i` animation-duration.
  var BAR_MS = 1100;
  // Splash fade-out length; must match cockpit.css's .boot-splash transition. LOG_START
  // adds a buffer past the fade so the log never starts while a sample could still catch
  // the splash mid-fade (the owner's whole complaint was the two overlapping).
  var FADE_MS = 200;
  var LOG_START = BAR_MS + FADE_MS + 150;
  var LOG_STEP = 130;
  var FLICKER_AT = 1900;
  var WHIP_AT = 2500;
  var HUD_AT = 3300;
  var LOCK_AT = 3500;
  var CALLSIGN_AT = 3700;
  var FINISH_AT = 4000;

  try { run(); } catch (e) { finish(true); }

  function run() {
    document.addEventListener('keydown', onSkip);
    document.addEventListener('click', onSkip);

    // t=0: the splash+bar play alone. Adding this class here -- not first paint -- is
    // the actual fix: the bar used to animate on the page's own paint clock while
    // everything else ran on this function's clock (which starts late, after hud.js,
    // cockpit.js and the 60KB dmgmap.js have loaded), so the log used to start partway
    // through a bar that was already moving.
    overlay.classList.add('is-booting');
    var splash = overlay.querySelector('.boot-splash');

    // t=BAR_MS: the bar completes. Fade the splash out; only once it's clear does the
    // log phase start (below) -- the owner explicitly didn't want the two on screen
    // together.
    at(BAR_MS, function () {
      if (splash) splash.classList.add('boot-splash-out');
    });
    at(LOG_START, function () {
      if (splash) splash.style.display = 'none';

      // blinking cursor, lower left (self-contained, no cockpit.css dependency)
      var cursor = document.createElement('span');
      cursor.className = 'boot-cursor';
      cursor.style.cssText = 'position:fixed;left:24px;bottom:24px;width:10px;height:18px;background:var(--hud,#8CFFC1);';
      overlay.appendChild(cursor);
    });

    // Boot log, one line every LOG_STEP starting at LOG_START, so all 16 lines arrive
    // while the scene effects below play out behind it.
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
      at(LOG_START + i * LOG_STEP, function () {
        var idx = lines.length;
        lines.push(line.indexOf('{P}') > -1 ? line.replace('{P}', '12') : line);
        render();
        if (line.indexOf('{P}') > -1) countReactor(idx, line);
      });
    });
    function countReactor(idx, template) {
      var t0 = performance.now();
      var dur = 1200;   // its own window now that the roll is spread out
      (function step() {
        if (done) return;
        var p = Math.min(1, (performance.now() - t0) / dur);
        lines[idx] = template.replace('{P}', String(Math.round(12 + p * 88)));
        render();
        if (p < 1) requestAnimationFrame(step);
      })();
    }

    // FLICKER_AT-WHIP_AT: monitor panels flicker on in scattered order
    at(FLICKER_AT, function () {
      // the frame seams glow green as the panels light, then settle (css owns the look)
      var frameEl = document.getElementById('frame');
      if (frameEl) frameEl.classList.add('seam-glow');
      // Only the image bands, and only some of them. A filter animation forces the tile's
      // big background to re-rasterise, so running it across all ~360 slices stalled the
      // main thread for most of this window. A scattered subset reads the same.
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

    // WHIP_AT-HUD_AT: 360 whip. Drive BUNNYS.state.yaw directly (cockpit.js renders it
    // while booted is false).
    at(WHIP_AT, function () {
      // No motion blur: blur() on .pano-ring re-rasterises the whole 360-tile sphere every
      // frame of the spin, and it was the single worst stall in the sequence. A 300deg/s
      // whip already reads as fast without it.
      var t0 = performance.now(), dur = 800;
      function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
      function step(now) {
        var p = Math.min(1, (now - t0) / dur);
        BUNNYS.state.yaw = ease(p) * 360;
        if (p < 1) raf = requestAnimationFrame(step);
        else { BUNNYS.state.yaw = 0; raf = null; }
      }
      raf = requestAnimationFrame(step);
    });

    // HUD_AT-LOCK_AT: HUD draw-in
    at(HUD_AT, function () {
      var hud = document.getElementById('hud');
      drawHudOnce();
    });

    // LOCK_AT-FINISH_AT: lock ping on MISSIONS, callsign flash, then fade
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
