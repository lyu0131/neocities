/* fx.js: the canvas#fx bitmap only - rain, a beam flash, scanline flicker, fire cue. */
(function () {
  'use strict';
  var ARGUS = window.ARGUS;
  var canvas = document.getElementById('fx');
  if (!ARGUS || !canvas) return;
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
  }
  resize();
  window.addEventListener('resize', resize);

  // rain streaks + a few slow drops sliding on the canopy
  function newStreak() { return { x: Math.random() * w, y: Math.random() * h, len: 10 + Math.random() * 18, speed: 6 + Math.random() * 6 }; }
  function newDrop() { return { x: Math.random() * w, y: Math.random() * h, r: 2 + Math.random() * 3, speed: 0.6 + Math.random() * 0.6, drift: (Math.random() - 0.5) * 0.3 }; }
  var streaks = []; for (var i = 0; i < Math.round(70 * half); i++) streaks.push(newStreak());
  var drops = []; for (var d = 0; d < Math.round(5 * half); d++) drops.push(newDrop());

  // distant beam flash every 6-12s at a random yaw, drawn only when that yaw is on screen
  var lastYaw = 0;
  ARGUS.on('view', function (detail) { lastYaw = detail.yaw || 0; });
  var beam = null;
  function scheduleBeam() {
    setTimeout(function () { beam = { yaw: Math.random() * 360, t0: performance.now() }; scheduleBeam(); }, 6000 + Math.random() * 6000);
  }

  // fire cue: a quick flash
  var fireT = -1;
  ARGUS.on('fire', function () { fireT = performance.now(); });

  function draw(now) {
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(200,220,230,' + (0.25 * half) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < streaks.length; i++) {
      var s = streaks[i];
      s.y += s.speed; s.x += 0.6;
      if (s.y > h) { s.y = -s.len; s.x = Math.random() * w; }
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 2, s.y - s.len);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(220,231,238,' + (0.3 * half) + ')';
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
    if (ARGUS.reduce) { draw(performance.now()); return; } // one static frame, then stop
    scheduleBeam();
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', function () {
    if (!started || ARGUS.reduce) return;
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; }
    else if (!raf) raf = requestAnimationFrame(loop);
  });

  if (ARGUS.state.booted || !document.getElementById('boot')) begin(); // sub-pages have no boot
  ARGUS.on('boot-done', begin);
})();
