/* seat.js: what's fixed to the seat, as the pilot's eye is: the two arm rails with their control grips,
   built as small chamfered prisms in the seat's own frame (the eye at the origin, x right, y up,
   z forward, in ball radii) and drawn in perspective over the HUD. The eye rides the seat, so only the
   head turning moves them on screen: they sit just under the view at rest and come up as the pilot
   looks down (a dive, or a drag). No seat back: behind the pilot is the monitor's own rear HUD.
   Shapes follow the clips' controls: a handle on a stalk, a head block with three thumb buttons, a ribbed
   grip, a trigger plate, and a rail carrying a tick track and a pink line. */
(function () {
  'use strict';
  var S = window.SITE5, m = S.m, D = m.D;
  var ctx = S.hudCtx;
  if (!ctx) return;
  var LIGHT = m.norm([0.15, 0.75, 0.65]);   // the ball's glow: mostly from in front and above
  var EDGE = '#8496B8';

  // ---- geometry ----
  var faces = [];   // { pts: [[x,y,z]...], n: normal, base: [r,g,b], group, rim }
  // a prism: a cross-section in x-y (counter-clockwise), extruded along z from z0 to z1
  function prism(sec, z0, z1, base, group, rim) {
    for (var i = 0; i < sec.length; i++) {
      var a = sec[i], b = sec[(i + 1) % sec.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      faces.push({ pts: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], n: [dy / l, -dx / l, 0], base: base, group: group, rim: rim });
    }
    faces.push({ pts: sec.map(function (q) { return [q[0], q[1], z1]; }), n: [0, 0, 1], base: base, group: group, rim: rim });
    faces.push({ pts: sec.map(function (q) { return [q[0], q[1], z0]; }), n: [0, 0, -1], base: base, group: group, rim: rim });
  }
  // a rectangle x0..x1, y0..y1 with its top corners chamfered by c (and the bottom ones by cb)
  function chamfer(x0, x1, y0, y1, c, cb) {
    cb = cb || 0;
    return [[x0 + cb, y0], [x1 - cb, y0], [x1, y0 + cb], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + cb]];
  }
  var GUN = [26, 33, 46], DEEP = [14, 19, 28], SLATE = [34, 44, 62], NAVY = [28, 38, 64];
  [-1, 1].forEach(function (sd) {
    // mirror a section for the left side (and keep it counter-clockwise)
    var M = function (sec) { return sd > 0 ? sec : sec.map(function (q) { return [-q[0], q[1]]; }).reverse(); };
    prism(M(chamfer(0.235, 0.315, -0.47, -0.425, 0.012, 0.006)), -0.06, 0.44, DEEP, 'rail', true);    // the arm rail
    prism(M(chamfer(0.248, 0.302, -0.425, -0.412, 0.004)), 0.0, 0.40, GUN, 'rail', true);            // its top plate
    prism(M(chamfer(0.262, 0.288, -0.412, -0.378, 0.006)), 0.33, 0.36, GUN, 'grip', true);           // the grip's stalk
    prism(M(chamfer(0.256, 0.294, -0.378, -0.352, 0.01, 0.004)), 0.24, 0.41, SLATE, 'grip', true);   // the handle
    prism(M(chamfer(0.25, 0.30, -0.39, -0.33, 0.016, 0.006)), 0.385, 0.435, NAVY, 'grip', true);    // the head block
    prism(M(chamfer(0.266, 0.284, -0.404, -0.39, 0.003)), 0.405, 0.43, GUN, 'grip');                 // the trigger
  });

  // details drawn on top of their faces: [group, kind, points, colour, alpha]
  var details = [];
  [-1, 1].forEach(function (sd) {
    var top = -0.412 + 0.0006;
    for (var z = 0.02; z <= 0.3; z += 0.012) details.push(['rail', 'line', [[sd * 0.252, top, z], [sd * (z % 0.06 < 0.012 ? 0.266 : 0.26), top, z]], '#C9D4EE', 0.55]);
    details.push(['rail', 'line', [[sd * 0.292, top, 0.0], [sd * 0.292, top, 0.32]], '#FF4F8B', 0.85]);
    details.push(['rail', 'line', [[sd * 0.296, top, 0.0], [sd * 0.296, top, 0.32]], '#FFC6E8', 0.4]);
    details.push(['rail', 'rect', [sd * 0.275, top, 0.36, 0.022, 0.008], sd > 0 ? '#E0A93A' : '#3FC1D9', 0.95]);
    for (var rz = 0.27; rz <= 0.37; rz += 0.011) details.push(['grip', 'line', [[sd * 0.259, -0.352 + 0.0006, rz], [sd * 0.291, -0.352 + 0.0006, rz]], '#5D6C86', 0.9]);
    // three thumb buttons on the head block's back face, toward the pilot, and a small lamp on top
    [[0.266, -0.344], [0.284, -0.354], [0.266, -0.364]].forEach(function (b) { details.push(['grip', 'disc', [sd * b[0], b[1], 0.385 - 0.0006, 0.0068], '#0B1019', 1]); });
    details.push(['grip', 'rect', [sd * 0.275, -0.33 + 0.0006, 0.41, 0.012, 0.006], sd > 0 ? '#E0A93A' : '#3FC1D9', 0.85]);
  });

  // ---- drawing ----
  // On a narrow (portrait) screen the view is too tight to ever take in the grips, so the pair is drawn
  // closer together there (KX < 1); LIFT raises them so their heads just show in the lower corners.
  var W, H, tx, ty, HQi, KX = 1, LIFT = 0.035;
  function local(p) { return [p[0] * KX, p[1] + LIFT, p[2]]; }
  function toEye(p) { return m.qrot(HQi, local(p)); }
  function proj(v) { return [W / 2 + v[0] / v[2] / tx * W / 2, H / 2 - v[1] / v[2] / ty * H / 2]; }
  // clip a polygon (eye frame) to in front of the eye
  function clip(poly) {
    var out = [], NEAR = 0.02;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], ina = a[2] > NEAR, inb = b[2] > NEAR;
      if (ina) out.push(a);
      if (ina !== inb) { var t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
    }
    return out;
  }
  function shade(base, n) {
    var l = 0.55 + 0.75 * Math.max(0, m.dot(n, LIGHT));
    return 'rgb(' + Math.round(base[0] * l) + ',' + Math.round(base[1] * l) + ',' + Math.round(base[2] * l) + ')';
  }
  function centre(pts) { var c = [0, 0, 0]; pts.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length]; }
  faces.forEach(function (fc) { fc.c = centre(fc.pts); });

  S.renderers.push(function (pose, w, h) {
    W = w; H = h; tx = S.cam.tx; ty = S.cam.ty;
    KX = m.clamp(tx / Math.tan(50 * D) * 1.25, 0.4, 1);
    HQi = m.qconj(m.euler(pose.head.yaw, pose.head.pitch, 0));
    var drawn = { rail: 0, grip: 0 };
    // the faces turned toward the eye (the eye is the origin), far to near
    var vis = faces.filter(function (fc) { return m.dot(m.norm([fc.n[0] / KX, fc.n[1], fc.n[2]]), local(fc.c)) < 0; })
      .map(function (fc) { var c = toEye(fc.c); return { fc: fc, d: c[0] * c[0] + c[1] * c[1] + c[2] * c[2] }; })
      .sort(function (a, b) { return b.d - a.d; });
    ctx.lineJoin = 'round';
    vis.forEach(function (o) {
      var fc = o.fc, poly = clip(fc.pts.map(toEye));
      if (poly.length < 3) return;
      var q = poly.map(proj);
      ctx.globalAlpha = 1; ctx.fillStyle = shade(fc.base, fc.n); ctx.beginPath();
      q.forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
      ctx.closePath(); ctx.fill();
      // a faint edge, brighter where the glow catches it
      ctx.strokeStyle = EDGE; ctx.lineWidth = 1; ctx.globalAlpha = fc.rim ? 0.12 + 0.4 * Math.max(0, m.dot(fc.n, LIGHT)) : 0.1; ctx.stroke();
      drawn[fc.group]++;
    });
    details.forEach(function (dt) {
      if (!drawn[dt[0]]) return;
      ctx.globalAlpha = dt[4];
      if (dt[1] === 'line') {
        var a = toEye(dt[2][0]), b = toEye(dt[2][1]);
        if (a[2] < 0.02 || b[2] < 0.02) return;
        var pa = proj(a), pb = proj(b);
        ctx.strokeStyle = dt[3]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      } else if (dt[1] === 'rect') {
        var r = dt[2], pts = [[r[0] - r[4], r[1], r[2] - r[3] / 2], [r[0] + r[4], r[1], r[2] - r[3] / 2], [r[0] + r[4], r[1], r[2] + r[3] / 2], [r[0] - r[4], r[1], r[2] + r[3] / 2]].map(toEye);
        if (pts.some(function (v) { return v[2] < 0.02; })) return;
        ctx.fillStyle = dt[3]; ctx.beginPath(); pts.map(proj).forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.closePath(); ctx.fill();
      } else {
        var c = dt[2], ring = [];
        for (var a2 = 0; a2 < 360; a2 += 30) ring.push(toEye([c[0] + Math.cos(a2 * D) * c[3], c[1] + Math.sin(a2 * D) * c[3], c[2]]));
        if (ring.some(function (v) { return v[2] < 0.02; })) return;
        ctx.fillStyle = dt[3]; ctx.strokeStyle = EDGE; ctx.lineWidth = 1; ctx.beginPath();
        ring.map(proj).forEach(function (s, j) { if (j) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); });
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.5; ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
    S.parts.seat = drawn;
    var g = toEye([0.275, -0.36, 0.41]);
    S.parts.gripAt = g[2] > 0.02 ? proj(g) : null;
  });
})();
