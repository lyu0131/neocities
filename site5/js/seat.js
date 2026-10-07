/* seat.js: what's fixed to the seat, as the pilot's eye is, after the owner's ref frames (#14, #28, #29, #31-33):
   the bucket seat (its pan with a quilted cushion and thigh bolsters, the lumbar back with its rounded pads, the
   wrap-round shoulder bolsters and the headrest's side wings), the two long armrest consoles on support legs with
   red lamp strips, the upright control grips (a ribbed boot, a head cap with thumb buttons, a trigger), and the
   hardware the seat hangs on: a pedestal, the legs' cross members, a bundle of hoses behind and the boom arm up
   to the ball wall. A real 3D model (WebGL2, its own canvas over the HUD), built from rounded boxes and tubes in
   the seat's frame (the eye at the origin, x right, y up, z forward, in ball radii; 1 is about 1.4 m).
   Lit the way a ball cockpit is: by the panoramic monitor all round it, so the light comes from the picture --
   the sky above, the moonlit cloud sea below (the brightest), the moon itself -- in world directions, and it
   shifts as the suit banks and dives; the near-miss flash lights it too. Ambient occlusion, worked out once at
   load by casting short rays from every vertex at the other parts, darkens where parts meet.
   The pilot's own body isn't drawn, so the back is left open behind the head (the block there would only hide the
   rear view a real pilot's body hides anyway); no tablets, as the owner wants the cockpit clean of panels. The eye
   rides the seat, so only the head turning moves it: it sits under the view at rest and comes up as the pilot
   looks down or round. */
