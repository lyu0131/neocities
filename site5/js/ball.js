/* ball.js: the cockpit's model and motion. Everything renders from one pose, built here each frame:
     world -> suit (attitude) -> ball (the panoramic monitor, a unit sphere rigid with the suit)
           -> seat (hung inside the ball on a spring) -> the pilot's eye (seat + head look).
   Frames are x right, y up, z forward; angles in degrees unless named *Rad.
   The suit flies a looping scripted dogfight on its own (AUTO). Arrows/WASD take it (MANUAL) and it
   hands back 4s after the last key; dragging turns the pilot's head, which drifts back when let go.
   The HUD is painted on the ball, so it only moves on screen when the eye moves against the ball. The
   pilot's head therefore leads every move -- looks up into a climb, into a turn -- on a spring that lags
   a beat and overshoots (as in the FPV clip, where the whole HUD drops as the pilot looks up), and the
   mouse steers the gaze a few degrees.
   world.js and hud.js register in SITE5.renderers and draw from the pose. The only global is SITE5. */
(function () {
  'use strict';
  var D = Math.PI / 180;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- quaternions, [x, y, z, w] ----
  function qmul(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
            a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
            a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  }
  function qaxis(x, y, z, a) { var s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; }
  function qconj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
  function qrot(q, v) {
    var ux = q[0], uy = q[1], uz = q[2], w = q[3];
    var cx = uy * v[2] - uz * v[1], cy = uz * v[0] - ux * v[2], cz = ux * v[1] - uy * v[0];
    return [v[0] + 2 * (w * cx + uy * cz - uz * cy), v[1] + 2 * (w * cy + uz * cx - ux * cz), v[2] + 2 * (w * cz + ux * cy - uy * cx)];
  }
  // yaw right +, pitch up +, bank right + (right side down)
  function euler(yaw, pitch, bank) {
    return qmul(qmul(qaxis(0, 1, 0, yaw * D), qaxis(1, 0, 0, -pitch * D)), qaxis(0, 0, 1, -bank * D));
  }
  function dir(az, el) { return [Math.cos(el * D) * Math.sin(az * D), Math.sin(el * D), Math.cos(el * D) * Math.cos(az * D)]; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function wrap(a) { return ((a % 360) + 540) % 360 - 180; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  // a damped spring {x, v} toward a target
  function spring(s, target, w, z, dt) { s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * dt; s.x += s.v * dt; }

  var look = (/[?&]look=(mix|xi|penelope)\b/.exec(location.search) || [])[1] || 'mix';
  var S = window.SITE5 = {
    m: { qmul: qmul, qconj: qconj, qrot: qrot, euler: euler, dir: dir, norm: norm, dot: dot, wrap: wrap, clamp: clamp, D: D },
    look: look, reduce: reduce, renderers: [], pose: null, frames: 0
  };

  // ---- the dogfight: the opponent's path through the world (az, el), a 32s loop ----
  var LOOP = 32;
  var KEYS = [[0, 0, 3], [4, 18, 9], [8, 52, -4], [11, 36, -22], [14, -6, -14], [18, -44, 6], [22, -78, 15], [26, -34, 4], [29.5, -8, 1]];
  function oppAt(t) {
    var n = KEYS.length, i = 0;
    while (i < n - 1 && KEYS[i + 1][0] <= t) i++;
    var k = function (j) { var m = ((j % n) + n) % n, lap = Math.floor(j / n); return [KEYS[m][0] + lap * LOOP, KEYS[m][1], KEYS[m][2]]; };
    var p0 = k(i - 1), p1 = k(i), p2 = k(i + 1), p3 = k(i + 2);
    var u = (t - p1[0]) / (p2[0] - p1[0]);
    var cr = function (a, b, c, d) { return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u); };
    return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
  }

  // ---- state ----
  // global clock, loop clock (reduced motion holds at 2s, a calm moment, and never runs the script)
  var T = reduce ? 2 : 0, lt = T, prevLt = T;
  var yaw = { x: 0, v: 0 }, pitch = { x: 3, v: 0 }, bank = { x: 0, v: 0 }, rollX = 0;
  var seat = [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }];   // offset in the ball, in ball radii
  var seatRoll = { x: 0, v: 0 }, seatPitch = { x: 0, v: 0 };
  var head = { yaw: 0, pitch: 0 }, lastDrag = -1e9, dragging = false;
  var lead = { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 } };   // the head looking into the move
  var gaze = { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 } }, gazeAt = [0, 0];   // the mouse, -1..1
  var keys = {}, lastKey = -1e9;
  var shake = 0, flash = 0, pos = [0, 0], lockT = 0, locked = false, lockId = null;
  var LOCK_IN = 4.5, LOCK_OUT = 7, LOCK_TIME = 0.5;   // acquire inside the (small) triangle, release past it
  // the eye sits well behind the ball's centre, as the reference camera does: from there everything on the ball
  // curves the way the inside of a dome does (from the exact centre a great circle would look straight)
  var EYE0 = [0, 0, -0.4];
  var suitQ = euler(0, 3, 0);

  function kick(x, y, z) { seat[0].v += x; seat[1].v += y; seat[2].v += z; }
  var EVENTS = [
    [6.35, function () { yaw.v += 80; kick(-0.5, 0, 0); }],                                   // jink
    [15.1, function () { kick(0, 0, -0.35); }],
    [19.4, function () { pitch.v += 50; kick(0, -0.45, 0); }],
    [23.3, function () { flash = 0.55; shake = 1; kick(0.35, 0.25, -0.5); }],                // near miss
    [24.0, function () { rollX = 55; }],
    [25.3, function () { rollX = 0; }]
  ];
  function events(from, to) {
    EVENTS.forEach(function (e) {
      var hit = from <= to ? e[0] > from && e[0] <= to : e[0] > from || e[0] <= to;
      if (hit) e[1]();
    });
  }

  // ---- input ----
  var cockpit = document.getElementById('cockpit');
  function keyRole(e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' }[k] || null;
  }
  addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var r = keyRole(e); if (!r) return;
    keys[r] = true; lastKey = performance.now(); e.preventDefault();
  });
  addEventListener('keyup', function (e) { var r = keyRole(e); if (r) keys[r] = false; });
  addEventListener('blur', function () { keys = {}; dragging = false; });
  var lx = 0, ly = 0;
  cockpit.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || !e.isPrimary || (e.target.closest && e.target.closest('a, button'))) return;
    dragging = true; lx = e.clientX; ly = e.clientY; lastDrag = performance.now();
    cockpit.setPointerCapture && cockpit.setPointerCapture(e.pointerId);
  });
  cockpit.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') gazeAt = [e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1];
    if (!dragging || !e.isPrimary) return;
    head.yaw = clamp(head.yaw - (e.clientX - lx) * 0.16, -150, 150);
    head.pitch = clamp(head.pitch + (e.clientY - ly) * 0.13, -70, 70);
    lx = e.clientX; ly = e.clientY; lastDrag = performance.now();
  });
  ['pointerup', 'pointercancel'].forEach(function (t) { cockpit.addEventListener(t, function () { dragging = false; lastDrag = performance.now(); }); });

  // ---- one step of the simulation ----
  function step(dt, now) {
    var manual = now - lastKey < 4000 || keys.l || keys.r || keys.u || keys.d;
    if (!reduce) { T += dt; prevLt = lt; lt = T % LOOP; if (!manual) events(prevLt, lt); }
    var o = oppAt(lt);
    var turn = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), climb = (keys.u ? 1 : 0) - (keys.d ? 1 : 0);
    if (manual) {
      yaw.v += (turn * 55 - yaw.v) * Math.min(1, dt * 4); pitch.v += (climb * 40 - pitch.v) * Math.min(1, dt * 4);
      yaw.x += yaw.v * dt; pitch.x += pitch.v * dt;
    } else if (!reduce) {
      // chase the opponent with a lag, so it drifts inside the reticle; dive past it at 9.5-12.8s
      var dive = smooth(9.5, 10.6, lt) * (1 - smooth(11.8, 12.8, lt)) * -16;
      spring(yaw, yaw.x + wrap(o[0] + 2 - yaw.x), 1.7, 0.75, dt);
      spring(pitch, o[1] + dive, 1.9, 0.8, dt);
    }
    yaw.v = clamp(yaw.v, -110, 110); pitch.v = clamp(pitch.v, -80, 80); pitch.x = clamp(pitch.x, -75, 75);
    spring(bank, reduce ? 0 : clamp(yaw.v * 0.5, -60, 60) + rollX, 3.2, 0.7, dt);
    suitQ = euler(yaw.x, pitch.x, bank.x);
    // flying forward: the cloud sea moves under us
    pos[0] += Math.sin(yaw.x * D) * 0.35 * dt; pos[1] += Math.cos(yaw.x * D) * 0.35 * dt;

    // the seat, hung in the ball: thrown outward in a turn, pressed down in a pull, lagging the roll
    if (!reduce) {
      var ax = -yaw.v * D * 0.075, ay = -pitch.v * D * 0.06;
      spring(seat[0], ax, 5.5, 0.38, dt); spring(seat[1], ay, 5.5, 0.38, dt); spring(seat[2], 0, 5.5, 0.45, dt);
      spring(seatRoll, -bank.v * 0.05, 6, 0.4, dt); spring(seatPitch, -pitch.v * 0.03, 6, 0.4, dt);
    }
    // the head drifts back to the nose once let go
    if (!dragging && now - lastDrag > 3000) { var k = Math.min(1, dt * 1.6); head.yaw -= head.yaw * k; head.pitch -= head.pitch * k; }
    // it leads the move (a third of the turn rate, a little under half the climb rate), and follows the mouse
    if (!reduce) {
      spring(lead.yaw, clamp(yaw.v * 0.3, -24, 24), 4.2, 0.5, dt); spring(lead.pitch, clamp(pitch.v * 0.42, -20, 20), 4.2, 0.5, dt);
      spring(gaze.yaw, dragging ? gaze.yaw.x : gazeAt[0] * 9, 3, 0.8, dt); spring(gaze.pitch, dragging ? gaze.pitch.x : -gazeAt[1] * 6, 3, 0.8, dt);
    }
    // the pilot's resting gaze is the nose itself: the triangle sight is right in front of the eyes
    var view = { yaw: head.yaw + lead.yaw.x + gaze.yaw.x, pitch: head.pitch + lead.pitch.x + gaze.pitch.x };

    // the opponent and its two escorts, loosely in company with it
    var od = dir(o[0], o[1]);
    var contacts = [{ id: 'opp', d: od },
      { id: 'ms1', d: dir(o[0] + 9 + 4 * Math.sin(T * 0.33), o[1] - 5 + 2 * Math.cos(T * 0.43)) },
      { id: 'ms2', d: dir(o[0] - 13 + 3 * Math.cos(T * 0.37), o[1] + 4 + 2 * Math.sin(T * 0.31)) }];
    // Targeting: the contact nearest the boresight, once inside LOCK_IN, is held for LOCK_TIME to lock. The
    // current target is kept until it drifts past LOCK_OUT (or another sits clearly nearer), so the lock never
    // flickers between two close contacts.
    var fwd = qrot(suitQ, [0, 0, 1]);
    contacts.forEach(function (c) { c.off = Math.acos(clamp(dot(c.d, fwd), -1, 1)) / D; });
    var near = contacts.reduce(function (a, b) { return b.off < a.off ? b : a; });
    var cur = contacts.filter(function (c) { return c.id === lockId; })[0];
    if (cur && cur.off < LOCK_OUT && !(near !== cur && near.off < cur.off - 2.5)) lockT += dt;
    else if (near.off < LOCK_IN) { if (near.id !== lockId) lockT = 0; lockId = near.id; lockT += dt; }
    else { lockId = null; lockT = 0; }
    locked = lockT > LOCK_TIME;

    shake *= Math.exp(-dt * 3.2); flash *= Math.exp(-dt * 7);
    var j = shake * 0.03, jr = shake * 1.6;
    var eye = [EYE0[0] + seat[0].x + (Math.random() - 0.5) * j, EYE0[1] + seat[1].x + (Math.random() - 0.5) * j, EYE0[2] + seat[2].x];
    var seatQ = euler(0, seatPitch.x + (Math.random() - 0.5) * jr, seatRoll.x + (Math.random() - 0.5) * jr);
    S.pose = {
      suitQ: suitQ, contacts: contacts, eye: eye, eyeQ: qmul(seatQ, euler(view.yaw, view.pitch, 0)), opp: od,
      heading: ((yaw.x % 360) + 360) % 360, pitch: pitch.x, flash: flash, pos: pos,
      locked: locked, lockT: lockT, lockId: lockId, mode: manual ? 'MANUAL' : 'AUTO', head: view, t: T
    };
  }

  // the camera: 87 degrees across on a landscape screen, 64 tall on a portrait one. (78 matches the reference frame
  // exactly with EYE0; the owner asked for it a little wider, 2026-10-05.) S.camRef is that fitted width.
  function camera(W, H) {
    if (W >= H) { var tx = 0.95; return { tx: tx, ty: tx * H / W }; }
    var ty = Math.tan(32 * D); return { tx: ty * W / H, ty: ty };
  }

  S.camRef = 0.81;
  var last = null, avg = 16;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = null; return; }
    var dt = last == null ? 1 / 60 : Math.min(0.05, (now - last) / 1000);
    if (last != null) avg += ((now - last) - avg) * 0.05;
    last = now;
    step(dt, now);
    var W = innerWidth, H = innerHeight;
    S.cam = camera(W, H); S.frameMs = avg;
    S.renderers.forEach(function (r) { r(S.pose, W, H); });
    S.frames++;
  }
  requestAnimationFrame(frame);
})();
