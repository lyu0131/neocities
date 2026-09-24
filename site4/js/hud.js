/* hud.js: everything inside svg#hud — heading tape, pitch ladder, FPM, boresight,
   SPD/ALT bars, status line, lock and rear-chevron readouts. Hub: driven by
   argus:view/argus:lock. Sub-pages (body.page): a reduced set driven by scroll. */
(function () {
  'use strict';
  var ARGUS = window.ARGUS;
  var svg = document.getElementById('hud');
  var isPage = document.body.classList.contains('page');
  var NS = 'http://www.w3.org/2000/svg';
  var CX = 960, CY = 540;

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function wrap360(a) { return ((a % 360) + 360) % 360; }
  function shortestDelta(from, to) { var d = wrap360(to - from); if (d > 180) d -= 360; return d; }
  function pad3(n) { n = Math.round(wrap360(n)); return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function cardinal(h) { return h === 0 ? 'N' : h === 90 ? 'E' : h === 180 ? 'S' : h === 270 ? 'W' : null; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  svg.setAttribute('viewBox', '0 0 1920 1080');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');

  // -- heading tape: fixed caret + readout, ticks regenerated around the current heading --
  var hdg = el('g', { transform: 'translate(' + CX + ',56)' });
  var hdgTicks = el('g');
  hdg.appendChild(hdgTicks);
  hdg.appendChild(el('path', { d: 'M0,-8 L-9,10 L9,10 Z' })); // caret, points at the centre tick
  var box = el('rect', { x: -46, y: 16, width: 92, height: 26, rx: 2 });
  var hdgReadout = el('text', { class: 'hdg-readout', x: 0, y: 35, 'text-anchor': 'middle' });
  hdg.appendChild(box); hdg.appendChild(hdgReadout);
  svg.appendChild(hdg);

  function drawHeading(yaw) {
    clear(hdgTicks);
    var span = 60, step = 5, px = 6.2;
    for (var d = -span; d <= span; d += step) {
      var heading = wrap360(Math.round(yaw) + d);
      var major = heading % 15 === 0;
      var x = d * px;
      hdgTicks.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: major ? 16 : 8 }));
      if (major) {
        var t = el('text', { x: x, y: -6, 'text-anchor': 'middle' });
        t.textContent = cardinal(heading) || pad3(heading);
        hdgTicks.appendChild(t);
      }
    }
    hdgReadout.textContent = pad3(yaw);
  }
  drawHeading(0);

  // -- boresight: fixed cross, class="boresight" for the boot reticle-drop --
  var bore = el('g', { class: 'boresight', transform: 'translate(' + CX + ',' + CY + ')' });
  bore.appendChild(el('circle', { r: 22 }));
  bore.appendChild(el('line', { x1: -34, y1: 0, x2: -14, y2: 0 }));
  bore.appendChild(el('line', { x1: 14, y1: 0, x2: 34, y2: 0 }));
  bore.appendChild(el('line', { x1: 0, y1: -34, x2: 0, y2: -14 }));
  svg.appendChild(bore);

  // -- status line, bottom centre --
  var IDLE_STATUS = 'ARGUS SL-01 / SYS NOMINAL';
  var status = el('text', { x: CX, y: 1010, 'text-anchor': 'middle' });
  status.textContent = IDLE_STATUS;
  svg.appendChild(status);

  function bar(x, label) {
    var g = el('g', { transform: 'translate(' + x + ',' + CY + ')' });
    g.appendChild(el('line', { x1: 0, y1: -160, x2: 0, y2: 160 }));
    var tick = el('line', { x1: -10, y1: 0, x2: 10, y2: 0 });
    g.appendChild(tick);
    var t = el('text', { x: 0, y: -172, 'text-anchor': 'middle' });
    t.textContent = label;
    g.appendChild(t);
    var readout = el('text', { x: 0, y: 186, 'text-anchor': 'middle' });
    g.appendChild(readout);
    svg.appendChild(g);
    return { tick: tick, readout: readout };
  }
  function setBar(b, frac01, text) {
    b.tick.setAttribute('y1', (160 - frac01 * 320).toFixed(1));
    b.tick.setAttribute('y2', (160 - frac01 * 320).toFixed(1));
    if (text != null) b.readout.textContent = text;
  }
  var spd = bar(120, 'SPD'), alt = bar(1800, 'ALT');

  if (!isPage) {
    // -- pitch ladder: rungs regenerated around the current pitch, banks slightly with vx --
    var ladder = el('g', { transform: 'translate(' + CX + ',' + CY + ')' });
    svg.appendChild(ladder);
    function drawLadder(pitch, roll) {
      clear(ladder);
      ladder.setAttribute('transform', 'translate(' + CX + ',' + CY + ') rotate(' + roll.toFixed(2) + ')');
      var scale = 14;
      for (var r = -10; r <= 10; r += 5) {
        if (r === 0) continue;
        var y = -(r - pitch) * scale;
        var w = r > 0 ? 90 : 60;
        var line = el('line', { x1: -w, y1: y, x2: w, y2: y });
        if (r < 0) line.setAttribute('stroke-dasharray', '6 6');
        ladder.appendChild(line);
        ladder.appendChild(el('line', { x1: -w, y1: y, x2: -w, y2: y + (r > 0 ? 8 : -8) }));
        ladder.appendChild(el('line', { x1: w, y1: y, x2: w, y2: y + (r > 0 ? 8 : -8) }));
      }
    }
    drawLadder(0, 0);

    // -- flight-path marker: lags the pointer via a CSS transition, recentres when idle --
    var fpm = el('g', { transform: 'translate(' + CX + ',' + CY + ')' });
    fpm.style.transition = 'transform .22s ease-out';
    fpm.appendChild(el('circle', { r: 12 }));
    fpm.appendChild(el('line', { x1: -30, y1: 0, x2: -14, y2: 0 }));
    fpm.appendChild(el('line', { x1: 14, y1: 0, x2: 30, y2: 0 }));
    fpm.appendChild(el('line', { x1: 0, y1: -14, x2: 0, y2: -6 }));
    svg.appendChild(fpm);
    var fpmIdleTimer = null;
    addEventListener('mousemove', function (e) {
      var ox = clamp((e.clientX / innerWidth - 0.5) * 260, -140, 140);
      var oy = clamp((e.clientY / innerHeight - 0.5) * 160, -100, 100);
      fpm.setAttribute('transform', 'translate(' + (CX + ox) + ',' + (CY + oy) + ')');
      clearTimeout(fpmIdleTimer);
      fpmIdleTimer = setTimeout(function () { fpm.setAttribute('transform', 'translate(' + CX + ',' + CY + ')'); }, 1500);
    });

    // -- rear-warning chevrons: amber, edge-mounted, point toward a target >60deg off-centre --
    var targets = Array.prototype.slice.call(document.querySelectorAll('.target'));
    var chevrons = targets.map(function () {
      var c = el('path', { d: 'M0,-16 L14,0 L0,16', style: 'color:var(--amber,#FFB02E)', opacity: 0 });
      svg.appendChild(c);
      return c;
    });
    function drawChevrons(yaw) {
      targets.forEach(function (t, i) {
        var dy = parseFloat(t.dataset.yaw) || 0;
        var off = shortestDelta(yaw, dy);
        var c = chevrons[i];
        if (Math.abs(off) <= 60) { c.setAttribute('opacity', 0); return; }
        var right = off > 0;
        c.setAttribute('opacity', 1);
        c.setAttribute('transform', 'translate(' + (right ? 1860 : 60) + ',' + CY + ') scale(' + (right ? 1 : -1) + ',1)');
      });
    }
    drawChevrons(0);

    ARGUS.on('view', function (d) {
      drawHeading(d.yaw);
      drawLadder(d.pitch, clamp((d.vx || 0) * 1.2, -6, 6));
      drawChevrons(d.yaw);
      setBar(spd, clamp(Math.abs(d.vx || 0) / 6, 0, 1));
      setBar(alt, clamp((d.pitch + 12) / 24, 0, 1), (d.pitch >= 0 ? '+' : '') + Math.round(d.pitch));
    });
    ARGUS.on('lock', function (d) { status.textContent = d.id ? 'LOCK: ' + d.label : IDLE_STATUS; });
    ARGUS.on('boot-done', function () { status.textContent = 'ALL SYSTEMS NOMINAL'; });
  } else {
    // -- sub-pages: reduced set, driven by scroll --
    var lastY = scrollY, lastT = performance.now();
    function onScroll() {
      var y = scrollY, t = performance.now();
      var dt = Math.max(1, t - lastT);
      var vel = (y - lastY) / dt * 1000; // px/s
      lastY = y; lastT = t;
      var max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      var frac = clamp(y / max, 0, 1);
      drawHeading(frac * 359);
      setBar(spd, clamp(Math.abs(vel) / 900, 0, 1));
      setBar(alt, frac, Math.round(y / 100) + 'M');
    }
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
