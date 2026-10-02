/* boot.js: the index-only boot sequence, seen from the pilot's seat through the cockpit's five
   canopy screens (hud.js #screens) and frame, which stay on screen the whole time. The boot draws
   on canvas#boot-scene, which sits just above the panorama and under the screens, so everything
   plays inside the real cockpit:
     1 COCKPIT     in the centre screen the chest hatch, hinged at its sill, swings up shut,
                   locks and seals; the cockpit goes dark and the linear seat slides back;
     2 UNIT CHECK  the five screens power up in turn (bunnys:screens-on); once they're lit, the
                   owner's emblem (img/emblem-hud.webp) holds on them: UNIT VERIFIED;
     3 PILOT ID    IFF brackets close on the cockpit block: PILOT CONNECTED, SYLAS LYU;
     4 LAUNCH      the screens show the catapult bay; the launch call; the suit flies out
                   through the bay hatch into the city.
   The city at the end is the hub's own arrival view, so the hand-over is one picture: the
   canvas fades onto the live panorama behind the same screens while the instruments power on.
   Drives BUNNYS.state.yaw/booted while state.booted is false; cockpit.js takes over once
   bunnys:boot-done fires. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var overlay = document.getElementById('boot');
  var canvas = document.getElementById('boot-scene');
  if (!BUNNYS || !overlay) {
    if (BUNNYS) BUNNYS.state.booted = true;
    if (canvas) canvas.remove();
    return;
  }

  // The launch lands facing the PILOT contact, so the first thing seen after the boot is
  // who's flying. Set now, so the hidden hub rasterises that view while the boot plays.
  var ARRIVE_YAW = -52;
  BUNNYS.state.yaw = ARRIVE_YAW;

  var ctx = canvas && canvas.getContext && canvas.getContext('2d');
  var screensEl = document.getElementById('screens'), frameEl = document.getElementById('frame');
  var logEl = document.getElementById('boot-log');
  var stageTxt = overlay.querySelector('.boot-stage-txt');
  var pips = overlay.querySelectorAll('.boot-stage .pips i');
  var capEl = overlay.querySelector('.boot-cap');
  var titleEl = overlay.querySelector('.boot-title');
  var noteEl = overlay.querySelector('.boot-note');
  var lines = [];
  var timers = [];
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

  // ---- timeline (ms on the boot clock) ----
  var T = {
    hatch: [150, 1050],           // the chest hatch, hinged at the sill, swings up shut
    thud: [1050, 1300],           // it lands: a small rebound and a jolt
    latch: 1150, latchEach: 80,   // four locking lugs engage in turn
    seal: [1500, 1850],           // the pressure seal traces round the frame
    dark: [1750, 2100],           // the hangar light is gone: the cockpit goes dark
    seat: [1900, 2300],           // the linear seat slides back into the core
    screens: 2300,                // the five screens power up (hud.js), left to console
    emblem: [3450, 4950],         // once the centre screen is clear: CSS flickers it on, turns it, fades
    glitch: [5000, 5220],         // channel switch to IFF
    iff: [5100, 5650],            // brackets close on the cockpit block
    friend: 5850,
    ring: [5850, 6450],
    cut: [6550, 7100],            // the unit gives way to the catapult bay
    bay: [6650, 7200],
    lights: 7050,
    hatchOpen: [7250, 7800],
    fire: [7800, 8800],
    out: [8680, 8820],            // only once the bay hatch fills the view: fly through, not a dissolve
    flash: [8720, 8780, 8950],    // a bloom as it clears the hatch, over before the hand-over
    end: 9010
  };

  // ONE boot clock drives the scene, the captions and the bar. It advances with real frames
  // but never by more than CLOCK_MAX_STEP per frame, so a main-thread stall (a cold open
  // still rasterising the panorama) pauses the whole shot instead of letting it skip ahead.
  var clock = 0, lastFrame = null, CLOCK_MAX_STEP = 50;
  function at(ms, fn) { timers.push({ t: clock + ms, fn: fn }); }
  function runClock(now) {
    if (done) return;
    if (lastFrame != null) clock += Math.min(CLOCK_MAX_STEP, now - lastFrame);
    lastFrame = now;
    var bar = overlay.querySelector('.boot-bar i');
    if (bar) bar.style.transform = 'scaleX(' + Math.min(1, clock / T.end).toFixed(4) + ')';
    var due = timers.filter(function (t) { return t.t <= clock; });
    timers = timers.filter(function (t) { return t.t > clock; });
    due.forEach(function (t) { t.fn(); });
    if (done) return;
    if (ctx) draw(clock);
    requestAnimationFrame(runClock);
  }

  function onSkip() { finish(true); }
  // Space skips (the button says so); Enter and Esc too. Not any key: 1-4 mean a contact.
  function onSkipKey(e) {
    if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault(); finish(true);
  }

  function finish(instant) {
    if (done) return;
    done = true;
    timers = [];
    document.removeEventListener('keydown', onSkipKey);
    document.removeEventListener('click', onSkip);
    drawHudOnce();
    BUNNYS.state.yaw = ARRIVE_YAW;
    BUNNYS.state.booted = true;
    try { sessionStorage.setItem('bunnys-booted', '1'); } catch (e) {}
    BUNNYS.emit('boot-done', {});
    moveLayers(null);
    if (!overlay.parentNode) return;
    if (instant || BUNNYS.reduce) { overlay.remove(); if (canvas) canvas.remove(); return; }
    // the hand-over: the canvas holds the arrival view and fades off it onto the live
    // panorama behind the same screens, while the frame seams glow
    if (ctx) draw(T.end);
    if (frameEl) {
      frameEl.classList.add('seam-glow');
      setTimeout(function () { frameEl.classList.remove('seam-glow'); }, 1300);
    }
    overlay.classList.add('boot-out');
    if (canvas) canvas.classList.add('boot-out');
    setTimeout(function () { overlay.remove(); if (canvas) canvas.remove(); }, 650);
  }

  var already = false;
  // Skip only when returning from our own pages; sessionStorage alone would also skip
  // the intro on a plain reload from an external referrer.
  // link.js marks a page reached through the canopy shutters, which holds even where no
  // referrer is sent (file://, a strict referrer policy).
  var fromInside = /\/(pilot|missions|hangar|index)\.html/.test(document.referrer || '') ||
    document.documentElement.classList.contains('linked');
  try { already = fromInside && sessionStorage.getItem('bunnys-booted') === '1'; } catch (e) {}
  if (BUNNYS.reduce || already) { finish(true); return; }

  // ---- maths ----
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function ease(p) { return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  var HUD = [140, 255, 193], PAPER = [207, 227, 242], AMBER = [255, 176, 46];
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(c1, c2, p, a) {
    return 'rgba(' + Math.round(lerp(c1[0], c2[0], p)) + ',' + Math.round(lerp(c1[1], c2[1], p)) + ',' +
      Math.round(lerp(c1[2], c2[2], p)) + ',' + a + ')';
  }

  // ---- layout: everything is placed off the centre canopy screen ----
  var W = 0, H = 0, dpr = 1;
  var centreShutter = null;
  // The centre screen's bounding box in viewport px, read from its own polygon. getBBox is in
  // #screens' viewBox units (hud.js lays the canopy out at its own scale), so it is mapped
  // through the viewBox by the element's CSS size -- not its on-screen rect, which the layer
  // shake below would feed back into the layout.
  function centre() {
    if (!centreShutter && screensEl) {
      var g = screensEl.querySelectorAll('.screen');
      centreShutter = g[1] && g[1].querySelector('.shutter');   // hud.js builds L, C, R, T, B
    }
    try {
      var b = centreShutter && centreShutter.getBBox(), vb = screensEl.viewBox.baseVal;
      if (b && b.width > 60 && b.height > 60 && vb && vb.width) {
        var cw = screensEl.clientWidth || W, ch = screensEl.clientHeight || H;
        var s = Math.min(cw / vb.width, ch / vb.height);           // preserveAspectRatio: meet, centred
        var ox = (cw - vb.width * s) / 2 - vb.x * s, oy = (ch - vb.height * s) / 2 - vb.y * s;
        var r = { x: ox + b.x * s, y: oy + Math.max(0, b.y) * s, w: b.width * s, h: Math.min(b.height, vb.height - b.y) * s };
        if (r.w > 60 && r.h > 60) return r;
      }
    } catch (e) {}
    return { x: W * .22, y: H * .14, w: W * .56, h: H * .72 };
  }
  // where the unit is drawn: the upper part of the centre screen, captions below it
  function base() {
    var c = centre();
    return { x: c.x + c.w * .07, y: c.y + c.h * .07, w: c.w * .86, h: c.h * .56 };
  }
  // the chest hatch opening, inside the centre screen
  function hatchGeo() {
    var c = centre(), ow = c.w * .74, oh = Math.min(c.h * .7, ow / 1.2);
    return { x: c.x + (c.w - ow) / 2, y: c.y + c.h * .45 - oh / 2, w: ow, h: oh };
  }
  function size() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  function placeCaptions() {
    if (!capEl) return;
    var b = base();
    capEl.style.top = Math.round(b.y + b.h + 14) + 'px';
  }

  // The camera moves the whole cockpit, not just the picture: the canvas, the five screens and
  // the frame shift together. A slight zoom until the linear seat slides back into the core, a
  // jolt as the hatch lands, a clunk as the seat locks, vibration under launch.
  function moveLayers(t) {
    var tf = '';
    if (t != null) {
      var thud = seg(t, T.thud[0], T.thud[1]), clunk = seg(t, T.seat[1], T.seat[1] + 200), fireP = seg(t, T.fire[0], T.fire[1]);
      var amp = (thud > 0 && thud < 1 ? 4 * (1 - thud) : 0) + (clunk > 0 && clunk < 1 ? 2.5 * (1 - clunk) : 0) +
        (fireP > 0 && fireP < 1 ? 5 * Math.sin(Math.PI * fireP) : 0);
      var z = 1 + .035 * (1 - ease(seg(t, T.seat[0], T.seat[1])));
      tf = 'translate(' + (amp * Math.sin(t * .11)).toFixed(2) + 'px,' + (amp * Math.cos(t * .157)).toFixed(2) + 'px) scale(' + z.toFixed(4) + ')';
    }
    [canvas, screensEl, frameEl].forEach(function (el) { if (el) el.style.transform = tf; });
  }

  // ---- the suit: the damage map's front frame, traced from the owner's STL ----
  var suit = (function () {
    var D = window.BUNNYS_DMG;
    if (!D || !window.Path2D) return null;
    var f = D.frames[0], zones = [], byId = {}, box = [1e9, 1e9, -1e9, -1e9];
    f.order.forEach(function (i) {
      var d = f.d[i], len = 0, zb = [1e9, 1e9, -1e9, -1e9], sx = 0, sy = 0, lx = 0, ly = 0;
      d.replace(/([MLZ])([^MLZ]*)/g, function (_, c, args) {
        if (c === 'Z') { len += Math.hypot(sx - lx, sy - ly); lx = sx; ly = sy; return ''; }
        var n = args.trim().split(/[\s,]+/).map(Number), x = n[0], y = n[1];
        if (c === 'M') { sx = x; sy = y; } else len += Math.hypot(x - lx, y - ly);
        lx = x; ly = y;
        zb[0] = Math.min(zb[0], x); zb[1] = Math.min(zb[1], y); zb[2] = Math.max(zb[2], x); zb[3] = Math.max(zb[3], y);
        return '';
      });
      var z = { id: D.zones[i].id, path: new Path2D(d), len: len, box: zb };
      zones.push(z); byId[z.id] = z;
      box = [Math.min(box[0], zb[0]), Math.min(box[1], zb[1]), Math.max(box[2], zb[2]), Math.max(box[3], zb[3])];
    });
    return { zones: zones, byId: byId, box: box };
  })();
  function suitFit() {
    var b = base(), bx = suit.box, bw = bx[2] - bx[0], bh = bx[3] - bx[1];
    var s = Math.min(b.w * 0.8 / bw, b.h * 0.86 / bh);
    return { s: s, x: b.x + b.w / 2 - (bx[0] + bw / 2) * s, y: b.y + b.h / 2 - (bx[1] + bh / 2) * s };
  }

  // ---- the city at the end: the hub's arrival view, pre-rendered once ----
  var city = null;
  (function () {
    var img = new Image();
    img.onload = function () {
      // pano.svg is 9600 wide, 26.667 units a degree; the hub shows about y 330-1670
      var cx = (((ARRIVE_YAW % 360) + 360) % 360) * 9600 / 360, cw = 2600, ch = 1340;
      var sx = Math.max(0, Math.min(9600 - cw, cx - cw / 2));
      var c = document.createElement('canvas');
      c.width = 1560; c.height = Math.round(1560 * ch / cw);
      try { c.getContext('2d').drawImage(img, sx, 330, cw, ch, 0, 0, c.width, c.height); city = c; } catch (e) {}
    };
    img.src = 'img/pano.svg';
  })();
  function cover(img, x, y, w, h) {
    var ia = img.width / img.height, da = w / h, sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (ia > da) { sw = sh * da; sx = (img.width - sw) / 2; } else { sh = sw / da; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  var noise = null;
  function noiseCanvas() {
    if (!noise) { noise = document.createElement('canvas'); noise.width = 96; noise.height = 54; }
    var nc = noise.getContext('2d'), im = nc.createImageData(96, 54);
    for (var i = 0; i < im.data.length; i += 4) {
      var v = Math.random() * 120;
      im.data[i] = v * .75; im.data[i + 1] = v; im.data[i + 2] = v * .9; im.data[i + 3] = 255;
    }
    nc.putImageData(im, 0, 0);
    return noise;
  }

  // ---- the shot ----
  function draw(t) {
    moveLayers(t);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#060A12';
    ctx.fillRect(0, 0, W, H);
    if (t < T.screens) {
      drawCockpit(t);
    } else {
      if (suit) { drawFigure(t); drawIFF(t); }
      drawBay(t);
      drawGlitch(t);
    }
    var f = t < T.flash[0] ? 0 : t < T.flash[1] ? seg(t, T.flash[0], T.flash[1]) : 1 - seg(t, T.flash[1], T.flash[2]);
    // additive, so the flash lights the city up rather than greying it over
    if (f > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(140,255,193,' + (f * .32).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Stage 1. The screens are still off, so they show the cockpit as it is: dark, lit only by
  // the hangar through the chest hatch in front. The hatch is a heavy door hinged at its sill:
  // open, it lies flat outside like a drawbridge; it swings up shut in true perspective, lands
  // with a small rebound, four lugs lock it, the pressure seal traces round it, and the light
  // is gone.
  function hatchAngle(t) {
    var p = seg(t, T.hatch[0], T.hatch[1]);
    var phi = (1 - (1 - Math.cos(Math.PI * p)) / 2) * Math.PI / 2;
    var rb = seg(t, T.thud[0], T.thud[0] + 240);
    if (rb > 0 && rb < 1) phi = .05 * Math.sin(Math.PI * rb) * (1 - rb);
    return phi;
  }
  function drawCockpit(t) {
    var o = hatchGeo(), cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    var light = 1 - ease(seg(t, T.dark[0], T.dark[1]));
    ctx.fillStyle = '#070C17'; ctx.fillRect(0, 0, W, H);
    if (light > 0) {
      var sp = ctx.createRadialGradient(cx, cy, o.h * .3, cx, cy, Math.max(W, H) * .75);
      sp.addColorStop(0, 'rgba(70,100,140,' + (.32 * light).toFixed(3) + ')'); sp.addColorStop(1, 'rgba(70,100,140,0)');
      ctx.fillStyle = sp; ctx.fillRect(0, 0, W, H);
    }
    var phi = hatchAngle(t);
    ctx.save();
    ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
    if (phi > .001 || t < T.thud[1]) drawHangar(o);
    drawDoor(o, phi, light);
    ctx.restore();
    // the hatch frame, with its two hinge knuckles on the sill
    ctx.fillStyle = 'rgb(' + Math.round(13 + 12 * light) + ',' + Math.round(21 + 16 * light) + ',' + Math.round(36 + 22 * light) + ')';
    ctx.beginPath(); ctx.rect(o.x - 14, o.y - 14, o.w + 28, o.h + 28); ctx.rect(o.x, o.y, o.w, o.h); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(221,231,238,' + (.08 + .16 * light).toFixed(3) + ')'; ctx.lineWidth = 1;
    ctx.strokeRect(o.x - .5, o.y - .5, o.w + 1, o.h + 1);
    ctx.strokeRect(o.x - 14.5, o.y - 14.5, o.w + 29, o.h + 29);
    ctx.fillStyle = 'rgba(26,38,62,' + (.6 + .4 * light).toFixed(3) + ')';
    [.2, .8].forEach(function (f) { ctx.fillRect(o.x + o.w * f - 14, o.y + o.h - 4, 28, 14); });
    drawLatches(t, o);
    drawSeal(t, o);
  }
  // the hangar outside: lit bay wall, gantry uprights, a catwalk with its lights
  function drawHangar(o) {
    var g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
    g.addColorStop(0, '#2B4062'); g.addColorStop(.55, '#15223A'); g.addColorStop(1, '#0A1222');
    ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
    var glow = ctx.createRadialGradient(o.x + o.w * .5, o.y, 0, o.x + o.w * .5, o.y, o.h * .9);
    glow.addColorStop(0, 'rgba(221,231,238,.22)'); glow.addColorStop(1, 'rgba(221,231,238,0)');
    ctx.fillStyle = glow; ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = 'rgba(8,14,26,.85)';
    for (var i = 1; i < 5; i++) ctx.fillRect(o.x + o.w * i / 5 - 4, o.y, 8, o.h);
    var cw = o.y + o.h * .6;
    ctx.strokeStyle = 'rgba(221,231,238,.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(o.x, cw); ctx.lineTo(o.x + o.w, cw); ctx.moveTo(o.x, cw - o.h * .08); ctx.lineTo(o.x + o.w, cw - o.h * .08); ctx.stroke();
    ctx.fillStyle = 'rgba(8,14,26,.9)'; ctx.fillRect(o.x, cw, o.w, o.h * .05);
    ctx.fillStyle = 'rgba(255,176,46,.8)';
    for (var x = o.x + o.w / 16; x < o.x + o.w; x += o.w / 8) { ctx.beginPath(); ctx.arc(x, cw - o.h * .1, 2, 0, 7); ctx.fill(); }
  }
  // The door in perspective: hinged along the sill at the opening's depth, its top edge swinging
  // out and away. At 90deg it reads as floor running away from the sill; at 0 it fills the frame.
  function drawDoor(o, phi, light) {
    var cx = o.x + o.w / 2, cy = o.y + o.h / 2, z0 = o.h * 1.4, L = o.h, Yh = o.h / 2;
    function D(u, s) {
      var k = z0 / (z0 + u * L * Math.sin(phi));
      return [cx + s * (o.w / 2) * k, cy + (Yh - u * L * Math.cos(phi)) * k];
    }
    var a = D(0, -1), b = D(0, 1), c = D(1, 1), d = D(1, -1);
    // lit from above while it lies open, then only by the cockpit as it closes
    var lum = (.45 + .55 * Math.sin(phi)) * (.3 + .7 * light);
    var g = ctx.createLinearGradient(0, a[1], 0, Math.min(a[1] - 1, d[1]));
    g.addColorStop(0, 'rgb(' + Math.round(12 + 24 * lum) + ',' + Math.round(19 + 34 * lum) + ',' + Math.round(33 + 46 * lum) + ')');
    g.addColorStop(1, 'rgb(' + Math.round(16 + 30 * lum) + ',' + Math.round(25 + 40 * lum) + ',' + Math.round(42 + 52 * lum) + ')');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(221,231,238,' + (.05 + .1 * light).toFixed(3) + ')';
    [.34, .67].forEach(function (u) {
      var p = D(u, -.92), q = D(u, .92);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(221,231,238,' + (.1 + .25 * light).toFixed(3) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
  }
  // four locking lugs slide in over the door's edges in turn; each light goes amber to green
  function drawLatches(t, o) {
    if (t < T.thud[0] - 300) return;
    [[-1, .3], [1, .3], [-1, .7], [1, .7]].forEach(function (l, i) {
      var e = ease(seg(t, T.latch + i * T.latchEach, T.latch + i * T.latchEach + 160));
      var y = o.y + o.h * l[1];
      var x = l[0] < 0 ? o.x - 14 + 12 * e : o.x + o.w - 2 - 12 * e;
      ctx.fillStyle = '#1C2A44'; ctx.fillRect(x, y - 5, 16, 10);
      ctx.strokeStyle = 'rgba(221,231,238,.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y - 4.5, 15, 9);
      var lx = l[0] < 0 ? o.x - 7 : o.x + o.w + 7, on = e >= 1;
      ctx.save();
      ctx.shadowColor = on ? '#8CFFC1' : '#FFB02E'; ctx.shadowBlur = 6;
      ctx.fillStyle = on ? '#8CFFC1' : 'rgba(255,176,46,.9)';
      ctx.beginPath(); ctx.arc(lx, y - 13, 2.2, 0, 7); ctx.fill();
      ctx.restore();
    });
  }
  // the pressure seal: a glowing line traced round the hatch from the sill, both ways, meeting at the top
  function drawSeal(t, o) {
    var q = ease(seg(t, T.seal[0], T.seal[1]));
    if (q <= 0) return;
    var half = o.w + o.h;
    function trace(s) {
      var side = s < 0 ? o.x : o.x + o.w;
      var pts = [[o.x + o.w / 2, o.y + o.h], [side, o.y + o.h], [side, o.y], [o.x + o.w / 2, o.y]];
      var left = q * half;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length && left > 0; i++) {
        var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], len = Math.hypot(dx, dy), f = Math.min(1, left / len);
        ctx.lineTo(pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f);
        left -= len;
      }
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = '#8CFFC1'; ctx.shadowBlur = 10;
    ctx.strokeStyle = rgba(HUD, .9); ctx.lineWidth = 1.5;
    trace(-1); trace(1);
    ctx.restore();
  }

  function drawGlitch(t) {
    var g = seg(t, T.glitch[0], T.glitch[1]);
    if (g <= 0 || g >= 1) return;
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.PI * g) * .55;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(noiseCanvas(), 0, 0, W, H);
    ctx.restore();
  }

  // Stage 3: the suit as one solid silhouette with a phosphor glow round its outer edge only (no
  // edges per part), in on the channel switch, out on the cut to the bay. Drawn once to its own
  // canvas -- the parts filled as one shape, then the glow cast from that shape -- and stamped
  // each frame, so overlapping parts never show a seam and the blur isn't paid every frame.
  // start() builds it before the clock runs: built on its first frame it was a 75ms hitch.
  var figure = null;
  function figureImage() {
    var fit = suitFit(), key = W + 'x' + H + '@' + dpr;
    if (!figure || figure.key !== key) {
      var bx = suit.box, m = 30, c = document.createElement('canvas');
      var x0 = fit.x + bx[0] * fit.s - m, y0 = fit.y + bx[1] * fit.s - m;
      c.width = Math.ceil(((bx[2] - bx[0]) * fit.s + 2 * m) * dpr); c.height = Math.ceil(((bx[3] - bx[1]) * fit.s + 2 * m) * dpr);
      var shape = document.createElement('canvas'), sx = shape.getContext('2d');
      shape.width = c.width; shape.height = c.height;
      sx.setTransform(dpr * fit.s, 0, 0, dpr * fit.s, (fit.x - x0) * dpr, (fit.y - y0) * dpr);
      sx.fillStyle = 'rgb(22,52,62)';
      suit.zones.forEach(function (z) { sx.fill(z.path); });
      var cx = c.getContext('2d');
      cx.shadowColor = 'rgba(140,255,193,.85)';
      cx.shadowBlur = 14 * dpr; cx.drawImage(shape, 0, 0);
      cx.shadowBlur = 3 * dpr; cx.drawImage(shape, 0, 0);
      figure = { key: key, img: c, x: x0, y: y0 };
    }
    return figure;
  }
  function drawFigure(t) {
    var a = ease(seg(t, T.glitch[0], T.glitch[1])) * (1 - ease(seg(t, T.cut[0], T.cut[0] + 350)));
    if (a <= 0) return;
    var figure = figureImage();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(figure.img, figure.x, figure.y, figure.img.width / dpr, figure.img.height / dpr);
    ctx.restore();
  }

  // Stage 3: IFF brackets close from the centre screen's edges onto the cockpit block.
  function drawIFF(t) {
    if (t < T.iff[0]) return;
    var fade = 1 - ease(seg(t, T.cut[0], T.cut[0] + 350));
    if (fade <= 0) return;
    var b = base(), fit = suitFit(), chest = suit.byId.chest;
    var cb = chest ? chest.box : suit.box;
    var to = [fit.x + cb[0] * fit.s - 12, fit.y + cb[1] * fit.s - 12, fit.x + cb[2] * fit.s + 12, fit.y + cb[3] * fit.s + 12];
    var from = [b.x, b.y, b.x + b.w, b.y + b.h];
    var p = ease(seg(t, T.iff[0], T.iff[1]));
    var x0 = lerp(from[0], to[0], p), y0 = lerp(from[1], to[1], p), x1 = lerp(from[2], to[2], p), y1 = lerp(from[3], to[3], p);
    var fr = seg(t, T.friend, T.friend + 200);
    var alpha = (t < T.friend ? .7 + .3 * Math.cos((t - T.iff[0]) * .02) : 1) * fade;
    var arm = Math.min(x1 - x0, y1 - y0) * .26;
    ctx.save();
    ctx.shadowColor = fr > .5 ? '#8CFFC1' : '#FFB02E'; ctx.shadowBlur = 6;
    ctx.strokeStyle = mix(AMBER, HUD, fr, alpha.toFixed(3)); ctx.lineWidth = 2;
    [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(function (k) {
      ctx.beginPath(); ctx.moveTo(k[0], k[1] + k[3] * arm); ctx.lineTo(k[0], k[1]); ctx.lineTo(k[0] + k[2] * arm, k[1]); ctx.stroke();
    });
    ctx.shadowBlur = 0;
    // interrogation sweep while it identifies
    if (t > T.iff[1] && t < T.friend) {
      var sy = lerp(y0, y1, ((t - T.iff[1]) % 260) / 260);
      ctx.strokeStyle = rgba(AMBER, .6 * fade); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 + 4, sy); ctx.lineTo(x1 - 4, sy); ctx.stroke();
    }
    var rp = seg(t, T.ring[0], T.ring[1]);
    if (rp > 0 && rp < 1) {
      ctx.strokeStyle = rgba(HUD, (1 - rp) * .8 * fade); ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) * lerp(.55, 1.5, easeOut(rp)), 0, 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Stage 4: the catapult bay through the screens, its vanishing point in the centre screen,
  // then the launch itself.
  var TW = 1.7, TH = 1, EXIT = 16, RAILS = [];
  for (var rz = 1.2; rz < EXIT; rz += .8) RAILS.push(rz);
  function drawBay(t) {
    var a = ease(seg(t, T.bay[0], T.bay[1]));
    if (a <= 0) return;
    // accelerating, and close enough by ~90% that the hatch fills the view before the city takes over
    var camZ = Math.pow(seg(t, T.fire[0], T.fire[1]), 2.2) * (EXIT - .6);
    var c = centre(), f = Math.min(H * .62, W * .5), ox = c.x + c.w / 2, oy = c.y + c.h * .52;
    function P(x, y, z) { var d = Math.max(.05, z - camZ); return [ox + x * f / d, oy + y * f / d]; }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#060A12'; ctx.fillRect(0, 0, W, H);

    // the bay hatch at the far end: the arrival view, and its doors sliding apart
    var h0 = P(-TW, -TH, EXIT), h1 = P(TW, TH, EXIT), hw = h1[0] - h0[0], hh = h1[1] - h0[1];
    if (city) cover(city, h0[0], h0[1], hw, hh);
    else { ctx.fillStyle = '#16223A'; ctx.fillRect(h0[0], h0[1], hw, hh); }
    var open = ease(seg(t, T.hatchOpen[0], T.hatchOpen[1])), slide = hw / 2 * open;
    ctx.save();
    ctx.beginPath(); ctx.rect(h0[0], h0[1], hw, hh); ctx.clip();
    ctx.fillStyle = '#0E1830';
    ctx.fillRect(h0[0] - slide, h0[1], hw / 2, hh);
    ctx.fillRect(h0[0] + hw / 2 + slide, h0[1], hw / 2, hh);
    ctx.restore();
    ctx.strokeStyle = rgba(HUD, .8); ctx.lineWidth = 1.5;
    ctx.strokeRect(h0[0], h0[1], hw, hh);

    for (var z = 2.5; z < EXIT; z += 1.5) {
      if (z - camZ < .3) continue;
      var p = P(-TW, -TH, z), q = P(TW, TH, z);
      ctx.strokeStyle = 'rgba(31,78,95,' + Math.max(.18, .9 - (z - camZ) / EXIT).toFixed(3) + ')'; ctx.lineWidth = 2;
      ctx.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
    }
    [-.35, .35].forEach(function (rx) {
      var n = P(rx, TH, Math.max(camZ + .3, .6)), m = P(rx, TH, EXIT);
      ctx.strokeStyle = 'rgba(221,231,238,.3)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(n[0], n[1]); ctx.lineTo(m[0], m[1]); ctx.stroke();
      RAILS.forEach(function (lz, i) {
        if (lz - camZ < .3) return;
        var lit = seg(t, T.lights + i * 26, T.lights + i * 26 + 90);
        var s = P(rx, TH, lz), rad = Math.max(1, .055 * f / (lz - camZ));
        ctx.fillStyle = 'rgba(140,255,193,' + (.12 + .88 * lit).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(s[0], s[1], rad, 0, 7); ctx.fill();
      });
    });
    // out through the hatch: the city fills the view, exactly as the hub will show it
    var out = ease(seg(t, T.out[0], T.out[1]));
    if (out > 0 && city) { ctx.globalAlpha = out; cover(city, 0, 0, W, H); }
    ctx.restore();
  }

  // ---- captions and the log (DOM, on the same clock) ----
  function render() { if (logEl) logEl.textContent = lines.slice(-4).join('\n'); }
  function log(s) { lines.push(s); render(); }
  function swap(el, text, tone) {
    if (!el) return;
    el.classList.add('is-out');
    at(170, function () { el.textContent = text; el.setAttribute('data-tone', tone || ''); el.classList.remove('is-out'); });
  }
  function stage(n, label) {
    for (var i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < n);
    swap(stageTxt, '0' + n + ' / ' + label);
  }
  var GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%/<>';
  function decode(el, text, dur) {
    if (!el) return;
    el.setAttribute('data-tone', 'hud'); el.classList.remove('is-out');
    var t0 = clock;
    (function step() {
      if (done) return;
      var p = Math.min(1, (clock - t0) / dur), fixed = Math.floor(p * text.length), out = '';
      for (var i = 0; i < text.length; i++) {
        out += i < fixed || text[i] === ' ' ? text[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(step);
    })();
  }

  // Start once the page has loaded and painted twice, so the heaviest first-frame work is
  // behind us; until then the opening frame holds.
  function start() {
    // decode the emblem first: left to its first visible frame, the decode lands as a hitch exactly
    // as it flickers on (measured: 100ms at 1440x900). decode() runs off the main thread.
    var em = overlay.querySelector('.boot-emblem');
    var ready = em && em.decode ? em.decode().catch(function () {}) : Promise.resolve();
    ready.then(function () {
      try { size(); if (suit) figureImage(); } catch (e) {}
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        if (done) return;   // skipped while it loaded
        try { run(); requestAnimationFrame(runClock); } catch (e) { finish(true); }
      }); });
    });
  }
  if (document.readyState === 'complete') start(); else addEventListener('load', start);
  // the skip works from the first frame, not only once the clock runs (it waits for load and
  // the emblem's decode); boot.js is the last deferred script, so every boot-done listener is in
  document.addEventListener('keydown', onSkipKey);
  document.addEventListener('click', onSkip);
  // while the page finishes loading, hold on the opening frame: the hangar through the hatch
  if (ctx) { size(); draw(0); }

  function run() {
    size(); placeCaptions();
    addEventListener('resize', function () { size(); placeCaptions(); });
    // Added here, not at first paint, so the bar, the scene and the captions all run on
    // this function's clock and stay in sync.
    overlay.classList.add('is-booting');

    at(0, function () { stage(1, 'COCKPIT'); });
    at(T.thud[0], function () { log('CHEST HATCH ...... CLOSED'); });
    at(T.latch + 3 * T.latchEach + 160, function () { log('HATCH LOCKS ...... 4 / 4'); });
    at(T.seal[1], function () { log('PRESSURE SEAL .... OK'); });
    at(T.seat[1], function () { log('LINEAR SEAT ...... LOCKED'); });

    at(T.screens, function () {
      stage(2, 'UNIT CHECK');
      // the five canopy screens power up: hud.js runs their bring-up now instead of at boot-done
      BUNNYS.emit('screens-on', {});
    });
    at(T.screens + 1300, function () { log('CANOPY SCREENS ... 5 / 5'); });
    // stage 2 is the emblem on the lit screens (the CSS .is-on runs its flicker-on, hold and fade
    // across T.emblem), with the unit's name under it
    at(T.emblem[0], function () { var em = overlay.querySelector('.boot-emblem'); if (em) em.classList.add('is-on'); });
    at(T.emblem[0] + 200, function () { swap(titleEl, 'RX-124 TR-6 [WOUNDWORT]'); });
    at(T.emblem[0] + 800, function () { swap(noteEl, 'UNIT VERIFIED', 'hud'); log('UNIT ............. VERIFIED'); });

    at(T.glitch[0], function () {
      stage(3, 'PILOT ID');
      swap(titleEl, ''); swap(noteEl, 'IDENTIFYING', 'amber');
      log('IFF .............. INTERROGATING');
    });
    at(T.friend, function () {
      swap(noteEl, 'PILOT CONNECTED', 'hud');
      decode(titleEl, 'SYLAS LYU', 520);
      log('PILOT ............ SYLAS LYU');
    });

    at(T.cut[0], function () {
      stage(4, 'LAUNCH');
      // the screens show the launch bay: the captions rise clear of the rails, below the log
      var clear = logEl ? logEl.parentNode.getBoundingClientRect().bottom + 18 : 0;
      if (capEl) capEl.style.transform = 'translateY(' + Math.round(Math.max(H * 0.14, clear) - capEl.offsetTop) + 'px)';
    });
    at(T.lights, function () { log('CATAPULT ......... CHARGED'); });
    at(T.hatchOpen[0] + 200, function () { log('LAUNCH HATCH ..... OPEN'); });
    at(T.fire[0] - 250, function () { swap(noteEl, 'LAUNCHING', 'go'); log('LAUNCH ........... GO'); });
    at(T.fire[0] + 500, function () { if (capEl) capEl.classList.add('is-out'); });

    at(T.end, function () { finish(false); });
  }
})();