(function () {
  'use strict';
  var S = window.SITE5, m = S.m, D = m.D;
  var canvas = document.getElementById('seat');
  var gl = canvas && canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, depth: true });
  if (!gl) return;

  // ---- materials: albedo, roughness, metalness, emission, and a surface kind for the shader's fine detail:
  //   0 smooth (glossy plastic), 1 rubber (a fine stipple), 2 machined metal (brushed streaks), 3 woven fabric,
  //   4 painted metal (orange peel, worn to bare metal on the corners), 5 bead-blasted polymer ----
  var MAT = {
    shell: { a: [0.17, 0.165, 0.16], r: 0.55, m: 0, k: 4 },          // the painted shell and consoles, a warm gunmetal
    pad: { a: [0.075, 0.074, 0.074], r: 0.95, m: 0, k: 3 },          // padding
    dark: { a: [0.07, 0.072, 0.078], r: 0.42, m: 0.7, k: 2 },        // dark anodised mechanism
    metal: { a: [0.56, 0.57, 0.58], r: 0.3, m: 1, k: 2 },            // steel joints, collars, bolts
    hose: { a: [0.19, 0.17, 0.15], r: 0.72, m: 0, k: 1 },            // rubber hoses, a little warm, as in #31
    grip: { a: [0.045, 0.045, 0.05], r: 0.85, m: 0, k: 1 },          // the grip's rubber handle
    boot: { a: [0.035, 0.035, 0.038], r: 0.6, m: 0, k: 1 },          // its bellows boot, a shinier rubber
    cap: { a: [0.12, 0.12, 0.125], r: 0.5, m: 0, k: 5 },             // the head cap, bead-blasted polymer
    button: { a: [0.025, 0.025, 0.028], r: 0.22, m: 0, k: 0 },       // glossy thumb buttons
    yellow: { a: [0.80, 0.60, 0.12], r: 0.3, m: 0, k: 0 },           // the suit's colours, on the grips
    teal: { a: [0.12, 0.52, 0.58], r: 0.3, m: 0, k: 0 },
    accent: null,                                                    // the grip's one coloured button: yellow right, teal left
    lamp: { a: [0.2, 0.02, 0.04], r: 0.3, m: 0, k: 0, e: [1.6, 0.16, 0.24] },   // the red lamps
    trim: { a: [0.2, 0.05, 0.1], r: 0.3, m: 0, k: 0, e: [0.85, 0.22, 0.45] }    // the pink trim along the consoles
  };

  // ---- geometry: triangles of {p, n, m, id}, the parts as ray occluders, sample points per group ----
  var TRI = [], boxes = [], spheres = [], pid = 0, points = { seat: [], rail: [], grip: [], frame: [] };
  function rot(axis, a) {
    var c = Math.cos(a * D), s = Math.sin(a * D);
    return [function (p) { return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; },
      function (p) { return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; },
      function (p) { return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }][axis];
  }
  var rotX = function (a) { return rot(0, a); }, rotY = function (a) { return rot(1, a); }, rotZ = function (a) { return rot(2, a); };
  function add(p, q) { return [p[0] + q[0], p[1] + q[1], p[2] + q[2]]; }
  function sub(p, q) { return [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function tri(a, b, c) { TRI.push(a, b, c); }
  // A rounded box: centre c, half sizes h, edge radius r, turned by R (a rotation, or none). The box surface is
  // sampled densely only in the rounded bands, then pushed out from its inner core, so the edges are true curves.
  function rbox(c, h, r, mat, grp, R) {
    R = R || function (p) { return p; };
    var id = pid++;
    var ax = [0, 1, 2].map(function (k) { var a = h[k] - r; return [-h[k], -a - r * 0.66, -a - r * 0.33, -a, a, a + r * 0.33, a + r * 0.66, h[k]]; });
    var at = function (q) {
      var inner = q.map(function (v, k) { return m.clamp(v, -(h[k] - r), h[k] - r); }), n = m.norm(sub(q, inner));
      var edge = q.filter(function (v, k) { return Math.abs(v) > h[k] - r + 1e-9; }).length > 1 ? 1 : 0;   // on a rounded edge
      return { p: add(c, R([inner[0] + n[0] * r, inner[1] + n[1] * r, inner[2] + n[2] * r])), n: R(n), m: mat, id: id, edge: edge };
    };
    for (var f = 0; f < 3; f++) for (var sg = -1; sg <= 1; sg += 2) {
      var u = (f + 1) % 3, v = (f + 2) % 3, U = ax[u], W = ax[v], grid = [];   // each grid vertex made once, shared by its quads
      for (var a0 = 0; a0 < 8; a0++) for (var b0 = 0; b0 < 8; b0++) { var p0 = [0, 0, 0]; p0[f] = sg * h[f]; p0[u] = U[a0]; p0[v] = W[b0]; grid.push(at(p0)); }
      for (var i = 0; i < 7; i++) for (var j = 0; j < 7; j++) {
        var q = function (a, b) { return grid[a * 8 + b]; };
        var A = q(i, j), B = q(i + 1, j), C = q(i + 1, j + 1), E = q(i, j + 1);
        if (sg > 0) { tri(A, B, C); tri(A, C, E); } else { tri(A, C, B); tri(A, E, C); }
      }
    }
    boxes.push({ c: c, M: [R([1, 0, 0]), R([0, 1, 0]), R([0, 0, 1])], h: h, rad: Math.hypot(h[0], h[1], h[2]), id: id });
    for (var k = 0; k < 8; k++) points[grp].push(add(c, R([k & 1 ? h[0] : -h[0], k & 2 ? h[1] : -h[1], k & 4 ? h[2] : -h[2]])));
    points[grp].push(c);
  }
  // A tube of radius r along a path (smoothed through its points), capped at both ends.
  function tube(path, r, mat, grp, sides) {
    sides = sides || 12;
    var id = pid++, pts = [];
    if (path.length === 2) for (var s0 = 0; s0 <= 8; s0++) pts.push([0, 1, 2].map(function (k) { return path[0][k] + (path[1][k] - path[0][k]) * s0 / 8; }));
    else for (var i = 0; i < path.length - 1; i++) {
      var p0 = path[Math.max(0, i - 1)], p1 = path[i], p2 = path[i + 1], p3 = path[Math.min(path.length - 1, i + 2)];
      for (var s = 0; s < 8; s++) { var t = s / 8, t2 = t * t, t3 = t2 * t; pts.push([0, 1, 2].map(function (k) { return 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3); })); }
    }
    if (path.length > 2) pts.push(path[path.length - 1]);
    var rings = [], ref = [0, 1, 0];
    for (i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], T = m.norm(sub(b, a));
      if (Math.abs(m.dot(T, ref)) > 0.95) ref = [1, 0, 0];
      var N = m.norm(cross(ref, T)), Bn = cross(T, N); ref = Bn;   // carried along, so the tube doesn't twist
      var ring = [];
      for (var k = 0; k < sides; k++) { var an = k / sides * 2 * Math.PI, n = [0, 1, 2].map(function (j) { return N[j] * Math.cos(an) + Bn[j] * Math.sin(an); }); ring.push({ p: add(pts[i], [n[0] * r, n[1] * r, n[2] * r]), n: n, m: mat, id: id }); }
      rings.push({ ring: ring, c: pts[i], T: T });
      if (i % 2 === 0 || i === pts.length - 1) spheres.push({ c: pts[i], r: r, id: id });   // every other ring is close enough for shading
    }
    for (i = 0; i < rings.length - 1; i++) for (k = 0; k < sides; k++) {
      var A = rings[i].ring[k], B = rings[i].ring[(k + 1) % sides], C = rings[i + 1].ring[(k + 1) % sides], E = rings[i + 1].ring[k];
      tri(A, C, B); tri(A, E, C);
    }
    [0, rings.length - 1].forEach(function (ri, e) {
      var R0 = rings[ri], n = e ? R0.T : [-R0.T[0], -R0.T[1], -R0.T[2]], mid = { p: R0.c, n: n, m: mat, id: id };
      for (k = 0; k < sides; k++) { var P = { p: R0.ring[k].p, n: n, m: mat, id: id }, Q = { p: R0.ring[(k + 1) % sides].p, n: n, m: mat, id: id }; if (e) tri(mid, P, Q); else tri(mid, Q, P); }
    });
    path.forEach(function (p) { points[grp].push(p); });
  }

  // the seat itself
  rbox([0, -0.6, 0.05], [0.2, 0.035, 0.18], 0.02, MAT.shell, 'seat');                         // the pan
  [-0.075, 0.04, 0.155].forEach(function (z) { rbox([0, -0.556, z], [0.145, 0.02, 0.054], 0.016, MAT.pad, 'seat'); });   // quilted cushion
  rbox([0, -0.585, 0.228], [0.19, 0.028, 0.018], 0.012, MAT.shell, 'seat');                   // the front lip
  rbox([0, -0.45, -0.165], [0.16, 0.1, 0.035], 0.025, MAT.shell, 'seat', rotX(-6));           // the lumbar back
  [-1, 1].forEach(function (sd) {
    rbox([sd * 0.172, -0.548, 0.08], [0.04, 0.026, 0.15], 0.012, MAT.shell, 'seat', rotZ(-sd * 14));      // thigh bolsters
    rbox([sd * 0.075, -0.45, -0.128], [0.058, 0.075, 0.01], 0.01, MAT.pad, 'seat', rotX(-6));             // lumbar pads
    rbox([sd * 0.2, -0.33, -0.13], [0.03, 0.2, 0.07], 0.022, MAT.shell, 'seat', rotY(-sd * 20));          // shoulder bolsters
    rbox([sd * 0.178, -0.38, -0.112], [0.008, 0.07, 0.042], 0.008, MAT.pad, 'seat', rotY(-sd * 20));      // their pads, two
    rbox([sd * 0.178, -0.23, -0.112], [0.008, 0.06, 0.042], 0.008, MAT.pad, 'seat', rotY(-sd * 20));
    rbox([sd * 0.15, 0.03, -0.15], [0.022, 0.075, 0.045], 0.018, MAT.shell, 'seat', rotY(-sd * 15));      // headrest wings, clear of the helmet
    rbox([sd * 0.132, 0.03, -0.142], [0.005, 0.055, 0.03], 0.005, MAT.pad, 'seat', rotY(-sd * 15));
  });

  // the consoles, their legs and lamps, and the grips
  [-1, 1].forEach(function (sd) {
    var X = sd * 0.275;
    rbox([X, -0.49, 0.17], [0.05, 0.04, 0.25], 0.01, MAT.shell, 'rail');                      // the console
    rbox([X - sd * 0.003, -0.446, 0.12], [0.04, 0.008, 0.2], 0.007, MAT.pad, 'rail');         // the arm pad
    rbox([sd * 0.3255, -0.49, 0.15], [0.003, 0.026, 0.2], 0.002, MAT.dark, 'rail');           // a panel let into its outer side
    rbox([sd * 0.2245, -0.49, 0.17], [0.003, 0.024, 0.21], 0.002, MAT.dark, 'rail');          // and its inner
    rbox([sd * 0.235, -0.451, 0.15], [0.0025, 0.0025, 0.17], 0.002, MAT.trim, 'rail');        // the pink trim
    rbox([X, -0.47, 0.4], [0.052, 0.05, 0.075], 0.01, MAT.shell, 'rail');                     // its raised head
    for (var g = 0; g < 4; g++) rbox([X, -0.495 + g * 0.014, 0.4755], [0.034, 0.003, 0.002], 0.0015, MAT.dark, 'rail');   // a vent in its front
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (b) { tube([[X + b[0] * 0.04, -0.4195, 0.4 + b[1] * 0.06], [X + b[0] * 0.04, -0.4185, 0.4 + b[1] * 0.06]], 0.004, MAT.metal, 'rail', 8); });   // bolts
    rbox([X, -0.418, 0.405], [0.032, 0.006, 0.036], 0.005, MAT.dark, 'rail');                 // the grip's mount plate
    rbox([sd * 0.24, -0.56, -0.01], [0.03, 0.02, 0.06], 0.01, MAT.dark, 'rail');              // the console's arm to the seat
    rbox([X, -0.70, 0.4], [0.03, 0.17, 0.035], 0.01, MAT.dark, 'rail');                       // the support leg
    tube([[X - 0.036, -0.535, 0.4], [X + 0.036, -0.535, 0.4]], 0.02, MAT.metal, 'rail');     // its hinge
    rbox([X - sd * 0.0305, -0.66, 0.4], [0.002, 0.055, 0.007], 0.002, MAT.lamp, 'rail');      // the red lamp strip
    rbox([X, -0.875, 0.4], [0.045, 0.012, 0.05], 0.008, MAT.metal, 'rail');                   // its foot
  });

  // what the seat hangs on: a pedestal, the legs' cross members, hoses, and the boom arm to the ball wall
  tube([[0, -0.635, 0.0], [0, -0.96, -0.05]], 0.05, MAT.dark, 'frame', 16);
  tube([[0, -0.66, 0.0], [0, -0.69, -0.005]], 0.058, MAT.metal, 'frame', 16);
  rbox([0, -0.65, 0.06], [0.24, 0.018, 0.035], 0.008, MAT.dark, 'frame');
  [-1, 1].forEach(function (sd) {
    tube([[sd * 0.275, -0.87, 0.4], [sd * 0.17, -0.89, 0.26], [sd * 0.04, -0.92, 0.05]], 0.018, MAT.dark, 'frame');
    [0.03, 0.07, 0.11, 0.15].forEach(function (a, i) {
      tube([[sd * a, -0.36 - i * 0.03, -0.19], [sd * (a + 0.05), -0.48, -0.3], [sd * (a + 0.02), -0.74, -0.29], [sd * 0.05, -0.92, -0.11]], 0.011 + (i % 2) * 0.005, MAT.hose, 'frame', 10);
    });
  });
  var bh = 0.33, bc = [0, -0.35 + bh * Math.cos(32.5 * D), -0.2 - bh * Math.sin(32.5 * D)];
  rbox(bc, [0.06, bh, 0.05], 0.015, MAT.shell, 'frame', rotX(-32.5));                        // the boom
  rbox([0, -0.33, -0.21], [0.08, 0.05, 0.03], 0.012, MAT.metal, 'frame');                    // its root on the back

  // ---- ambient occlusion, once: short rays from each vertex over its hemisphere, against the other parts ----
  // The pilot isn't drawn, but their helmet and torso still shade the seat's inner faces, so they stand in here
  // as occluders only.
  spheres.push({ c: [0, 0.0, -0.02], r: 0.13, id: -1 });
  boxes.push({ c: [0, -0.32, -0.03], M: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [0.16, 0.2, 0.085], rad: 0.27, id: -1 });
  var AO_D = 0.14, DIRS = [];
  for (var di = 0; di < 12; di++) {   // cosine-weighted, a golden-angle spiral
    var rr = Math.sqrt((di + 0.5) / 12), ph = di * 2.39996;
    DIRS.push([rr * Math.cos(ph), rr * Math.sin(ph), Math.sqrt(1 - rr * rr)]);
  }
  function hitBox(o, d, b) {
    var lo = sub(o, b.c), t0 = 0, t1 = AO_D;
    for (var k = 0; k < 3; k++) {
      var oo = m.dot(lo, b.M[k]), dd = m.dot(d, b.M[k]);
      if (Math.abs(dd) < 1e-9) { if (Math.abs(oo) > b.h[k]) return -1; continue; }
      var ta = (-b.h[k] - oo) / dd, tb = (b.h[k] - oo) / dd;
      if (ta > tb) { var sw = ta; ta = tb; tb = sw; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return -1;
    }
    return t0;
  }
  function hitSphere(o, d, s) {
    var l = sub(o, s.c), b = m.dot(l, d), c = m.dot(l, l) - s.r * s.r, h = b * b - c;
    if (h < 0) return -1;
    var t = -b - Math.sqrt(h);
    return t > 0 && t < AO_D ? t : -1;
  }
  // each part's neighbours (the occluders within reach of its bounds), found once per part, not per vertex
  var bound = {}, cand = {};
  TRI.forEach(function (v) { var b = bound[v.id] || (bound[v.id] = { lo: v.p.slice(), hi: v.p.slice() }); for (var k = 0; k < 3; k++) { b.lo[k] = Math.min(b.lo[k], v.p[k]); b.hi[k] = Math.max(b.hi[k], v.p[k]); } });
  function neighbours(id) {
    if (cand[id]) return cand[id];
    var b = bound[id], c = [0, 1, 2].map(function (k) { return (b.lo[k] + b.hi[k]) / 2; }), rad = Math.hypot(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) / 2;
    var near = function (q, r) { var d = sub(q, c); return Math.sqrt(m.dot(d, d)) < r + rad + AO_D; };
    return (cand[id] = { bs: boxes.filter(function (o) { return o.id !== id && near(o.c, o.rad); }), ss: spheres.filter(function (o) { return o.id !== id && near(o.c, o.r); }) });
  }
  function ao(v) {
    if (v.ao !== undefined) return v.ao;   // a vertex shared by several triangles is worked out once
    var o = add(v.p, [v.n[0] * 0.002, v.n[1] * 0.002, v.n[2] * 0.002]), nb = neighbours(v.id);
    var reach = function (q, r) { var d = sub(q, o); return m.dot(d, d) < (r + AO_D) * (r + AO_D); };
    var bs = nb.bs.filter(function (b) { return reach(b.c, b.rad); }), ss = nb.ss.filter(function (sp) { return reach(sp.c, sp.r); });
    var tA = Math.abs(v.n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], X = m.norm(cross(tA, v.n)), Y = cross(v.n, X), occ = 0;
    DIRS.forEach(function (q) {
      var d = [0, 1, 2].map(function (k) { return X[k] * q[0] + Y[k] * q[1] + v.n[k] * q[2]; }), best = AO_D;
      bs.forEach(function (b) { var t = hitBox(o, d, b); if (t >= 0 && t < best) best = t; });
      ss.forEach(function (s) { var t = hitSphere(o, d, s); if (t >= 0 && t < best) best = t; });
      occ += 1 - best / AO_D;
    });
    return (v.ao = 1 - 0.9 * occ / DIRS.length);
  }
  var STRIDE = 17, V = new Float32Array(TRI.length * STRIDE);
  TRI.forEach(function (v, i) {
    var e = v.m.e || [0, 0, 0], o = i * STRIDE;
    V.set([v.p[0], v.p[1], v.p[2], v.n[0], v.n[1], v.n[2], v.m.a[0], v.m.a[1], v.m.a[2], e[0], e[1], e[2], v.m.r, v.m.m, v.m.k, v.edge || 0, 1], o);
  });
  // The occlusion is worked out after load, a slice at a time while the browser is idle, then uploaded: the seat
  // sits under the view at rest, so it's in long before anyone looks down.
  function occlude(from) {
    var t0 = Date.now(), i = from;
    for (; i < TRI.length && Date.now() - t0 < 12; i++) V[i * STRIDE + 16] = ao(TRI[i]);
    if (i < TRI.length) return later(function () { occlude(i); });
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
    S.parts.seatAO = true;
  }
  var later = window.requestIdleCallback ? function (f) { requestIdleCallback(f, { timeout: 200 }); } : function (f) { setTimeout(f, 16); };

  // ---- GL ----
  var VS = ['#version 300 es',
    'in vec3 aP, aN, aA, aE; in float aR, aM, aK, aG, aO;',
    'uniform mat3 uView, uRot; uniform vec3 uOrg; uniform vec2 uTan; uniform float uKX, uLift;',
    'out vec3 vN, vA, vE, vP, vW; out float vR, vM, vK, vG, vO;',
    'void main() {',
    '  vec3 q = uRot * aP + uOrg, m = uRot * aN;',
    '  vec3 p = vec3(q.x * uKX, q.y + uLift, q.z), e = uView * p;',
    '  vP = p; vW = aP; vN = normalize(vec3(m.x / uKX, m.y, m.z)); vA = aA; vE = aE; vR = aR; vM = aM; vK = aK; vG = aG; vO = aO;',
    '  float n = .01, f = 4.;',
    '  gl_Position = vec4(e.x / uTan.x, e.y / uTan.y, e.z * (f + n) / (f - n) - 2. * f * n / (f - n), e.z);',
    '}'].join('\n');
  // Physically based: the light is the panoramic monitor -- what it shows in each world direction (the sky above,
  // the cloud sea below, brightest where the moon lights it), read through the suit's attitude -- plus the moon and
  // the flash. Diffuse takes the screen's light round the normal; the reflection takes it round the mirror direction,
  // blurred toward the diffuse as the surface roughens; Fresnel (Schlick, roughness-aware) splits the two, and
  // metals tint their reflection. Each surface kind adds its own fine relief (normal and roughness), in seat space.
  var FS = ['#version 300 es', 'precision highp float;',
    'in vec3 vN, vA, vE, vP, vW; in float vR, vM, vK, vG, vO;',
    'uniform mat3 uSuit; uniform float uFlash;',
    'out vec4 o;',
    'const vec3 MOON = normalize(vec3(-.45, .30, .84));',
    'float h3(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);',
    '  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),',
    '             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }',
    'vec3 grad(vec3 p) { return vec3(n3(p + vec3(31., 0, 0)), n3(p + vec3(0, 47., 0)), n3(p + vec3(0, 0, 59.))) - .5; }',   // a cheap bump direction
    // how much of a pattern at frequency f survives at this pixel's size: fine relief fades out rather than sparkling
    'float keep(vec3 p, float f) { return clamp(1.5 - length(fwidth(p * f)) * 1.5, 0., 1.); }',
    'vec3 screen(vec3 w) {',
    '  vec3 zen = vec3(.020, .036, .068), hor = vec3(.105, .175, .228), sea = vec3(.20, .27, .34);',
    '  vec3 c = w.y > 0. ? mix(hor, zen, sqrt(w.y)) : mix(hor, sea, sqrt(-w.y));',
    '  c *= 1. + .6 * pow(max(dot(normalize(vec3(w.x, -abs(w.y), w.z)), normalize(vec3(MOON.x, -MOON.y, MOON.z))), 0.), 3.);',
    '  return pow(mix(vec3(dot(c, vec3(.3, .59, .11))), c, .6), vec3(2.2));',   // as light (linear), a little greyer than it looks
    '}',
    'vec3 irradiance(vec3 w) { return screen(w) * .8 + .1 * (screen(vec3(0., 1., 0.)) + screen(vec3(0., -1., 0.))); }',
    'void main() {',
    '  vec3 n = normalize(vN), v = normalize(-vP), P = vW;',
    '  if (dot(n, v) < 0.) n = -n;',
    '  vec3 alb = vA; float rough = vR, metal = vM, k = vK + .5;',
    '  if (k < 1.) {',                                             // glossy plastic: a faint ripple from the mould
    '    rough += .04 * (n3(P * 600.) - .5);',
    '  } else if (k < 2.) {',                                      // rubber: a fine stipple, matte with tiny glints
    '    float st = n3(P * 700.), kp = keep(P, 700.);',
    '    n = normalize(n + .45 * kp * grad(P * 700.));', '    st = mix(.5, st, kp);',
    '    rough = clamp(rough + .15 * (st - .5), .3, 1.); alb *= .85 + .3 * st;',
    '  } else if (k < 3.) {',                                      // machined metal: brushed streaks, a little scuffing
    '    float kp = keep(P, 900.), br = mix(.5, n3(vec3(P.x * 900., P.y * 900., P.z * 40.)), kp) * .6 + n3(P * 200.) * .4;',
    '    n = normalize(n + .1 * kp * grad(vec3(P.x * 900., P.y * 900., P.z * 40.)));',
    '    rough = clamp(rough * (.7 + .6 * br), .08, 1.); alb *= .9 + .2 * br;',
    '  } else if (k < 4.) {',                                      // woven fabric: a cross weave, very rough
    '    float kp = keep(P, 700.), wv = mix(.6, abs(sin(P.x * 700.) * sin(P.z * 700. + P.y * 700.)), kp);',
    '    n = normalize(n + .2 * kp * grad(P * 600.)); alb *= .78 + .4 * wv; rough = .97;',
    '  } else if (k < 5.) {',                                      // painted metal: orange peel; worn to bare metal on the corners
    '    n = normalize(n + .06 * grad(P * 260.));',
    '    float wear = smoothstep(.75, 1., vG) * smoothstep(.62, .85, n3(P * 160.) * .75 + n3(P * 500.) * .25 * keep(P, 500.)) * .8;',
    '    alb = mix(alb * (.92 + .16 * n3(P * 60.)), vec3(.30, .30, .31), wear); metal = mix(metal, 1., wear); rough = mix(rough, .4, wear);',
    '    rough += .08 * (n3(P * 40.) - .5);',                      // handling marks
    '  } else {',                                                  // bead-blasted polymer: an even fine tooth
    '    float kp = keep(P, 900.); n = normalize(n + .16 * kp * grad(P * 900.)); rough = clamp(rough + .1 * kp * (n3(P * 900.) - .5), .3, 1.);',
    '  }',
    '  rough = clamp(rough, .05, 1.);',
    '  vec3 w = uSuit * n, vw = uSuit * v, rw = reflect(-vw, w);',
    '  float NoV = max(dot(w, vw), 1e-3);',
    '  vec3 F0 = mix(vec3(.04), alb, metal);',
    '  vec3 F = F0 + (max(vec3(1. - rough), F0) - F0) * pow(1. - NoV, 5.);',
    '  vec3 env = mix(screen(rw), irradiance(rw), rough * rough);',          // a rough surface blurs what it reflects
    '  vec3 diff = (1. - F) * (1. - metal) * alb * irradiance(w);',
    // the moon: a GGX highlight
    '  vec3 hv = normalize(MOON + vw); float NoH = max(dot(w, hv), 0.), NoL = max(dot(w, MOON), 0.), a2 = pow(rough, 4.);',
    '  float Dg = a2 / (3.14159 * pow(NoH * NoH * (a2 - 1.) + 1., 2.));',
    '  vec3 moon = ((1. - F) * (1. - metal) * alb * .02 + F * Dg * .002) * NoL * vec3(.55, .6, .7);',   // a small, far moon
    // no boost: a surface lit by the screen all round can only send back a share of the screen's own light
    '  vec3 c = (diff + F * env + moon) * vO + vec3(.7, .8, 1.) * uFlash * 1.6 * alb + vE;',
    '  o = vec4(pow(c, vec3(1. / 2.2)), 1.);',
    '}'].join('\n');
  function shader(type, src) {
    var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  var seatVAO = gl.createVertexArray(); gl.bindVertexArray(seatVAO);
  var vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, V, gl.STATIC_DRAW);
  later(function () { occlude(0); });
  var COUNT = TRI.length;
  function attribs() {
    [['aP', 3, 0], ['aN', 3, 3], ['aA', 3, 6], ['aE', 3, 9], ['aR', 1, 12], ['aM', 1, 13], ['aK', 1, 14], ['aG', 1, 15], ['aO', 1, 16]].forEach(function (a) {
      var loc = gl.getAttribLocation(prog, a[0]); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, a[1], gl.FLOAT, false, STRIDE * 4, a[2] * 4);
    });
  }
  attribs();
  var U = {}; ['uView', 'uRot', 'uOrg', 'uTan', 'uKX', 'uLift', 'uSuit', 'uFlash'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });

  // ---- the control grips: the Blender model (js/grip-data.js, from tools/make_grip.py), one per hand on its
  // console's mount, the stick tilting about its gimbal with the flight (the bellows half as far) ----
  var PIVOT_Y = -0.412 + 0.032 / 1.4, PIVOT_Z = 0.405;   // the housing's foot on the mount plate
  var TILT_SIDE = 18, TILT_FORE = 15;                      // full stick, degrees
  function decode(b64, Type) { var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Type(u.buffer); }
  var grips = (window.SITE5_GRIP ? [-1, 1] : []).map(function (sd) {
    var groups = [0, 0.5, 1].map(function (mv) { return { moves: mv, data: [] }; });
    window.SITE5_GRIP.parts.forEach(function (pt) {
      var P = decode(pt.pos, Float32Array), N = decode(pt.nrm, Int8Array), A = decode(pt.ao, Uint8Array);
      var mt = pt.mat === 'accent' ? (sd > 0 ? MAT.yellow : MAT.teal) : MAT[pt.mat], e = mt.e || [0, 0, 0], g = groups[pt.moves === 0 ? 0 : pt.moves < 1 ? 1 : 2].data;
      for (var v = 0; v < pt.count; v++) {
        g.push(sd * P[v * 3], P[v * 3 + 1], P[v * 3 + 2], sd * N[v * 3] / 127, N[v * 3 + 1] / 127, N[v * 3 + 2] / 127,
          mt.a[0], mt.a[1], mt.a[2], e[0], e[1], e[2], mt.r, mt.m, mt.k, 0, A[v] / 255);
      }
    });
    var all = [], ranges = [];
    groups.forEach(function (g) { ranges.push({ moves: g.moves, first: all.length / STRIDE, count: g.data.length / STRIDE }); all = all.concat(g.data); });
    var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(all), gl.STATIC_DRAW);
    attribs();
    var org = [sd * 0.275, PIVOT_Y, PIVOT_Z];
    [[0, 0, 0], [0, 0.05, 0], [0, 0.1, 0.01], [0, 0.14, 0.02], [sd * 0.02, 0.13, 0.02]].forEach(function (q) { points.grip.push(add(org, q)); });
    return { vao: vao, ranges: ranges, org: org };
  });
  gl.bindVertexArray(null);
  var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // the stick's turn: tipped sideways by side degrees (top to the right for +), then fore (top away for +)
  function tilt(side, fore) {
    var R = function (p) { return rotZ(-side)(rotX(fore)(p)); }, x = R([1, 0, 0]), y = R([0, 1, 0]), z = R([0, 0, 1]);
    return x.concat(y, z);
  }
  gl.enable(gl.DEPTH_TEST);   // no culling: the meshes are closed, and the shader lights a face from whichever side shows
  function mat(q) { var x = m.qrot(q, [1, 0, 0]), y = m.qrot(q, [0, 1, 0]), z = m.qrot(q, [0, 0, 1]); return x.concat(y, z); }

  // On a narrow (portrait) screen the view is too tight to ever take in the grips, so the pair is drawn closer
  // together there (KX < 1); LIFT raises everything so the grips' heads just show in the lower corners.
  var LIFT = 0.035;
  S.renderers.push(function (pose, W, H) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    var tx = S.cam.tx, ty = S.cam.ty, KX = m.clamp(tx / 0.95, 0.42, 1), HQi = m.qconj(m.euler(pose.head.yaw, pose.head.pitch, 0));
    gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix3fv(U.uView, false, mat(HQi));
    gl.uniform2f(U.uTan, tx, ty); gl.uniform1f(U.uKX, KX); gl.uniform1f(U.uLift, LIFT);
    gl.uniformMatrix3fv(U.uSuit, false, mat(pose.suitQ)); gl.uniform1f(U.uFlash, pose.flash);
    gl.uniformMatrix3fv(U.uRot, false, I3); gl.uniform3f(U.uOrg, 0, 0, 0);
    gl.bindVertexArray(seatVAO); gl.drawArrays(gl.TRIANGLES, 0, COUNT);
    var st = pose.stick || [0, 0], side = st[0] * TILT_SIDE, fore = -st[1] * TILT_FORE;   // climbing pulls it back
    grips.forEach(function (gp) {
      gl.bindVertexArray(gp.vao); gl.uniform3fv(U.uOrg, gp.org);
      gp.ranges.forEach(function (r) { if (!r.count) return; gl.uniformMatrix3fv(U.uRot, false, r.moves ? tilt(side * r.moves, fore * r.moves) : I3); gl.drawArrays(gl.TRIANGLES, r.first, r.count); });
    });
    gl.bindVertexArray(null);
    S.parts.gripTilt = [side, fore];
    // what shows, per group: how many of its sample points land on the screen (for the tests)
    var drawn = {}, proj = function (p) { var e = m.qrot(HQi, [p[0] * KX, p[1] + LIFT, p[2]]); return e[2] > 0.02 ? [W / 2 + e[0] / e[2] / tx * W / 2, H / 2 - e[1] / e[2] / ty * H / 2] : null; };
    Object.keys(points).forEach(function (g) { drawn[g] = points[g].filter(function (p) { var s = proj(p); return s && s[0] >= 0 && s[0] <= W && s[1] >= 0 && s[1] <= H; }).length; });
    S.parts.seat = drawn;
    S.parts.gripAt = proj([0.275, -0.3, 0.4]);
  });
  S.seatGL = gl;
})();
