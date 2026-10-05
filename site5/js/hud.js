/* hud.js: the HUD, as vectors on a 2D canvas, authored ON the ball and projected through the same
   ball -> eye geometry as world.js, so it curves for real and stays sharp.

   The layout is measured, not composed: every front position below was read off the owner's front frame
   (ref, 1:26:32) and converted to ball angles assuming the frame's camera, a 100-degree view tilted 10 deg
   down (the tilt that makes its rulers true meridians and its pink rail a true parallel). The side rings
   come from the side frame (29:50). Ball angles: az right +, el up +, the nose at (0, 0).
     - the pink rail: a parallel at el -18 round the whole ball, open in front between az +-30, where
       diamond caps close it (chevrons at +-26 pointing in);
     - at az +-90 and 180 a ring of coffin cells (radius 17) centred on the rail, a small crosshair (3.4)
       at its centre, a dotted ring (26) round it, dot grids;
     - the tall rulers: full circles round a point off each side, through the measured ruler path, their
       dashes sliding round with the pitch; a coffin column just outside; a plate on each;
     - the centre: heading ticks at el 22 scrolling with the heading, the nose designator at el -10; the plate
       cluster under it (centred on el -26);
     - world-fixed: the W contact marks.
   Every element is drawn at SZ (0.75) of its measured size, in place: the owner found it too cluttered.
   The triangle sight (or the Y, ?look=penelope) is always up on the nose, at eye level; the rail and the
   cluster sit lower than the frame has them so it stands clear (owner, 2026-10-05). Coffin cells glow in turn. */
