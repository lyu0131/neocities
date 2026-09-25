/* cockpit.js: the 360 view engine — cylinder, input, targets, lock-on */
(function () {
  'use strict';
  var ARGUS = window.ARGUS;
  var wrap360 = ARGUS.wrap360, shortestDelta = ARGUS.shortestDelta, clamp = ARGUS.clamp;
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
  // The world is a sphere, not a ring: the strip is tessellated into LAT_BANDS rows of
  // SLICES quads, each tilted to its own latitude. pano.svg is equirectangular at
  // 360deg / 9600px, so one pixel is DEG_PER_PX of arc in BOTH axes and the vertical
  // mapping falls out of the horizon row -- no extra distortion term needed.
  var LAT_BANDS = 8, IMG_W = 9600, IMG_H = 2000, HORIZON_Y = 1150;
  var DEG_PER_PX = 360 / IMG_W;
  var BAND_PX = IMG_H / LAT_BANDS, BAND_DEG = BAND_PX * DEG_PER_PX;
  function bandTopLat(j) { return (HORIZON_Y - j * BAND_PX) * DEG_PER_PX; }
  function bandMidLat(j) { return bandTopLat(j) - BAND_DEG / 2; }
  var tiles = [];
  // Bands run from the zenith to the nadir so the world closes into a real sphere.
  // The image only covers the middle ones (row >= 0); above and below it the bands are
  // filled with the strip's own edge colour, which is flat sky and flat sea anyway.
  // Flat caps were what made it still read as a ring: a disc does not converge.
  var BANDS = [];
  (function buildBands() {
    var imgTop = HORIZON_Y * DEG_PER_PX, imgBot = (HORIZON_Y - IMG_H) * DEG_PER_PX;
    var nTop = 3, nBot = 4;   // polar bands are flat fill, so they need little subdivision
    var stepTop = (93 - imgTop) / nTop, stepBot = (imgBot + 93) / nBot;
    for (var k = nTop; k > 0; k--) BANDS.push({ top: imgTop + k * stepTop, bot: imgTop + (k - 1) * stepTop, row: -1 });
    for (var j = 0; j < LAT_BANDS; j++) BANDS.push({ top: bandTopLat(j), bot: bandTopLat(j + 1), row: j });
    for (var k = 0; k < nBot; k++) BANDS.push({ top: imgBot - k * stepBot, bot: imgBot - (k + 1) * stepBot, row: -1 });
  })();
  var sliceW = 0, R = 0;

  // .pano-ring sits at z~0 (its children are pushed back via translateZ), so its own flat
  // box is nearer the camera than everything inside it and swallows hover/click before they
  // reach .target — CSS gives .target pointer-events:auto for exactly this pairing, so ring
  // (and slices, which inherit) need pointer-events:none.
  ring.style.pointerEvents = 'none';

  var MAX_PITCH = 26;   // you can look well down now that the sphere has a floor
  var COVER_PITCH = 12; // the strip itself only has to cover this much; caps take the rest
  function clampPitch(p) { return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p)); }

  // build the 24 slices once, ahead of the existing .target children. CSS owns their
  // size, background-image and background-size (via --slice-w); we only own transform
  // and background-position-x.
  (function buildSphere() {
    var frag = document.createDocumentFragment();
    BANDS.forEach(function (b) {
      for (var i = 0; i < SLICES; i++) {
        var el = document.createElement('div');
        el.className = 'pano-slice' + (b.row < 0 ? (b.top > 0 ? ' pole-top' : ' pole-bot') : '');
        frag.appendChild(el);
        tiles.push({ el: el, i: i, band: b, lat: (b.top + b.bot) / 2, h: b.top - b.bot });
      }
    });
    ring.insertBefore(frag, ring.firstChild);
  })();


  // One longitude segment's width on screen. It sets R, and through R the scale of
  // the whole sphere. 0.27 of the viewport height reproduces the framing the cylinder
  // had, so the skyline sits where it always did.
  function readSliceW() {
    return Math.max(80, innerHeight * 0.27);
  }

  // radius R = sliceW / (2*tan(7.5deg)); slice i sits at rotateY(-i*15) translateZ(-R).
  // The angles are negated so that increasing yaw (turning right) slides the scene left
  // and a target at +52deg appears to the RIGHT, matching the heading tape. Mirroring the
  // ring with scaleX(-1) would also fix the handedness but reverses the CSS label text.
  // and shows pano content [i*sliceW, (i+1)*sliceW), so it's centred on content
  // (i+0.5)*sliceW — the ring's own rotateY corrects for that half-slice offset so
  // the DESIGN.md yaw->x mapping (yaw 0 = x0, yaw 180 = x4800) holds exactly.
  // The strip must keep its natural aspect or the whole scene distorts: 24 slices of
  // 400 panorama units span the full 9600, so a slice is 400x2000 and its height is
  // exactly 5x its width. Oversizing it to cover more pitch stretched everything
  // vertically -- which made the suit and the skyline render about two thirds of
  // their true width. The floor and ceiling caps cover the pitch range instead.
  function layout() {
    sliceW = readSliceW();
    R = sliceW / (2 * Math.tan(HALF_SLICE * Math.PI / 180));
    var OVER = 1.04;               // quads are chords, so overlap slightly or seams show
    var imgH = 2 * R * Math.tan(BAND_DEG / 2 * Math.PI / 180);

    tiles.forEach(function (t) {
      var cos = Math.cos(t.lat * Math.PI / 180);
      var w = sliceW * cos;
      var tileH = 2 * R * Math.tan(t.h / 2 * Math.PI / 180);
      // A quad is one fixed width, but the sphere's circumference shrinks across the
      // band, so its edge nearer the equator needs more width than its centre does.
      // Sizing every quad off its centre latitude left wedge-shaped gaps between bands,
      // widening toward the poles. Widen each quad to cover its widest edge; the texture
      // scale stays tied to w, so this only bleeds into the neighbour, never stretches.
      var edge = Math.min(Math.abs(t.band.top), Math.abs(t.band.bot));
      var over = Math.max(OVER, Math.cos(edge * Math.PI / 180) / cos * 1.03);
      // texture: this quad shows image cell (i, j), so scale the whole image by the
      // cell count and offset to that cell
      t.el.style.width = (w * over) + 'px';
      t.el.style.height = (tileH * OVER) + 'px';
      t.el.style.marginLeft = (-w * over / 2) + 'px';
      t.el.style.marginTop = (-tileH * OVER / 2) + 'px';
      if (t.band.row >= 0) {
        t.el.style.backgroundSize = (w * SLICES) + 'px ' + (imgH * LAT_BANDS) + 'px';
        t.el.style.backgroundPosition = (-(t.i * w) - w * (over - 1) / 2) + 'px '
                                      + (-(t.band.row * imgH) - imgH * (OVER - 1) / 2) + 'px';
      }
      t.el.style.transform = 'rotateY(' + (-t.i * SLICE_DEG) + 'deg) rotateX('
                           + (-t.lat) + 'deg) translateZ(' + (-R) + 'px)';
    });

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
      // must carry everything the dossier shows: svg#hud is aria-hidden, so this
      // live region is the only route to that text for assistive tech
      lockStatus.textContent = 'LOCK: ' + (d.label || '') + ' — ' + (d.readout || '')
        + (d.info ? ' — ' + d.info : '');
    } else {
      lockStatus.textContent = '';
    }
  });
  // Putting the boresight on a target acquires it, the same as hovering or tabbing to
  // it: turn until it sits under the centre reticle and its dossier comes up.
  var boreTarget = null;
  function updateBoresight(yaw) {
    var best = null, bestOff = 12;                // degrees from dead centre: wide enough
                                                  // that aiming roughly at a target latches it
    targets.forEach(function (t) {
      var off = Math.abs(shortestDelta(yaw, parseFloat(t.dataset.yaw) || 0));
      if (off < bestOff) { bestOff = off; best = t; }
    });
    if (best !== boreTarget) { boreTarget = best; refreshLock(); }
  }
  function refreshLock() {
    var t = focusTarget || hoverTarget || boreTarget, id = t ? t.id : null;
    if (id === desiredLock) return;
    desiredLock = id;
    if (t) ARGUS.emit('lock', { id: t.id, label: t.dataset.label, readout: t.dataset.readout, info: t.dataset.info || '', brief: t.dataset.brief || '', href: t.dataset.href || '' });
    else ARGUS.emit('lock', { id: null, label: null, readout: null, info: '', brief: '', href: '' });
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
  var hadInput = false;
  function markInput() {
    hadInput = true; lastInputTime = performance.now(); }

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

  // boot.js sets state.booted true and only THEN emits boot-done, so a keypress can land
  // in between: input is accepted, and this handler would then discard it by snapping the
  // target back. Only re-sync when the user has not already steered.
  // slew panel: turn the view onto a contact without dragging for it
  Array.prototype.forEach.call(document.querySelectorAll('#slew button[data-slew]'), function (b) {
    b.addEventListener('click', function () {
      var t = document.getElementById(b.dataset.slew);
      if (!t || !state.booted) return;
      targetYaw = wrap360(parseFloat(t.dataset.yaw) || 0);
      targetPitch = 0;
      markInput();
    });
  });

  ARGUS.on('boot-done', function () {
    if (hadInput) return;
    targetYaw = state.yaw;
    targetPitch = state.pitch;
  });

  // Culling only: a target on the far side still projects through the depthless
  // Past 95deg it is culled outright: the cylinder has no depth, so a target on the far side
  // still projects onto the screen through it, arriving mirrored (its back face is toward us).
  // At a wide enough field of view that put the UNKNOWN box, 180deg behind, in the middle of
  // the screen as backwards text. Hiding it is the fix; backface-visibility alone would drop
  // the box but leave the CSS ::after label painting.
  function updateBehind(yaw) {
    targets.forEach(function (t) {
      var dy = parseFloat(t.dataset.yaw) || 0;
      var off = Math.abs(shortestDelta(yaw, dy));
      var hidden = off > 95;
      t.style.visibility = hidden ? 'hidden' : '';
      t.style.pointerEvents = hidden ? 'none' : '';
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
      updateBoresight(state.yaw);
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
    updateBoresight(state.yaw);
    emitView(state.yaw, state.pitch, velYaw, 0);
  }
  requestAnimationFrame(frame);
})();
