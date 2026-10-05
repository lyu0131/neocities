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
     - the tall rulers: meridians at az +-42 (dashes streaming at airspeed), a coffin column outside
       (+-47.5), a plate on each (+-40, el 0.5);
     - the centre: heading ticks at el 22, a vertical line el 13 -> -8, the nose designator at el -10,
       slashes and frame dashes where the frame has them; the plate cluster under it (el -24 .. -34);
     - world-fixed: the pitch ladder (rungs, the '=' zero line, the long hatch rows) and W contact marks.
   The triangle sight (or the Y, ?look=penelope) only comes up during a lock. */
(function () {
  'use strict';
  var S = window.SITE5, m = S.m, D = m.D, qrot = m.qrot, norm = m.norm, dir = m.dir;
  var canvas = document.getElementById('hud'), ctx = canvas.getContext('2d');
  var Y_SIGHT = S.look === 'penelope';
  var C = {
    line: '#AFC0EC', tick: '#EEF3FA', pink: '#FFA3DC', bar: '#FF4F8B', barIn: '#FFC6E8', salmon: '#EBA89C',
    cell: 'rgba(52, 66, 82, .5)', cellEdge: '#8DA0BC', plate: 'rgba(120, 140, 200, .10)'
  };
  var FONT = "Michroma, 'B612 Mono', sans-serif";
  S.hudCtx = ctx;
  var parts = S.parts = {};
  var tapes = S.tapes = {};

  // the layout, in ball degrees (see the header)
  var RAIL = -18, GAP = 30, RING_AZ = [90, -90, 180], RING_R = 17, DOT_R = 26, RULER = 42;

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
  function stroke(color, alpha, width) { ctx.strokeStyle = color; ctx.globalAlpha = alpha * GA; ctx.lineWidth = Math.max(0.8, width); }
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
    ctx.globalAlpha = alpha * GA; ctx.fillStyle = color; ctx.beginPath();
    q.forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
    ctx.closePath(); ctx.fill();
    return true;
  }
  function text(p, s, color, alpha, size, align) {
    var q = project(p); if (!q) return;
    ctx.globalAlpha = alpha * GA; ctx.fillStyle = color; ctx.font = size + 'px ' + FONT; ctx.textAlign = align || 'left';
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
  function cell(pts, al) { if (fill(pts, C.cell, al)) { stroke(C.cellEdge, 0.22 * al, 1); path(pts, true); return true; } return false; }
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

  // ---- ball-fixed ----
  // The pink rail at the waist, right round the ball, with its tick rails; open in front, where diamond
  // caps close it and salmon chevrons point in at the cluster.
  function rail() {
    var run = function (e) { var pts = []; for (var az = GAP + 1.4; az <= 360 - GAP - 1.4 + 0.01; az += 3) pts.push(dir(az, e)); return pts; };
    stroke(C.tick, 0.4, 1); path(run(RAIL + 1.2)); path(run(RAIL - 1.6));
    stroke(C.bar, 0.9, 1.8); path(run(RAIL)); stroke(C.barIn, 0.6, 1.1); path(run(RAIL - 0.7));
    for (var az = GAP + 4; az <= 360 - GAP - 4; az += 4.5) {
      var big = Math.round((az - GAP - 4) / 4.5) % 3 === 0;
      stroke(C.tick, big ? 0.6 : 0.35, 1); seg(dir(az, RAIL + 1.2), dir(az, RAIL + (big ? 2.8 : 1.9))); seg(dir(az, RAIL - 1.6), dir(az, RAIL - (big ? 2.9 : 2.2)));
    }
    var caps = 0;
    [-1, 1].forEach(function (sd) {
      var B = basis(dir(sd * GAP, RAIL)), w = T(2.6), h = T(3.4);
      var dia = [tp(B, -w, 0), tp(B, 0, h), tp(B, w, 0), tp(B, 0, -h)];
      if (fill(dia, C.plate, 1)) caps++;
      stroke(C.line, 0.85, 1.4); path(dia, true);
      stroke(C.line, 0.5, 1); path([tp(B, -w * 0.62, 0), tp(B, 0, h * 0.62), tp(B, w * 0.62, 0), tp(B, 0, -h * 0.62)], true);
      stroke(C.line, 0.9, 1.4); path([tp(B, -sd * w * 0.2, h * 0.3), tp(B, sd * w * 0.25, 0), tp(B, -sd * w * 0.2, -h * 0.3)]);
      // the bracket ticks over and under the cap
      stroke(C.line, 0.6, 1.2); seg(tp(B, -w * 0.5, h * 1.2), tp(B, w * 0.1, h * 1.45)); seg(tp(B, -w * 0.1, -h * 1.45), tp(B, w * 0.5, -h * 1.2));
      var Bc = basis(dir(sd * (GAP - 4), RAIL - 0.5));
      stroke(C.salmon, 0.9, 2.2); path([tp(Bc, sd * T(0.9), T(1.5)), tp(Bc, -sd * T(0.6), 0), tp(Bc, sd * T(0.9), -T(1.5))]);
    });
    parts.rail = true; parts.caps = caps;
  }
  // A ring of coffin cells round the rail at az, pointing in, with its crosshair and dotted ring.
  function sideRing(az) {
    var c = dir(az, RAIL), n = 34, drawn = 0;
    for (var k = 0; k < n; k++) {
      var a = k * 360 / n, q = ring(c, RING_R, a, a)[0];
      if (cell(coffin(radialBasis(c, q), -1, T(2.3), T(1.45)), 1)) drawn++;
    }
    var dots_ = ring(c, DOT_R, 0, 360, 3);
    ctx.fillStyle = C.tick;
    dots_.forEach(function (d) { var s = project(d); if (s) { ctx.globalAlpha = 0.55 * GA; ctx.beginPath(); ctx.arc(s[0], s[1], 1.4, 0, 7); ctx.fill(); } });
    stroke(C.line, 0.55, 1.2); path(ring(c, 3.4, 0, 360), true);
    [45, 135, 225, 315].forEach(function (a) { stroke(C.line, 0.6, 1.2); seg(ring(c, 3.4, a, a)[0], ring(c, 5, a, a)[0]); seg(ring(c, 8, a, a)[0], ring(c, 10, a, a)[0]); });
    var B = basis(c);
    dots(B, -T(8), -T(5), 3, 2, T(0.45)); dots(B, T(9), T(1.8), 3, 2, T(0.45));
    parts.ringCells = (parts.ringCells || 0) + drawn;
    if (az === 90) S.ringSample = [0, 60, 120, 180, 240, 300].map(function (a) { return ring(c, RING_R, a, a)[0]; }).concat([c]);
  }
  // The tall rulers are arcs of circles round a point off to each side (az +-90, el -10), radius 48 -- the
  // ruler's measured path in the front frame (it bows toward the middle), and unlike a meridian a circle
  // like this curves on screen however you look at it. The coffin column runs round the same centre just
  // outside it (radius 42.5 / 40), its points toward the nose; a plate sits on each ruler at eye level.
  var SIDE_C = [dir(-90, -10), dir(90, -10)], RULER_R = 48;
  function arcPt2(sd, r, phi) { var c = SIDE_C[sd < 0 ? 0 : 1]; return ring(c, r, sd < 0 ? phi : 180 - phi, sd < 0 ? phi : 180 - phi)[0]; }
  function rulers(p) {
    var stream = (p.dist * 0.003) % 1;
    tapes.stream = stream.toFixed(3);
    [-1, 1].forEach(function (sd) {
      var c = SIDE_C[sd < 0 ? 0 : 1];
      for (var e = -84, n = 0; e <= 84; e += 1.6, n++) {
        var ph = e - stream * 1.6, q = arcPt2(sd, RULER_R, ph), al = fade(Math.asin(q[1]) / D), long = n % 5 === 0;
        if (al < 0.04) continue;
        stroke(C.tick, (long ? 0.75 : 0.45) * al, long ? 2 : 1.3);
        seg(q, arcPt2(sd, RULER_R - (long ? 3 : 1.8), ph));
      }
      for (var ph2 = -84, i = 0; ph2 <= 84; ph2 += 4.6, i++) {
        var q2 = arcPt2(sd, 42.5 - (i % 2) * 2.4, ph2), al2 = fade(Math.asin(q2[1]) / D);
        if (al2 < 0.05) continue;
        cell(coffin(radialBasis(c, q2), 1, T(2.5), T(1.55)), al2 * 0.9);
      }
      var qp = arcPt2(sd, RULER_R + 2, 11);
      plate(radialBasis(c, qp), 0, 0, T(2.8), T(1.25), 0.9);
    });
    if (!S.rulerSample) S.rulerSample = [-40, -20, 0, 20, 40].map(function (ph) { return arcPt2(1, RULER_R, ph); });
  }
  // the centre, all from the front frame
  function centre() {
    // heading ticks over the nose, with the caret
    for (var a = -5; a <= 5.01; a += 0.5) { var big = Math.abs(a % 2.5) < 0.01; stroke(C.line, big ? 0.7 : 0.45, 1); seg(dir(a, 22.2), dir(a, big ? 23.5 : 22.9)); }
    stroke(C.line, 0.8, 1.3); seg(dir(0, 23), dir(0, 25)); path([dir(-0.6, 20.8), dir(0, 21.5), dir(0.6, 20.8)]);
    // the vertical reference and the nose designator under it
    stroke(C.line, 0.55, 1.2); seg(dir(0, 12.9), dir(0, -8));
    stroke(C.salmon, 0.85, 1.6); seg(dir(-2.6, -10), dir(-1.7, -10)); seg(dir(1.7, -10), dir(2.6, -10));
    stroke(C.salmon, 0.7, 1); dashText(basis(dir(0, -10)), 0, 0.004, T(1.4), 1, 0); dashText(basis(dir(0, -10.9)), 0, 0, T(1.2), 1, 0);
    stroke(C.line, 0.7, 1.2); path([dir(-0.9, -11.6), dir(0, -13), dir(0.9, -11.6)]);
    [-1, 1].forEach(function (sd) {
      // the slashes
      stroke(C.line, 0.6, 1.6);
      seg(dir(sd * 21.9, 20.5), dir(sd * 19.8, 19.7));
      seg(dir(sd * 20.9, -6.1), dir(sd * 18.4, -4.4));
      seg(dir(sd * 21.3, -12.2), dir(sd * 18.4, -14.6));
      // the frame dashes
      stroke(C.line, 0.55, 1.4);
      seg(dir(sd * 33.1, -8.2), dir(sd * 31.1, -8.3));
      seg(dir(sd * 35, -26.8), dir(sd * 33, -27.2));
      seg(dir(sd * 35.1, -35.3), dir(sd * 33.5, -35.7));
      seg(dir(sd * 12.9, 20.9), dir(sd * 9.9, 21.1));
      stroke(C.line, 0.5, 1.2); seg(dir(sd * 20.3, -20.2), dir(sd * 20.3, -21.8));
    });
  }
  // the plate cluster under the nose
  function cluster() {
    var B = basis(dir(0, -26));
    stroke(C.line, 0.85, 2); path([dir(-1.4, -23.2), dir(0, -24.4), dir(1.4, -23.2)]);
    stroke(C.line, 0.55, 1); dashText(basis(dir(0, -25.6)), 0, 0, T(4.6), 2, T(0.9));
    stroke(C.line, 0.85, 2); path([dir(-1.4, -29), dir(0, -28), dir(1.4, -29)]);
    stroke(C.salmon, 0.85, 2); path([dir(-1.6, -31.6), dir(0, -30.4), dir(1.6, -31.6)]);
    var tri = [dir(-2.6, -35.6), dir(2.6, -35.6), dir(0, -32.8)];
    fill(tri, C.plate, 1); stroke(C.salmon, 0.75, 1.4); path(tri, true);
    stroke(C.salmon, 0.5, 1); path([dir(-1.6, -35.1), dir(1.6, -35.1), dir(0, -33.5)], true);
    [-1, 1].forEach(function (sd) {
      badge(B, sd * T(10.1), 0, T(2.3));
      arrowPlate(B, sd * T(18), T(0.7), T(3.1), sd);
      tabPlate(basis(dir(sd * 8, -22.6)), 0, 0, T(1.3), sd);
      tabPlate(basis(dir(sd * 8, -29)), 0, 0, T(1.3), sd);
      dots(basis(dir(sd * 24.3, -27.3)), 0, 0, 3, 2, T(0.55));
    });
  }

  // ---- world-fixed ----
  function worldBasis(az, el) {
    var a = az * D, e = el * D;
    return { c: toBall(dir(az, el)), R: toBall([Math.cos(a), 0, -Math.sin(a)]), U: toBall([-Math.sin(e) * Math.sin(a), Math.cos(e), -Math.sin(e) * Math.cos(a)]) };
  }
  // The pitch ladder: a rung pair every 2.5 deg of the world's pitch (az 9 -> 14.4 either side), only near
  // the current pitch; at 0 deg the '=' line and the long hatch rows out to +-40. It banks with the suit.
  function pitchLadder(p) {
    var rungs = 0, hatch = 0;
    for (var k = Math.ceil((p.pitch - 12) / 2.5) * 2.5; k <= p.pitch + 12; k += 2.5) {
      if (Math.abs(k) < 0.01 || Math.abs(k) > 85) continue;
      var al = 1 - smooth(7, 12, Math.abs(k - p.pitch));
      if (al < 0.05) continue;
      var B = worldBasis(p.heading, k);
      [-1, 1].forEach(function (sd) {
        stroke(C.line, 0.55 * al, 1.3);
        if (k > 0) seg(tp(B, sd * T(9), 0), tp(B, sd * T(14.4), 0));
        else { seg(tp(B, sd * T(9), 0), tp(B, sd * T(11.2), 0)); seg(tp(B, sd * T(12.4), 0), tp(B, sd * T(14.4), 0)); }
      });
      rungs++;
    }
    var Z = worldBasis(p.heading, 0);
    stroke(C.line, 0.7, 1.3);
    [-1, 1].forEach(function (sd) { seg(tp(Z, sd * T(3.2), 0), tp(Z, sd * T(9), 0)); });
    stroke(C.line, 0.85, 1.4); seg(tp(Z, -T(0.9), T(0.3)), tp(Z, T(0.9), T(0.3))); seg(tp(Z, -T(0.9), -T(0.3)), tp(Z, T(0.9), -T(0.3)));
    var ends = {};
    [-1, 1].forEach(function (sd) {
      for (var a = 16.5; a <= 40; a += 1.6) {
        var Bh = worldBasis(p.heading + sd * a, -1.8);
        stroke(C.line, 0.55 * (1 - smooth(30, 40, a)), 1.5); seg(tp(Bh, -sd * T(0.75), T(0.9)), tp(Bh, sd * T(0.75), -T(0.9)));
        hatch++;
      }
      ends[sd] = project(toBall(dir(p.heading + sd * 25, -1.8)));
    });
    parts.ladderRoll = ends[1] && ends[-1] ? Math.round(Math.atan2(ends[1][1] - ends[-1][1], ends[1][0] - ends[-1][0]) / D) : 0;
    parts.rungs = rungs; parts.hatch = hatch;
  }
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
    p.contacts.slice(1).forEach(function (c) { var po = toBall(c.d); if (project(po)) { wMark(po, T(3.2), C.line, 'MS'); n++; } });
    var po = toBall(p.opp), lock = p.locked;
    wMark(po, T(4.2), lock ? C.bar : C.line, lock ? 'LOCK' : 'UNKNOWN', lock ? C.bar : C.salmon);
    parts.markers = n + 1;
    // off the nose: a dotted arc leads from the centre toward it
    var off = Math.acos(m.clamp(po[2], -1, 1)) / D;
    if (off > 10) {
      var ax = norm([po[0], po[1], 0]), end = Math.min(off - 5, 46);
      ctx.fillStyle = C.line;
      for (var g = 8; g <= end; g += 1.7) {
        var s = project(norm([ax[0] * Math.sin(g * D), ax[1] * Math.sin(g * D), Math.cos(g * D)]));
        if (!s) continue;
        ctx.globalAlpha = 0.6 * (1 - (g - 8) / 50); ctx.beginPath(); ctx.arc(s[0], s[1], 1.5, 0, 7); ctx.fill();
      }
    }
  }
  // the triangle sight (or the Y), only while locking
  function lockSight(p) {
    var a = smooth(0, 0.5, p.lockT);
    parts.lockSight = a > 0.5;
    if (a <= 0) return;
    GA = a;
    if (Y_SIGHT) {
      [150, 30, 270].forEach(function (an) {
        var c = Math.cos(an * D), sn = Math.sin(an * D);
        [-1, 1].forEach(function (o) { var pt = function (r) { return tp(F, c * r - sn * o * 0.0045, sn * r + c * o * 0.0045); }; stroke(C.line, 0.8, 2.2); seg(pt(0.03), pt(0.085)); });
      });
      ctx.letterSpacing = '4px'; text(tp(F, 0.1, 0.1), p.mode, C.pink, 0.95, 12, 'left'); ctx.letterSpacing = '0px';
    } else {
      var u = Math.min(0.22, tx * 0.4) / 237, L = function (x, y) { return tp(F, x * u, -y * u); }, lw = f / 605 * 0.8;
      var Tt = -200, A = 210, hw = 237, len = Math.hypot(hw, A - Tt), face = [L(-hw, Tt), L(hw, Tt), L(0, A)];
      fill(face, 'rgb(170, 186, 245)', 0.07); stroke(C.line, 0.32, lw); path(face, true);
      [-1, 1].forEach(function (sd) {
        var ux = -sd * hw / len, uy = (A - Tt) / len, nx = sd * (A - Tt) / len, ny = hw / len;
        var at = function (t, off) { return L(sd * hw + ux * len * t + nx * off, Tt + uy * len * t + ny * off); };
        stroke(C.line, 0.62, 6 * lw); seg(at(-0.04, 30), at(0.3, 30)); seg(at(0.72, 30), at(1.03, 30));
        var ix = sd * hw * 0.62, iy = Tt + 62;
        stroke(C.line, 0.56, 4 * lw); path([L(ix - sd * 78, iy), L(ix, iy), L(ix + ux * 84, iy + uy * 84)]);
      });
      stroke(C.line, 0.56, 4 * lw); path([L(-48, A - 196), L(0, A - 116), L(48, A - 196)]);
      ctx.letterSpacing = '3px'; text(L(hw - 24, Tt + 20 + 12 / lw), p.mode, C.pink, 0.95, Math.max(9, Math.round(12 * lw)), 'right'); ctx.letterSpacing = '0px';
    }
    GA = 1;
  }

  S.project = function (p) { return E ? project(p) : null; };
  S.anchors = { capL: dir(-GAP, RAIL), rulerL: dir(-RULER, -7.5), cluster: dir(0, -26), heading: dir(0, 22.2) };
  S.renderers.push(function (p, w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    W = w; H = h; E = p.eye; EQi = m.qconj(p.eyeQ); SQi = m.qconj(p.suitQ); tx = S.cam.tx; ty = S.cam.ty; f = W / 2 / tx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    parts.ringCells = 0;
    rulers(p);
    RING_AZ.forEach(sideRing);
    rail();
    centre();
    cluster();
    pitchLadder(p);
    contacts(p);
    lockSight(p);
    parts.rear = !!(project(dir(180, RAIL)) || project(dir(150, RAIL)) || project(dir(-150, RAIL)));
    ctx.globalAlpha = 1;
  });
  if (document.fonts && document.fonts.load) document.fonts.load('12px Michroma');
})();
