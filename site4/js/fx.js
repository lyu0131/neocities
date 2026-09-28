/* fx.js: the canvas#fx bitmap only - rain, a beam flash, scanline flicker, fire cue. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var canvas = document.getElementById('fx');
  if (!BUNNYS || !canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var half = document.body.classList.contains('page') ? 0.5 : 1; // half intensity on sub-pages
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var w = 0, h = 0;

  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Setting canvas.width clears the bitmap. Under reduced motion begin() draws the only
    // frame there will ever be, so without this repaint one resize left the layer blank for
    // good. Both callers route through here, so this is the one place it can be fixed.
    if (started) draw(performance.now());
  }
  resize();
  // resize fires on every mobile URL-bar scroll; 150ms matches cockpit.js's own debounce
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  // Rain and snow out in the world. What lands on the canopy in front of you is glass.js's
  // job -- the five slow ellipses that used to stand in for it here are gone, replaced
  // properly. Everything here is sized by the rolled condition.
  var WX = BUNNYS.wx || {};
  var KIND = WX.kind !== undefined ? WX.kind : 'rain';
  function shear() { return WX.shear ? WX.shear() : 34; }
  function newStreak() { return { x: Math.random() * w, y: Math.random() * h, len: 10 + Math.random() * 18, speed: 360 + Math.random() * 360 }; }
  // three parallax bands: the near flakes are big, fast and pale, the far ones small and faint
  function newFlake() {
    var band = Math.random();
    return { x: Math.random() * w, y: Math.random() * h, band: band,
             r: 0.7 + band * 2.4, speed: 18 + band * 62,
             sway: 8 + band * 26, phase: Math.random() * 6.28 };
  }
  var N_WORLD = Math.round((WX.world != null ? WX.world : 70) * half);
  var streaks = [], flakes = [], i;
  if (KIND === 'rain') for (i = 0; i < N_WORLD; i++) streaks.push(newStreak());
  if (KIND === 'snow') for (i = 0; i < N_WORLD; i++) flakes.push(newFlake());

  // distant beam flash every 6-12s at a random yaw, drawn only when that yaw is on screen
  var lastYaw = 0;
  BUNNYS.on('view', function (detail) { lastYaw = detail.yaw || 0; });
  var beam = null;
  function scheduleBeam() {
    setTimeout(function () { beam = { yaw: Math.random() * 360, t0: performance.now() }; scheduleBeam(); }, 6000 + Math.random() * 6000);
  }

  // fire cue: a quick flash
  var fireT = -1;
  BUNNYS.on('fire', function () { fireT = performance.now(); });

  // Lightning: a sky flash, not a drawn bolt -- branching geometry reads as a cartoon at this
  // scale. Each strike also lights every drop on the glass at once, via one CSS rule on
  // #glass, which is the half that sells it. Never under reduced motion: a full-screen flash
  // is a safety matter there, not a preference.
  var glassEl = document.getElementById('glass');
  var strike = null;
  function scheduleStrike() {
    setTimeout(function () {
      var n = 1 + Math.floor(Math.random() * 3);
      strike = { t0: performance.now(), n: n, gap: 40 + Math.random() * 50, a: 0.10 + Math.random() * 0.25 };
      scheduleStrike();
    }, 8000 + Math.random() * 12000);
  }
  function lightning(now) {
    if (!strike) return;
    var age = now - strike.t0, span = strike.n * strike.gap + 120;
    if (age > span) { strike = null; if (glassEl) glassEl.classList.remove('flash'); return; }
    var sub = Math.floor(age / strike.gap);
    var on = sub < strike.n && (age % strike.gap) < strike.gap * 0.6;
    if (glassEl) glassEl.classList.toggle('flash', on);
    if (!on) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(190,215,255,' + (strike.a * half).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  var lastT = 0;
  function draw(now) {
    ctx.clearRect(0, 0, w, h);

    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    var sh = shear();

    if (streaks.length) {
      ctx.strokeStyle = 'rgba(200,220,230,' + (0.25 * half) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // the streak leans by the same wind the ENVIRONMENT panel prints, so turning the
      // cockpit turns you into the weather and the rain slants the other way
      for (var i = 0; i < streaks.length; i++) {
        var s = streaks[i];
        s.y += s.speed * dt; s.x += sh * dt;
        if (s.y > h) { s.y = -s.len; s.x = Math.random() * w; }
        else if (s.x < -40) s.x = w + 20; else if (s.x > w + 40) s.x = -20;
        var lean = sh / s.speed * s.len;
        ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - lean, s.y - s.len);
      }
      ctx.stroke();
    }

    for (var fi = 0; fi < flakes.length; fi++) {
      var fl = flakes[fi];
      fl.y += fl.speed * dt;
      fl.x += (sh * (0.25 + fl.band * 0.75) + Math.sin(now * 0.001 + fl.phase) * fl.sway) * dt;
      if (fl.y > h + 4) { fl.y = -4; fl.x = Math.random() * w; }
      if (fl.x < -20) fl.x = w + 10; else if (fl.x > w + 20) fl.x = -10;
      ctx.fillStyle = 'rgba(232,242,250,' + ((0.18 + fl.band * 0.5) * half).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r, 0, 6.2832); ctx.fill();
    }

    if (beam) {
      var age = now - beam.t0;
      if (age < 500) {
        var diff = ((beam.yaw - lastYaw + 540) % 360) - 180;
        var fov = w > h ? 50 : 35;
        if (Math.abs(diff) < fov) {
          var bx = w / 2 + (diff / fov) * (w / 2);
          var a = (1 - age / 500) * 0.5 * half;
          var g = ctx.createLinearGradient(bx - 40, 0, bx + 40, 0);
          g.addColorStop(0, 'rgba(140,255,193,0)'); g.addColorStop(0.5, 'rgba(140,255,193,' + a + ')'); g.addColorStop(1, 'rgba(140,255,193,0)');
          ctx.fillStyle = g; ctx.fillRect(bx - 40, 0, 80, h);
        }
      } else beam = null;
    }

    var sl = 0.02 + Math.random() * 0.02; // faint scanline flicker
    ctx.fillStyle = 'rgba(140,255,193,' + (sl * half) + ')';
    ctx.fillRect(0, Math.floor(Math.random() * h), w, 1);

    lightning(now);

    if (fireT >= 0) {
      var fAge = now - fireT;
      if (fAge < 280) { ctx.fillStyle = 'rgba(255,255,255,' + ((1 - fAge / 280) * 0.5) + ')'; ctx.fillRect(0, 0, w, h); }
      else fireT = -1;
    }
  }

  var raf = null, started = false;
  function loop(now) { raf = requestAnimationFrame(loop); if (!document.hidden) draw(now); }
  function begin() {
    if (started) return;
    started = true;
    if (BUNNYS.reduce) { draw(performance.now()); return; } // one static frame, then stop
    scheduleBeam();
    if (WX.lightning) scheduleStrike();
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', function () {
    if (!started || BUNNYS.reduce) return;
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; }
    else if (!raf) raf = requestAnimationFrame(loop);
  });

  if (BUNNYS.state.booted || !document.getElementById('boot')) begin(); // sub-pages have no boot
  BUNNYS.on('boot-done', begin);
})();
