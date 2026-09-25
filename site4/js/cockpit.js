/* cockpit.js: the 360 view engine — cylinder, input, targets, lock-on */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var wrap360 = BUNNYS.wrap360, shortestDelta = BUNNYS.shortestDelta, clamp = BUNNYS.clamp;
  var state = BUNNYS.state;
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
  // The image only covers the middle ones (row >= 0); paintCap() fills the rest.
  // Flat caps were what made it still read as a ring: a disc does not converge.
  var BANDS = [];
  (function buildBands() {
    var imgTop = HORIZON_Y * DEG_PER_PX, imgBot = (HORIZON_Y - IMG_H) * DEG_PER_PX;
    var nTop = 3, nBot = 4;   // polar bands are flat fill, so they need little subdivision
    var stepTop = (93 - imgTop) / nTop, stepBot = (imgBot + 93) / nBot;
    for (var k = nTop; k > 0; k--) BANDS.push({ top: imgTop + k * stepTop, bot: imgTop + (k - 1) * stepTop, row: -1, cap: k - 1 });
    for (var j = 0; j < LAT_BANDS; j++) BANDS.push({ top: bandTopLat(j), bot: bandTopLat(j + 1), row: j, cap: 0 });
    for (var k = 0; k < nBot; k++) BANDS.push({ top: imgBot - k * stepBot, bot: imgBot - (k + 1) * stepBot, row: -1, cap: k });
  })();
  var sliceW = 0, R = 0;
  var OVER = 1.04;   // quads are chords, so overlap slightly or the seams show

  // The strip spans 43.1deg up and 31.9deg down; cap tiles close the sphere past that.
  // They used to fall through to the CSS background at its natural size, so every cap
  // band redrew the image's own top-left corner -- concentric rings of city glow
  // overhead, and sky pixels on the floor. paintCap() paints them instead: one ramp
  // evaluated at each tile's true top and bottom latitude, so neighbouring bands agree
  // exactly at the seam and the 4% overlap matches whichever quad wins.
  var CAP_TOP = HORIZON_Y * DEG_PER_PX, CAP_BOT = (HORIZON_Y - IMG_H) * DEG_PER_PX;
  // sampled off the rendered strip's first and last row, averaged across all 9600px
  var SKY_EDGE = [7, 12, 22], ZENITH = [3, 5, 11];
  var SEA_EDGE = [9, 16, 31], NADIR = [4, 7, 14];
  var CLOUD_LOW = [86, 63, 52];     // sodium bounce off the city, caught on the underside
  var CLOUD_HIGH = [84, 96, 115];   // starlight only, up near the zenith
  // x, y, rx, ry as % of the whole 360deg cap strip, then peak alpha. Masses are defined
  // in strip space and sliced per tile exactly as the panorama is, so one cloud spans
  // several quads with no seam through it. x stays clear of 0 and 100: background-repeat
  // puts the neighbouring copy there, so a mass crossing the edge is cut, not wrapped.
  var CLOUDS = [[11, 50, 10, 40, .30], [24, 42, 6, 34, .20], [37, 56, 10, 42, .34],
                [50, 46, 7, 36, .24], [63, 54, 11, 44, .31], [77, 44, 6, 32, .19],
                [90, 52, 9, 40, .26]];
  function capT(lat) {   // 0 at the strip's edge, 1 at the pole
    var t = lat >= 0 ? (lat - CAP_TOP) / (90 - CAP_TOP) : (CAP_BOT - lat) / (90 + CAP_BOT);
    return Math.max(0, Math.min(1, t));
  }
  function lerpRGB(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function capRGB(lat) {
    return lat >= 0 ? lerpRGB(SKY_EDGE, ZENITH, capT(lat)) : lerpRGB(SEA_EDGE, NADIR, capT(lat));
  }

  // .pano-ring sits at z~0 (its children are pushed back via translateZ), so its own flat
  // box is nearer the camera than everything inside it and swallows hover/click before they
  // reach .target — CSS gives .target pointer-events:auto for exactly this pairing, so ring
  // (and slices, which inherit) need pointer-events:none.
  ring.style.pointerEvents = 'none';

  var SNAP_DEG = 14;         // magnetism reaches this far from a contact
  var SNAP_STRENGTH = 0.85;  // fraction of the remaining gap taken per pull step
  var SNAP_CLICK = 1.2;      // inside this, close the gap outright so the aim clicks on
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
    var imgH = 2 * R * Math.tan(BAND_DEG / 2 * Math.PI / 180);

    tiles.forEach(function (t) {
      var cos = Math.cos(t.lat * Math.PI / 180);   // always positive: no band centre passes 90deg
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
      // Lay every tile out at the equator's width and squeeze it with scaleX rather than
      // sizing it by cos(lat). The rendered geometry is identical, but background-size is
      // then the same for all eight image bands, so the browser rasterises pano.svg once
      // instead of once per band. Eight multi-thousand-pixel vector rasters cost 5.5s of
      // dropped frames across the boot on a throttled CPU -- that was the "stuck" boot.
      t.el.style.width = (sliceW * over) + 'px';
      t.el.style.height = (tileH * OVER) + 'px';
      t.el.style.marginLeft = (-sliceW * over / 2) + 'px';
      t.el.style.marginTop = (-tileH * OVER / 2) + 'px';
      var xOff = -(t.i * sliceW) - sliceW * (over - 1) / 2;
      if (t.band.row >= 0) {
        t.el.style.backgroundSize = (sliceW * SLICES) + 'px ' + (imgH * LAT_BANDS) + 'px';
        t.el.style.backgroundPosition = xOff + 'px '
                                      + (-(t.band.row * imgH) - imgH * (OVER - 1) / 2) + 'px';
      } else {
        paintCap(t, sliceW, xOff);
      }
      t.el.style.transform = 'rotateY(' + (-t.i * SLICE_DEG) + 'deg) rotateX('
                           + (-t.lat) + 'deg) translateZ(' + (-R) + 'px) scaleX(' + cos.toFixed(5) + ')';
    });

    placeTargets(state.yaw, state.pitch);
  }

  // Cap tiles carry no image: a latitude ramp continuing the strip's own edge colour and,
  // overhead, cloud masses laid out across the full 360deg and sliced per tile.
  function paintCap(t, w, xOff) {
    var half = t.h * OVER / 2;
    var img = [], size = [], pos = [];
    if (t.band.top > 0) {
      var stripW = w * SLICES;
      var tint = lerpRGB(CLOUD_LOW, CLOUD_HIGH, capT(t.lat)), fade = 1 - capT(t.lat);
      // de-phase each band so the stacked cap rings never line up into a bullseye
      var at = (xOff - t.band.cap * stripW * 0.31).toFixed(1) + 'px 0';
      CLOUDS.forEach(function (c) {
        img.push('radial-gradient(ellipse ' + c[2] + '% ' + c[3] + '% at ' + c[0] + '% ' + c[1] + '%, '
               + rgba(tint, (c[4] * fade).toFixed(3)) + ', ' + rgba(tint, 0) + ')');
        size.push(stripW.toFixed(1) + 'px 100%');
        pos.push(at);
      });
    }
    img.push('linear-gradient(' + rgba(capRGB(t.lat + half), 1) + ',' + rgba(capRGB(t.lat - half), 1) + ')');
    size.push('100% 100%'); pos.push('0 0');
    t.el.style.backgroundImage = img.join(',');
    t.el.style.backgroundSize = size.join(',');
    t.el.style.backgroundPosition = pos.join(',');
  }

  // Targets are billboards: they sit at their true bearing but always face the camera.
  // Tangent to the sphere they turned away the moment you were not dead on them, and the
  // ring's own rotateX(pitch) tipped them further, so a contact you were looking straight
  // at still pointed off somewhere else. Undoing the ring's rotation AFTER the translate
  // leaves the box square to the screen while the translate still fixes where it sits.
  // A billboard is square to the screen, so its far end swings back toward the sphere by
  // half its width times the sine of the off-axis angle -- and the readout label under the
  // box is about 240px wide. At the old 40px standoff that end punched through the
  // panorama and the scene painted over it, cutting the readout off on a diagonal. Stand
  // each contact far enough forward to clear the surface, then scale it back down so the
  // boxes still read the size the 40px standoff gave them.
  var STANDOFF = 150;
  function placeTargets(yaw, pitch) {
    var off = Math.min(STANDOFF, R * 0.22);   // a short window shrinks R; never crowd the camera
    var k = (R - off) / (R - 40);
    targets.forEach(function (t) {
      var dy = parseFloat(t.dataset.yaw) || 0;
      t.style.transform = 'rotateY(' + (HALF_SLICE - dy).toFixed(2) + 'deg) translateZ('
                        + (-R + off).toFixed(1) + 'px) rotateY(' + (dy - yaw).toFixed(2)
                        + 'deg) rotateX(' + (-pitch).toFixed(2) + 'deg) scale(' + k.toFixed(4) + ')';
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
    placeTargets(yaw, pitch);
  }

  var lastEmit = null;
  function emitView(yaw, pitch, vx, vy) {
    root.style.setProperty('--yaw', yaw.toFixed(2) + 'deg');
    root.style.setProperty('--pitch', pitch.toFixed(2) + 'deg');
    if (!lastEmit || Math.abs(lastEmit.yaw - yaw) > 0.01 || Math.abs(lastEmit.pitch - pitch) > 0.01) {
      lastEmit = { yaw: yaw, pitch: pitch };
      BUNNYS.emit('view', { yaw: yaw, pitch: pitch, vx: vx || 0, vy: vy || 0 });
    }
  }

  // -- lock-on: a single event-driven source of truth so boot.js's own bunnys:lock
  // (the MISSIONS lock ping) drives the same bracket close-in as hover/focus does --
  var lockedId = null, hoverTarget = null, focusTarget = null, desiredLock = null;
  BUNNYS.on('lock', function (d) {
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
    if (t) BUNNYS.emit('lock', { id: t.id, label: t.dataset.label, readout: t.dataset.readout, info: t.dataset.info || '', brief: t.dataset.brief || '', href: t.dataset.href || '' });
    else BUNNYS.emit('lock', { id: null, label: null, readout: null, info: '', brief: '', href: '' });
  }

  var firing = false, fireStart = 0;
  function fire(t) {
    if (!state.booted) return;
    var href = t.dataset.href;
    if (!href) return; // t-unknown locks but never fires
    markInput();
    BUNNYS.emit('fire', { id: t.id, href: href });
    if (BUNNYS.reduce) { location.href = href; return; }
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
  BUNNYS.on('face', function (d) { turnTo(d.yaw); });

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

  // WASD mirrors the arrows. Held keys turn continuously (the render loop reads `held`),
  // while a single tap still steps, so both a tap and a hold feel right.
  var held = {};
  var STEP = { left: -15, right: 15, up: 4, down: -4 };
  function keyRole(e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'ArrowLeft' || k === 'a') return 'left';
    if (k === 'ArrowRight' || k === 'd') return 'right';
    if (k === 'ArrowUp' || k === 'w') return 'up';
    if (k === 'ArrowDown' || k === 's') return 'down';
    return null;
  }
  document.addEventListener('keyup', function (e) { var r = keyRole(e); if (r) held[r] = false; });
  window.addEventListener('blur', function () { held = {}; });

  document.addEventListener('keydown', function (e) {
    if (!state.booted) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var role = keyRole(e);
    if (role) {
      if (!e.repeat) {
        if (role === 'left' || role === 'right') targetYaw = wrap360(targetYaw + STEP[role]);
        else targetPitch = clampPitch(targetPitch + STEP[role]);
      }
      held[role] = true;
      markInput();
      e.preventDefault();
      return;
    }
    if (e.key === 'Home') { targetYaw = 0; targetPitch = 0; markInput(); e.preventDefault(); }
  });

  // phone tilt: ask permission once, then map gamma/beta relative to the enable point
  if (!BUNNYS.fine && typeof DeviceOrientationEvent !== 'undefined') {
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

  BUNNYS.on('boot-done', function () {
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

    // held WASD/arrows turn continuously rather than stepping once per repeat
    var turn = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    var tilt = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    if (turn || tilt) {
      targetYaw = wrap360(targetYaw + turn * 70 * dt);
      targetPitch = clampPitch(targetPitch + tilt * 26 * dt);
      markInput();
    }

    // Magnetism: as the view slows near a contact, pull the aim onto it so the reticle
    // settles on the target instead of just past it. It waits out live input (so a wheel
    // nudge or a held key is never fought) but engages while a released flick is still
    // coasting, bleeds that coast off, and closes the last degree outright -- asymptoting
    // in from a weaker pull read as drifting rather than snapping.
    if (!firing) {
      var near = null, nearOff = SNAP_DEG;
      targets.forEach(function (t) {
        var d = shortestDelta(targetYaw, parseFloat(t.dataset.yaw) || 0);
        if (Math.abs(d) < Math.abs(nearOff)) { nearOff = d; near = t; }
      });
      if (near && !dragging && !turn && Math.abs(velYaw) < 3.5 && now - lastInputTime > 90) {
        var pull = 1 - Math.pow(0.0001, dt);          // frame-rate independent
        targetYaw = wrap360(targetYaw + nearOff * pull * SNAP_STRENGTH);
        velYaw *= Math.pow(0.55, dt * 60);
        if (Math.abs(nearOff) < SNAP_CLICK) {
          targetYaw = wrap360(parseFloat(near.dataset.yaw) || 0);
          velYaw = 0;
        }
      }
    }

    var idle = !dragging && !firing && !BUNNYS.reduce && (now - lastInputTime > 4000);
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
