/* world.js: the panoramic monitor's picture, one full-screen WebGL2 fragment shader.
   Per pixel: a ray from the pilot's eye (off the ball's centre, swaying with the seat) meets the ball;
   that point p shows the outside world in its own direction from the centre (the ball is a display,
   not a window), turned by the suit's attitude. So the picture bends as a real spherical screen would,
   and the bend changes as the seat moves. Then the ball's own panel seams: a geodesic of hexagons and
   pentagons (the spherical Voronoi of a Fibonacci point set), drawn in ball coordinates.
   No textures, no pre-curved art. Renders below device resolution and steps down further if slow. */
(function () {
  'use strict';
  var S = window.SITE5, m = S.m;
  var canvas = document.getElementById('world');
  var gl = canvas && canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) { document.documentElement.classList.add('nogl'); return; }

  var VS = '#version 300 es\nin vec2 a; void main() { gl_Position = vec4(a, 0., 1.); }';
  var FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 uRes, uTan, uPos; uniform vec3 uEye, uOpp, uTint; uniform mat3 uEyeM, uSuitM;',
    'uniform float uTime, uFlash, uSeam; uniform vec3 uBA[2], uBB[2]; uniform float uBI[2];',
    'uniform vec3 uCells[64];',
    'out vec4 o;',
    'const vec3 MOON = normalize(vec3(-.45, .30, .84));',
    'float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float h31(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);',
    '  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }',
    'float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(17.1, 9.2); a *= .5; } return s; }',
    'vec3 sky(vec3 w) {',
    '  vec3 zen = vec3(.020, .036, .068), hor = vec3(.105, .175, .228);',
    '  if (w.y > 0.) {',
    '    vec3 c = mix(hor, zen, pow(clamp(w.y, 0., 1.), .5));',
    '    vec3 q = w * 170.; float h = h31(floor(q));',            // sparse stars
    '    if (h > .9968) c += vec3(.75, .82, 1.) * smoothstep(.16, 0., length(fract(q) - .5)) * (h - .9968) * 300. * smoothstep(0., .2, w.y);',
    '    float md = dot(w, MOON);',
    '    c += vec3(.86, .9, 1.) * smoothstep(.99965, .99978, md) + vec3(.20, .27, .36) * pow(max(md, 0.), 300.) + vec3(.05, .075, .10) * pow(max(md, 0.), 14.);',
    '    vec2 hp = w.xz / (w.y + .1) * .3;',                         // thin high cloud near the horizon
    '    c = mix(c, vec3(.16, .22, .29), smoothstep(.56, .86, fbm(hp * vec2(1., 3.) + uPos * .2)) * .4 * smoothstep(.5, .04, w.y));',
    '    return c;',
    '  }',
    '  float dn = max(-w.y, .015); vec2 P = w.xz / dn, M = normalize(MOON.xz);',   // the cloud sea, a plane below
    // puffy tops: big masses carved by finer detail; the moon side of each puff lit (a one-tap slope),
    // the detail fading out with distance so the far field doesn't shimmer
    '  float d = length(P), far = smoothstep(4., 18., d);',
    '  vec2 Q = P * 1.3 + uPos * 2.6;',
    '  float n = fbm(Q * .45) * .62 + fbm(Q * 1.7) * .38 * (1. - far);',
    '  float cov = mix(smoothstep(.43, .60, n), .5, smoothstep(8., 30., d));',
    '  float slope = clamp((n - fbm((Q + M * .06) * .45) * .62 - fbm((Q + M * .06) * 1.7) * .38 * (1. - far)) * 9., -1., 1.);',
    '  float lit = .8 + .5 * pow(max(dot(normalize(P), M), 0.), 3.);',
    '  vec3 c = mix(vec3(.035, .065, .10), vec3(.24, .32, .40) * (.8 + .55 * slope * (1. - far)) * lit, cov);',
    '  return mix(c, hor * 1.06, 1. - exp(-d * .05));',
    '}',
    'void main() {',
    '  vec2 ndc = gl_FragCoord.xy / uRes * 2. - 1.;',
    '  vec3 d = normalize(uEyeM * normalize(vec3(ndc * uTan, 1.)));',
    '  float b = dot(uEye, d), t = -b + sqrt(b * b - dot(uEye, uEye) + 1.);',
    '  vec3 p = uEye + t * d;',                          // on the ball
    '  vec3 w = uSuitM * p;',                            // the world direction that point shows
    '  vec3 col = sky(w);',
    // the opponent: a dark speck with an orange thruster glint
    '  float r = acos(clamp(dot(w, uOpp), -1., 1.));',
    '  col = mix(col, vec3(.02, .03, .05), smoothstep(.0065, .0035, r));',
    '  col += vec3(1., .55, .22) * exp(-r * r / 3.e-6) * (.7 + .3 * sin(uTime * 37.));',
    // beams: a great-circle arc from A to B, widening toward B (it passes close)
    '  for (int i = 0; i < 2; i++) {',
    '    if (uBI[i] <= 0.) continue;',
    '    vec3 A = uBA[i], B = uBB[i], n = normalize(cross(A, B));',
    '    float tot = acos(clamp(dot(A, B), -1., 1.)), along = atan(dot(cross(A, w), n), dot(A, w)) / tot;',
    '    if (along < 0. || along > 1.) continue;',
    '    float dist = abs(dot(w, n)), wd = mix(.0015, .045, pow(along, 1.6));',
    '    float core = exp(-pow(dist / (wd * .35), 2.)), halo = exp(-pow(dist / wd, 2.));',
    '    col += (vec3(1., .86, .97) * core + vec3(.45, .40, 1.) * halo * .8 + vec3(1., .45, .85) * halo * .35) * uBI[i];',
    '  }',
    // the ball's panels: the nearest two cell centres; their difference is zero on a seam
    '  float d1 = -2., d2 = -2.; int id = 0;',
    '  for (int i = 0; i < 64; i++) { float dd = dot(p, uCells[i]); if (dd > d1) { d2 = d1; d1 = dd; id = i; } else if (dd > d2) d2 = dd; }',
    '  float e = d1 - d2, px = fwidth(e) + 1e-5;',
    '  float seam = 1. - smoothstep(px * .7, px * 1.9, e), lip = (1. - smoothstep(px * 1.9, px * 4., e)) * (1. - seam);',
    '  col *= 1. + (h21(vec2(float(id), 3.)) - .5) * .05 * uSeam;',
    '  col = mix(col, col * .3 + vec3(.008, .012, .02), seam * uSeam);',
    '  col += vec3(.05, .065, .085) * lip * uSeam * .7;',
    '  col = col * uTint + vec3(.9, .95, 1.) * uFlash;',
    '  col += (h21(gl_FragCoord.xy) - .5) / 255.;',      // dither against banding
    '  o = vec4(col, 1.);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); return null; }
    return sh;
  }
  var vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  var prog = gl.createProgram();
  if (!vs || !fs) { document.documentElement.classList.add('nogl'); return; }
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); document.documentElement.classList.add('nogl'); return; }
  gl.useProgram(prog);
  var U = {};
  ['uRes', 'uTan', 'uPos', 'uEye', 'uOpp', 'uTint', 'uEyeM', 'uSuitM', 'uTime', 'uFlash', 'uSeam', 'uBA', 'uBB', 'uBI', 'uCells']
    .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // 64 panel centres on a Fibonacci sphere: a geodesic of mostly hexagons, a few pentagons
  var cells = [];
  for (var i = 0; i < 64; i++) {
    var y = 1 - (i + 0.5) / 64 * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963 + 0.4;
    cells.push(Math.cos(th) * rr, y, Math.sin(th) * rr);
  }
  gl.uniform3fv(U.uCells, cells);
  var LOOKS = { mix: { seam: 0.6, tint: [0.95, 0.99, 1.06] }, xi: { seam: 0.95, tint: [0.92, 1.0, 1.03] }, penelope: { seam: 0.45, tint: [0.96, 0.92, 1.16] } };
  var L = LOOKS[S.look];
  gl.uniform1f(U.uSeam, L.seam); gl.uniform3fv(U.uTint, L.tint);

  // render scale: under device resolution (the picture is soft; the HUD carries the crisp lines),
  // stepping down if frames run long
  var scale = Math.min(window.devicePixelRatio || 1, 1.5) * (innerWidth < 700 ? 0.7 : 0.75), checkAt = 0;
  function mat(q) { var x = m.qrot(q, [1, 0, 0]), y = m.qrot(q, [0, 1, 0]), z = m.qrot(q, [0, 0, 1]); return x.concat(y, z); }

  S.renderers.push(function (pose, W, H) {
    if (pose.t > checkAt) { checkAt = pose.t + 2; if (S.frameMs > 21 && scale > 0.45) scale -= 0.1; }
    var cw = Math.max(1, Math.round(W * scale)), ch = Math.max(1, Math.round(H * scale));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.uniform2f(U.uRes, cw, ch);
    gl.uniform2f(U.uTan, S.cam.tx, S.cam.ty);
    gl.uniform2f(U.uPos, pose.pos[0], pose.pos[1]);
    gl.uniform3fv(U.uEye, pose.eye);
    gl.uniform3fv(U.uOpp, pose.opp);
    gl.uniformMatrix3fv(U.uEyeM, false, mat(pose.eyeQ));
    gl.uniformMatrix3fv(U.uSuitM, false, mat(pose.suitQ));
    gl.uniform1f(U.uTime, pose.t);
    gl.uniform1f(U.uFlash, pose.flash);
    var ba = [], bb = [], bi = [];
    for (var k = 0; k < 2; k++) {
      var b = pose.beams[k];
      ba.push.apply(ba, b ? b.a : [0, 0, 1]); bb.push.apply(bb, b ? b.b : [0, 1, 0]); bi.push(b ? b.i : 0);
    }
    gl.uniform3fv(U.uBA, ba); gl.uniform3fv(U.uBB, bb); gl.uniform1fv(U.uBI, bi);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });
  S.gl = gl;
})();
