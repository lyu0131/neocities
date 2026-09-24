/* gen.js — GENERATION LOSS: seven machines that copy (or watch) badly.
   <canvas data-gen="noise|scan|halftone|wave|copy|cctv|barcode" data-seed="optional" data-cam="cctv only, optional" aria-hidden="true"> */
(function () {
  'use strict';
  var PAPER = '#e6e5df', WHITE = '#ffffff', INK = '#000000', GREY = '#55544f', CONCRETE = '#8c8b85', REC = '#ff1a1a';
  var TONE = [PAPER, GREY, INK, REC, WHITE, CONCRETE].map(function (hex) { // packed RGBA in platform byte order
    var n = parseInt(hex.slice(1), 16);
    return new Uint32Array(new Uint8Array([n >> 16, n >> 8 & 255, n & 255, 255]).buffer)[0];
  });
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function (v) { return (v + 0.5) / 16; });
  var FPS = 20;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mulberry32(a) {
    return function () {
      a = a + 0x6d2b79f5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(s) { for (var h = 2166136261, i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

  // Smooth 2D value noise on a seeded 256x256 lattice (wraps every 256 units, far beyond these scales).
  function valueNoise(rand) {
    var T = new Float32Array(65536);
    for (var i = 0; i < 65536; i++) T[i] = rand();
    return function (x, y) {
      var X = Math.floor(x), Y = Math.floor(y), u = x - X, v = y - Y;
      var a = X & 255, b = (X + 1) & 255, c = (Y & 255) << 8, d = ((Y + 1) & 255) << 8;
      u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
      var top = T[a | c] + (T[b | c] - T[a | c]) * u, bot = T[a | d] + (T[b | d] - T[a | d]) * u;
      return top + (bot - top) * v;
    };
  }

  var PIECES = {
    // NOISE: toner drift. Two value-noise layers slide against each other under per-frame static,
    // Bayer-dithered to paper/grey/ink; a broken rec contour traces one high iso-level, only where a slow mask allows.
    noise: function (rand) {
      var n = valueNoise(rand), s = 0.025 + rand() * 0.02, a = rand() * 6.283, iso = 0.7 + rand() * 0.05;
      var dx = Math.cos(a) * 0.12, dy = Math.sin(a) * 0.12;
      return { cell: 4, frame: function (buf, w, h, t) {
        for (var y = 0, i = 0; y < h; y++) for (var x = 0; x < w; x++, i++) {
          var v = n(x * s + t * dx, y * s + t * dy) * 0.62 + n(x * s * 2.7 - t * dy * 1.7, y * s * 2.7 + t * dx * 1.7 + 50) * 0.38;
          if (Math.abs(v - iso) < 0.004 && n(x * s * 0.15 + 99, y * s * 0.15 - t * 0.01) > 0.76) { buf[i] = TONE[3]; continue; }
          v = (v - 0.47) * 2.4 + (rand() - 0.5) * 0.3;
          buf[i] = TONE[Math.max(0, Math.min(2, v * 2 + BAYER[(x & 3) | (y & 3) << 2] | 0))];
        }
      } };
    },

    // SCAN: dead channel. Bands of barcode bars on scanlines, each band creeping sideways at its own rate;
    // a rolling vsync bar darkens what it passes, tears shear slices of rows, roughly 1 tear in 7 burns rec.
    scan: function (rand) {
      var L = 1024, bands = [], tears = [], end = 0;
      while (end < 1) {
        var bars = new Uint8Array(L), quiet = 0.3 + rand() * 0.6, x = 0;
        while (x < L) { var len = 1 + (rand() * rand() * 28 | 0); bars.fill(rand() < quiet ? 0 : rand() < 0.35 ? 1 : 2, x, x + len); x += len; }
        end += 0.06 + rand() * 0.3;
        bands.push({ end: end, bars: bars, v: (rand() - 0.5) * 24 });
      }
      function tear() { tears.push({ y: rand(), h: 0.005 + rand() * rand() * 0.15, dx: (rand() - 0.5) * 90 | 0, life: 1 + rand() * 12 | 0, hot: rand() < 0.15 }); }
      tear(); tear(); tear();
      return { cell: 3, frame: function (buf, w, h, t) {
        if (rand() < 0.12) tear();
        var roll = t * 0.06 % 1;
        for (var y = 0, i = 0, b = 0; y < h; y++) {
          var fy = y / h, hot = false, dist = Math.abs(fy - roll);
          while (bands[b].end < fy) b++;
          var off = (bands[b].v * t | 0) + (Math.sin(fy * 50 + t * 4) * 1.5 | 0);
          for (var k = 0; k < tears.length; k++) if (fy >= tears[k].y && fy < tears[k].y + tears[k].h) { off += tears[k].dx; hot = hot || tears[k].hot; }
          var o = (off % L + L) % L, gap = y & 1, rolled = Math.min(dist, 1 - dist) < 0.05, drop = rand() < 0.006;
          for (var x = 0; x < w; x++, i++) {
            var tone = gap ? 0 : drop ? (rand() < 0.5 ? 0 : 2) : bands[b].bars[(x + o) % L];
            if (rolled && tone < 2) tone++;
            if (hot && tone === 2) tone = 3;
            buf[i] = TONE[tone];
          }
        }
        tears = tears.filter(function (tr) { return --tr.life > 0; });
      } };
    },

    // HALFTONE: metaball blobs drifting on slow Lissajous paths, printed through misregistered screens
    // (grey plate 15deg, ink plate 45deg); one small blob is a rec spot colour trapped between the plates.
    halftone: function (rand) {
      function blob(r) {
        return { x: 0.15 + rand() * 0.7, y: 0.15 + rand() * 0.7, r: r, ax: 0.1 + rand() * 0.25, ay: 0.1 + rand() * 0.25,
          fx: 0.03 + rand() * 0.08, fy: 0.03 + rand() * 0.08, p: rand() * 6.283 };
      }
      var ink = [], hot = [blob(0.03 + rand() * 0.02)];
      for (var i = 4 + rand() * 3 | 0; i--;) ink.push(blob(0.03 + rand() * 0.08));
      function field(list, w, h, t, ox, oy) {
        var m = Math.min(w, h), pts = list.map(function (b) {
          return [(b.x + b.ax * Math.sin(t * b.fx + b.p)) * w + ox, (b.y + b.ay * Math.sin(t * b.fy + b.p * 1.7)) * h + oy, b.r * m * b.r * m];
        });
        return function (x, y) {
          for (var f = 0, k = 0; k < pts.length; k++) { var dx = x - pts[k][0], dy = y - pts[k][1]; f += pts[k][2] / (dx * dx + dy * dy + 1); }
          return f;
        };
      }
      function screen(ctx, w, h, sp, ang, colour, f, lo, hi) {
        var c = Math.cos(ang), s = Math.sin(ang), R = Math.hypot(w, h) / 2;
        ctx.fillStyle = colour;
        ctx.beginPath();
        for (var u = -R; u < R; u += sp) for (var v = -R; v < R; v += sp) {
          var x = w / 2 + u * c - v * s, y = h / 2 + u * s + v * c;
          if (x < -sp || y < -sp || x > w + sp || y > h + sp) continue;
          var k = (f(x, y) - lo) / (hi - lo);
          if (k > 0.04) { var r = Math.sqrt(Math.min(k, 1)) * sp * 0.64; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); }
        }
        ctx.fill();
      }
      return { draw: function (ctx, w, h, t) {
        var mis = 3 + 2 * Math.sin(t * 0.3);
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, w, h);
        screen(ctx, w, h, 12, 0.26, GREY, field(ink, w, h, t, mis, -mis), 0.2, 0.8);
        screen(ctx, w, h, 7, 1.31, REC, field(hot, w, h, t, 0, 0), 0.5, 1.5);
        screen(ctx, w, h, 9, 0.785, INK, field(ink, w, h, t, 0, 0), 0.4, 1.3);
      } };
    },

    // WAVE: worn cassette on a scope. 2-4 traces (tone vs hiss mix, own tape speed) scroll left under wow/flutter,
    // loud passages clip to flat tops, dropouts collapse to a broken flat line; a rare one-frame click spikes rec.
    wave: function (rand) {
      var n = valueNoise(rand), tr = [];
      for (var j = 2 + rand() * 3 | 0; j--;) {
        tr.push({ f: 0.08 + rand() * 0.3, g: 0.2 + rand() * 0.6, q: rand(), v: 6 + rand() * 18, p: rand() * 99, o: rand() * 999, tone: tr.length % 2 ? 1 : 2 });
      }
      return { cell: 3, frame: function (buf, w, h, t) {
        for (var i = 0; i < w * h; i++) buf[i] = TONE[i % w % 24 === 0 && (i / w | 0) & 1 ? 5 : 0]; // graticule
        tr.forEach(function (c, j) {
          var mid = (j + 0.5) * h / tr.length, half = h / tr.length / 2, prev = mid | 0, hot = rand() < 0.01 ? rand() * w | 0 : -9;
          for (var x = 0; x < w; x += 3) buf[(mid | 0) * w + x] = TONE[5];
          for (x = 0; x < w; x++) {
            var pos = x + t * c.v + Math.sin(t * 0.7 + c.p) * 5 + Math.sin(t * 11 + x * 0.04) * 0.8; // wow + flutter
            var env = n(pos * 0.012 + c.o, j * 9), drop = n(pos * 0.005 + c.o, j * 9 + 50) > 0.7;
            var s = (Math.sin(pos * c.f) + Math.sin(pos * c.f * 2.7 + c.p) * 0.4) * (1 - c.q) + (n(pos * c.g, j * 9 + 3) - 0.5) * 3 * c.q;
            var y = s * env * env * half * (drop ? 0.2 : 3) + (rand() - 0.5) * 0.9;
            y = mid + Math.sin(t * 1.7 + c.p) * 0.8 + Math.max(-half * 0.8, Math.min(half * 0.8, y)) | 0; // clip: flat tops
            if (x === hot) y = mid - half + 1 | 0;
            if (drop && rand() < 0.4) { prev = y; continue; } // dropout: line breaks up
            for (var a = Math.min(prev, y), b = Math.max(prev, y); a <= b; a++) buf[a * w + x] = TONE[x - hot >>> 0 < 2 ? 3 : c.tone];
            prev = y;
          }
        });
      } };
    },

    // COPY: a copier fed its own output. A seeded big glyph plus bars/discs (some knocked out) is recopied every PER frames
    // under a sweeping lamp: each copy skewed, warped along a drifting field, contrast-boosted, blotched and re-dithered,
    // with wear growing until it rots into texture; then the lamp burns rec once as it lays down a fresh original.
    copy: function (rand) {
      var PER = 8, LIFE = 36, n = valueNoise(rand), W = 0, H = 0, cur, nxt, tmp, gen = 0, k = 0, streak = 0;
      function original(out) {
        var c = document.createElement('canvas'), g = c.getContext('2d'), m = Math.min(W, H);
        c.width = W; c.height = H; gen = 0; streak = rand() * W | 0;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold ' + (m | 0) + 'px "Times New Roman", serif';
        g.fillText('&?@%#R8K'[rand() * 8 | 0], W * (0.25 + rand() * 0.5), H * 0.55);
        for (var i = 3 + rand() * 4 | 0; i--;) {
          var x = W * (0.1 + rand() * 0.8), y = H * (0.1 + rand() * 0.8), s = m * (0.15 + rand() * 0.4), r = rand();
          g.globalCompositeOperation = rand() < 0.4 ? 'destination-out' : 'source-over';
          if (r < 0.5) g.fillRect(x - s * 1.2, y - s / 8, s * 2.4, s / 4);
          else { g.beginPath(); g.arc(x, y, s / 2, 0, 6.2832); g.fill(); }
        }
        var d = g.getImageData(0, 0, W, H).data;
        for (i = 0; i < W * H; i++) out[i] = d[i * 4 + 3] > 127 ? 2 : 0;
      }
      function at(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? 0 : cur[y * W + x] / 2; }
      function photocopy() { // cur -> nxt, one generation; wear e ramps 0..1 so early copies stay clean
        var a = (rand() - 0.5) * 0.03, z = 1 + (rand() - 0.4) * 0.02, ca = Math.cos(a) / z, sa = Math.sin(a) / z, e = gen / LIFE;
        var ox = W / 2 + (rand() - 0.5) * 1.5, oy = H / 2 + (rand() - 0.5) * 1.5;
        for (var y = 0, i = 0; y < H; y++) for (var x = 0; x < W; x++, i++) {
          var sx = ox + (x - W / 2) * ca - (y - H / 2) * sa + (n(x * 0.05, y * 0.05 + gen * 0.04) - 0.5) * (0.8 + e * 2.5);
          var sy = oy + (x - W / 2) * sa + (y - H / 2) * ca + (n(x * 0.05 + 70, y * 0.05 + gen * 0.04) - 0.5) * (0.8 + e * 2.5);
          var X = Math.floor(sx), Y = Math.floor(sy), u = sx - X, v = sy - Y;
          var top = at(X, Y) + (at(X + 1, Y) - at(X, Y)) * u, bot = at(X, Y + 1) + (at(X + 1, Y + 1) - at(X, Y + 1)) * u;
          var d = (top + (bot - top) * v - 0.5) * 1.15 + 0.5 + (n(x * 0.1 + 140, y * 0.1 + gen * 0.3) - 0.5) * (0.1 + e * 0.8)
            + (rand() - 0.5) * 0.2 + (x === streak) * 0.15;
          nxt[i] = Math.max(0, Math.min(2, d * 2 + BAYER[(x & 3) | (y & 3) << 2] | 0));
        }
      }
      return { cell: 4, frame: function (buf, w, h) {
        if (w !== W || h !== H) { // (re)start at this size; a still frame is taken mid-rot
          W = w; H = h; cur = new Uint8Array(w * h); nxt = new Uint8Array(w * h); original(cur); k = 0;
          for (var s = still ? LIFE / 2 : 0; s--; gen++) { photocopy(); tmp = cur; cur = nxt; nxt = tmp; }
          nxt.set(cur);
        }
        var ph = k++ % PER, bar = ph * (H + 2) / PER | 0;
        if (!ph) { tmp = cur; cur = nxt; nxt = tmp; if (++gen > LIFE) original(nxt); else photocopy(); }
        for (var y = 0, i = 0; y < H; y++) {
          var src = y < bar ? nxt : cur, lamp = y >= bar - 2 && y < bar;
          for (var x = 0; x < W; x++, i++) buf[i] = TONE[lamp ? (gen ? 1 : 3) : src[i]];
        }
      } };
    },

    // CCTV: corridor camera. A baked one-point-perspective corridor (floor tiles, door frames, ceiling lights, grime,
    // vignette); 1-2 figure blobs walk through; flicker, static, scanlines and a rolling hum bar, dithered over five greys.
    // Now and then the feed freezes on a torn frame. Burned-in VT323 CAM / clock / REC drawn crisp at full resolution.
    cctv: function (rand, data) {
      var n = valueNoise(rand), W = 0, H = 0, S, L, vx, vy, bw, bh, frz = 0, held = '', figs = [];
      var RAMP = [2, 1, 5, 0, 4].map(function (k) { return TONE[k]; }); // ink, grey, concrete, paper, white
      var cam = String(((data.cam || '').match(/\d+/) || [1 + rand() * 8 | 0])[0]);
      var gx = 0.3 + rand() * 0.4, gy = 0.3 + rand() * 0.12, gh = 0.08 + rand() * 0.05, gw = 1 + rand(), tile = 1.5 + rand() * 2, door = rand();
      for (var j = 1 + (rand() < 0.5); j--;) { // the last one starts mid-frame so a still always has somebody in it
        figs.push({ sp: 0.03 + rand() * 0.03, o: j ? rand() : 0.45 + rand() * 0.3, a0: 1.5 + rand() * 3, a1: 1.5 + rand() * 3, x0: (rand() - 0.5) * 2.6, x1: (rand() - 0.5) * 1.4 });
      }
      function clock() { return new Date().toLocaleString('sv-SE'); } // "2026-09-23 03:13:07", local time
      function build(w, h) {
        W = w; H = h; S = new Float32Array(w * h); L = new Float32Array(w * h); frz = 0;
        vx = w * gx; vy = h * gy; bh = h * gh; bw = bh * gw;
        for (var y = 0, i = 0; y < h; y++) for (var x = 0; x < w; x++, i++) {
          var dx = (x - vx) / bw, dy = (y - vy) / bh, ax = Math.abs(dx), ay = Math.abs(dy), z, v;
          if (ax < 1 && ay < 1) v = 0.25; // far end
          else if (ay > ax) { // floor tiles / ceiling lights; depth z = 8 / distance from the vanishing point
            z = 8 / ay;
            v = dy > 0 ? 0.72 - z * 0.05 - (z * tile % 1 < 0.08 || ax / ay % 0.5 < 0.04 ? 0.2 : 0) : z * tile % 1 < 0.25 && ax / ay < 0.3 ? 1.1 : 0.15;
          } else { z = 8 / ax; v = 0.5 - z * 0.04 - ((z * 0.7 + door) % 1 < 0.1 || Math.abs(dy / ax - 0.3) < 0.04 ? 0.25 : 0); } // walls: door frames, rail
          var r = (x / w - 0.5) * (x / w - 0.5) + (y / h - 0.5) * (y / h - 0.5);
          S[i] = v + (n(x * 0.07, y * 0.07) - 0.5) * 0.3 - r * 0.9;
        }
      }
      return { cell: 3, frame: function (buf, w, h, t) {
        if (w !== W || h !== H) build(w, h);
        if (frz > 0) { frz--; return; } // frozen: the buffer still holds the torn frame
        L.set(S);
        figs.forEach(function (f) { // legs, torso, neck, head: a crude silhouette scaled by depth
          var u = (t * f.sp + f.o) % 1.3 - 0.15;
          if (u < 0 || u > 1) return;
          var a = f.a0 + (f.a1 - f.a0) * u, fh = 1.4 * a * bh, fy = vy + a * bh, fx = vx + (f.x0 + (f.x1 - f.x0) * u) * a * bw + Math.sin(t * 7) * fh * 0.02;
          for (var y = Math.max(0, fy - fh | 0); y < Math.min(H, fy); y++) {
            var k = (fy - y) / fh, gap = k < 0.45 ? (0.45 - k) * fh * 0.2 * Math.abs(Math.sin(t * 4 + f.o * 9)) + 0.5 : -1; // stride
            var r = k < 0.45 ? fh * 0.06 + gap : fh * (k < 0.8 ? 0.12 : k < 0.84 ? 0.035 : 0.065);
            for (var x = Math.max(0, fx - r | 0); x < Math.min(W, fx + r); x++) if (Math.abs(x - fx) > gap) L[y * W + x] = 0.1;
          }
        });
        var g = 0.94 + rand() * 0.08, hum = t * 0.09 % 1 * h * 1.3 - h * 0.15;
        for (var y = 0, i = 0; y < h; y++) {
          var bar = Math.abs(y - hum) < h * 0.07, jit = bar ? (rand() * 3 | 0) - 1 : 0, lift = (bar ? 0.15 : 0) - (y & 1) * 0.04;
          for (var x = 0; x < w; x++, i++) {
            var v = L[y * w + Math.max(0, Math.min(w - 1, x + jit))] * g + lift + (rand() - 0.5) * 0.16;
            buf[i] = RAMP[Math.max(0, Math.min(4, v * 4 + BAYER[(x & 3) | (y & 3) << 2] | 0))];
          }
        }
        if (rand() < 0.012) { // freeze on a frame with a band of rows sheared sideways
          frz = 4 + rand() * 12 | 0; held = clock();
          for (var r = rand() * h | 0, e = Math.min(h, r + 2 + rand() * h * 0.25), s = (rand() - 0.5) * w * 0.4 | 0; r < e; r++) {
            buf.subarray(r * w, r * w + w).copyWithin(Math.max(0, s), Math.max(0, -s));
          }
          buf.fill(RAMP[4], r * w, r * w + w); // bright head-switch line under the torn band
        }
      }, draw: function (ctx, w, h, t) {
        var fs = Math.round(Math.max(14, Math.min(28, w / 24, h / 9))), m = fs * 0.5;
        function burn(s, x, y, al) { ctx.textAlign = al; ctx.strokeText(s, x, y); ctx.fillStyle = WHITE; ctx.fillText(s, x, y); }
        ctx.font = fs + 'px VT323, monospace'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = fs / 6; ctx.strokeStyle = INK;
        burn('CAM ' + (cam.length < 2 ? '0' : '') + cam, m, m + fs / 2, 'left');
        burn(frz > 0 ? held : clock(), w - m, m + fs / 2, 'right');
        if (still || t % 1 < 0.6) { // blinks only while animating
          burn('REC', m + fs * 0.8, h - m - fs / 2, 'left');
          ctx.fillStyle = REC; ctx.beginPath(); ctx.arc(m + fs * 0.3, h - m - fs / 2, fs * 0.25, 0, 6.2832); ctx.fill();
        }
      } };
    },

    // BARCODE: a label that won't hold still. Twelve slots of random bar/space runs under their digits; slots keep
    // re-encoding (digit rolls), one glitches per frame (jumps, shifts or inverts), and every few seconds a rec laser
    // sweeps across, re-encoding each slot it crosses. Digits drawn crisp in VT323 under the bars.
    barcode: function (rand) {
      var N = 12, W = 0, H = 0, code, slot, at = [], dig = [], roll = [], per = 3 + rand() * 3, hit = -1;
      function encode(k) {
        for (var x = at[k], on = 0; x < at[k + 1]; on ^= 1) { var e = Math.min(at[k + 1], x + 1 + rand() * 4 | 0); code.fill(on, x, e); x = e; }
        dig[k] = rand() * 10 | 0; roll[k] = W ? 6 : 0;
      }
      return { cell: 2, frame: function (buf, w, h, t) {
        if (w !== W || h !== H) {
          code = new Uint8Array(w); slot = new Int8Array(w).fill(-1); W = 0;
          for (var k = 0; k <= N; k++) at[k] = Math.round(w * (0.05 + 0.9 * k / N));
          for (k = 0; k < N; k++) { slot.fill(k, at[k], at[k + 1]); encode(k); }
          W = w; H = h;
        }
        var ph = (t + 0.75) % per / 1.5, lx = ph < 1 ? ph * w | 0 : -1; // 1.5 s sweep; a still frame catches it mid-strip
        if (lx >= 0 && slot[lx] >= 0 && slot[lx] !== hit) encode(hit = slot[lx]);
        if (rand() < 0.1) encode(rand() * N | 0);
        var gk = rand() < 0.4 ? rand() * N | 0 : -2, mode = rand() * 3 | 0, amt = (rand() - 0.5) * 12 | 0 || 3;
        var y0 = h * 0.1 | 0, y1 = h * 0.72 | 0;
        for (var y = 0, i = 0; y < h; y++) for (var x = 0; x < w; x++, i++) {
          var gl = slot[x] === gk, yy = gl && !mode ? y - amt : y, xx = gl && mode === 1 ? Math.max(0, Math.min(w - 1, x + amt)) : x;
          var on = yy >= y0 && yy < y1 && code[xx];
          if (gl && mode === 2 && y >= y0 && y < y1) on = !on;
          buf[i] = TONE[x === lx ? 3 : on ? 2 : 4];
        }
      }, draw: function (ctx, w, h) {
        ctx.font = Math.round(Math.max(12, Math.min(20, h * 0.13))) + 'px VT323, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
        for (var k = 0; k < N; k++) ctx.fillText(roll[k]-- > 0 ? rand() * 10 | 0 : dig[k], (at[k] + at[k + 1]) / 2 * w / W, h * 0.86);
      } };
    }
  };

  var pieces = [], raf = 0, last = 0;

  function start(canvas) {
    var make = PIECES[canvas.dataset.gen];
    if (!make) return;
    var s = canvas.dataset.seed, rand = mulberry32(s ? hash(s) : Math.random() * 4294967296 >>> 0);
    var piece = make(rand, canvas.dataset), ctx = canvas.getContext('2d'), off = document.createElement('canvas'), octx = off.getContext('2d');
    var img, buf, cw = 0, ch = 0, dpr = 1;
    var p = { t: 0, visible: false, draw: function () {
      if (!cw || !ch) return;
      if (piece.cell) { // low-res buffer, scaled up with hard pixel edges
        piece.frame(buf, off.width, off.height, p.t);
        octx.putImageData(img, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      }
      if (piece.draw) { // vector layer at full resolution (on top of the pixels, if any): stays crisp
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        piece.draw(ctx, cw, ch, p.t);
      }
    } };
    // pixel + text pieces redraw once VT323 arrives, so a reduced-motion still frame doesn't keep the fallback font
    if (piece.cell && piece.draw && document.fonts) document.fonts.load('16px VT323').then(p.draw, function () {});
    function fit() {
      dpr = window.devicePixelRatio || 1; cw = canvas.clientWidth; ch = canvas.clientHeight;
      if (!cw || !ch) return;
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      if (piece.cell) {
        off.width = Math.ceil(cw / piece.cell); off.height = Math.ceil(ch / piece.cell);
        img = octx.createImageData(off.width, off.height);
        buf = new Uint32Array(img.data.buffer);
      }
      p.draw();
    }
    new ResizeObserver(fit).observe(canvas); // fires once on observe: initial size + first frame
    new IntersectionObserver(function (es) { p.visible = es[es.length - 1].isIntersecting; kick(); }).observe(canvas);
    pieces.push(p);
  }

  function loop(now) {
    raf = 0;
    if (document.hidden) return;
    var live = pieces.filter(function (p) { return p.visible; });
    if (!live.length) return;
    if (now - last > 1000 / FPS - 4) {
      last = now;
      live.forEach(function (p) { p.t += 1 / FPS; p.draw(); });
    }
    raf = requestAnimationFrame(loop);
  }
  function kick() { if (!still && !raf) raf = requestAnimationFrame(loop); }

  function init() {
    [].forEach.call(document.querySelectorAll('canvas[data-gen]'), start);
    document.addEventListener('visibilitychange', kick);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
