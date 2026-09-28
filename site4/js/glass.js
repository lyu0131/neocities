/* glass.js: water on the canopy panes — canvas#glass.

   This is the near field: drops that have landed on the glass in front of the pilot, as
   opposed to fx.js's streaks, which are rain out in the world. Three behaviours carry it:

   - beads cling and grow, and never move, so a few hundred of them cost nothing per frame;
   - a bead that gets too heavy releases into a runner, which accelerates, carves a track and
     ABSORBS the beads it passes, visibly fattening as it crosses a wet patch;
   - a runner stops dead at a screen seam and pools there, because the canopy is five separate
     panes and water cannot cross the frame between them.

   The bitmap PERSISTS. It is never cleared in the frame loop — only written to, in the step
   below and in resize(). That is the whole reason this is a second canvas rather than part of
   fx.js: beads that stay put between frames are free. Do not add a clearRect.

   We cannot sample what is behind the glass (the scene is a CSS-3D subtree; element() is
   Firefox-only and backdrop-filter is banned here), so refraction is faked in the sprite: a
   dark lens rim, a body whose bright spot sits LOW because a droplet inverts the scene, and a
   specular highlight opposite it. Two opposed bright points is what the eye reads as a lens. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var canvas = document.getElementById('glass');
  if (!BUNNYS || !canvas) return;
  var gctx = canvas.getContext('2d');
  if (!gctx) return;

  // Water is soft, so it does not need the full device ratio. This is the knob to turn first
  // if the layer ever profiles badly: at 1440x900 it is an ~11MB compositor surface at 1.5.
  var GLASS_DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  var isPage = document.body.classList.contains('page');

  var R_CRIT = 5.5;        // mean radius at which a bead lets go, jittered per bead
  var R_SEED = 1.6;        // radius a fresh bead lands at
  var GRAV = 900;          // px/s^2 at unit mass
  var DEPOSIT_PX = 14;     // a runner leaves a residual bead every this many px of travel
  var TRAIL_A = 0.085;     // the damp track left behind
  var WANDER = 26;         // px/s of sideways drift, so a runner is not a straight scratch
  // The head is drawn into the persistent bitmap each frame, so the next frame's erase has to
  // be WIDER than the sprite or the old heads pile up into a scalloped dark tube behind the
  // runner. Absorption uses the same reach, or a bead can be wiped from the glass while still
  // sitting in the array as an invisible ghost.
  var WIPE = 1.4;

  // Everything about how wet the glass gets comes from the one weather object, so the
  // ENVIRONMENT panel's reading and what you see on the pane can never disagree. A sub-page
  // is a document: beads only, no runners crawling behind the body text.
  var WX = BUNNYS.wx || {};
  var scale = isPage ? 0.21 : 1;
  var wx = {
    beads: Math.round((WX.beads != null ? WX.beads : 520) * scale),
    runners: isPage ? 0 : (WX.runners != null ? WX.runners : 20),
    spawn: (WX.spawn != null ? WX.spawn : 40) * scale,
    growth: WX.growth != null ? WX.growth : 1
  };

  var w = 0, h = 0;
  var beads = [];          // sorted by y, so a runner's absorption scan is a windowed walk
  var runners = [];
  var polys = null;        // the five screen polygons, from hud.js via bunnys:screens

  // ---------------------------------------------------------------- sprites, drawn once
  // One droplet at high resolution, scaled per bead. Six radius buckets would snap; one sprite
  // keeps the rim and highlight proportional at every size, and a scaled drawImage is cheap.
  var DROP = (function () {
    var S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), R = 58, cx = S / 2, cy = S / 2;
    var sh = x.createRadialGradient(cx, cy + R * 0.20, R * 0.2, cx, cy + R * 0.20, R * 1.04);
    sh.addColorStop(0, 'rgba(0,0,0,.22)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sh; x.beginPath(); x.arc(cx, cy + R * 0.18, R * 1.04, 0, 6.2832); x.fill();
    // the body's bright centre sits LOW: a droplet is a lens, so it inverts the scene and the
    // bright horizon shows up in its lower half
    var bd = x.createRadialGradient(cx + R * 0.20, cy + R * 0.30, R * 0.04, cx, cy, R);
    bd.addColorStop(0, 'rgba(208,230,244,.34)');
    bd.addColorStop(0.55, 'rgba(150,182,206,.13)');
    bd.addColorStop(1, 'rgba(120,150,175,.05)');
    x.fillStyle = bd; x.beginPath(); x.arc(cx, cy, R, 0, 6.2832); x.fill();
    // the rim reads almost black: light entering the edge is turned away from the eye. This is
    // the shape that makes a drop look wet rather than merely shiny.
    x.strokeStyle = 'rgba(4,8,14,.5)'; x.lineWidth = R * 0.28;
    x.beginPath(); x.arc(cx, cy, R * 0.87, 0, 6.2832); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.5)';
    x.beginPath(); x.ellipse(cx - R * 0.29, cy - R * 0.33, R * 0.19, R * 0.14, -0.5, 0, 6.2832); x.fill();
    return c;
  })();

  function drawBead(b) { gctx.drawImage(DROP, b.x - b.r * 1.15, b.y - b.r * 1.15, b.r * 2.3, b.r * 2.3); }

  // ---------------------------------------------------------------- the five panes
  function bbox(pts) {
    var a = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, pts: pts };
    for (var i = 0; i < pts.length; i++) {
      if (pts[i][0] < a.x0) a.x0 = pts[i][0];
      if (pts[i][0] > a.x1) a.x1 = pts[i][0];
      if (pts[i][1] < a.y0) a.y0 = pts[i][1];
      if (pts[i][1] > a.y1) a.y1 = pts[i][1];
    }
    a.area = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
    return a;
  }
  // The five panes tile the viewport edge to edge, so clipping to their union alone leaves no
  // dry frame between them -- the water would read as one sheet. Keeping spawns and runners a
  // margin clear of every edge is what makes five separate panes visible in the water.
  var SEAM_DRY = 7;
  function edgeDist(p, x, y) {
    var pts = p.pts, best = 1e9;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var ax = pts[j][0], ay = pts[j][1], bx = pts[i][0], by = pts[i][1];
      var vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
      var t = L ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L)) : 0;
      var dx = x - (ax + t * vx), dy = y - (ay + t * vy);
      var d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  function inPoly(p, x, y) {
    if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) return false;
    var pts = p.pts, hit = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  BUNNYS.on('screens', function (d) {
    if (!d.polys) return;
    var out = [], total = 0, k;
    for (k in d.polys) if (d.polys[k] && d.polys[k].length > 2) { var b = bbox(d.polys[k]); out.push(b); total += b.area; }
    if (!out.length) return;
    polys = out; polys.total = total;
  });
  // Until hud.js reports in, treat the whole viewport as one pane. The CSS clip hides the
  // overspill, so the worst case is cosmetic and it corrects itself on the first emit.
  function panes() {
    if (polys) return polys;
    var one = [bbox([[0, 0], [w, 0], [w, h], [0, h]])];
    one.total = one[0].area;
    return one;
  }
  function paneAt(x, y) {
    var p = panes();
    for (var i = 0; i < p.length; i++) if (inPoly(p[i], x, y)) return p[i];
    return null;
  }

  // ---------------------------------------------------------------- beads
  function insert(b) {                      // keep the array sorted by y
    var lo = 0, hi = beads.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (beads[m].y < b.y) lo = m + 1; else hi = m; }
    beads.splice(lo, 0, b);
  }
  function lowerBound(y) {
    var lo = 0, hi = beads.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (beads[m].y < y) lo = m + 1; else hi = m; }
    return lo;
  }
  function newBead(x, y, r) {
    return { x: x, y: y, r: r, dr: r, crit: R_CRIT * (0.75 + Math.random() * 0.5),
             g: (0.22 + Math.random() * 0.45) * wx.growth };
  }
  // A drop landing on one already there merges with it, which is what actually pushes beads
  // over the edge and releases runners in clusters rather than on a timer.
  function land() {
    var p = panes(), pick = Math.random() * p.total, pane = p[0], i;
    for (i = 0; i < p.length; i++) { pick -= p[i].area; if (pick <= 0) { pane = p[i]; break; } }
    for (var tries = 0; tries < 8; tries++) {
      var x = pane.x0 + Math.random() * (pane.x1 - pane.x0);
      var y = pane.y0 + Math.random() * (pane.y1 - pane.y0);
      if (!inPoly(pane, x, y) || edgeDist(pane, x, y) < SEAM_DRY) continue;
      var lo = lowerBound(y - 8);
      for (var k = lo; k < beads.length && beads[k].y < y + 8; k++) {
        var b = beads[k], dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy < (b.r + 3.5) * (b.r + 3.5)) {   // merge: volumes add
          b.r = Math.cbrt(b.r * b.r * b.r + R_SEED * R_SEED * R_SEED * 3);
          b.dr = b.r; drawBead(b);
          return;
        }
      }
      if (beads.length >= wx.beads) return;
      var nb = newBead(x, y, R_SEED + Math.random() * 1.8);
      insert(nb); drawBead(nb);
      return;
    }
  }

  // ---------------------------------------------------------------- runners
  function release(b, i) {
    beads.splice(i, 1);
    if (runners.length >= wx.runners) return;
    runners.push({ x: b.x, y: b.y, r: b.r, vx: 0, vy: 12, px: b.x, py: b.y,
                   pane: paneAt(b.x, b.y), phase: Math.random() * 6.28, since: 0,
                   gap: DEPOSIT_PX * (0.5 + Math.random()) });
  }
  function erase(x0, y0, x1, y1, r) {
    gctx.globalCompositeOperation = 'destination-out';
    gctx.lineCap = 'round'; gctx.lineWidth = r * 2;
    gctx.strokeStyle = 'rgba(0,0,0,1)';
    gctx.beginPath(); gctx.moveTo(x0, y0); gctx.lineTo(x1, y1); gctx.stroke();
    gctx.globalCompositeOperation = 'source-over';
  }
  // Everything within reach of the segment just travelled is swallowed, and its volume added.
  // Watching a runner fatten and speed up across a wet patch is the behaviour that sells this.
  function absorb(rn, y0, y1) {
    var lo = lowerBound(Math.min(y0, y1) - rn.r * WIPE - 6);
    for (var i = lo; i < beads.length; i++) {
      var b = beads[i];
      if (b.y > Math.max(y0, y1) + rn.r * WIPE + 6) break;
      var dx = b.x - rn.x, dy = b.y - rn.y, reach = rn.r * WIPE + b.r;
      if (dx * dx + dy * dy <= reach * reach) {
        rn.r = Math.cbrt(rn.r * rn.r * rn.r + b.r * b.r * b.r);
        beads.splice(i, 1); i--;
      }
    }
  }

  function step(dt, t, shear) {
    var i, b;
    // condensation, then release
    for (i = beads.length - 1; i >= 0; i--) {
      b = beads[i];
      if (b.g) { b.r += b.g * dt; if (b.r - b.dr > 0.25) { b.dr = b.r; drawBead(b); } }
      if (b.r >= b.crit && wx.runners) release(b, i);
    }
    var want = wx.spawn * dt;
    for (i = 0; i < Math.floor(want); i++) land();
    if (Math.random() < want - Math.floor(want)) land();

    for (i = runners.length - 1; i >= 0; i--) {
      var rn = runners[i];
      rn.vy += GRAV * (0.10 + rn.r / R_CRIT * 0.16) * dt;
      // an acceleration, not a velocity: surface tension resists, so a gust leans the track
      // rather than snapping it sideways
      rn.vx += shear * 0.35 * dt;
      rn.vx *= 0.96;
      // The wobble is a velocity, not an acceleration: fed through vx it was damped away to
      // nothing and every track came out a dead straight scratch. Water follows whatever the
      // surface gives it, so the path should visibly wander.
      var wob = Math.sin(t * 0.0028 + rn.phase) * WANDER + Math.sin(t * 0.0071 + rn.phase * 2) * WANDER * 0.4;
      var nx = rn.x + (rn.vx + wob) * dt, ny = rn.y + rn.vy * dt;

      // a pane's edge is a machined seam; water pools against it instead of crossing
      // pool just inside the seam rather than against it, so the frame line stays clear
      var stop = rn.pane && (!inPoly(rn.pane, nx, ny) || edgeDist(rn.pane, nx, ny) < SEAM_DRY + rn.r);
      if (stop || ny > h + 20) {
        erase(rn.x, rn.y, rn.x, rn.y, rn.r * WIPE);
        if (stop) { var fat = newBead(rn.x, rn.y, rn.r); fat.g = 0; insert(fat); drawBead(fat); }
        runners.splice(i, 1);
        continue;
      }
      absorb(rn, rn.y, ny);
      erase(rn.x, rn.y, nx, ny, rn.r * WIPE);
      gctx.strokeStyle = 'rgba(190,215,232,' + TRAIL_A + ')';
      gctx.lineCap = 'round'; gctx.lineWidth = Math.max(1, rn.r * 0.5);
      gctx.beginPath(); gctx.moveTo(rn.x, rn.y); gctx.lineTo(nx, ny); gctx.stroke();
      rn.since += Math.abs(ny - rn.y);
      // jittered spacing and a nudge off the centre line, or the residue reads as a dotted rule
      if (rn.since > rn.gap) {              // residue, which a later runner can re-absorb
        rn.since = 0; rn.gap = DEPOSIT_PX * (0.5 + Math.random());
        var res = newBead(nx + (Math.random() - 0.5) * rn.r * 1.2, ny,
                          Math.min(1.9, rn.r * (0.16 + Math.random() * 0.22)));
        res.g *= 0.4;
        insert(res); drawBead(res);
        rn.r = Math.max(R_CRIT * 0.7, rn.r * 0.985);
      }
      rn.x = nx; rn.y = ny;
      drawBead(rn);
    }
  }

  // ---------------------------------------------------------------- lifecycle
  function clearAll() {
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, canvas.width, canvas.height);
    gctx.setTransform(GLASS_DPR, 0, 0, GLASS_DPR, 0, 0);
    beads.length = 0; runners.length = 0;
  }
  // Land a population and run the simulation forward with no rAF, so the glass is already wet
  // when the cockpit opens — and so reduced motion gets a mature still frame rather than a
  // bare pane: mature beads, runners frozen mid-track, water pooled along the lower seams.
  function seed(steps) {
    clearAll();
    for (var i = 0; i < wx.beads * 0.45; i++) land();
    for (var s = 0; s < steps; s++) step(1 / 30, s * 33, 0);
  }
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * GLASS_DPR);
    canvas.height = Math.round(h * GLASS_DPR);
    gctx.setTransform(GLASS_DPR, 0, 0, GLASS_DPR, 0, 0);
    seed(BUNNYS.reduce ? 520 : 320);   // the bitmap is gone with the old size; rebuild it
  }
  resize();
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 150); });

  var raf = null, started = false, last = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt, now, WX.shear ? WX.shear() : 34);
  }
  function begin() {
    if (started) return;
    started = true;
    if (BUNNYS.reduce) { seed(520); return; }   // a still photograph of a rained-on pane
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', function () {
    if (!started || BUNNYS.reduce) return;
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; }
    else if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
  });

  BUNNYS.glass = { beads: function () { return beads.length; }, runners: function () { return runners.length; } };

  if (BUNNYS.state.booted || !document.getElementById('boot')) begin();
  BUNNYS.on('boot-done', begin);
})();
