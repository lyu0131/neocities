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
    mix:      { tri: 1, y: 0, hexes: 1, tapes: 1, bars: 1, cluster: 1, line: '#AFC0EC' },
    xi:       { tri: 1, y: 0, hexes: 1, tapes: 0, bars: 0, cluster: 0, line: '#9CB3E8' },
    penelope: { tri: 0, y: 1, hexes: 0, tapes: 1, bars: 1, cluster: 1, line: '#BAC4F4' }
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
  // A vertebra cell: a wedge along the radius (r outward, in tangent units; sd flips it for the left
  // side), narrower toward the sight, its outer corners chamfered -- the chained cells of the refs.
  function vertebra(B, sd, r0, a, b) {
    var P = function (r, v) { return tp(B, sd * (r0 + r), v); };
    return [P(-a, -b * 0.6), P(a - b * 0.35, -b), P(a, -b * 0.6), P(a, b * 0.6), P(a - b * 0.35, b), P(-a, b * 0.6)];
  }
  // a wing cell: an arrow-headed plate pointing in toward the sight
  function wingCell(B, sd, r0, b) {
    var P = function (r, v) { return tp(B, sd * (r0 + r), v); };
    return [P(-0.03, 0), P(-0.006, b * 1.1), P(0.05, b * 0.8), P(0.05, -b * 0.8), P(-0.006, -b * 1.1)];
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
      var B = arcBasis(sd, CELL, ph, aft), r0 = (i % 2) * 0.03;
      var cells = vertebra(B, sd, r0, 0.034, 0.02);
      if (fill(cells, C.cell, al)) {
        stroke(C.cellEdge, 0.2 * al, 1); path(cells, true);
        stroke(C.cellEdge, 0.35 * al, 1); seg(tp(B, sd * (r0 + 0.012), -0.006), tp(B, sd * (r0 + 0.012), 0.006));
      }
      // now and then a larger wing cell further out, pointing in (as in the seat shots)
      if (i % 6 === 3) { var wing = wingCell(B, sd, 0.085, 0.024); if (fill(wing, C.cell, al * 0.9)) { stroke(C.cellEdge, 0.22 * al, 1); path(wing, true); } }
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
  // Ref #21/#17: a ring of loose radial dashes round the sight, uneven lengths, open at the top (the
  // heading tape and roll arc) and the bottom (the plate cluster) -- dashes, not a line.
  var RING = 26.5;
  function ringDashes() {
    var n = 0;
    for (var a = 0; a < 360; a += 6) {
      var up = Math.abs(a - 90) < 44, dn = Math.abs(a - 270) < 36;
      if (up || dn) continue;
      var h = Math.abs(Math.sin(a * 12.9898) * 43758.5453) % 1, len = 0.5 + h * 1.6;
      var c = Math.cos(a * D), sn = Math.sin(a * D);
      var pt = function (th) { var st = Math.sin(th * D); return [st * c, st * sn, Math.cos(th * D)]; };
      stroke(LOOK.line, 0.32 + h * 0.3, h > 0.7 ? 1.8 : 1.2); seg(pt(RING), pt(RING + len));
      n++;
    }
    parts.ringDashes = n;
  }
  // Ref #34/#35: small rows of alternating up/down triangles either side of the sight
  function triRows() {
    [-1, 1].forEach(function (sd) {
      var B = basis(dir(sd * 20, 3.6)), s = 0.0105;
      for (var k = 0; k < 4; k++) {
        var x = (k - 1.5) * s * 2.3, up = k % 2 === 0 ? 1 : -1;
        var tri = [tp(B, x - s, -up * s * 0.75), tp(B, x + s, -up * s * 0.75), tp(B, x, up * s * 0.95)];
        fill(tri, LOOK.line, 0.32); stroke(LOOK.line, 0.6, 1); path(tri, true);
      }
    });
  }
  // the penelope look's own sight (ref #6, #35): a Y of three double bars round a small '=' centre
  function yReticle(p) {
    [90 + 60, 90 - 60, 270].forEach(function (a) {
      var c = Math.cos(a * D), sn = Math.sin(a * D), nx = -sn, ny = c;
      [-1, 1].forEach(function (o) {
        var off = o * 0.0045, pt = function (r) { return tp(F, c * r + nx * off, sn * r + ny * off); };
        stroke(LOOK.line, 0.8, 2.2); seg(pt(0.03), pt(0.085));
      });
    });
    stroke(LOOK.line, 0.9, 1.5); seg(tp(F, -0.011, 0.004), tp(F, 0.011, 0.004)); seg(tp(F, -0.011, -0.004), tp(F, 0.011, -0.004));
    stroke(LOOK.line, 0.7, 1.4); seg(tp(F, 0, 0.12), tp(F, 0, 0.2)); seg(tp(F, 0, -0.12), tp(F, 0, -0.26));
    ctx.letterSpacing = '4px'; text(tp(F, 0.1, 0.16), p.mode, C.pink, 0.95, 12, 'left'); ctx.letterSpacing = '0px';
    parts.yReticle = true;
  }
  // under the sight, the plate cluster from the penelope view: chevrons (periwinkle over salmon),
  // hex badges, arrow plates pointing out, small tab plates and dot grids
  function cluster(y0) {
    var B = basis(dir(0, y0)), s = 0.016;
    stroke(LOOK.line, 0.8, 2); path([tp(B, -0.024, 0.012), tp(B, 0, -0.008), tp(B, 0.024, 0.012)]);
    stroke(C.salmon, 0.9, 2); path([tp(B, -0.024, -0.05), tp(B, 0, -0.03), tp(B, 0.024, -0.05)]);
    stroke(C.salmon, 0.6, 2); path([tp(B, -0.024, -0.075), tp(B, 0, -0.055), tp(B, 0.024, -0.075)]);
    var tri = [tp(B, -0.042, -0.135), tp(B, 0.042, -0.135), tp(B, 0, -0.088)];
    fill(tri, C.plate, 1); stroke(LOOK.line, 0.7, 1.2); path(tri, true);
    stroke(LOOK.line, 0.45, 1); path([tp(B, -0.03, -0.128), tp(B, 0.03, -0.128), tp(B, 0, -0.097)], true);
    stroke(LOOK.line, 0.5, 1); seg(tp(B, -0.014, -0.122), tp(B, 0.014, -0.122));
    [-1, 1].forEach(function (sd) {
      badge(B, sd * 0.088, -0.02, s * 1.25);
      arrowPlate(B, sd * 0.155, -0.02, s * 1.55, sd);
      plate(B, sd * 0.085, 0.034, 0.024, 0.0095, 0.85);
      plate(B, sd * 0.085, -0.074, 0.024, 0.0095, 0.85);
      arrowPlate(B, sd * 0.06, 0.034, s * 0.9, -sd);
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
  // a tangent basis at a world direction, built from the world (so it banks with the horizon, not the ball)
  function worldBasis(az, el) {
    var a = az * D, e = el * D;
    return { c: toBall(dir(az, el)), R: toBall([Math.cos(a), 0, -Math.sin(a)]), U: toBall([-Math.sin(e) * Math.sin(a), Math.cos(e), -Math.sin(e) * Math.cos(a)]) };
  }
  // The pitch ladder (ref #17, #21, #35): a rung pair every 5 deg of the world's pitch either side of the
  // heading, solid above the horizon and broken below, each with an end tick toward the horizon; at 0 deg,
  // long hatch rows instead. World-fixed, so the ladder banks and slides as the suit rolls and climbs.
  function pitchLadder(p) {
    var rungs = 0, hatch = 0;
    // only the rungs near the current pitch, fading out before they'd reach the roll arc or the heading tape
    for (var k = Math.ceil((p.pitch - 17.5) / 5) * 5; k <= p.pitch + 17.5; k += 5) {
      if (k === 0 || Math.abs(k) > 85) continue;
      var B = worldBasis(p.heading, k), dn = k > 0 ? -1 : 1, al = 1 - smooth(9, 17.5, Math.abs(k - p.pitch));
      if (al < 0.05) continue;
      [-1, 1].forEach(function (sd) {
        stroke(LOOK.line, 0.6 * al, 1.4);
        if (k > 0) seg(tp(B, sd * 0.13, 0), tp(B, sd * 0.235, 0));
        else { seg(tp(B, sd * 0.13, 0), tp(B, sd * 0.17, 0)); seg(tp(B, sd * 0.195, 0), tp(B, sd * 0.235, 0)); }
        seg(tp(B, sd * 0.13, 0), tp(B, sd * 0.13, dn * 0.016));
      });
      rungs++;
    }
    var ends = {};
    [-1, 1].forEach(function (sd) {
      for (var a = 6; a <= 13.5; a += 0.9) {
        var B = worldBasis(p.heading + sd * a, 0);
        stroke(LOOK.line, 0.62, 1.5); seg(tp(B, -sd * 0.006, 0.01), tp(B, sd * 0.006, -0.01));
        hatch++;
      }
      ends[sd] = project(toBall(dir(p.heading + sd * 9.5, 0)));
    });
    // the hatch rows' screen angle: what the test reads to see the ladder bank
    parts.ladderRoll = ends[1] && ends[-1] ? Math.round(Math.atan2(ends[1][1] - ends[-1][1], ends[1][0] - ends[-1][0]) / D) : 0;
    parts.rungs = rungs; parts.hatch = hatch;
  }
  function horizonBars(p, at) {
    // the pink double bars, set on a white tick rail, on the world's horizon either side of the
    // heading (and of its reciprocal, behind): they bank and slide against the ball. Each ends, toward
    // the sight, in a diamond plate with a salmon chevron pointing in (ref #6, #17).
    [-1, 1].forEach(function (sd) {
      var pt = function (d, e) { return toBall(dir(p.heading + at + sd * d, e)); };
      var a = [], b = [], up = [], dn = [];
      for (var d = 19; d <= 44; d += 2) { a.push(pt(d, 0)); b.push(pt(d, -0.8)); up.push(pt(d, 1.3)); dn.push(pt(d, -2.1)); }
      stroke(C.tick, 0.38, 1); path(up); path(dn);
      for (d = 20; d <= 44; d += 2) { var big = (d - 20) % 8 === 0; stroke(C.tick, big ? 0.55 : 0.35, 1); seg(pt(d, 1.3), pt(d, big ? 2.6 : 1.9)); seg(pt(d, -2.1), pt(d, -2.7)); }
      stroke(C.bar, 0.9, 1.8); path(a); stroke(C.barIn, 0.65, 1.1); path(b);
      var B = worldBasis(p.heading + at + sd * 17.4, -0.4), w = 0.022, h = 0.034;
      var dia = [tp(B, -w, 0), tp(B, 0, h), tp(B, w, 0), tp(B, 0, -h)];
      if (fill(dia, C.plate, 1)) parts.caps = (parts.caps || 0) + 1;
      stroke(LOOK.line, 0.8, 1.3); path(dia, true);
      stroke(LOOK.line, 0.5, 1); path([tp(B, -w * 0.6, 0), tp(B, 0, h * 0.6), tp(B, w * 0.6, 0), tp(B, 0, -h * 0.6)], true);
      stroke(LOOK.line, 0.85, 1.3); path([tp(B, sd * w * 0.25, h * 0.3), tp(B, -sd * w * 0.25, 0), tp(B, sd * w * 0.25, -h * 0.3)]);
      var Bc = worldBasis(p.heading + at + sd * 15.2, -0.4);
      stroke(C.salmon, 0.9, 2); path([tp(Bc, sd * 0.008, 0.016), tp(Bc, -sd * 0.006, 0), tp(Bc, sd * 0.008, -0.016)]);
    });
  }
  // a contact marker (ref #4): an inverted triangle with tabs at its top corners and a tick above
  function tabbed(B, r, color, alpha) {
    stroke(color, 0.9 * alpha, 1.6); path([tp(B, -r, r * 0.55), tp(B, r, r * 0.55), tp(B, 0, -r * 0.95)], true);
    stroke(color, 0.95 * alpha, 2.6); seg(tp(B, -r * 1.3, r * 0.36), tp(B, -r * 0.78, r * 0.36)); seg(tp(B, r * 0.78, r * 0.36), tp(B, r * 1.3, r * 0.36));
    stroke(color, 0.7 * alpha, 1.2); seg(tp(B, 0, r * 0.75), tp(B, 0, r * 1.05));
  }
  function escorts(p) {
    var n = 0;
    p.contacts.slice(1).forEach(function (c) {
      var po = toBall(c.d), B = basis(po), r = 0.026;
      if (!project(po)) return;
      tabbed(B, r, LOOK.line, 0.85);
      ctx.letterSpacing = '2px'; text(tp(B, r * 1.4, -r * 0.6), 'MS', LOOK.line, 0.75, 9, 'left'); ctx.letterSpacing = '0px';
      n++;
    });
    parts.markers = n;
  }
  // The incoming threat (ref #25): a trail of stacked chevron outlines pointing along its path, and when
  // it's out of view a pink feathered arrow at the screen's edge pointing toward it (ref #30).
  function threatDraw(p) {
    parts.trail = 0;
    if (!p.threat) return;
    var pts = [p.threat.d].concat(p.threat.trail).map(function (d) { return project(toBall(d)); });
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if (!a || !b) continue;
      var dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, s = 15 - i * 1.4;
      var tip = [b[0] + ux * s, b[1] + uy * s], l1 = [b[0] - uy * s * 0.7, b[1] + ux * s * 0.7], l2 = [b[0] + uy * s * 0.7, b[1] - ux * s * 0.7];
      ctx.globalAlpha = 0.9 - i * 0.13; ctx.strokeStyle = C.tick; ctx.lineWidth = 1.3; ctx.beginPath();
      ctx.moveTo(l1[0], l1[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(l2[0], l2[1]); ctx.lineTo(l1[0] + ux * 4, l1[1] + uy * 4); ctx.stroke();
      parts.trail++;
    }
    edgeArrow(toBall(p.threat.d), C.bar);
  }
  function edgeArrow(ballPt, color) {
    var q = project(ballPt), M = 64;
    if (q && q[0] > M && q[0] < W - M && q[1] > M && q[1] < H - M) return;
    var v = qrot(EQi, [ballPt[0] - E[0], ballPt[1] - E[1], ballPt[2] - E[2]]);
    var dx = v[0], dy = -v[1], k = 1 / Math.max(Math.abs(dx) / (W / 2 - M), Math.abs(dy) / (H / 2 - M), 1e-6);
    var x = W / 2 + dx * k, y = H / 2 + dy * k, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    var P = function (a, b) { return [x + ux * a + nx * b, y + uy * a + ny * b]; };
    ctx.globalAlpha = 0.85; ctx.fillStyle = color;
    // the head: a chevron, and three feathers trailing off it
    [[0, 20, 12], [-12, 16, 10], [-22, 13, 8], [-31, 10, 6]].forEach(function (f, i) {
      var t = P(f[0], 0), a = P(f[0] - f[2], f[1]), b = P(f[0] - f[2], -f[1]), ia = P(f[0] - f[2] - 3, f[1] - 3), ib = P(f[0] - f[2] - 3, -f[1] + 3), ti = P(f[0] - 4, 0);
      ctx.globalAlpha = 0.85 - i * 0.16; ctx.beginPath();
      ctx.moveTo(a[0], a[1]); ctx.lineTo(t[0], t[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(ib[0], ib[1]); ctx.lineTo(ti[0], ti[1]); ctx.lineTo(ia[0], ia[1]); ctx.closePath(); ctx.fill();
    });
    parts.edgeArrow = (parts.edgeArrow || 0) + 1;
  }
  function target(p) {
    var po = toBall(p.opp), B = basis(po), r = 0.036, lock = p.locked, col = lock ? C.bar : LOOK.line;
    // the marker: an inverted triangle with a V inside, a double bar over it and tabs at its corners
    tabbed(B, r, col, 1);
    stroke(col, 0.95, 2.6); seg(tp(B, -r * 1.12, r * 0.8), tp(B, r * 1.12, r * 0.8));
    stroke(col, 0.85, 1.3); path([tp(B, -r * 0.45, r * 0.2), tp(B, 0, -r * 0.4), tp(B, r * 0.45, r * 0.2)]);
    // acquiring, then locked: three double-bar prongs grow out of it (ref #4), up from the top corners and
    // down from the point
    parts.brace = false;
    if (p.lockT > 0) {
      var g = Math.min(1, p.lockT / 0.5), L = r * (1.1 + 1.9 * g);
      [[-1, 0.62, 1], [1, 0.62, 1], [0, -1, 0]].forEach(function (pr) {
        var ox = pr[0] * r * 0.9, oy = pr[0] ? r * 0.62 : -r * 0.95;
        var dx = pr[0] * 0.8, dy = pr[0] ? 0.6 : -1, nl = Math.hypot(dx, dy); dx /= nl; dy /= nl;
        [-1, 1].forEach(function (o) {
          var px = -dy * o * 0.0042, py = dx * o * 0.0042;
          stroke(lock ? C.bar : LOOK.line, lock ? 0.85 : 0.5, 2);
          seg(tp(B, ox + dx * r * 0.3 + px, oy + dy * r * 0.3 + py), tp(B, ox + dx * L + px, oy + dy * L + py));
        });
      });
      parts.brace = lock;
    }
    var lx = r * 1.5;
    ctx.letterSpacing = '2px';
    text(tp(B, lx, -r * 0.35), 'UNKNOWN', C.salmon, 0.95, 10, 'left');
    if (lock) text(tp(B, lx, -r * 1.35), 'LOCK', C.bar, 0.95, 10, 'left');
    ctx.letterSpacing = '0px';
    // off the nose: a dotted arc leads from the reticle to it, and off the screen an edge arrow
    var off = Math.acos(m.clamp(po[2], -1, 1)) / D;
    if (off > 10) {
      var ax = norm([po[0], po[1], 0]), end = Math.min(off - 4, 46);
      ctx.fillStyle = LOOK.line;
      for (var gg = 9; gg <= end; gg += 1.7) {
        var s = project(norm([ax[0] * Math.sin(gg * D), ax[1] * Math.sin(gg * D), Math.cos(gg * D)]));
        if (!s) continue;
        ctx.globalAlpha = 0.75 * (1 - (gg - 9) / 50); ctx.beginPath(); ctx.arc(s[0], s[1], 1.8, 0, 7); ctx.fill();
      }
    }
    edgeArrow(po, LOOK.line);
  }

  S.project = function (p) { return E ? project(p) : null; };
  S.renderers.push(function (p, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    W = w; H = h; E = p.eye; EQi = m.qconj(p.eyeQ); SQi = m.qconj(p.suitQ); tx = S.cam.tx; ty = S.cam.ty; f = W / 2 / tx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    parts.ring = false; parts.yReticle = false; parts.edgeArrow = 0; parts.caps = 0;
    waistRail();
    if (LOOK.hexes) ladders(p);
    if (LOOK.tapes) tapesDraw(p);
    headingTape(p, 0); headingTape(p, 180);
    ringDashes();
    rollArc(p);
    if (LOOK.tri) triangle(p);
    if (LOOK.y) yReticle(p);
    triRows();
    if (LOOK.cluster) cluster(LOOK.tri ? -22 : -21);
    rearCluster();
    pitchLadder(p);
    if (LOOK.bars) { horizonBars(p, 0); horizonBars(p, 180); }
    escorts(p);
    target(p);
    threatDraw(p);
    ctx.globalAlpha = 1;
  });
  if (document.fonts && document.fonts.load) document.fonts.load('12px Michroma');
})();