(function () {
  'use strict';
  var S = window.SITE5, m = S.m, D = m.D, qrot = m.qrot, norm = m.norm, dir = m.dir;
  var canvas = document.getElementById('hud'), ctx = canvas.getContext('2d');
  var Y_SIGHT = S.look === 'penelope';
  var C = {
    line: '#AFC0EC', tick: '#EEF3FA', pink: '#FFA3DC', bar: '#FF4F8B', barIn: '#FFC6E8', salmon: '#EBA89C',
    cellEdge: '#8DA0BC', glow: 'rgb(150, 182, 255)', glowEdge: '#CFE0FF', plate: 'rgba(120, 140, 200, .10)'
  };
  var FONT = "Michroma, 'B612 Mono', sans-serif";
  S.hudCtx = ctx;
  var parts = S.parts = {};
  var tapes = S.tapes = {};

  // the layout, in ball degrees (see the header)
  var RAIL = -22, GAP = 30, RING_AZ = [90, -90, 180], RING_R = 17, DOT_R = 26, RULER = 42;
  // the size of every element (cells, plates, ticks, marks), its position unchanged: 0.75 (owner, 2026-10-05)
  var SZ = 0.75;

  // ---- projection and drawing on the ball ----
  var W = 0, H = 0, E, EQi, SQi, tx, ty, f, GA = 1;   // GA: a fade applied to everything drawn
  function project(p) {
    var v = qrot(EQi, [p[0] - E[0], p[1] - E[1], p[2] - E[2]]);
    if (v[2] < 0.04) return null;
    return [W / 2 + v[0] / v[2] / tx * W / 2, H / 2 - v[1] / v[2] / ty * H / 2];
  }
  function toBall(w) { return qrot(SQi, w); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  // the tangent basis at a ball point: R toward increasing azimuth, U toward increasing elevation
  function basis(c) {
    var az = Math.atan2(c[0], c[2]), el = Math.asin(m.clamp(c[1], -1, 1));
    return { c: c, R: [Math.cos(az), 0, -Math.sin(az)], U: [-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az)] };
  }
  // at q on a circle round c: R pointing away from c, U round the circle
  function radialBasis(c, q) {
    var d = m.dot(q, c), R = norm([q[0] * d - c[0], q[1] * d - c[1], q[2] * d - c[2]]);
    return { c: q, R: R, U: cross(q, R) };
  }
  function tp(B, u, v) { return norm([B.c[0] + B.R[0] * u + B.U[0] * v, B.c[1] + B.R[1] * u + B.U[1] * v, B.c[2] + B.R[2] * u + B.U[2] * v]); }
  // The hierarchy, by brightness, opacity and weight only (the colours stay): what reads first is brightest and
  // the only thing with a halo. A halo is a second, wider, faint stroke laid under the sharp core -- never a blur,
  // so it can't run neighbouring shapes together.
  //   1  the triangle sight and the active target         full, a restrained halo
  //   2  the pink rail's core                             near full, a fainter, tighter halo
  //   3  rulers, rings, coffin cells, heading, escorts    crisp, no halo, a little dimmer
  //   4  plates, badges, tabs, dash text, dot grids       crisp, finest, dimmer still
  // halo.w: how many core widths it spans, halo.max: but never more than this many px past the core (so a heavy
  // bar gets a tight rim, not a band)
  var TIERS = { 1: { a: 1, w: 1, halo: { w: 3, k: 0.16, max: 4 } }, 2: { a: 0.95, w: 1, halo: { w: 2.4, k: 0.1, max: 3 } },
                3: { a: 0.82, w: 0.9, halo: null }, 4: { a: 0.7, w: 0.85, halo: null } };
  var TA = 1, TW = 1, HALO = null, HALO_TIER = 0;
  function tier(n) { var t = TIERS[n]; TA = t.a; TW = t.w; HALO = t.halo; HALO_TIER = n; }
  var LW = 1;   // the current stroke's width, before depth
  function stroke(color, alpha, width) { ctx.strokeStyle = color; ctx.globalAlpha = alpha * GA * TA; LW = Math.max(0.8, width * TW); ctx.lineWidth = LW; }
  // stroke the current path: the halo under it first, if this tier has one
  function strokeNow() {
    if (HALO) {
      var lw = ctx.lineWidth, ga = ctx.globalAlpha;
      ctx.lineWidth = lw + Math.min(lw * (HALO.w - 1), HALO.max); ctx.globalAlpha = ga * HALO.k; ctx.stroke();
      ctx.lineWidth = lw; ctx.globalAlpha = ga;
      parts.halo[HALO_TIER] = (parts.halo[HALO_TIER] || 0) + 1;
    }
    ctx.stroke();
  }
  // How much heavier a line on the sphere at p draws than one straight ahead: with the eye behind the centre,
  // nearer parts of the monitor are closer, so they draw a little heavier (gently: the square root of the
  // distance ratio, held to 0.85..1.35). Continuous over the sphere, so a line never jumps in weight.
  var D0 = 1.4;
  function depthScale(p) {
    var dx = p[0] - E[0], dy = p[1] - E[1], dz = p[2] - E[2];
    return m.clamp(Math.sqrt(D0 / Math.sqrt(dx * dx + dy * dy + dz * dz)), 0.85, 1.35);
  }
  S.depthScale = function (p) { return E ? depthScale(p) : 1; };
  // a polyline through ball points, subdivided every ~1.2 degrees so it follows the sphere
  // Short paths (a tick, a cell) take one width from their middle; long ones (the rail, the rings, the ruler
  // circles) are stroked a few segments at a time, each at its own depth, so the weight changes smoothly
  // round the sphere. Round joins keep the pieces seamless.
  function path(pts, closed) {
    var n = pts.length, segs = closed ? n : n - 1, long = segs > 6;
    var mid = pts[Math.floor(n / 2)];
    ctx.beginPath();
    if (!long) ctx.lineWidth = LW * depthScale(mid);
    var pen = false, last = null;
    for (var i = 0; i < segs; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      if (long) {
        if (pen) strokeNow();
        ctx.beginPath(); ctx.lineWidth = LW * depthScale(norm([a[0] + b[0], a[1] + b[1], a[2] + b[2]]));
        if (last) { ctx.moveTo(last[0], last[1]); pen = true; } else pen = false;
      }
      var ang = Math.acos(m.clamp(m.dot(a, b), -1, 1)), k = Math.max(1, Math.ceil(ang / (1.2 * D)));
      for (var j = (i === 0 || long) ? 0 : 1; j <= k; j++) {
        var t = j / k, s = project(norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
        if (!s) { pen = false; last = null; continue; }
        if (pen) ctx.lineTo(s[0], s[1]); else { ctx.moveTo(s[0], s[1]); pen = true; }
        last = s;
      }
    }
    strokeNow();
  }
  function seg(a, b) { path([a, b]); }
  function fill(pts, color, alpha) {
    var q = pts.map(project);
    if (!q.every(Boolean)) return false;
    ctx.globalAlpha = alpha * GA * TA; ctx.fillStyle = color; ctx.beginPath();
    q.forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
    ctx.closePath(); ctx.fill();
    return true;
  }
  function text(p, s, color, alpha, size, align) {
    var q = project(p); if (!q) return;
    ctx.globalAlpha = alpha * GA * TA; ctx.fillStyle = color; ctx.font = size + 'px ' + FONT; ctx.textAlign = align || 'left';
    ctx.fillText(s, q[0], q[1]);
  }
  // points on a small circle of radius r degrees round c, from..to degrees round it
  function ring(c, r, from, to, step) {
    var B = basis(c), pts = [], cr = Math.cos(r * D), sr = Math.sin(r * D);
    for (var a = from; a <= to + 0.01; a += step || 4) {
      var ca = Math.cos(a * D), sa = Math.sin(a * D);
      pts.push(norm([c[0] * cr + (B.R[0] * ca + B.U[0] * sa) * sr, c[1] * cr + (B.R[1] * ca + B.U[1] * sa) * sr, c[2] * cr + (B.R[2] * ca + B.U[2] * sa) * sr]));
    }
    return pts;
  }
  function smooth(e0, e1, x) { var t = m.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function fade(el) { return 1 - smooth(48, 80, Math.abs(el)); }
  var F = basis([0, 0, 1]);   // the nose

  // ---- shapes, in tangent units round a ball point B (u along R, v along U) ----
  // a coffin cell: wide at one end, pointed at the other (s +1: the point toward +R)
  function coffin(B, s, a, b) {
    var P = function (u, v) { return tp(B, s * u, v); };
    return [P(a, -b * 0.35), P(a, b * 0.35), P(a * 0.2, b), P(-a, b * 0.72), P(-a, -b * 0.72), P(a * 0.2, -b)];
  }
  // a coffin cell; g (0..1) lights it: a brighter face, a lit edge and a soft halo stroke
  // A coffin cell: a flat translucent slate face with a very faint gradient, lighter at the wide end, darker
  // toward the point (pts[0..1] are the point, pts[3..4] the wide end), and a soft luminous border: a faint wide
  // halo under a fine edge. g (0..1) lights it as the glow runs past.
  function cell(pts, al, g) {
    var q = pts.map(project);
    if (!q.every(Boolean)) return false;
    var tipX = (q[0][0] + q[1][0]) / 2, tipY = (q[0][1] + q[1][1]) / 2, wideX = (q[3][0] + q[4][0]) / 2, wideY = (q[3][1] + q[4][1]) / 2;
    var gr = ctx.createLinearGradient(wideX, wideY, tipX, tipY);
    gr.addColorStop(0, 'rgba(66, 82, 102, .56)'); gr.addColorStop(1, 'rgba(42, 54, 70, .46)');
    ctx.globalAlpha = al * GA * TA; ctx.fillStyle = gr; ctx.beginPath();
    q.forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
    ctx.closePath(); ctx.fill();
    if (g > 0.02) fill(pts, C.glow, al * g * 0.5);
    var w = depthScale(pts[0]);
    ctx.strokeStyle = g > 0.02 ? C.glowEdge : C.cellEdge;
    ctx.globalAlpha = al * GA * TA * (0.035 + 0.1 * g); ctx.lineWidth = (2.8 + 1.4 * g) * w; ctx.stroke();
    ctx.globalAlpha = al * GA * TA * (0.3 + 0.6 * g); ctx.lineWidth = (0.85 + 0.45 * g) * w; ctx.stroke();
    return true;
  }
  // The chase: a few lit heads run along a row of n cells (speed cells a second), each leaving a fading trail,
  // so the glow moves on from one cell to the next. Off under reduced motion (the clock holds still there).
  var TRAIL = 5;
  // which cell of the left column is brightest (the test watches it move)
  function noteLit(i, g) { if (g > (parts._litG || 0)) { parts._litG = g; parts.litCells = i; } }
  function chase(i, n, t, speed, heads) {
    var g = 0;
    for (var h = 0; h < heads; h++) {
      var head = (t * speed + h * n / heads) % n, d = ((head - i) % n + n) % n;
      if (d < TRAIL) g = Math.max(g, Math.pow(1 - d / TRAIL, 2));
    }
    return g;
  }
  function longHex(B, u, v, a, b, k) {
    return [tp(B, u - a, v), tp(B, u - a + k, v + b), tp(B, u + a - k, v + b), tp(B, u + a, v), tp(B, u + a - k, v - b), tp(B, u - a + k, v - b)];
  }
  // tiny unreadable "text": rows of dashes
  function dashText(B, u, v, a, rows, gap) {
    for (var r = 0; r < rows; r++) for (var x = -a, i = 0; x < a; x += a * 0.16, i++) if ((i * 7 + r * 3) % 5 !== 3) seg(tp(B, u + x, v - r * gap), tp(B, u + x + a * 0.11, v - r * gap));
  }
  // a label plate: outline, an inset outline, two lines of dash text
  function plate(B, u, v, a, b, alpha) {
    var al = alpha == null ? 1 : alpha;
    fill(longHex(B, u, v, a, b, b * 0.9), C.plate, al);
    stroke(C.line, 0.7 * al, 1.2); path(longHex(B, u, v, a, b, b * 0.9), true);
    stroke(C.line, 0.45 * al, 1); path(longHex(B, u, v, a * 0.86, b * 0.68, b * 0.62), true);
    stroke(C.line, 0.55 * al, 1); dashText(B, u - a * 0.05, v + b * 0.22, a * 0.5, 2, b * 0.44);
  }
  // an arrow plate pointing toward sd, with a chevron inside
  function arrowPlate(B, u, v, s, sd) {
    var P = function (x, y) { return tp(B, u + sd * x * s, v + y * s); };
    var out = [P(-1, 0.75), P(0.35, 0.75), P(1, 0), P(0.35, -0.75), P(-1, -0.75)];
    fill(out, C.plate, 1); stroke(C.line, 0.75, 1.3); path(out, true);
    stroke(C.line, 0.5, 1); path([P(-0.82, 0.55), P(0.25, 0.55), P(0.75, 0), P(0.25, -0.55), P(-0.82, -0.55)], true);
    stroke(C.line, 0.85, 1.5); path([P(0.1, 0.34), P(-0.35, 0), P(0.1, -0.34)]);
  }
  // a hexagonal badge with a smaller hexagon and three spokes
  function badge(B, u, v, s) {
    var hex = function (r) { var q = []; for (var a = 0; a < 360; a += 60) q.push(tp(B, u + Math.cos(a * D) * r * 1.15, v + Math.sin(a * D) * r)); return q; };
    fill(hex(s), C.plate, 1); stroke(C.line, 0.75, 1.3); path(hex(s), true);
    stroke(C.line, 0.5, 1); path(hex(s * 0.45), true);
    for (var a = 90; a < 450; a += 120) seg(tp(B, u + Math.cos(a * D) * s * 0.52, v + Math.sin(a * D) * s * 0.45), tp(B, u + Math.cos(a * D) * s * 0.85, v + Math.sin(a * D) * s * 0.8));
  }
  // a small tab plate: a bracket pair with a short arrow inside
  function tabPlate(B, u, v, s, sd) {
    var P = function (x, y) { return tp(B, u + sd * x * s, v + y * s); };
    stroke(C.line, 0.7, 1.2); path([P(-0.4, 0.5), P(-1, 0.5), P(-1.2, 0), P(-1, -0.5), P(-0.4, -0.5)]); path([P(0.4, 0.5), P(1, 0.5), P(1.2, 0), P(1, -0.5), P(0.4, -0.5)]);
    stroke(C.line, 0.6, 1); path([P(-0.5, 0), P(0.5, 0)]); path([P(0.2, 0.22), P(0.5, 0), P(0.2, -0.22)]);
  }
  function dots(B, u, v, cols, rows, s) {
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var x = u + (i - (cols - 1) / 2) * s * 2.3, y = v + (j - (rows - 1) / 2) * s * 2.3;
      fill([tp(B, x - s, y - s), tp(B, x + s, y - s), tp(B, x + s, y + s), tp(B, x - s, y + s)], C.line, 0.4);
    }
  }
  function T(deg) { return Math.tan(deg * D); }
  function Z(deg) { return Math.tan(deg * SZ * D); }   // a size, scaled

  // ---- ball-fixed ----
  // The pink rail at the waist, right round the ball, with its tick rails; open in front, where diamond
  // caps close it and salmon chevrons point in at the cluster.
  function rail() {
    var u = 1.2 * SZ, dn = 1.6 * SZ;
    var run = function (e) { var pts = []; for (var az = GAP + 1.4 * SZ; az <= 360 - GAP - 1.4 * SZ + 0.01; az += 3) pts.push(dir(az, e)); return pts; };
    tier(3);
    stroke(C.tick, 0.4, 1); path(run(RAIL + u)); path(run(RAIL - dn));
    stroke(C.barIn, 0.6, 1); path(run(RAIL - 0.7 * SZ));
    tier(2);
    stroke(C.bar, 0.92, 1.6); path(run(RAIL));
    tier(3);
    for (var az = GAP + 4; az <= 360 - GAP - 4; az += 4.5) {
      var big = Math.round((az - GAP - 4) / 4.5) % 3 === 0;
      stroke(C.tick, big ? 0.6 : 0.35, 1); seg(dir(az, RAIL + u), dir(az, RAIL + u + (big ? 1.6 : 0.7) * SZ)); seg(dir(az, RAIL - dn), dir(az, RAIL - dn - (big ? 1.3 : 0.6) * SZ));
    }
    var caps = 0;
    [-1, 1].forEach(function (sd) {
      var B = basis(dir(sd * GAP, RAIL)), w = Z(2.6), h = Z(3.4);
      var dia = [tp(B, -w, 0), tp(B, 0, h), tp(B, w, 0), tp(B, 0, -h)];
      if (fill(dia, C.plate, 1)) caps++;
      stroke(C.line, 0.85, 1.3); path(dia, true);
      stroke(C.line, 0.5, 1); path([tp(B, -w * 0.62, 0), tp(B, 0, h * 0.62), tp(B, w * 0.62, 0), tp(B, 0, -h * 0.62)], true);
      stroke(C.line, 0.9, 1.3); path([tp(B, -sd * w * 0.2, h * 0.3), tp(B, sd * w * 0.25, 0), tp(B, -sd * w * 0.2, -h * 0.3)]);
      var Bc = basis(dir(sd * (GAP - 4 * SZ), RAIL - 0.5 * SZ));
      stroke(C.salmon, 0.9, 2); path([tp(Bc, sd * Z(0.9), Z(1.5)), tp(Bc, -sd * Z(0.6), 0), tp(Bc, sd * Z(0.9), -Z(1.5))]);
    });
    parts.rail = true; parts.caps = caps;
  }
  // A ring of coffin cells round the rail at az, pointing in, with its crosshair and dotted ring.
  function sideRing(az, p) {
    tier(3);
    var c = dir(az, RAIL), n = Math.round(34 / SZ), drawn = 0;
    for (var k = 0; k < n; k++) {
      var a = k * 360 / n, q = ring(c, RING_R, a, a)[0];
      if (cell(coffin(radialBasis(c, q), -1, Z(2.3), Z(1.45)), 1, chase(k, n, p.t, 14, 2))) drawn++;
    }
    var dots_ = ring(c, DOT_R, 0, 360, 3);
    ctx.fillStyle = C.tick;
    dots_.forEach(function (d) { var s = project(d); if (s) { ctx.globalAlpha = 0.55 * GA * TA; ctx.beginPath(); ctx.arc(s[0], s[1], 1.4 * SZ, 0, 7); ctx.fill(); } });
    stroke(C.line, 0.55, 1.1); path(ring(c, 3.4 * SZ, 0, 360), true);
    [45, 135, 225, 315].forEach(function (a) { stroke(C.line, 0.6, 1.1); seg(ring(c, 3.4 * SZ, a, a)[0], ring(c, 5 * SZ, a, a)[0]); seg(ring(c, 8, a, a)[0], ring(c, 8 + 2 * SZ, a, a)[0]); });
    var B = basis(c);
    dots(B, -T(8), -T(5), 3, 2, Z(0.45)); dots(B, T(9), T(1.8), 3, 2, Z(0.45));
    parts.ringCells = (parts.ringCells || 0) + drawn;
    if (az === 90) S.ringSample = [0, 60, 120, 180, 240, 300].map(function (a) { return ring(c, RING_R, a, a)[0]; }).concat([c]);
  }
  // The tall rulers are circles round a point off to each side (az +-90, el -10), radius 48: the ruler's
  // measured path in the front frame (it bows toward the middle), and unlike a meridian a circle like this
  // curves on screen however you look at it. They run the whole way round, as does the coffin column just
  // outside them, and their dashes slide round with the suit's pitch (1.6 deg of arc per degree), a long one
  // every fifth: climb and they run down past you, dive and they run up.
  var SIDE_C = [dir(-90, -10), dir(90, -10)], RULER_R = 48, STEP = 1.6;
  function arcPt2(sd, r, phi) { var c = SIDE_C[sd < 0 ? 0 : 1]; return ring(c, r, sd < 0 ? phi : 180 - phi, sd < 0 ? phi : 180 - phi)[0]; }
  function rulers(p) {
    var base = p.pitch * STEP;
    tier(3);
    tapes.stream = base.toFixed(3);
    [-1, 1].forEach(function (sd) {
      var c = SIDE_C[sd < 0 ? 0 : 1];
      for (var k = Math.ceil((base - 180) / STEP); k * STEP - base < 180; k++) {
        var ph = k * STEP - base, long = ((k % 5) + 5) % 5 === 0, q = arcPt2(sd, RULER_R, ph);
        stroke(C.tick, long ? 0.75 : 0.45, long ? 1.8 : 1.2);
        seg(q, arcPt2(sd, RULER_R - (long ? 3 : 1.8) * SZ, ph));
      }
      var cw = 2.5 * SZ, cr = RULER_R - 3.6 * SZ - cw;
      var nc = 2 * Math.round(360 / (4.6 * SZ) / 2), sp = 360 / nc;   // an even count: the stagger meets itself
      for (var i = 0; i < nc; i++) {
        var ph2 = -180 + i * sp, q2 = arcPt2(sd, cr - (i % 2) * 2.4 * SZ, ph2);
        var gl = chase(i, nc, p.t, 18, 4); if (sd < 0) noteLit(i, gl);
        cell(coffin(radialBasis(c, q2), 1, Z(2.5), Z(1.55)), 0.9, gl);
      }
      tier(4); plate(radialBasis(c, arcPt2(sd, RULER_R + 2 * SZ, 11)), 0, 0, Z(2.8), Z(1.25), 0.9); tier(3);
    });
    if (!S.rulerSample) S.rulerSample = [-40, -20, 0, 20, 40].map(function (ph) { return arcPt2(1, RULER_R, ph); });
  }
  // the centre: the heading ticks over the nose (+-12 deg) scroll with the heading under a fixed caret -- a tick
  // every degree, taller every 5, tallest every 10, fading out at the ends -- and the nose designator under it
  function centre(p) {
    tier(3);
    var h = p.heading, HT = 22.2, span = 12;
    for (var k = Math.ceil(h - span); k <= h + span; k++) {
      var rel = k - h, ten = ((k % 10) + 10) % 10 === 0, five = ((k % 5) + 5) % 5 === 0;
      var al = (ten ? 0.95 : five ? 0.8 : 0.55) * (1 - smooth(span - 3, span, Math.abs(rel)));
      stroke(C.line, al, ten ? 1.5 : five ? 1.25 : 1);
      seg(dir(rel, HT), dir(rel, HT + (ten ? 2.3 : five ? 1.6 : 0.9) * SZ));
    }
    tapes.heading = Math.round(h * 10) / 10;
    stroke(C.line, 0.95, 1.5); path([dir(-0.9 * SZ, HT - 1.8 * SZ), dir(0, HT - 0.8 * SZ), dir(0.9 * SZ, HT - 1.8 * SZ)]);
    var Bn = basis(dir(0, -10));
    stroke(C.salmon, 0.85, 1.4); seg(tp(Bn, -Z(2.6), 0), tp(Bn, -Z(1.7), 0)); seg(tp(Bn, Z(1.7), 0), tp(Bn, Z(2.6), 0));
    stroke(C.salmon, 0.7, 1); dashText(Bn, 0, Z(0.2), Z(1.4), 2, Z(0.9));
    stroke(C.line, 0.7, 1.1); path([tp(Bn, -Z(0.9), -Z(1.6)), tp(Bn, 0, -Z(3)), tp(Bn, Z(0.9), -Z(1.6))]);
  }
  // the plate cluster under the nose, the whole group scaled by SZ about its centre (0, CLUSTER): Q(az, el) is where
  // a point the front frame has at (az, el -- centred on -26 there) goes
  var CLUSTER = -27;
  function cluster() {
    tier(4);
    var B = basis(dir(0, CLUSTER));
    var Q = function (az, el) { return tp(B, Z(az), Z(el + 26)); };
    stroke(C.line, 0.85, 1.8); path([Q(-1.4, -23.2), Q(0, -24.4), Q(1.4, -23.2)]);
    stroke(C.line, 0.55, 1); dashText(B, 0, Z(0.4), Z(4.6), 2, Z(0.9));
    stroke(C.line, 0.85, 1.8); path([Q(-1.4, -29), Q(0, -28), Q(1.4, -29)]);
    stroke(C.salmon, 0.85, 1.8); path([Q(-1.6, -31.6), Q(0, -30.4), Q(1.6, -31.6)]);
    var tri = [Q(-2.6, -35.6), Q(2.6, -35.6), Q(0, -32.8)];
    fill(tri, C.plate, 1); stroke(C.salmon, 0.75, 1.3); path(tri, true);
    stroke(C.salmon, 0.5, 1); path([Q(-1.6, -35.1), Q(1.6, -35.1), Q(0, -33.5)], true);
    [-1, 1].forEach(function (sd) {
      badge(B, sd * Z(10.1), 0, Z(2.3));
      arrowPlate(B, sd * Z(18), Z(0.7), Z(3.1), sd);
      tabPlate(B, sd * Z(8), Z(3.4), Z(1.3), sd);
      tabPlate(B, sd * Z(8), -Z(3), Z(1.3), sd);
      dots(B, sd * Z(24.3), -Z(1.3), 3, 2, Z(0.55));
    });
  }

  // ---- world-fixed ----
  // a contact: a doubled W, as in the front frame, with its label low on the right
  function wMark(po, r, color, label, labelColor) {
    var B = basis(po);
    var Wp = function (s, dy) { return [[-1, 1], [-0.5, -1], [0, 0.45], [0.5, -1], [1, 1]].map(function (q) { return tp(B, q[0] * r * s, (q[1] * r + dy) * s); }); };
    stroke(color, 0.9, 1.6); path(Wp(1, 0));
    stroke(color, 0.6, 1.2); path(Wp(0.8, -r * 0.12));
    stroke(color, 0.8, 1.3); path([tp(B, -r * 0.2, r * 0.2), tp(B, 0, -r * 0.2), tp(B, r * 0.2, r * 0.2)]);
    ctx.letterSpacing = '2px'; text(tp(B, r * 0.85, -r * 1.35), label, labelColor || color, 0.9, 9, 'left'); ctx.letterSpacing = '0px';
  }
  function contacts(p) {
    var n = 0;
    tier(3);
    p.contacts.slice(1).forEach(function (c) { var po = toBall(c.d); if (project(po)) { wMark(po, Z(3.2), C.line, 'MS'); n++; } });
    var po = toBall(p.opp), lock = p.locked;
    tier(1);
    wMark(po, Z(4.2), lock ? C.bar : C.line, lock ? 'LOCK' : 'UNKNOWN', lock ? C.bar : C.salmon);
    parts.markers = n + 1;
  }
  // the triangle sight (or the Y), always up on the nose; it brightens while a lock builds
  function lockSight(p) {
    GA = 0.72 + 0.28 * smooth(0, 0.5, p.lockT);
    tier(1);
    parts.sight = true;
    if (Y_SIGHT) {
      [150, 30, 270].forEach(function (an) {
        var c = Math.cos(an * D), sn = Math.sin(an * D);
        [-1, 1].forEach(function (o) { var pt = function (r) { return tp(F, c * r - sn * o * 0.0045 * SZ, sn * r + c * o * 0.0045 * SZ); }; stroke(C.line, 0.8, 2); seg(pt(0.03 * SZ), pt(0.085 * SZ)); });
      });
      ctx.letterSpacing = '4px'; text(tp(F, 0.1, 0.1), p.mode, C.pink, 0.95, 12, 'left'); ctx.letterSpacing = '0px';
    } else {
      var u = Math.min(0.22, tx * 0.4) * SZ / 237, L = function (x, y) { return tp(F, x * u, -y * u); }, lw = f / 605 * 0.8 * SZ;
      var Tt = -200, A = 210, hw = 237, len = Math.hypot(hw, A - Tt), face = [L(-hw, Tt), L(hw, Tt), L(0, A)];
      fill(face, 'rgb(170, 186, 245)', 0.07); HALO = null; stroke(C.line, 0.34, Math.max(1, lw)); path(face, true); tier(1);
      [-1, 1].forEach(function (sd) {
        var ux = -sd * hw / len, uy = (A - Tt) / len, nx = sd * (A - Tt) / len, ny = hw / len;
        var at = function (t, off) { return L(sd * hw + ux * len * t + nx * off, Tt + uy * len * t + ny * off); };
        stroke(C.line, 0.7, 7 * lw); seg(at(-0.04, 30), at(0.3, 30)); seg(at(0.72, 30), at(1.03, 30));
        var ix = sd * hw * 0.62, iy = Tt + 62;
        stroke(C.line, 0.64, 4.6 * lw); path([L(ix - sd * 78, iy), L(ix, iy), L(ix + ux * 84, iy + uy * 84)]);
      });
      stroke(C.line, 0.64, 4.6 * lw); path([L(-48, A - 196), L(0, A - 116), L(48, A - 196)]);
      ctx.letterSpacing = '3px'; text(L(hw - 24, Tt + 20 + 12 / lw), p.mode, C.pink, 0.95, Math.max(9, Math.round(12 * lw)), 'right'); ctx.letterSpacing = '0px';
    }
    GA = 1;
  }

  S.project = function (p) { return E ? project(p) : null; };
  S.anchors = { capL: dir(-GAP, RAIL), rulerL: dir(-RULER, -7.5), cluster: dir(0, CLUSTER), heading: dir(0, 22.2), nose: [0, 0, 1], apex: dir(0, -8) };
  S.renderers.push(function (p, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    W = w; H = h; E = p.eye; EQi = m.qconj(p.eyeQ); SQi = m.qconj(p.suitQ); tx = S.cam.tx; ty = S.cam.ty; f = W / 2 / tx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    parts.ringCells = 0; parts._litG = 0; parts.halo = {};
    rulers(p);
    RING_AZ.forEach(function (az) { sideRing(az, p); });
    rail();
    centre(p);
    cluster();
    contacts(p);
    lockSight(p);
    parts.rear = !!(project(dir(180, RAIL)) || project(dir(150, RAIL)) || project(dir(-150, RAIL)));
    ctx.globalAlpha = 1;
  });
  if (document.fonts && document.fonts.load) document.fonts.load('12px Michroma');
})();
