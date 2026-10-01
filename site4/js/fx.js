/* fx.js: the canvas#fx bitmap only - rain, a beam flash, scanline flicker. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var canvas = document.getElementById('fx');
  if (!BUNNYS || !canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

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

  // rain streaks + a few slow drops sliding on the canopy
  function newStreak() { return { x: Math.random() * w, y: Math.random() * h, len: 10 + Math.random() * 18, speed: 6 + Math.random() * 6 }; }
  function newDrop() { return { x: Math.random() * w, y: Math.random() * h, r: 2 + Math.random() * 3, speed: 0.6 + Math.random() * 0.6, drift: (Math.random() - 0.5) * 0.3 }; }
  var streaks = []; for (var i = 0; i < 70; i++) streaks.push(newStreak());
  var drops = []; for (var d = 0; d < 5; d++) drops.push(newDrop());

  // distant beam flash every 6-12s at a random yaw, drawn only when that yaw is on screen
  var lastYaw = 0;
  BUNNYS.on('view', function (detail) { lastYaw = detail.yaw || 0; });
  var beam = null;
  function scheduleBeam() {
    setTimeout(function () { beam = { yaw: Math.random() * 360, t0: performance.now() }; scheduleBeam(); }, 6000 + Math.random() * 6000);
  }

  function draw(now) {
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(200,220,230,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < streaks.length; i++) {
      var s = streaks[i];
      s.y += s.speed; s.x += 0.6;
      if (s.y > h) { s.y = -s.len; s.x = Math.random() * w; }
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 2, s.y - s.len);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(220,231,238,0.3)';
    for (var d = 0; d < drops.length; d++) {
      var dr = drops[d];
      dr.y += dr.speed; dr.x += dr.drift;
      if (dr.y > h) { dr.y = -dr.r; dr.x = Math.random() * w; }
      ctx.beginPath(); ctx.ellipse(dr.x, dr.y, dr.r, dr.r * 1.6, 0, 0, Math.PI * 2); ctx.fill();
    }

    if (beam) {
      var age = now - beam.t0;
      if (age < 500) {
        var diff = ((beam.yaw - lastYaw + 540) % 360) - 180;
        var fov = w > h ? 50 : 35;
        if (Math.abs(diff) < fov) {
          var bx = w / 2 + (diff / fov) * (w / 2);
          var a = (1 - age / 500) * 0.5;
          var g = ctx.createLinearGradient(bx - 40, 0, bx + 40, 0);
          g.addColorStop(0, 'rgba(140,255,193,0)'); g.addColorStop(0.5, 'rgba(140,255,193,' + a + ')'); g.addColorStop(1, 'rgba(140,255,193,0)');
          ctx.fillStyle = g; ctx.fillRect(bx - 40, 0, 80, h);
        }
      } else beam = null;
    }

    var sl = 0.02 + Math.random() * 0.02; // faint scanline flicker
    ctx.fillStyle = 'rgba(140,255,193,' + sl + ')';
    ctx.fillRect(0, Math.floor(Math.random() * h), w, 1);
  }

  var raf = null, started = false;
  function loop(now) { raf = requestAnimationFrame(loop); if (!document.hidden) draw(now); }
  function begin() {
    if (started) return;
    started = true;
    if (BUNNYS.reduce) { draw(performance.now()); return; } // one static frame, then stop
    scheduleBeam();
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
