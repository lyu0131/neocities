/* cockpit.js: the 360 view engine — cylinder, input, targets, lock-on */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var wrap360 = BUNNYS.wrap360, shortestDelta = BUNNYS.shortestDelta, clamp = BUNNYS.clamp;
  var state = BUNNYS.state;
  var pano = document.getElementById('pano');
  var ring = pano.querySelector('.pano-ring');
  var targets = Array.prototype.slice.call(ring.querySelectorAll('.target'));
  var nav = document.getElementById('targets-nav');
  var navLinks = Array.prototype.slice.call(nav.querySelectorAll('a[data-target]'));
  var lockStatus = document.getElementById('lock-status');

  var SLICES = 24, SLICE_DEG = 15, HALF_SLICE = SLICE_DEG / 2;
  // The world is a sphere: the strip tessellates into LAT_BANDS rows of SLICES quads, each
  // tilted to its own latitude. pano.svg is equirectangular at 360deg/9600px, so DEG_PER_PX
  // is the same arc-per-pixel on both axes -- no extra distortion term for the vertical mapping.
  var LAT_BANDS = 8, IMG_W = 9600, IMG_H = 2000, HORIZON_Y = 1150;
  var DEG_PER_PX = 360 / IMG_W;
  var BAND_PX = IMG_H / LAT_BANDS, BAND_DEG = BAND_PX * DEG_PER_PX;
  function bandTopLat(j) { return (HORIZON_Y - j * BAND_PX) * DEG_PER_PX; }
  var tiles = [];
  // Bands run zenith to nadir so the world closes into a true sphere -- a flat disc cap
  // doesn't converge and reads as a ring instead. The image covers only the middle rows
  // (row >= 0); paintCap() fills the rest.
  var BANDS = [];
  (function buildBands() {
    var imgTop = HORIZON_Y * DEG_PER_PX, imgBot = (HORIZON_Y - IMG_H) * DEG_PER_PX;
    var nTop = 3, nBot = 4;   // polar bands are flat fill, so they need little subdivision
    var stepTop = (93 - imgTop) / nTop, stepBot = (imgBot + 93) / nBot;
    for (var k = nTop; k > 0; k--) BANDS.push({ top: imgTop + k * stepTop, bot: imgTop + (k - 1) * stepTop, row: -1, cap: k - 1 });
    for (var j = 0; j < LAT_BANDS; j++) BANDS.push({ top: bandTopLat(j), bot: bandTopLat(j + 1), row: j, cap: 0 });
    for (var k = 0; k < nBot; k++) BANDS.push({ top: imgBot - k * stepBot, bot: imgBot - (k + 1) * stepBot, row: -1, cap: k });
  })();
  var sliceW = 0, R = 0, PERSP = 0;
  var OVER = 1.04;   // quads are chords, so overlap slightly or the seams show

  // Cap tiles close the sphere past the strip's 43.1deg/31.9deg range. paintCap() evaluates
  // one ramp at each tile's true top and bottom latitude, so neighbouring bands agree
  // exactly at the seam and the 4% overlap matches whichever quad wins.
  var CAP_TOP = HORIZON_Y * DEG_PER_PX, CAP_BOT = (HORIZON_Y - IMG_H) * DEG_PER_PX;
  var SKY_EDGE = [7, 12, 22], ZENITH = [3, 5, 11];
  var SEA_EDGE = [9, 16, 31], NADIR = [4, 7, 14];
  var CLOUD_LOW = [86, 63, 52];     // sodium bounce off the city, caught on the underside
  var CLOUD_HIGH = [84, 96, 115];   // starlight only, up near the zenith
  // x, y, rx, ry as % of the whole cap strip, then peak alpha, sliced per tile like the
  // panorama so one cloud spans several quads with no seam. x avoids 0/100: that's where
  // background-repeat's neighbouring copy sits, so a mass crossing the edge is cut, not wrapped.
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

  // .pano-ring sits at z~0 while its children are pushed back via translateZ, so its own flat
  // box is nearer the camera and swallows hover/click before they reach .target. CSS gives
  // .target pointer-events:auto for exactly this pairing, so ring (and slices, which inherit)
  // need pointer-events:none.
  ring.style.pointerEvents = 'none';

  var SNAP_DEG = 14;         // magnetism reaches this far from a contact
  var SNAP_STRENGTH = 0.85;  // fraction of the remaining gap taken per pull step
  var SNAP_DRAG = 0.30;      // gentler while the mouse is down: guide the drag, don't fight it
  var SNAP_CLICK = 1.2;      // inside this, close the gap outright so the aim clicks on
  var BORE_DEG = 14;         // acquire radius, measured in BOTH axes
  var MAX_PITCH = 26;   // you can look well down now that the sphere has a floor
  function clampPitch(p) { return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p)); }

  // Built once; CSS owns size/background-image/background-size (--slice-w), this owns transform and
  // background-position-x.
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


  // Sets R, and through R the whole sphere's scale; 0.27 of viewport height keeps the skyline
  // framing consistent.
  function readSliceW() {
    return Math.max(80, innerHeight * 0.27);
  }

  // radius R = sliceW / (2*tan(7.5deg)); slice i sits at rotateY(-i*15) translateZ(-R). Angles are
  // negated so increasing yaw slides the scene left and a target at +52deg appears to the RIGHT,
  // matching the heading tape (scaleX(-1) would also fix handedness but mirrors the CSS label
  // text).
  // Each slice shows content centred at (i+0.5)*sliceW; the ring's own rotateY corrects for that
  // offset so the DESIGN.md yaw->x mapping (yaw 0 = x0, yaw 180 = x4800) holds exactly. The strip
  // must keep its natural aspect (5x width in height) or the scene distorts vertically.
  function layout() {
    sliceW = readSliceW();
    R = sliceW / (2 * Math.tan(HALF_SLICE * Math.PI / 180));
    // CSS puts the camera at z = +perspective, but .pano-ring's origin -- the sphere's centre --
    // sits at z = 0. Push the ring forward by PERSP so the sphere's centre lands on the camera;
    // otherwise each slice subtends the wrong angle and R = sliceW / (2 tan 7.5) stops being true.
    PERSP = parseFloat(getComputedStyle(pano).perspective) || 0;
    var imgH = 2 * R * Math.tan(BAND_DEG / 2 * Math.PI / 180);

    tiles.forEach(function (t) {
      var cos = Math.cos(t.lat * Math.PI / 180);   // always positive: no band centre passes 90deg
      var tileH = 2 * R * Math.tan(t.h / 2 * Math.PI / 180);
      // The sphere's circumference shrinks across the band, so a quad's edge nearer the equator
      // needs more width than its centre. Widen each quad to its widest edge, or bands gap at the
      // poles.
      var edge = Math.min(Math.abs(t.band.top), Math.abs(t.band.bot));
      var over = Math.max(OVER, Math.cos(edge * Math.PI / 180) / cos * 1.03);
      // This quad shows image cell (i, j): scale the whole image by the cell count and offset to
      // that cell. Every tile is laid out at the equator's width and squeezed with scaleX rather
      // than resized by cos(lat), so background-size is identical across all bands and the browser
      // rasterises pano.svg once instead of once per band -- the per-band alternative stalls the
      // boot.
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

  // Cap tiles carry no source image: a latitude-colour ramp plus cloud masses sliced per tile.
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

  // Targets are billboards, square to the screen so they always face the camera: undoing the
  // ring's rotation AFTER the translate does that while the translate still fixes where it sits.
  // A square billboard's far end swings back toward the sphere by half its width times the sine
  // of the off-axis angle, so STANDOFF clears the surface and scale (k below) brings it back down.
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
    var t = 'translateZ(' + PERSP.toFixed(1) + 'px) rotateX(' + pitch.toFixed(2)
          + 'deg) rotateY(' + (yaw - HALF_SLICE).toFixed(2) + 'deg)';
    ring.style.transform = t;
    placeTargets(yaw, pitch);
  }

  var lastEmit = null;
  function emitView(yaw, pitch, vx, vy) {
    // No --yaw/--pitch on :root here: nothing read them, and an inherited custom property
    // changed per frame on the root restyled every node in the document (~9k) each frame.
    if (!lastEmit || Math.abs(lastEmit.yaw - yaw) > 0.01 || Math.abs(lastEmit.pitch - pitch) > 0.01) {
      lastEmit = { yaw: yaw, pitch: pitch };
      BUNNYS.emit('view', { yaw: yaw, pitch: pitch, vx: vx || 0, vy: vy || 0 });
    }
  }

  // Lock-on is one event-driven source of truth, so boot.js's MISSIONS lock ping drives the same
  // bracket close-in as hover/focus.
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
      // Must carry everything the dossier shows: svg#hud is aria-hidden, so this live region is the
      // only route to that text for assistive tech.
      lockStatus.textContent = 'LOCK: ' + (d.label || '') + ' — ' + (d.readout || '')
        + (d.info ? ' — ' + d.info : '');
    } else {
      lockStatus.textContent = '';
    }
  });
  // Boresight acquisition works like hover/tab: turning a contact under the centre reticle brings
  // up its dossier.
  var boreTarget = null;
  // a contact picked with 1-4: held through the swing, so Enter mid-turn opens what was picked and
  // not whatever the reticle is crossing; any manual turn lets it go
  var keyTarget = null;
  function dropKeyLock() { if (keyTarget) { keyTarget = null; refreshLock(); } }
  // what the dossier shows and Enter opens, highest priority first
  function currentTarget() { return focusTarget || keyTarget || hoverTarget || boreTarget; }
  // Every target sits on the horizon, so a contact's elevation offset from the boresight is simply
  // -pitch.
  function boreOffset(t, yaw, pitch) {
    return { yaw: shortestDelta(yaw, parseFloat(t.dataset.yaw) || 0), pitch: -pitch };
  }
  function boreDist(o) { return Math.sqrt(o.yaw * o.yaw + o.pitch * o.pitch); }
  // Acquisition uses true angular distance (yaw and pitch), not yaw alone, or the lock can sit well
  // off the reticle.
  function updateBoresight(yaw, pitch) {
    var best = null, bestOff = BORE_DEG;
    targets.forEach(function (t) {
      var d = boreDist(boreOffset(t, yaw, pitch));
      if (d < bestOff) { bestOff = d; best = t; }
    });
    if (best !== boreTarget) { boreTarget = best; refreshLock(); }
  }
  function refreshLock() {
    var t = currentTarget(), id = t ? t.id : null;
    if (id === desiredLock) return;
    desiredLock = id;
    if (t) BUNNYS.emit('lock', { id: t.id, label: t.dataset.label, readout: t.dataset.readout, info: t.dataset.info || '', brief: t.dataset.brief || '', href: t.dataset.href || '' });
    else BUNNYS.emit('lock', { id: null, label: null, readout: null, info: '', brief: '', href: '' });
  }

  // Firing blinks the lock, then link.js shutters the canopy and goes.
  function fire(t) {
    if (!state.booted) return;
    var href = t.dataset.href;
    if (!href) return; // a contact without an approach only locks
    markInput();
    if (!BUNNYS.link) { location.href = href; return; }   // link.go itself goes straight there under reduced motion
    t.classList.add('is-fired');
    setTimeout(function () { t.classList.remove('is-fired'); }, 200);
    BUNNYS.link.go(href, 160);
  }

  targets.forEach(function (t) {
    t.addEventListener('mouseenter', function () { hoverTarget = t; refreshLock(); });
    t.addEventListener('mouseleave', function () { if (hoverTarget === t) hoverTarget = null; refreshLock(); });
    t.addEventListener('click', function () { fire(t); });
  });

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

  var dragging = false, lastDragX = 0, lastDragY = 0, velYaw = 0, dragDist = 0;
  var DRAG_SLOP = 6;   // px of travel past which a release is a drag, not a click
  // Pointer events, so a mouse drag and a finger swipe are one input (a swipe never fires mouse
  // events: the browser reads it as a pan or zoom -- #cockpit sets touch-action: none for that).
  // Only the first finger steers; a second one, or the browser cancelling the gesture, ends it.
  document.addEventListener('pointerdown', function (e) {
    if (!state.booted || e.button !== 0 || !e.isPrimary) return;
    if (e.target.closest && e.target.closest('#targets-nav, .hud-btn, button')) return;
    dragging = true; state.dragging = true; velYaw = 0; dragDist = 0; lastDragX = e.clientX; lastDragY = e.clientY;
    dropKeyLock();
    markInput();
  });
  document.addEventListener('pointermove', function (e) {
    if (!dragging || !e.isPrimary) return;
    var dx = e.clientX - lastDragX, dy = e.clientY - lastDragY;
    dragDist += Math.abs(dx) + Math.abs(dy);
    targetYaw = wrap360(targetYaw - dx * 0.25);
    targetPitch = clampPitch(targetPitch - dy * 0.12);
    velYaw = -dx * 0.25;
    lastDragX = e.clientX; lastDragY = e.clientY;
    markInput();
  });
  ['pointerup', 'pointercancel'].forEach(function (t) {
    addEventListener(t, function (e) { if (e.isPrimary) { dragging = false; state.dragging = false; } });
  });
  // A target label is a link, so a drag that starts and ends on one still fires a click and
  // navigates
  // away mid-turn. Swallow it past DRAG_SLOP, in the capture phase so it lands before the link's
  // own handler.
  document.addEventListener('click', function (e) {
    if (dragDist <= DRAG_SLOP) return;
    dragDist = 0;
    e.preventDefault(); e.stopPropagation();
  }, true);

  addEventListener('wheel', function (e) {
    if (!state.booted) return;
    e.preventDefault();
    dropKeyLock();
    targetYaw = wrap360(targetYaw + (e.deltaX + e.deltaY) * 0.04);
    markInput();
  }, { passive: false });

  // WASD mirrors the arrows; held keys turn continuously via the render loop's `held` while a
  // single tap still steps.
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
    if (!state.booted || !BUNNYS.keyable(e)) return;
    var role = keyRole(e);
    if (role) {
      dropKeyLock();
      if (!e.repeat) {
        if (role === 'left' || role === 'right') targetYaw = wrap360(targetYaw + STEP[role]);
        else targetPitch = clampPitch(targetPitch + STEP[role]);
      }
      held[role] = true;
      markInput();
      e.preventDefault();
      return;
    }
    if (e.key === 'Home') { dropKeyLock(); targetYaw = 0; targetPitch = 0; markInput(); e.preventDefault(); }
    // Enter fires whatever is locked -- boresight, hover or focus -- as the dossier's "PRESS ENTER
    // OR CLICK TO OPEN" says. A focused control keeps its own Enter, except a SLEW button whose
    // contact is already locked: Enter once turns onto it, Enter again opens it.
    if (e.key === 'Enter' && !e.repeat) {
      var t = currentTarget();
      var ctl = e.target.closest && e.target.closest('button, a, input, textarea, select');
      if (ctl && !(t && ctl.dataset.slew === t.id)) return;
      if (t && t.dataset.href) { e.preventDefault(); fire(t); }
      return;
    }
    if (e.repeat) return;
    // 1-4: what the matching SLEW button does -- swing onto that contact and lock it; Enter opens it
    var n = '1234'.indexOf(e.key);
    if (n >= 0) {
      var sb = document.querySelector('#slew [data-slew="' + BUNNYS.contacts[n].id + '"]');
      if (sb) { e.preventDefault(); sb.click(); }
      return;
    }
    // HUD MODE by key -- X declutter, N night vision, R run diag, C comms -- and Esc acknowledges comms
    var mode = { x: 'declutter', n: 'nv', r: 'diag', c: 'comms' }[e.key.toLowerCase()];
    var mb = mode && document.querySelector('#hudmode [data-mode="' + mode + '"]');
    if (mb) { e.preventDefault(); mb.click(); return; }
    if (e.key === 'Escape') { var ack = document.querySelector('#comms:not([hidden]) .comms-ack'); if (ack) ack.click(); }
  });
  // index.html?face=t-unknown (a sub-page's 4 + Enter) arrives facing that contact. A query, not a
  // #fragment: a fragment sends the browser scrolling toward the element, inside the overflow:hidden,
  // 3D-transformed panorama.
  BUNNYS.on('boot-done', function () {
    var m = /[?&]face=([\w-]+)/.exec(location.search), c = m && document.getElementById(m[1]);
    if (c && c.classList.contains('target')) turnTo(parseFloat(c.dataset.yaw) || 0);
  });

  // slew panel: turn the view onto a contact without dragging for it
  Array.prototype.forEach.call(document.querySelectorAll('#slew button[data-slew]'), function (b) {
    b.addEventListener('click', function () {
      var t = document.getElementById(b.dataset.slew);
      if (!t || !state.booted) return;
      targetYaw = wrap360(parseFloat(t.dataset.yaw) || 0);
      targetPitch = 0;
      markInput();
      keyTarget = t; refreshLock();   // a slew locks like its number key does
    });
  });

  // state.booted goes true before boot-done fires, so a keypress can land in between and already be
  // accepted; only re-sync when the user has not steered.
  BUNNYS.on('boot-done', function () {
    if (hadInput) return;
    targetYaw = state.yaw;
    targetPitch = state.pitch;
  });

  // The sphere has no depth, so a far target still projects through it, arriving mirrored -- at
  // this field of view that can read as backwards text mid-screen. Hide it outright;
  // backface-visibility
  // alone would drop the box but leave the CSS ::after label painting.
  function updateBehind(yaw) {
    targets.forEach(function (t) {
      var dy = parseFloat(t.dataset.yaw) || 0;
      var off = Math.abs(shortestDelta(yaw, dy));
      // Cut at 80, not 90: the camera sits at the sphere's centre, so a contact at exactly 90deg
      // sits in the camera plane, where the projection scale goes to infinity.
      var hidden = off > 80;
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
      updateBoresight(state.yaw, state.pitch);
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

    // Magnetism pulls the aim onto a contact as the view slows near it. It waits out live input
    // (a wheel nudge or held key is never fought) but engages while a released flick is still
    // coasting, and closes the last degree outright -- a weaker asymptotic pull reads as drifting.
    var near = null, nearOff = null, nearDist = SNAP_DEG;
    targets.forEach(function (t) {
      var o = boreOffset(t, targetYaw, targetPitch);
      var d = boreDist(o);
      if (d < nearDist) { nearDist = d; nearOff = o; near = t; }
    });
    // Assist applies during a drag too, at reduced strength (SNAP_DRAG) so it guides rather than
    // fights; full strength (SNAP_STRENGTH) is for a released flick settling.
    var settling = !turn && Math.abs(velYaw) < 3.5 && now - lastInputTime > 90;
    // While dragging, only assist when it already heads toward the contact (below), or a drag
    // starting on a target gets pulled straight back and can never move away from it.
    var strength = dragging ? SNAP_DRAG : (settling ? SNAP_STRENGTH : 0);
    // `near` has to be tested FIRST: nearOff is null when nothing is in range, and
    // reading it unguarded threw on every frame with no contact nearby.
    if (near && strength > 0 && (!dragging || velYaw * nearOff.yaw >= 0)) {
      var pull = 1 - Math.pow(0.0001, dt);          // frame-rate independent
      targetYaw = wrap360(targetYaw + nearOff.yaw * pull * strength);
      // Elevation is corrected on the settle only, and skipped while a held up/down key is
      // active (!tilt) -- otherwise the pull fights deliberate vertical input either way.
      if (!dragging && !tilt) targetPitch = clampPitch(targetPitch + nearOff.pitch * pull * strength * 0.7);
      if (!dragging) {
        velYaw *= Math.pow(0.55, dt * 60);
        if (nearDist < SNAP_CLICK) {
          targetYaw = wrap360(parseFloat(near.dataset.yaw) || 0);
          targetPitch = 0;
          velYaw = 0;
        }
      }
    }

    var idle = !dragging && !BUNNYS.reduce && (now - lastInputTime > 4000);
    var wantYaw = targetYaw, wantPitch = targetPitch;
    if (idle) { wantYaw = wrap360(wantYaw + 0.6 * Math.sin(now / 2200)); wantPitch = clampPitch(wantPitch + 0.3 * Math.sin(now / 2900 + 1)); }

    var ease = 1 - Math.pow(0.88, dt * 60);
    state.yaw = wrap360(state.yaw + shortestDelta(state.yaw, wantYaw) * ease);
    state.pitch = clampPitch(state.pitch + (wantPitch - state.pitch) * ease);

    applyRing(state.yaw, state.pitch);
    updateBehind(state.yaw);
    updateBoresight(state.yaw, state.pitch);
    emitView(state.yaw, state.pitch, velYaw, 0);
  }
  requestAnimationFrame(frame);
})();
