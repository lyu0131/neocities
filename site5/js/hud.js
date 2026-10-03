/* hud.js: the HUD, drawn as vectors on a 2D canvas but authored ON the ball: every line is a run of
   points on the sphere, subdivided and projected through the same ball -> eye geometry as world.js,
   so it curves for real (a latitude ring bows, a reticle off the nose skews, everything bends as the
   seat sways) and stays sharp at any size. Two kinds of element, which is what sells the motion:
   - ball-fixed, riding with the suit: the reticle and its mode word, the rings, ladders, rulers, the
     waist rail, the heading tape;
   - world-fixed, sliding across the ball as the suit turns: the horizon bars and the target marker.
   Three looks (?look=): mix (the default), xi, penelope; see docs/reference.md. */
(function () {
  'use strict';
  var S = window.SITE5, m = S.m, D = m.D, qrot = m.qrot, norm = m.norm, dir = m.dir;
  var canvas = document.getElementById('hud'), ctx = canvas.getContext('2d');
  var seatEl = document.getElementById('seat');
  var LOOK = {
    mix:      { tri: 1, ring: 20, hexes: 1, rulers: 1, bars: 1, chev: 1, line: '#AFC0EC' },
    xi:       { tri: 1, ring: 0,  hexes: 1, rulers: 0, bars: 0, chev: 0, line: '#9CB3E8' },
    penelope: { tri: 0, ring: 17, hexes: 0, rulers: 1, bars: 1, chev: 1, line: '#BAC4F4' }
  }[S.look];
  var C = { tick: '#EEF3FA', pink: '#FFA3DC', bar: '#FF4F8B', barIn: '#FFC6E8', salmon: '#EBA89C', hex: 'rgba(63, 78, 92, .2)', rail: '#5D7391' };
  var FONT = "Michroma, 'B612 Mono', sans-serif";

  var W = 0, H = 0, E, EQi, SQi, tx, ty, f;   // per frame
  function project(p) {
    var v = qrot(EQi, [p[0] - E[0], p[1] - E[1], p[2] - E[2]]);
    if (v[2] < 0.04) return null;
    return [W / 2 + v[0] / v[2] / tx * W / 2, H / 2 - v[1] / v[2] / ty * H / 2];
  }
  function toBall(w) { return qrot(SQi, w); }
  // the tangent basis at a ball point: R toward increasing azimuth, U toward increasing elevation
  function basis(c) {
    var az = Math.atan2(c[0], c[2]), el = Math.asin(m.clamp(c[1], -1, 1));
    return { c: c, R: [Math.cos(az), 0, -Math.sin(az)], U: [-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az)] };
  }
  // a point near c, (u, v) in tangent units (tan of the angle off c)
  function tp(B, u, v) { return norm([B.c[0] + B.R[0] * u + B.U[0] * v, B.c[1] + B.R[1] * u + B.U[1] * v, B.c[2] + B.R[2] * u + B.U[2] * v]); }

  function stroke(color, alpha, width) { ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = Math.max(0.8, width); }
  // a polyline through ball points, subdivided every ~1.2 degrees so it follows the sphere
  function path(pts, closed) {
    ctx.beginPath();
    var pen = false, n = pts.length;
    for (var i = 0; i < (closed ? n : n - 1); i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      var ang = Math.acos(m.clamp(m.dot(a, b), -1, 1)), k = Math.max(1, Math.ceil(ang / (1.2 * D)));
      for (var j = i === 0 ? 0 : 1; j <= k; j++) {
        var t = j / k, s = project(norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
        if (!s) { pen = false; continue; }
        if (pen) ctx.lineTo(s[0], s[1]); else { ctx.moveTo(s[0], s[1]); pen = true; }
      }
    }
    ctx.stroke();
  }
  function seg(a, b) { path([a, b]); }
  function text(p, s, color, alpha, size, align) {
    var q = project(p); if (!q) return;
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.font = size + 'px ' + FONT; ctx.textAlign = align || 'left';
    ctx.fillText(s, q[0], q[1]);
  }
  // a small circle on the ball around c, radius r degrees
  function ring(c, r, from, to) {
    var B = basis(c), pts = [], cr = Math.cos(r * D), sr = Math.sin(r * D);
    for (var a = from; a <= to + 0.01; a += 4) {
      var ca = Math.cos(a * D), sa = Math.sin(a * D);
      pts.push(norm([c[0] * cr + (B.R[0] * ca + B.U[0] * sa) * sr, c[1] * cr + (B.R[1] * ca + B.U[1] * sa) * sr, c[2] * cr + (B.R[2] * ca + B.U[2] * sa) * sr]));
    }
    return pts;
  }

  var F = basis([0, 0, 1]);   // the nose

  // ---- ball-fixed ----
  function waistRail() {
    // the ring round the ball at the pilot's waist, with a notch every 15 degrees
    var a = [], b = [];
    for (var az = -180; az <= 180; az += 3) { a.push(dir(az, -15)); b.push(dir(az, -16.2)); }
    stroke(C.rail, 0.85, 2); path(a); stroke(C.rail, 0.55, 1); path(b);
    for (az = -180; az < 180; az += 15) { stroke(C.rail, 0.7, 1.4); seg(dir(az, -16.2), dir(az, -17.6)); }
  }
  function headingTape(p) {
    var arc = [];
    for (var az = -14; az <= 14; az += 2) arc.push(dir(az, 27));
    stroke(LOOK.line, 0.55, 1); path(arc);
    var h = p.heading;
    for (var k = Math.ceil((h - 14) / 5) * 5; k <= h + 14; k += 5) {
      var rel = k - h, big = ((k % 10) + 10) % 10 === 0;
      stroke(LOOK.line, 0.7, 1); seg(dir(rel, 27), dir(rel, big ? 28.6 : 27.8));
      if (big && Math.abs(rel) < 12) text(dir(rel, 29.2), ('00' + (((k % 360) + 360) % 360)).slice(-3), LOOK.line, 0.7, 9, 'center');
    }
    stroke(C.pink, 0.9, 1.4); path([dir(-0.8, 26.1), dir(0, 26.9), dir(0.8, 26.1)]);
  }
  // The side scales run the ball's whole height and fade out toward its top and bottom, so they close
  // in on each other the way the ball's own meridians do instead of stopping dead.
  var EL_MAX = 82, TAPE = 47;   // the scales fade out toward 82 degrees up and down; the white tapes sit 47 out
  function fade(el) { return 1 - smooth(46, EL_MAX, Math.abs(el)); }
  function smooth(e0, e1, x) { var t = m.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  // a meridian line at azimuth az, drawn in short runs so its alpha can fade by elevation
  function meridian(az, color, alpha, width) {
    for (var e = -EL_MAX; e < EL_MAX; e += 4) {
      var mid = e + 2, a = alpha * fade(mid);
      if (a < 0.02) continue;
      stroke(color, a, width); seg(dir(az, e), dir(az, e + 4));
    }
  }
  // a tick on the meridian at az, pointing outward (sd) by len degrees
  function tick(az, sd, el, len, color, alpha, width) {
    var a = alpha * fade(el);
    if (a < 0.02 || Math.abs(el) > EL_MAX) return;
    stroke(color, a, width); seg(dir(az, el), dir(az + sd * len, el));
  }
  function label(az, el, s, color, alpha, size, align) {
    var a = alpha * fade(el);
    if (a > 0.05 && Math.abs(el) < EL_MAX) text(dir(az, el), s, color, a, size, align);
  }
  function hexLadders(p) {
    // the hex-cell columns, and a thin ruler beside each whose ticks stream past at airspeed
    var stream = (p.dist * 0.006) % 2;
    tapes.stream = stream.toFixed(3);
    [-1, 1].forEach(function (sd) {
      for (var el = -70, i = 0; el <= 74; el += 4.4, i++) {
        var al = fade(el);
        if (al < 0.05) continue;
        var B = basis(dir(sd * (30 + (i % 2) * 2.2), el)), r = 0.028, pts = [];
        for (var a = 0; a < 360; a += 60) pts.push(tp(B, Math.cos(a * D) * r * 1.3, Math.sin(a * D) * r));
        var q = pts.map(project);
        if (q.every(Boolean)) {
          ctx.globalAlpha = al; ctx.fillStyle = C.hex; ctx.beginPath();
          q.forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); ctx.fill();
        }
        stroke(LOOK.line, 0.24 * al, 1); path(pts, true);
      }
      var rx = sd * 36.5;
      meridian(rx, LOOK.line, 0.4, 1);
      for (var e = -EL_MAX - 2, n = 0; e <= EL_MAX; e += 2, n++) {
        var te = e - stream;
        tick(rx, sd, te, (n % 5 === 0) ? 1.8 : 0.8, LOOK.line, 0.45, 1);
      }
    });
  }
  function rulers(p) {
    // left: the pitch tape -- ticks every 2.5 degrees of the suit's pitch, scrolling as it climbs or dives;
    // right: the altitude tape -- a tick every 20 m, 1.5 degrees apart, labelled every 100 m
    var labels = [];
    for (var k = Math.ceil((p.pitch - EL_MAX) / 2.5) * 2.5; k <= p.pitch + EL_MAX; k += 2.5) {
      var el = k - p.pitch, ten = Math.abs(k % 10) < 0.01;
      tick(-TAPE, -1, el, ten ? 2.6 : (Math.abs(k % 5) < 0.01 ? 1.8 : 1.1), C.tick, ten ? 0.8 : 0.45, ten ? 2 : 1.2);
      if (ten && Math.abs(k) <= 90) {
        var v = Math.round(k);
        if (Math.abs(el) > 2.5) label(-TAPE + 1.2, el - 0.5, (v > 0 ? '+' : '') + v, C.tick, 0.7, 9, 'left');   // the read-out takes eye level
        if (Math.abs(el) < 40) labels.push(v);
      }
    }
    meridian(-TAPE, C.tick, 0.3, 1);
    tapes.pitchLabels = labels;
    var STEP = 20, DEG = 1.5;
    for (var h = Math.ceil((p.alt - EL_MAX / DEG * STEP) / STEP) * STEP; h <= p.alt + EL_MAX / DEG * STEP; h += STEP) {
      var e2 = (h - p.alt) / STEP * DEG, hund = Math.abs(h % 100) < 0.01;
      tick(TAPE, 1, e2, hund ? 2.6 : 1.3, C.tick, hund ? 0.8 : 0.45, hund ? 2 : 1.2);
      if (hund && Math.abs(e2) > 2.5) label(TAPE - 1.2, e2 - 0.5, String(Math.round(h)), C.tick, 0.7, 9, 'right');
    }
    meridian(TAPE, C.tick, 0.3, 1);
    tapes.alt = Math.round(p.alt);
    // the read-outs at eye level, each with a pink caret on its tape
    [[-TAPE, -1, (p.pitch >= 0 ? '+' : '') + p.pitch.toFixed(1), 'left'], [TAPE, 1, String(Math.round(p.alt)), 'right']].forEach(function (r) {
      stroke(C.pink, 0.95, 1.6); path([dir(r[0] - r[1] * 1.6, 0.9), dir(r[0] - r[1] * 0.3, 0), dir(r[0] - r[1] * 1.6, -0.9)]);
      ctx.letterSpacing = '1px'; text(dir(r[0] - r[1] * 2, -0.5), r[2], C.pink, 0.95, 10, r[3]); ctx.letterSpacing = '0px';
    });
  }
  function rollScale(p) {
    // ticks on the bottom of the outer ring, turning with the bank against a fixed pink pointer
    var r = LOOK.ring + 0.6;
    for (var a = -60; a <= 60; a += 10) {
      var at = 270 + a + p.bank, big = a % 30 === 0;
      stroke(LOOK.line, big ? 0.75 : 0.45, big ? 1.8 : 1.1);
      seg(ring(F.c, r, at, at)[0], ring(F.c, r + (big ? 2 : 1.1), at, at)[0]);
    }
    stroke(C.pink, 0.95, 1.6); path([ring(F.c, r - 1.6, 266, 266)[0], ring(F.c, r - 0.2, 270, 270)[0], ring(F.c, r - 1.6, 274, 274)[0]]);
    tapes.roll = Math.round(p.bank);
  }
  function triangle(p) {
    // the inverted-triangle reticle, in old screen units (y down) mapped onto the tangent plane at the nose
    var u = Math.min(0.28, tx * 0.46) / 237;
    var L = function (x, y) { return tp(F, x * u, -y * u); };
    var lw = f / 605;
    var Tt = -200, A = 210, hw = 237, len = Math.hypot(hw, A - Tt);
    var face = [L(-hw, Tt), L(hw, Tt), L(0, A)].map(project);
    if (face[0] && face[1]) S.triWidth = Math.round(face[1][0] - face[0][0]);
    if (face.every(Boolean)) {
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(170, 186, 245, .07)'; ctx.beginPath();
      face.forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); ctx.fill();
    }
    stroke(LOOK.line, 0.32, 1 * lw); path([L(-hw, Tt), L(hw, Tt), L(0, A)], true);
    [-1, 1].forEach(function (sd) {
      var ux = -sd * hw / len, uy = (A - Tt) / len, nx = sd * (A - Tt) / len, ny = hw / len;
      var at = function (t, off) { return L(sd * hw + ux * len * t + nx * off, Tt + uy * len * t + ny * off); };
      stroke(LOOK.line, 0.62, 7 * lw); seg(at(-0.04, 30), at(0.3, 30)); seg(at(0.72, 30), at(1.03, 30));
      var ix = sd * hw * 0.62, iy = Tt + 62;
      stroke(LOOK.line, 0.56, 5 * lw); path([L(ix - sd * 78, iy), L(ix, iy), L(ix + ux * 84, iy + uy * 84)]);
      var ang = (sd < 0 ? 150 : 30) * D, c = Math.cos(ang), sn = Math.sin(ang);
      [-3, 3].forEach(function (o) { stroke(LOOK.line, 0.5, 1.4 * lw); seg(L(c * 270 - sn * o, sn * 270 + c * o), L(c * 380 - sn * o, sn * 380 + c * o)); });
      for (var h = 0; h < 6; h++) { var x0 = sd * (262 + h * 17); stroke(LOOK.line, 0.55, 1.6 * lw); seg(L(x0, 150), L(x0 + 10, 162)); }
    });
    stroke(LOOK.line, 0.56, 5 * lw); path([L(-48, A - 196), L(0, A - 116), L(48, A - 196)]);
    [30, 150, 210, 330].forEach(function (a) { stroke(LOOK.line, 0.72, 3 * lw); seg(L(Math.cos(a * D) * 54, Math.sin(a * D) * 54), L(Math.cos(a * D) * 82, Math.sin(a * D) * 82)); });
    stroke(LOOK.line, 0.6, 3 * lw); seg(L(0, Tt + 22), L(0, Tt + 70)); seg(L(0, A - 92), L(0, A - 40));
    stroke(LOOK.line, 0.8, 2 * lw); seg(L(0, -40), L(0, -14)); seg(L(0, 18), L(0, 52));
    stroke(LOOK.line, 0.9, 1.5 * lw); seg(L(-7, -3), L(7, -3)); seg(L(-7, 3), L(7, 3));
    ctx.letterSpacing = lw < 0.8 ? '2px' : '4px';
    text(L(hw - 24, Tt + 20 + 12 / lw), p.mode, C.pink, 0.95, Math.max(9, Math.round(13 * lw)), 'right');
    ctx.letterSpacing = '0px';
  }
  function circleReticle(p) {
    var r = LOOK.ring, solo = !LOOK.tri;
    stroke(LOOK.line, solo ? 0.55 : 0.26, solo ? 1.4 : 1); path(ring(F.c, r, 0, 360), true);
    for (var a = 0; a < 360; a += 15) {
      var big = a % 90 === 0, o = ring(F.c, r, a, a)[0], i2 = ring(F.c, r + (big ? 2.2 : 1), a, a)[0];
      stroke(LOOK.line, solo ? 0.6 : 0.32, big ? 2 : 1); seg(o, i2);
    }
    if (solo) {
      // its centre: a small ring, stems, the top double mark, and the mode word
      stroke(LOOK.line, 0.8, 1.4); path(ring(F.c, 1.3, 0, 360), true);
      stroke(LOOK.line, 0.75, 1.6); seg(dir(0, 2.2), dir(0, 6)); seg(dir(0, -2.2), dir(0, -9)); seg(dir(-2.2, 0), dir(-6, 0)); seg(dir(2.2, 0), dir(6, 0));
      stroke(LOOK.line, 0.7, 1.2); seg(dir(-3, r - 2), dir(3, r - 2)); seg(dir(-2, r - 3.2), dir(2, r - 3.2));
      ctx.letterSpacing = '4px'; text(dir(r * 0.62, r * 0.72), p.mode, C.pink, 0.95, 12, 'left'); ctx.letterSpacing = '0px';
    }
  }
  function chevrons() {
    var y0 = LOOK.tri ? -21 : -20;
    stroke(LOOK.line, 0.8, 2); path([dir(-1.4, y0 + 0.7), dir(0, y0 - 0.5), dir(1.4, y0 + 0.7)]);
    stroke(C.salmon, 0.9, 2); path([dir(-1.4, y0 - 3), dir(0, y0 - 1.8), dir(1.4, y0 - 3)]);
  }

  // ---- world-fixed ----
  function horizonBars(p) {
    // pink double bars on the world's horizon either side of the heading: they bank against the ball
    [-1, 1].forEach(function (sd) {
      var a = [], b = [];
      for (var d = 18; d <= 42; d += 3) { a.push(toBall(dir(p.heading + sd * d, 0))); b.push(toBall(dir(p.heading + sd * d, -1.1))); }
      stroke(C.bar, 0.85, 1.8); path(a); stroke(C.barIn, 0.6, 1); path(b);
      stroke(C.bar, 0.8, 1.6); seg(toBall(dir(p.heading + sd * 18, 0.9)), toBall(dir(p.heading + sd * 18, -2)));
    });
  }
  function target(p) {
    var po = toBall(p.opp), B = basis(po), r = 0.036;
    // the marker: an inverted triangle with a V inside and a double bar over it
    stroke(LOOK.line, 0.9, 1.6); path([tp(B, -r, r * 0.55), tp(B, r, r * 0.55), tp(B, 0, -r * 0.95)], true);
    stroke(LOOK.line, 0.95, 2.6); seg(tp(B, -r * 1.12, r * 0.8), tp(B, r * 1.12, r * 0.8));
    stroke(LOOK.line, 0.85, 1.3); path([tp(B, -r * 0.45, r * 0.2), tp(B, 0, -r * 0.4), tp(B, r * 0.45, r * 0.2)]);
    ctx.letterSpacing = '2px';
    text(tp(B, r * 0.95, -r * 1.25), 'UNKNOWN', C.salmon, 0.95, 10, 'left');
    ctx.letterSpacing = '0px';
    // locked: a ring closing on it, its ticks turning
    if (p.lockT > 0 && (LOOK.ring || S.look === 'mix')) {
      var rr = 3.3 + 4 * Math.exp(-p.lockT * 5), spin = p.t * 90;
      stroke(p.locked ? C.bar : LOOK.line, p.locked ? 0.95 : 0.6, 1.5); path(ring(po, rr, 0, 360), true);
      for (var a = 0; a < 360; a += 45) seg(ring(po, rr, a + spin, a + spin)[0], ring(po, rr + 1, a + spin, a + spin)[0]);
      if (p.locked) { ctx.letterSpacing = '2px'; text(tp(B, r * 0.95, -r * 2.3), 'LOCK', C.bar, 0.95, 10, 'left'); ctx.letterSpacing = '0px'; }
    } else if (p.locked) {
      stroke(C.pink, 0.95, 1.6); path(ring(po, 3.6, 0, 360), true);
    }
    // off the nose: a dotted arc leads from the reticle to it
    var off = Math.acos(m.clamp(po[2], -1, 1)) / D;
    if (off > 10) {
      var ax = norm([po[0], po[1], 0]), end = Math.min(off - 4, 46);
      ctx.fillStyle = LOOK.line;
      for (var g = 9; g <= end; g += 1.7) {
        var s = project(norm([ax[0] * Math.sin(g * D), ax[1] * Math.sin(g * D), Math.cos(g * D)]));
        if (!s) continue;
        ctx.globalAlpha = 0.75 * (1 - (g - 9) / 50); ctx.beginPath(); ctx.arc(s[0], s[1], 1.8, 0, 7); ctx.fill();
      }
    }
  }

  var tapes = S.tapes = {};
  S.project = function (p) { return E ? project(p) : null; };
  S.renderers.push(function (p, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    W = w; H = h; E = p.eye; EQi = m.qconj(p.eyeQ); SQi = m.qconj(p.suitQ); tx = S.cam.tx; ty = S.cam.ty; f = W / 2 / tx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    waistRail();
    if (LOOK.hexes) hexLadders(p);
    if (LOOK.rulers) rulers(p);
    headingTape(p);
    if (LOOK.ring) { circleReticle(p); rollScale(p); }
    if (LOOK.tri) triangle(p);
    if (LOOK.chev) chevrons();
    if (LOOK.bars) horizonBars(p);
    target(p);
    ctx.globalAlpha = 1;
    // the seat edge is fixed to the seat, as the eye is: only the head turning moves it
    if (seatEl) seatEl.style.transform = 'translate(' + (-Math.tan(m.clamp(p.head.yaw, -80, 80) * D) * f).toFixed(1) + 'px,' + (Math.tan(m.clamp(p.head.pitch, -70, 70) * D) * f).toFixed(1) + 'px)';
  });
  if (document.fonts && document.fonts.load) document.fonts.load('12px Michroma');
})();
