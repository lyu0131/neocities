/* boot.js: the index-only boot sequence. Drives ARGUS.state.yaw/booted and #boot's own
   contents while state.booted is false; cockpit.js takes over once argus:boot-done fires. */
(function () {
  'use strict';
  var ARGUS = window.ARGUS;
  var overlay = document.getElementById('boot');
  if (!ARGUS || !overlay) { if (ARGUS) ARGUS.state.booted = true; return; }
  var logEl = document.getElementById('boot-log');
  var lines = [];
  var timers = [];
  var raf = null;
  var blinkTimer = null;
  var done = false;

  // .hud-draw is a ONE-SHOT intro: it animates every stroke inside #hud. hud.js rebuilds
  // the heading ticks and ladder rungs on every view event, so if the class is left on,
  // each newly created element re-matches the rule and restarts the 1.1s draw-in -- the
  // tape and ladder then look like they are perpetually reloading. Drop it once it ends.
  function drawHudOnce() {
    var hud = document.getElementById('hud');
    if (!hud) return;
    hud.classList.add('hud-draw');
    if (ARGUS.reduce) { hud.classList.remove('hud-draw'); return; }
    setTimeout(function () { hud.classList.remove('hud-draw'); }, 1400);
  }

  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function render() { if (logEl) logEl.textContent = lines.join('\n'); }

  function onSkip() { finish(true); }

  // t=6200 (or immediately): hand the page over to cockpit.js/fx.js
  function finish(instant) {
    if (done) return;
    done = true;
    clearTimers();
    if (raf) cancelAnimationFrame(raf);
    if (blinkTimer) clearInterval(blinkTimer);
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
    ARGUS.state.yaw = 0;
    ARGUS.state.booted = true;
    try { sessionStorage.setItem('argus-booted', '1'); } catch (e) {}
    ARGUS.emit('boot-done', {});
    if (overlay.parentNode) {
      if (instant || ARGUS.reduce) overlay.remove();
      else { overlay.classList.add('boot-out'); setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 350); }
    }
  }

  var already = false;
  try { already = sessionStorage.getItem('argus-booted') === '1'; } catch (e) {}
  if (ARGUS.reduce || already) { finish(true); return; }

  try { run(); } catch (e) { finish(true); }

  function run() {
    document.addEventListener('keydown', onSkip);
    document.addEventListener('click', onSkip);

    // t=0: blinking cursor, lower left (self-contained, no cockpit.css dependency)
    var cursor = document.createElement('span');
    cursor.className = 'boot-cursor';
    cursor.style.cssText = 'position:fixed;left:24px;bottom:24px;width:10px;height:18px;background:var(--hud,#8CFFC1);';
    overlay.appendChild(cursor);
    var blinkOn = true;
    blinkTimer = setInterval(function () { blinkOn = !blinkOn; cursor.style.opacity = blinkOn ? '1' : '0'; }, 500);

    // t=300-1900: boot log, one line every ~180ms; the reactor % counts up in place
    var LOG = [
      'ARGUS SL-01 // COLD START',
      'LINEAR SEAT ........ LOCKED',
      'REACTOR ............ {P}% ▲',
      'PARTICLE INTERFERENCE ... 0.2%',
      'ALL-AROUND MONITOR .. INIT',
      'PILOT BIOMETRIC ..... MATCH',
      'CALLSIGN ............ SYLAS LYU'
    ];
    LOG.forEach(function (line, i) {
      at(300 + i * 180, function () {
        var idx = lines.length;
        lines.push(line.indexOf('{P}') > -1 ? line.replace('{P}', '12') : line);
        render();
        if (line.indexOf('{P}') > -1) countReactor(idx, line, 300 + i * 180);
      });
    });
    function countReactor(idx, template, startAt) {
      var t0 = performance.now();
      var dur = Math.max(1900 - startAt, 200);
      (function step() {
        if (done) return;
        var p = Math.min(1, (performance.now() - t0) / dur);
        lines[idx] = template.replace('{P}', String(Math.round(12 + p * 88)));
        render();
        if (p < 1) requestAnimationFrame(step);
      })();
    }

    // t=1900-3100: 24 monitor slices flicker on in scattered order
    at(1900, function () {
      // the frame seams glow green as the panels light, then settle (css owns the look)
      var frameEl = document.getElementById('frame');
      if (frameEl) frameEl.classList.add('seam-glow');
      var slices = Array.prototype.slice.call(document.querySelectorAll('.pano-slice'));
      var order = slices.map(function (_, i) { return i; });
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      }
      var span = 1200, n = order.length;
      order.forEach(function (idx, k) {
        at(Math.floor(k * span / n), function () {
          var el = slices[idx];
          if (!el) return;
          el.classList.add('boot-flicker');
          at(220, function () { el.classList.remove('boot-flicker'); });
        });
      });
    });

    // t=3100-4300: 360 whip. Drive ARGUS.state.yaw directly (cockpit.js renders it while
    // booted is false); the ring's blur filter is ours to drive here since it tracks the tween.
    at(3100, function () {
      var ring = document.querySelector('.pano-ring');
      var t0 = performance.now(), dur = 1200;
      function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
      function step(now) {
        var p = Math.min(1, (now - t0) / dur);
        ARGUS.state.yaw = ease(p) * 360;
        if (ring) ring.style.filter = 'blur(' + (Math.sin(p * Math.PI) * 10).toFixed(1) + 'px)';
        if (p < 1) raf = requestAnimationFrame(step);
        else { ARGUS.state.yaw = 0; if (ring) ring.style.filter = ''; raf = null; }
      }
      raf = requestAnimationFrame(step);
    });

    // t=4300-5400: HUD draw-in
    at(4300, function () {
      var hud = document.getElementById('hud');
      drawHudOnce();
    });

    // t=5400-6200: lock ping on MISSIONS, callsign flash, then fade
    at(5400, function () {
      ARGUS.emit('face', { yaw: 0 });
      var t = document.getElementById('t-missions');
      ARGUS.emit('lock', { id: 't-missions', label: t ? t.dataset.label : 'MISSIONS', readout: t ? t.dataset.readout : '' });
    });
    at(5750, function () {
      ARGUS.emit('lock', { id: null, label: '', readout: '' });
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
    at(6200, function () { finish(false); });
  }
})();
