/* cockpit.js: the 360 view engine — cylinder, input, targets, lock-on */
(function () {
  'use strict';
  var ARGUS = window.ARGUS;
  var state = ARGUS.state;
  var root = document.documentElement;
  var pano = document.getElementById('pano');
  var ring = pano.querySelector('.pano-ring');
  var targets = Array.prototype.slice.call(ring.querySelectorAll('.target'));
  var nav = document.getElementById('targets-nav');
  var navLinks = Array.prototype.slice.call(nav.querySelectorAll('a[data-target]'));
  var lockStatus = document.getElementById('lock-status');
  var tiltBtn = document.getElementById('tilt');

  var SLICES = 24, SLICE_DEG = 15, HALF_SLICE = SLICE_DEG / 2;
  var sliceEls = [];
  var sliceW = 0, R = 0;

  // .pano-ring sits at z~0 (its children are pushed back via translateZ), so its own flat
  // box is nearer the camera than everything inside it and swallows hover/click before they
  // reach .target — CSS gives .target pointer-events:auto for exactly this pairing, so ring
  // (and slices, which inherit) need pointer-events:none.
  ring.style.pointerEvents = 'none';

  function wrap360(a) { return ((a % 360) + 360) % 360; }
  function shortestDelta(from, to) { var d = wrap360(to - from); if (d > 180) d -= 360; return d; }
  function clampPitch(p) { return Math.max(-12, Math.min(12, p)); }

  // build the 24 slices once, ahead of the existing .target children. CSS owns their
  // size, background-image and background-size (via --slice-w); we only own transform
  // and background-position-x.
  (function buildSlices() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < SLICES; i++) {
      var el = document.createElement('div');
      el.className = 'pano-slice';
      frag.appendChild(el);
      sliceEls.push(el);
    }
    ring.insertBefore(frag, ring.firstChild);
  })();

  // sliceW: the resolved pixel width of a slice, which CSS sizes from --slice-w on
  // #pano (default 27vh — 0.27x viewport height, i.e. the strip's 2000px maps to
  // ~1.35x viewport height). Read the computed box, not the custom property string,
  // so vh/vw/% units resolve correctly; fall back if CSS hasn't sized it yet.
  function readSliceW() {
    var w = sliceEls.length ? parseFloat(getComputedStyle(sliceEls[0]).width) : NaN;
    return isFinite(w) && w > 0 ? w : innerHeight * 0.27;
  }

  // radius R = sliceW / (2*tan(7.5deg)); slice i sits at rotateY(-i*15) translateZ(-R).
  // The angles are negated so that increasing yaw (turning right) slides the scene left
  // and a target at +52deg appears to the RIGHT, matching the heading tape. Mirroring the
  // ring with scaleX(-1) would also fix the handedness but reverses the CSS label text.
  // and shows pano content [i*sliceW, (i+1)*sliceW), so it's centred on content
  // (i+0.5)*sliceW — the ring's own rotateY corrects for that half-slice offset so
  // the DESIGN.md yaw->x mapping (yaw 0 = x0, yaw 180 = x4800) holds exactly.
  function layout() {
    sliceW = readSliceW();
    R = sliceW / (2 * Math.tan(HALF_SLICE * Math.PI / 180));
    for (var i = 0; i < SLICES; i++) {
      var el = sliceEls[i];
      el.style.backgroundPositionX = (-(i * sliceW)) + 'px';
      el.style.transform = 'rotateY(' + (-i * SLICE_DEG) + 'deg) translateZ(' + (-R) + 'px)';
    }
    targets.forEach(function (t) {
      var dy = parseFloat(t.dataset.yaw) || 0;
      t.style.transform = 'rotateY(' + (HALF_SLICE - dy) + 'deg) translateZ(' + (-R + 40) + 'px)';
    });
  }
  layout();
  var resizeTimer = null;
  addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 150); });

  // ring rotation: yaw - 7.5deg corrects the half-slice offset above
  function applyRing(yaw, pitch) {
    var t = 'rotateX(' + pitch.toFixed(2) + 'deg) rotateY(' + (yaw - HALF_SLICE).toFixed(2) + 'deg)';
    if (firing) {
      var p = Math.min(1, (performance.now() - fireStart) / 280);
      t += ' scale(' + (1 + p * 0.5).toFixed(3) + ')'; // boot.js owns filter on .pano-ring; we only scale
    }
    ring.style.transform = t;
  }

  var lastEmit = null;
  function emitView(yaw, pitch, vx, vy) {
    root.style.setProperty('--yaw', yaw.toFixed(2) + 'deg');
    root.style.setProperty('--pitch', pitch.toFixed(2) + 'deg');
    if (!lastEmit || Math.abs(lastEmit.yaw - yaw) > 0.01 || Math.abs(lastEmit.pitch - pitch) > 0.01) {
      lastEmit = { yaw: yaw, pitch: pitch };
      ARGUS.emit('view', { yaw: yaw, pitch: pitch, vx: vx || 0, vy: vy || 0 });
    }
  }

  // -- lock-on: a single event-driven source of truth so boot.js's own argus:lock
  // (the MISSIONS lock ping) drives the same bracket close-in as hover/focus does --
  var lockedId = null, hoverTarget = null, focusTarget = null, desiredLock = null;
  ARGUS.on('lock', function (d) {
    if (lockedId && lockedId !== d.id) {
      var prev = document.getElementById(lockedId);
      if (prev) prev.classList.remove('is-locked');
    }
    lockedId = d.id || null;
    if (lockedId) {
      var t = document.getElementById(lockedId);
      if (t) t.classList.add('is-locked');
      lockStatus.textContent = 'LOCK: ' + (d.label || '') + ' — ' + (d.readout || '');
    } else {
      lockStatus.textContent = '';
    }
  });
  function refreshLock() {
    var t = focusTarget || hoverTarget, id = t ? t.id : null;
    if (id === desiredLock) return;
    desiredLock = id;
    if (t) ARGUS.emit('lock', { id: t.id, label: t.dataset.label, readout: t.dataset.readout });
    else ARGUS.emit('lock', { id: null, label: null, readout: null });
  }

  var firing = false, fireStart = 0;
  function fire(t) {
    if (!state.booted) return;
    var href = t.dataset.href;
    if (!href) return; // t-unknown locks but never fires
    markInput();
    ARGUS.emit('fire', { id: t.id, href: href });
    if (ARGUS.reduce) { location.href = href; return; }
    firing = true; fireStart = performance.now();
    setTimeout(function () { location.href = href; }, 280);
  }

  targets.forEach(function (t) {
    t.addEventListener('mouseenter', function () { hoverTarget = t; refreshLock(); });
    t.addEventListener('mouseleave', function () { if (hoverTarget === t) hoverTarget = null; refreshLock(); });
    t.addEventListener('click', function () { fire(t); });
  });

  // turn to face a target by yaw, in degrees
  function turnTo(yawDeg) { targetYaw = wrap360(yawDeg); markInput(); }
  ARGUS.on('face', function (d) { turnTo(d.yaw); });

  navLinks.forEach(function (link) {
    link.addEventListener('focus', function () {
      var t = document.getElementById(link.dataset.target);
      if (!t || !state.booted) return;
      focusTarget = t; turnTo(parseFloat(t.dataset.yaw) || 0); refreshLock();
    });
    link.addEventListener('blur', function () { if (focusTarget === document.getElementById(link.dataset.target)) focusTarget = null; refreshLock(); });
    link.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var t = document.getElementById(link.dataset.target);
      if (t) { e.preventDefault(); fire(t); }
    });
  });

  // -- input: drag, wheel, keys, idle sway, all held until boot-done --
  var targetYaw = state.yaw, targetPitch = state.pitch;
  var lastInputTime = performance.now();
  function markInput() { lastInputTime = performance.now(); }

  var dragging = false, lastDragX = 0, lastDragY = 0, velYaw = 0;
  document.addEventListener('mousedown', function (e) {
    if (!state.booted || e.button !== 0) return;
    if (e.target.closest && e.target.closest('#targets-nav, .hud-btn')) return;
    dragging = true; velYaw = 0; lastDragX = e.clientX; lastDragY = e.clientY;
    markInput();
  });
  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastDragX, dy = e.clientY - lastDragY;
    targetYaw = wrap360(targetYaw - dx * 0.25);
    targetPitch = clampPitch(targetPitch - dy * 0.12);
    velYaw = -dx * 0.25;
    lastDragX = e.clientX; lastDragY = e.clientY;
    markInput();
  });
  addEventListener('mouseup', function () { dragging = false; });

  addEventListener('wheel', function (e) {
    if (!state.booted) return;
    e.preventDefault();
    targetYaw = wrap360(targetYaw + (e.deltaX + e.deltaY) * 0.04);
    markInput();
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (!state.booted) return;
    if (e.key === 'ArrowLeft') { targetYaw = wrap360(targetYaw - 15); markInput(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { targetYaw = wrap360(targetYaw + 15); markInput(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { targetPitch = clampPitch(targetPitch + 4); markInput(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { targetPitch = clampPitch(targetPitch - 4); markInput(); e.preventDefault(); }
    else if (e.key === 'Home') { targetYaw = 0; targetPitch = 0; markInput(); e.preventDefault(); }
  });

  // phone tilt: ask permission once, then map gamma/beta relative to the enable point
  if (!ARGUS.fine && typeof DeviceOrientationEvent !== 'undefined') {
    tiltBtn.hidden = false;
    var tiltBase = null, tiltBaseYaw = 0;
    tiltBtn.addEventListener('click', function () {
      var start = function () {
        tiltBase = null;
        addEventListener('deviceorientation', function (e) {
          if (e.gamma == null) return;
          if (!tiltBase) { tiltBase = { g: e.gamma, b: e.beta || 0 }; tiltBaseYaw = state.yaw; }
          targetYaw = wrap360(tiltBaseYaw + (e.gamma - tiltBase.g));
          targetPitch = clampPitch(-(e.beta - tiltBase.b) * 0.3);
          markInput();
        });
        tiltBtn.hidden = true;
      };
      if (DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted') start(); });
      else start();
    });
  }

  ARGUS.on('boot-done', function () { targetYaw = state.yaw; targetPitch = state.pitch; });

  // rear warning: a target more than 60deg off-centre gets .is-behind (CSS draws the chevron)
  function updateBehind(yaw) {
    targets.forEach(function (t) {
      var dy = parseFloat(t.dataset.yaw) || 0;
      t.classList.toggle('is-behind', Math.abs(shortestDelta(yaw, dy)) > 60);
    });
  }

  // -- render loop: no easing/input while !booted (boot.js drives state.yaw/pitch) --
  var lastFrameTime = null;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    var dt = lastFrameTime == null ? 1 / 60 : Math.min(0.25, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (!state.booted) {
      applyRing(state.yaw, state.pitch);
      updateBehind(state.yaw);
      emitView(state.yaw, state.pitch, 0, 0);
      return;
    }

    if (!dragging && Math.abs(velYaw) > 0.001) { targetYaw = wrap360(targetYaw + velYaw); velYaw *= Math.pow(0.92, dt * 60); }
    else if (!dragging) velYaw = 0;

    var idle = !dragging && !firing && !ARGUS.reduce && (now - lastInputTime > 4000);
    var wantYaw = targetYaw, wantPitch = targetPitch;
    if (idle) { wantYaw = wrap360(wantYaw + 0.6 * Math.sin(now / 2200)); wantPitch = clampPitch(wantPitch + 0.3 * Math.sin(now / 2900 + 1)); }

    var ease = 1 - Math.pow(0.88, dt * 60);
    state.yaw = wrap360(state.yaw + shortestDelta(state.yaw, wantYaw) * ease);
    state.pitch = clampPitch(state.pitch + (wantPitch - state.pitch) * ease);

    applyRing(state.yaw, state.pitch);
    updateBehind(state.yaw);
    emitView(state.yaw, state.pitch, velYaw, 0);
  }
  requestAnimationFrame(frame);
})();
