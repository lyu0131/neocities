/* hud.js: the hub's HUD, drawn into svg#hud over the panorama. A monochrome hairline overlay:
   the monitor's top rim (a U-arc), two curved tick rulers bowed in toward the horizon, a triangle
   reticle with its fire-control mode word (MANUAL / LOCKED) and a heading scale over it, a horizon rail with hex clamps and yellow chevrons, a
   lock readout under the rail, and floor arcs. The contacts themselves are not drawn here: they are
   .target arrowheads in the panorama (cockpit.js), so they turn with the scene. This file adds
   what's dynamic: the heading, the lock readout, and contacts out of view riding the rail's ends.
   Everything is in viewport px (the viewBox is the window), redrawn on resize. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var svg = document.getElementById('hud');
  if (!svg) return;
  var NS = 'http://www.w3.org/2000/svg';
  var pano = document.getElementById('pano');
  var pad = BUNNYS.pad, wrap360 = BUNNYS.wrap360, shortestDelta = BUNNYS.shortestDelta;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(e);
    return e;
  }
  function line(x1, y1, x2, y2, o, w, parent) {
    return el('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), 'stroke-opacity': o, 'stroke-width': w || 1.2 }, parent);
  }
  function text(x, y, s, attrs, parent) {
    var t = el('text', Object.assign({ x: x.toFixed(1), y: y.toFixed(1) }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }
  function hex(x, y, r, attrs, parent) {
    var pts = [];
    for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i + Math.PI / 6; pts.push((x + r * Math.cos(a)).toFixed(1) + ',' + (y + r * Math.sin(a)).toFixed(1)); }
    return el('polygon', Object.assign({ points: pts.join(' ') }, attrs), parent);
  }
  function setText(node, v) { if (node && node.textContent !== v) node.textContent = v; }

  var hdgText = null, modeText = null, lockLine = null, hintLine = null, edgeL = null, edgeR = null;
  var W = 0, H = 0, phone = false, hy = 0, halfFov = 50, lock = null;

  function draw() {
    W = innerWidth; H = innerHeight; phone = W < 700;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    // the panorama's real field of view: #pano's CSS perspective (cockpit.js puts the camera at the
    // sphere's centre), so a contact past this many degrees off the nose is out of the window
    var persp = parseFloat(getComputedStyle(pano).perspective) || W * .42;
    halfFov = Math.atan(W / 2 / persp) * 180 / Math.PI;
    var cx = W / 2, cy = H / 2;
    hy = H * (phone ? .72 : .78);
    var k = phone ? Math.min(.66, W / 560) : Math.max(.5, Math.min(1, W / 1440, H / 900));   // the reticle's scale

    // the monitor's top rim
    var a = Math.min(W * (phone ? .46 : .27), 520), uy = H * (phone ? .14 : .17);
    el('path', { class: 'rim', d: 'M' + (cx - a) + ',-20 A' + a + ',' + (uy + 20) + ' 0 0 0 ' + (cx + a) + ',-20', 'stroke-width': phone ? 5 : 8, 'stroke-dasharray': '420 6 900 5' });
    el('path', { class: 'rim-in', d: 'M' + (cx - a + 14) + ',-20 A' + (a - 14) + ',' + (uy + 6) + ' 0 0 0 ' + (cx + a - 14) + ',-20' });

    // two tick rulers, bowed in toward the horizon
    var near = Math.min(W * (phone ? .44 : .2), 400), far = near + Math.min(W * .09, 170);
    [-1, 1].forEach(function (side) {
      var d = '';
      for (var y = -10, i = 0; y <= H + 10; y += phone ? 16 : 20, i++) {
        var t = (y - cy) / (H * .62), x = cx + side * (near + (far - near) * Math.min(1, t * t));
        d += (d ? 'L' : 'M') + x.toFixed(1) + ',' + y;
        line(x, y, x + side * (i % 5 ? 7 : 16), y, i % 5 ? .45 : .7);
      }
      el('path', { class: 'spine', d: d });
    });

    // the triangle reticle, on the boresight (the panorama's centre): a translucent inverted
    // triangle, heavy bars outside its sides, nested corner brackets, a broken ring of dashes round
    // the centre, long double lines radiating out, hatched rows, and the fire-control mode word
    var g = el('g', { class: 'sight', transform: 'translate(' + cx + ',' + cy + ') scale(' + k.toFixed(3) + ')' });
    var T = -200, A = 210, hw = 237, L = Math.hypot(hw, A - T);
    el('polygon', { class: 'tri-panel', points: -hw + ',' + T + ' ' + hw + ',' + T + ' 0,' + A }, g);
    [-1, 1].forEach(function (sd) {
      // a side runs from its top corner (sd*hw, T) to the apex; bars sit 30 outside it
      var ux = -sd * hw / L, uy = (A - T) / L, nx = sd * (A - T) / L, ny = hw / L;
      function at(t, off) { return [sd * hw + ux * L * t + nx * off, T + uy * L * t + ny * off]; }
      [[-.04, .3], [.72, 1.03]].forEach(function (seg) {
        var p0 = at(seg[0], 30), p1 = at(seg[1], 30);
        el('path', { class: 'tri-bar', d: 'M' + p0[0].toFixed(1) + ',' + p0[1].toFixed(1) + 'L' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1), 'stroke-width': 7 }, g);
      });
      // the inner triangle's top corner bracket: an arm along the top, an arm down the side
      var ix = sd * hw * .62, iy = T + 62;
      el('path', { class: 'tri-brk', d: 'M' + (ix - sd * 78) + ',' + iy + 'L' + ix + ',' + iy + 'L' + (ix + ux * 84).toFixed(1) + ',' + (iy + uy * 84).toFixed(1), 'stroke-width': 5 }, g);
      // long double lines radiating out past the sides, and a hatched row under each
      var ang = (sd < 0 ? 150 : 30) * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang);
      [-3, 3].forEach(function (o) { line(c * 270 - sn * o, sn * 270 + c * o, c * 380 - sn * o, sn * 380 + c * o, .55, 1.4, g); });
      for (var h = 0; h < 6; h++) { var hx0 = sd * (262 + h * 17); line(hx0, 150, hx0 + 10, 162, .6, 1.6, g); }
    });
    // the inner triangle's apex: a small V
    el('path', { class: 'tri-brk', d: 'M-48,' + (A - 196) + 'L0,' + (A - 116) + 'L48,' + (A - 196), 'stroke-width': 5 }, g);
    // the broken ring of dashes and the stems through the centre
    [30, 150, 210, 330].forEach(function (d) {
      var r = d * Math.PI / 180;
      line(Math.cos(r) * 54, Math.sin(r) * 54, Math.cos(r) * 82, Math.sin(r) * 82, .75, 3, g);
    });
    line(0, T + 22, 0, T + 70, .6, 3, g); line(0, -40, 0, -14, .8, 2, g); line(0, 18, 0, 52, .8, 2, g);
    line(0, A - 92, 0, A - 40, .6, 3, g);
    line(-7, -3, 7, -3, .9, 1.5, g); line(-7, 3, 7, 3, .9, 1.5, g);
    // the mode word holds 13px on screen whatever the reticle's scale
    modeText = text(hw - 22, T + 28, 'MANUAL', { class: 'mode', 'text-anchor': 'end', style: 'font-size:' + (13 / k).toFixed(1) + 'px' }, g);
    // heading scale over the reticle
    var hg = el('g', { transform: 'translate(' + cx + ',' + (cy + (T - 22) * k - (phone ? 6 : 0)).toFixed(1) + ')' });
    for (var t2 = -6; t2 <= 6; t2++) line(t2 * 7, 0, t2 * 7, t2 % 3 ? -3 : -6, .6, 1, hg);
    hdgText = text(0, -12, '000', { class: 'hdg', 'text-anchor': 'middle' }, hg);

    // the horizon rail: a double line with risers, edge to clamp; hex clamps, chevrons pointing in
    var cw = phone ? W * .3 : Math.min(W * .19, 270);
    [-1, 1].forEach(function (sd) {
      var x0 = cx + sd * (cw + 40), x1 = sd < 0 ? 0 : W;
      line(x0, hy - 6, x1, hy - 6, .7, 1.3); line(x0 + sd * 30, hy + 6, x1, hy + 6, .45, 1.3);
      for (var x = x0 + sd * 60, n = 0; sd < 0 ? x > 0 : x < W; x += sd * (phone ? 70 : 120), n++) {
        line(x, hy - 6, x + sd * 6, hy - (n % 2 ? 12 : 10), .7, 1.3);
        if (n % 2) line(x + sd * 30, hy + 6, x + sd * 36, hy + 12, .45, 1.3);
      }
      var hx = cx + sd * cw;
      hex(hx, hy, phone ? 15 : 20, { class: 'clamp' });
      el('path', { class: 'chev', d: 'M' + (hx - sd * 30) + ',' + (hy - 9) + ' l' + (-sd * 9) + ',9 l' + (sd * 9) + ',9' });
    });
    line(cx - cw + 44, hy, cx + cw - 44, hy, .35, 1).setAttribute('stroke-dasharray', '2 4');
    // contacts out of view ride the rail's ends
    edgeL = el('g', { class: 'edge' }); edgeR = el('g', { class: 'edge' });

    // the lock readout under the rail
    var cl = el('g', { class: 'cluster', transform: 'translate(' + cx + ',' + (hy + (phone ? 50 : 64)) + ') scale(' + (phone ? .8 : 1) + ')' });
    [-1, 1].forEach(function (sd) {
      hex(sd * 156, 0, 14, { class: 'cell' }, cl);
      hex(sd * 128, 0, 14, { class: 'cell is-solid' }, cl);
    });
    lockLine = text(0, -4, '', { class: 'lock-line', 'text-anchor': 'middle' }, cl);
    hintLine = text(0, 10, '', { class: 'hint-line', 'text-anchor': 'middle' }, cl);
    el('path', { class: 'chev', d: 'M-7,26 l7,-7 l7,7 M-7,34 l7,-7 l7,7' }, cl);

    // floor arcs
    for (var f = 0; f < 3; f++) {
      var fy = hy + (phone ? 100 : 120) + f * (phone ? 40 : 52);
      el('path', { class: 'floor', d: 'M-40,' + (fy + 120 + f * 20) + ' Q' + cx + ',' + (fy - 40) + ' ' + (W + 40) + ',' + (fy + 120 + f * 20) });
    }
    [-1, 1].forEach(function (sd) { line(cx + sd * cw, hy + 110, cx + sd * cw, H, .25, 1).setAttribute('stroke-dasharray', '60 30'); });

    showLock(); showView(BUNNYS.state.yaw);
  }

  // what Enter does, said under the rail
  function showLock() {
    if (!lockLine) return;
    var open = BUNNYS.fine ? 'ENTER TO OPEN' : 'TAP TO OPEN';
    setText(lockLine, lock && lock.id ? 'LOCKED  ' + lock.label : 'NO LOCK');
    setText(hintLine, lock && lock.id ? lock.readout + '  ' + open : (BUNNYS.fine ? 'DRAG OR 1-4 TO LOCK' : 'SWIPE TO TURN'));
    lockLine.classList.toggle('is-hostile', !!(lock && lock.id === 't-unknown'));
    setText(modeText, lock && lock.id ? 'LOCKED' : 'MANUAL');
  }

  // heading, and which contacts are out of the window (listed at the rail's ends)
  var edgeKey = '';
  function showView(yaw) {
    if (!hdgText) return;
    setText(hdgText, pad(Math.round(wrap360(yaw)) % 360, 3));
    var left = [], right = [];
    BUNNYS.contacts.forEach(function (c) {
      var d = shortestDelta(yaw, c.yaw);
      var out = Math.abs(d) > halfFov - 4, t = document.getElementById(c.id);
      if (out) (d < 0 ? left : right).push(c);
      // its label would hang in from the edge while the rail's end already names it
      if (t) t.classList.toggle('is-out', out);
    });
    var key = left.map(function (c) { return c.id; }).join() + '|' + right.map(function (c) { return c.id; }).join();
    if (key === edgeKey) return;
    edgeKey = key;
    [[edgeL, left, -1], [edgeR, right, 1]].forEach(function (e) {
      while (e[0].firstChild) e[0].removeChild(e[0].firstChild);
      e[1].forEach(function (c, i) {
        var brg = pad(wrap360(c.yaw), 3), s = e[2] < 0 ? '◂ ' + c.label + ' ' + brg : c.label + ' ' + brg + ' ▸';
        var t = text(e[2] < 0 ? 16 : W - 16, hy - 30 - i * 18, s, { 'text-anchor': e[2] < 0 ? 'start' : 'end' }, e[0]);
        if (!c.page) t.classList.add('is-hostile');
      });
    });
  }

  BUNNYS.on('view', function (d) { showView(d.yaw); });
  BUNNYS.on('lock', function (d) { lock = d; showLock(); });
  draw();
  var resizeTimer = null;
  addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { edgeKey = ''; draw(); }, 120); });
})();
