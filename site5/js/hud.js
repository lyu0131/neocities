/* hud.js: the HUD, drawn as vectors on a 2D canvas but authored ON the ball: every line is a run of
   points on the sphere, subdivided and projected through the same ball -> eye geometry as world.js,
   so it curves for real (a latitude ring bows, a reticle off the nose skews, everything bends as the
   seat sways) and stays sharp at any size. Two kinds of element, which is what sells the motion:
   - ball-fixed, riding with the suit: the reticle, ladders, tapes, plates, the waist rail, the heading
     tape and the roll arc -- front and rear, the monitor is all the way round;
   - world-fixed, sliding across the ball as the suit turns: the horizon bars and the target marker.
   The detail follows the clips' key frames (docs/reference.md): long flat-topped hex cells in
   staggered pairs, dash rulers without a spine, label plates with two lines of tiny text, the plate
   cluster under the sight. Three looks (?look=): mix (the default), xi, penelope. */
(function () {
  'use strict';
  var S = window.SITE5, m = S.m, D = m.D, qrot = m.qrot, norm = m.norm, dir = m.dir;
  var canvas = document.getElementById('hud'), ctx = canvas.getContext('2d');
  var LOOK = {
    mix:      { tri: 1, ring: 0,  hexes: 1, tapes: 1, bars: 1, cluster: 1, line: '#AFC0EC' },
    xi:       { tri: 1, ring: 0,  hexes: 1, tapes: 0, bars: 0, cluster: 0, line: '#9CB3E8' },
    penelope: { tri: 0, ring: 11, hexes: 0, tapes: 1, bars: 1, cluster: 1, line: '#BAC4F4' }
  }[S.look];
  var C = {
    tick: '#EEF3FA', pink: '#FFA3DC', bar: '#FF4F8B', barIn: '#FFC6E8', salmon: '#EBA89C', rail: '#5D7391',
    cell: 'rgba(50, 64, 79, .46)', cellEdge: '#8DA0BC', plate: 'rgba(120, 140, 200, .10)'
  };
  var FONT = "Michroma, 'B612 Mono', sans-serif";
  S.hudCtx = ctx;
  var parts = S.parts = {};
  var tapes = S.tapes = {};

  // ---- projection and drawing on the ball ----
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
  function fill(pts, color, alpha) {
    var q = pts.map(project);
    if (!q.every(Boolean)) return false;
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
    q.forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
    ctx.closePath(); ctx.fill();
    return true;
  }
  function text(p, s, color, alpha, size, align) {
    var q = project(p); if (!q) return;
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.font = size + 'px ' + FONT; ctx.textAlign = align || 'left';
    ctx.fillText(s, q[0], q[1]);
  }
  // a small circle on the ball around c, radius r degrees, from..to degrees round it
  function ring(c, r, from, to) {
    var B = basis(c), pts = [], cr = Math.cos(r * D), sr = Math.sin(r * D);
    for (var a = from; a <= to + 0.01; a += 4) {
      var ca = Math.cos(a * D), sa = Math.sin(a * D);
      pts.push(norm([c[0] * cr + (B.R[0] * ca + B.U[0] * sa) * sr, c[1] * cr + (B.R[1] * ca + B.U[1] * sa) * sr, c[2] * cr + (B.R[2] * ca + B.U[2] * sa) * sr]));
    }
    return pts;
  }
  var F = basis([0, 0, 1]);   // the nose

  function smooth(e0, e1, x) { var t = m.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  // ---- circles round the nose (or the tail) ----
  // The side ladders and tapes are arcs of circles centred on the boresight, as in the FPV frames: seen
  // from near the ball's centre a circle round the nose projects as a true circle, where a line of
  // constant azimuth (a great circle) would project straight. theta: degrees out from the axis; phi:
  // degrees round it, from the horizontal on side sd (+1 right, -1 left), up positive. aft: round the tail.
  var CELL = 36, RULER = 31, TAPE = 47, PHI_MAX = 80;
  function arcPt(sd, theta, phi, aft) {
    var a = aft ? -1 : 1, st = Math.sin(theta * D);
    return [st * sd * Math.cos(phi * D) * a, st * Math.sin(phi * D), Math.cos(theta * D) * a];
  }
  // the tangent basis there: R outward along the radius (screen-right on the right side), U round the arc (up)
  function arcBasis(sd, theta, phi, aft) {
    var a = aft ? -1 : 1, ct = Math.cos(theta * D), st = Math.sin(theta * D), cp = Math.cos(phi * D), sp = Math.sin(phi * D);
    return { c: arcPt(sd, theta, phi, aft), R: [ct * cp * a, sd * ct * sp, -sd * st * a], U: [-sd * sp * a, cp, 0] };
  }
  // the ladders fade out round toward the top and bottom, so they read as ( ) brackets and never reach
  // the heading tape or the plate cluster; the tapes run on off the screen
  function fadeL(phi) { return 1 - smooth(40, 66, Math.abs(phi)); }
  S.arcSample = [-40, -20, 0, 20, 40].map(function (ph) { return arcPt(1, RULER, ph); });

  // ---- shapes, in tangent units around a ball point B (u right, v up) ----
  // a long flat-topped hexagon with pointed ends (the ladder cell and the label plate)
  function longHex(B, u, v, a, b, k) {
    return [tp(B, u - a, v), tp(B, u - a + k, v + b), tp(B, u + a - k, v + b), tp(B, u + a, v), tp(B, u + a - k, v - b), tp(B, u - a + k, v - b)];
  }
  // a label plate: outline, an inset outline, and two lines of tiny "text" (dashes too small to read)
  function plate(B, u, v, a, b, alpha, color) {
    var al = alpha == null ? 1 : alpha;
    fill(longHex(B, u, v, a, b, b * 0.9), C.plate, al);
    stroke(color || LOOK.line, 0.7 * al, 1.2); path(longHex(B, u, v, a, b, b * 0.9), true);
    stroke(color || LOOK.line, 0.45 * al, 1); path(longHex(B, u, v, a * 0.86, b * 0.68, b * 0.62), true);
    stroke(color || LOOK.line, 0.55 * al, 1);
    [[-0.22, 0.6], [0.2, 0.45]].forEach(function (row) {
      for (var x = -a * 0.5, i = 0; x < a * 0.5; x += a * 0.12, i++) if ((i * 7) % 5 !== 3) seg(tp(B, u + x, v + b * row[0]), tp(B, u + x + a * 0.08 * row[1] * 1.6, v + b * row[0]));
    });
  }
  // an arrow plate pointing out (sd), with a chevron inside
  function arrowPlate(B, u, v, s, sd) {
    var P = function (x, y) { return tp(B, u + sd * x * s, v + y * s); };
    var out = [P(-1, 0.7), P(0.35, 0.7), P(1, 0), P(0.35, -0.7), P(-1, -0.7)];
    fill(out, C.plate, 1); stroke(LOOK.line, 0.75, 1.2); path(out, true);
    stroke(LOOK.line, 0.5, 1); path([P(-0.82, 0.5), P(0.25, 0.5), P(0.75, 0), P(0.25, -0.5), P(-0.82, -0.5)], true);
    stroke(LOOK.line, 0.85, 1.4); path([P(-0.35, 0.32), P(0.1, 0), P(-0.35, -0.32)]);
  }
  // a hexagonal badge with a smaller hexagon and three spokes inside
  function badge(B, u, v, s) {
    var hex = function (r) { var q = []; for (var a = 0; a < 360; a += 60) q.push(tp(B, u + Math.cos(a * D) * r * 1.15, v + Math.sin(a * D) * r)); return q; };
    fill(hex(s), C.plate, 1); stroke(LOOK.line, 0.75, 1.2); path(hex(s), true);
    stroke(LOOK.line, 0.5, 1); path(hex(s * 0.45), true);
    for (var a = 90; a < 450; a += 120) seg(tp(B, u + Math.cos(a * D) * s * 0.52, v + Math.sin(a * D) * s * 0.45), tp(B, u + Math.cos(a * D) * s * 0.85, v + Math.sin(a * D) * s * 0.8));
  }
  // a grid of small squares
  function dots(B, u, v, cols, rows, s) {
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var x = u + (i - (cols - 1) / 2) * s * 2.2, y = v + (j - (rows - 1) / 2) * s * 2.2;
      fill([tp(B, x - s, y - s), tp(B, x + s, y - s), tp(B, x + s, y + s), tp(B, x - s, y + s)], LOOK.line, 0.38);
    }
  }

  // ---- ball-fixed ----
  function waistRail() {
    // the ring round the ball at the pilot's waist, with a notch every 15 degrees
    var a = [], b = [];
    for (var az = -180; az <= 180; az += 3) { a.push(dir(az, -15)); b.push(dir(az, -16.2)); }
    stroke(C.rail, 0.85, 2); path(a); stroke(C.rail, 0.55, 1); path(b);
    for (az = -180; az < 180; az += 15) { stroke(C.rail, 0.7, 1.4); seg(dir(az, -16.2), dir(az, -17.6)); }
  }
  // the heading tape over the nose, and its reciprocal over the tail (at = 0 or 180)
  function headingTape(p, at) {
    var arc = [];
    for (var az = -14; az <= 14; az += 2) arc.push(dir(at + az, 28.5));
    stroke(LOOK.line, 0.55, 1); path(arc);
    var h = p.heading + at;
    for (var k = Math.ceil((h - 14) / 5) * 5; k <= h + 14; k += 5) {
      var rel = k - h, big = ((k % 10) + 10) % 10 === 0;
      stroke(LOOK.line, 0.7, 1); seg(dir(at + rel, 28.5), dir(at + rel, big ? 30.1 : 29.3));
      if (big && Math.abs(rel) < 12) text(dir(at + rel, 30.7), ('00' + (((k % 360) + 360) % 360)).slice(-3), LOOK.line, 0.7, 9, 'center');
    }
    stroke(at ? C.salmon : C.pink, 0.9, 1.4); path([dir(at - 0.8, 27.6), dir(at, 28.4), dir(at + 0.8, 27.6)]);
  }
  // A hex ladder: two staggered columns of long cells round a circle CELL degrees out, a dash ruler
  // just inside it (as in the seat shots) streaming at airspeed, and a label plate.
  function ladder(sd, aft, stream) {
    for (var ph = -PHI_MAX, i = 0; ph <= PHI_MAX; ph += 5, i++) {
      var al = fadeL(ph);
      if (al < 0.05) continue;
      var cells = longHex(arcBasis(sd, CELL, ph, aft), (i % 2) * sd * 0.032, 0, 0.034, 0.0185, 0.012);
      if (fill(cells, C.cell, al)) { stroke(C.cellEdge, 0.2 * al, 1); path(cells, true); }
    }
    var STEP = 1.7;
    for (var e = -PHI_MAX - STEP, n = 0; e <= PHI_MAX; e += STEP, n++) {
      var te = e - stream * STEP, a2 = fadeL(te), long = n % 5 === 0;
      if (a2 < 0.04) continue;
      stroke(C.tick, (long ? 0.7 : 0.42) * a2, long ? 1.8 : 1.1);
      seg(arcPt(sd, RULER, te, aft), arcPt(sd, RULER + (long ? 1.6 : 0.9), te, aft));
    }
    plate(arcBasis(sd, RULER - 3.6, 12, aft), 0, 0, 0.036, 0.0135, 0.9);
  }
  function ladders(p) {
    var stream = (p.dist * 0.003) % 1;
    tapes.stream = stream.toFixed(3);
    ladder(-1, false, stream); ladder(1, false, stream);
    // the rear of the monitor: the same pair round the tail
    ladder(-1, true, stream); ladder(1, true, stream);
    parts.rear = !!(project(dir(180, 10)) || project(arcPt(1, CELL, 0, true)) || project(arcPt(-1, CELL, 0, true)));
  }
  // The tapes, round a circle TAPE degrees out, as the dash ladders of the clip (no spine): left the
  // pitch tape (a dash every 2.5 degrees of the suit's pitch, a long bright one at every 10 with its
  // number), right the altitude tape (a dash every 20 m, a number every 100 m). Each has a pink
  // read-out at eye level; both run on off the top and bottom of the screen.
  var PH = 1.6, PA = 1.8;   // degrees round the tape per degree of pitch, per 20 m
  function tapesDraw(p) {
    var labels = [];
    ctx.textBaseline = 'middle';
    var dash = function (sd, ph, long, mid) {
      if (Math.abs(ph) > PHI_MAX) return;
      stroke(C.tick, long ? 0.85 : mid ? 0.6 : 0.4, long ? 2.2 : 1.2);
      seg(arcPt(sd, TAPE - (long ? 0.6 : 0), ph), arcPt(sd, TAPE + (long ? 2.8 : mid ? 1.7 : 1.1), ph));
    };
    for (var k = Math.ceil((p.pitch - PHI_MAX / PH) / 2.5) * 2.5; k <= p.pitch + PHI_MAX / PH; k += 2.5) {
      var ph = (k - p.pitch) * PH, ten = Math.abs(k % 10) < 0.01;
      dash(-1, ph, ten, Math.abs(k % 5) < 0.01);
      if (ten && Math.abs(k) <= 90) {
        var v = Math.round(k);
        if (Math.abs(ph) > 3.5) text(arcPt(-1, TAPE - 1.3, ph), (v > 0 ? '+' : '') + v, C.tick, 0.7, 9, 'left');   // the read-out takes eye level
        if (Math.abs(ph) < 40) labels.push(v);
      }
    }
    tapes.pitchLabels = labels;
    var STEP = 20;
    for (var h = Math.ceil((p.alt - PHI_MAX / PA * STEP) / STEP) * STEP; h <= p.alt + PHI_MAX / PA * STEP; h += STEP) {
      var pa = (h - p.alt) / STEP * PA, hund = Math.abs(h % 100) < 0.01;
      dash(1, pa, hund, Math.abs(h % 50) < 0.01);
      if (hund && Math.abs(pa) > 3.5) text(arcPt(1, TAPE - 1.3, pa), String(Math.round(h)), C.tick, 0.7, 9, 'right');
    }
    tapes.alt = Math.round(p.alt);
    [[-1, (p.pitch >= 0 ? '+' : '') + p.pitch.toFixed(1), 'left'], [1, String(Math.round(p.alt)), 'right']].forEach(function (r) {
      stroke(C.pink, 0.95, 1.6); path([arcPt(r[0], TAPE - 1.6, 1.3), arcPt(r[0], TAPE - 0.3, 0), arcPt(r[0], TAPE - 1.6, -1.3)]);
      ctx.letterSpacing = '1px'; text(arcPt(r[0], TAPE - 2, 0), r[1], C.pink, 0.95, 10, r[2]); ctx.letterSpacing = '0px';
    });
    ctx.textBaseline = 'alphabetic';
  }
  function rollArc(p) {
    // over the sight: a short arc whose ticks turn with the bank against a fixed pink pointer
    var r = 21.5;
    for (var a = -40; a <= 40; a += 10) {
      var at = 90 + a + p.bank, big = a % 30 === 0;
      if (Math.abs(at - 90) > 34) continue;
      stroke(LOOK.line, big ? 0.75 : 0.45, big ? 1.8 : 1.1);
      seg(ring(F.c, r, at, at)[0], ring(F.c, r + (big ? 1.8 : 1), at, at)[0]);
    }
    stroke(LOOK.line, 0.3, 1); path(ring(F.c, r, 56, 124));
    stroke(C.pink, 0.95, 1.6); path([ring(F.c, r - 1.5, 86.5, 86.5)[0], ring(F.c, r - 0.2, 90, 90)[0], ring(F.c, r - 1.5, 93.5, 93.5)[0]]);
    tapes.roll = Math.round(p.bank);
  }
  function triangle(p) {
    // the inverted-triangle reticle, in old screen units (y down) mapped onto the tangent plane at the nose
    var u = Math.min(0.28, tx * 0.46) / 237;
    var L = function (x, y) { return tp(F, x * u, -y * u); };
    var lw = f / 605;
    var Tt = -200, A = 210, hw = 237, len = Math.hypot(hw, A - Tt);
    var face = [L(-hw, Tt), L(hw, Tt), L(0, A)];
    var q = face.map(project);
    if (q[0] && q[1]) S.triWidth = Math.round(q[1][0] - q[0][0]);
    fill(face, 'rgb(170, 186, 245)', 0.07);
    stroke(LOOK.line, 0.32, 1 * lw); path(face, true);
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
    // the penelope look's own sight: a ring with tick groups, a small centre ring, stems
    var r = LOOK.ring;
    stroke(LOOK.line, 0.55, 1.4); path(ring(F.c, r, 0, 360), true);
    for (var a = 0; a < 360; a += 15) {
      var big = a % 90 === 0;
      stroke(LOOK.line, 0.6, big ? 2 : 1); seg(ring(F.c, r, a, a)[0], ring(F.c, r + (big ? 2.2 : 1), a, a)[0]);
    }
    stroke(LOOK.line, 0.8, 1.4); path(ring(F.c, 1.3, 0, 360), true);
    stroke(LOOK.line, 0.75, 1.6); seg(dir(0, 2.2), dir(0, 6)); seg(dir(0, -2.2), dir(0, -9)); seg(dir(-2.2, 0), dir(-6, 0)); seg(dir(2.2, 0), dir(6, 0));
    stroke(LOOK.line, 0.7, 1.2); seg(dir(-3, r - 2), dir(3, r - 2)); seg(dir(-2, r - 3.2), dir(2, r - 3.2));
    ctx.letterSpacing = '4px'; text(dir(r * 0.62, r * 0.72), p.mode, C.pink, 0.95, 12, 'left'); ctx.letterSpacing = '0px';
    parts.ring = true;
  }
  // under the sight, the plate cluster from the penelope view: chevrons (periwinkle over salmon),
  // hex badges, arrow plates pointing out, small tab plates and dot grids
  function cluster(y0) {
    var B = basis(dir(0, y0)), s = 0.016;
    stroke(LOOK.line, 0.8, 2); path([tp(B, -0.024, 0.012), tp(B, 0, -0.008), tp(B, 0.024, 0.012)]);
    stroke(C.salmon, 0.9, 2); path([tp(B, -0.024, -0.05), tp(B, 0, -0.03), tp(B, 0.024, -0.05)]);
    [-1, 1].forEach(function (sd) {
      badge(B, sd * 0.088, -0.02, s * 1.25);
      arrowPlate(B, sd * 0.155, -0.02, s * 1.55, sd);
      plate(B, sd * 0.085, 0.034, 0.024, 0.0095, 0.85);
      plate(B, sd * 0.085, -0.074, 0.024, 0.0095, 0.85);
      dots(B, sd * 0.215, -0.02, 2, 2, 0.0042);
    });
  }
  // behind the seat: the same plate language round a rear marker (the monitor sees six o'clock too)
  function rearCluster() {
    var B = basis(dir(180, 4)), s = 0.016;
    var tri = [tp(B, -0.05, 0.03), tp(B, 0.05, 0.03), tp(B, 0, -0.055)];
    fill(tri, C.plate, 1); stroke(LOOK.line, 0.75, 1.4); path(tri, true);
    stroke(LOOK.line, 0.55, 1.2); path([tp(B, -0.028, 0.012), tp(B, 0, -0.03), tp(B, 0.028, 0.012)]);
    stroke(LOOK.line, 0.85, 2.4); seg(tp(B, -0.058, 0.046), tp(B, 0.058, 0.046));
    ctx.letterSpacing = '3px'; text(tp(B, 0, -0.085), 'AFT', C.salmon, 0.9, 10, 'center'); ctx.letterSpacing = '0px';
    [-1, 1].forEach(function (sd) {
      arrowPlate(B, sd * 0.11, -0.005, s * 1.5, sd);
      badge(B, sd * 0.19, -0.005, s * 1.15);
      dots(B, sd * 0.255, -0.005, 2, 3, 0.004);
    });
  }

  // ---- world-fixed ----
  function horizonBars(p, at) {
    // the pink double bars, set on a white tick rail, on the world's horizon either side of the
    // heading (and of its reciprocal, behind): they bank and slide against the ball
    [-1, 1].forEach(function (sd) {
      var pt = function (d, e) { return toBall(dir(p.heading + at + sd * d, e)); };
      var a = [], b = [], up = [], dn = [];
      for (var d = 17; d <= 43; d += 2) { a.push(pt(d, 0)); b.push(pt(d, -0.8)); up.push(pt(d, 1.3)); dn.push(pt(d, -2.1)); }
      stroke(C.tick, 0.38, 1); path(up); path(dn);
      for (d = 18; d <= 42; d += 2) { var big = (d - 18) % 8 === 0; stroke(C.tick, big ? 0.55 : 0.35, 1); seg(pt(d, 1.3), pt(d, big ? 2.6 : 1.9)); seg(pt(d, -2.1), pt(d, -2.7)); }
      stroke(C.bar, 0.9, 1.8); path(a); stroke(C.barIn, 0.65, 1.1); path(b);
      stroke(C.bar, 0.85, 1.6); seg(pt(17, 1.3), pt(17, -2.1));
    });
  }
  function target(p) {
    var po = toBall(p.opp), B = basis(po), r = 0.036;
    // the marker: an inverted triangle with a V inside and a double bar over it
    stroke(LOOK.line, 0.9, 1.6); path([tp(B, -r, r * 0.55), tp(B, r, r * 0.55), tp(B, 0, -r * 0.95)], true);
    stroke(LOOK.line, 0.95, 2.6); seg(tp(B, -r * 1.12, r * 0.8), tp(B, r * 1.12, r * 0.8));
    stroke(LOOK.line, 0.85, 1.3); path([tp(B, -r * 0.45, r * 0.2), tp(B, 0, -r * 0.4), tp(B, r * 0.45, r * 0.2)]);
    // locked: a ring closing on it, its ticks turning; the labels sit just outside whatever is round it
    // the ring scales with the triangle, which is smaller on a narrow screen
    var rr = (4.4 + 4 * Math.exp(-p.lockT * 5)) * Math.max(0.7, Math.min(0.28, tx * 0.46) / 0.28), lx = p.lockT > 0 ? Math.tan((rr + 1.6) * D) : r * 0.95;
    ctx.letterSpacing = '2px';
    text(tp(B, lx, -r * 0.35), 'UNKNOWN', C.salmon, 0.95, 10, 'left');
    ctx.letterSpacing = '0px';
    if (p.lockT > 0) {
      var spin = p.t * 90;
      stroke(p.locked ? C.bar : LOOK.line, p.locked ? 0.95 : 0.6, 1.5); path(ring(po, rr, 0, 360), true);
      for (var a = 0; a < 360; a += 45) seg(ring(po, rr, a + spin, a + spin)[0], ring(po, rr + 1, a + spin, a + spin)[0]);
      if (p.locked) { ctx.letterSpacing = '2px'; text(tp(B, lx, -r * 1.35), 'LOCK', C.bar, 0.95, 10, 'left'); ctx.letterSpacing = '0px'; }
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

  S.project = function (p) { return E ? project(p) : null; };
  S.renderers.push(function (p, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    W = w; H = h; E = p.eye; EQi = m.qconj(p.eyeQ); SQi = m.qconj(p.suitQ); tx = S.cam.tx; ty = S.cam.ty; f = W / 2 / tx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    parts.ring = false;
    waistRail();
    if (LOOK.hexes) ladders(p);
    if (LOOK.tapes) tapesDraw(p);
    headingTape(p, 0); headingTape(p, 180);
    if (LOOK.ring) circleReticle(p);
    rollArc(p);
    if (LOOK.tri) triangle(p);
    if (LOOK.cluster) cluster(LOOK.tri ? -22 : -21);
    rearCluster();
    if (LOOK.bars) { horizonBars(p, 0); horizonBars(p, 180); }
    target(p);
    ctx.globalAlpha = 1;
  });
  if (document.fonts && document.fonts.load) document.fonts.load('12px Michroma');
})();
