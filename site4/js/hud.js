/* hud.js: everything inside svg#hud — heading tape, pitch ladder, FPM, boresight,
   SPD/ALT bars, radar scope, system gauges, caution banner and status line.
   Hub: driven by argus:view/argus:lock. Sub-pages (body.page): a reduced set
   driven by scroll.

   Layout is responsive: the viewBox tracks the real viewport and every group is
   placed against an edge in place(). A fixed 1920x1080 viewBox desynced from
   frame.svg's xMidYMax crop at any aspect but 16:9, which pushed the status line
   and the bottoms of both bars off screen on a wide, short window. */
(function () {
  'use strict';
  var ARGUS = window.ARGUS;
  var svg = document.getElementById('hud');
  var isPage = document.body.classList.contains('page');
  var NS = 'http://www.w3.org/2000/svg';
  var W = 0, H = 0;

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
  function xf(g, x, y, extra) { g.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')' + (extra || '')); }

  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // -- heading tape: fixed caret + readout, ticks regenerated around the current heading --
  var hdg = el('g');
  var hdgTicks = el('g');
  hdg.appendChild(hdgTicks);
  hdg.appendChild(el('path', { d: 'M0,-8 L-9,10 L9,10 Z' })); // caret, points at the centre tick
  hdg.appendChild(el('rect', { x: -46, y: 16, width: 92, height: 26, rx: 2 }));
  var hdgReadout = el('text', { class: 'hdg-readout', x: 0, y: 35, 'text-anchor': 'middle' });
  hdg.appendChild(hdgReadout);
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

  // -- boresight: fixed cross, class="boresight" for the boot reticle-drop --
  var bore = el('g', { class: 'boresight' });
  bore.appendChild(el('circle', { r: 22 }));
  bore.appendChild(el('line', { x1: -34, y1: 0, x2: -14, y2: 0 }));
  bore.appendChild(el('line', { x1: 14, y1: 0, x2: 34, y2: 0 }));
  bore.appendChild(el('line', { x1: 0, y1: -34, x2: 0, y2: -14 }));
  svg.appendChild(bore);

  // -- status line, bottom centre --
  var IDLE_STATUS = 'ARGUS SL-01 / SYS NOMINAL';
  var status = el('text', { 'text-anchor': 'middle' });
  status.textContent = IDLE_STATUS;
  svg.appendChild(status);

  // -- vertical SPD / ALT bars; half-height adapts so they never run off a short window --
  var barH = 160;
  function bar(label) {
    var g = el('g');
    var rule = el('line', { x1: 0, y1: -barH, x2: 0, y2: barH });
    g.appendChild(rule);
    var tick = el('line', { x1: -10, y1: 0, x2: 10, y2: 0 });
    g.appendChild(tick);
    var t = el('text', { x: 0, y: -barH - 12, 'text-anchor': 'middle' });
    t.textContent = label;
    g.appendChild(t);
    var readout = el('text', { x: 0, y: barH + 26, 'text-anchor': 'middle' });
    g.appendChild(readout);
    svg.appendChild(g);
    return { g: g, rule: rule, tick: tick, cap: t, readout: readout, frac: 0 };
  }
  function setBar(b, frac01, text) {
    b.frac = frac01;
    var y = (barH - frac01 * barH * 2).toFixed(1);
    b.tick.setAttribute('y1', y); b.tick.setAttribute('y2', y);
    if (text != null) b.readout.textContent = text;
  }
  var spd = bar('SPD'), alt = bar('ALT');

  // ---------------------------------------------------------------- radar scope
  // Heading-up: straight ahead is at the top, and a bearing to the right of the
  // nose plots to the right, so it agrees with the heading tape and the scene.
  var RAD = 100;
  var radar = el('g', { class: 'radar' });
  var radarCone, radarSweep, blips = [];
  var targets = Array.prototype.slice.call(document.querySelectorAll('.target'));

  function buildRadar() {
    radar.appendChild(el('circle', { r: RAD, fill: 'rgba(6,10,18,.55)' }));
    [RAD, RAD * 0.66, RAD * 0.33].forEach(function (r) {
      radar.appendChild(el('circle', { r: r, opacity: r === RAD ? 1 : 0.4 }));
    });
    for (var a = 0; a < 360; a += 30) {
      var big = a % 90 === 0, rad = a * Math.PI / 180;
      var s = big ? RAD - 14 : RAD - 7;
      radar.appendChild(el('line', {
        x1: (Math.sin(rad) * s).toFixed(1), y1: (-Math.cos(rad) * s).toFixed(1),
        x2: (Math.sin(rad) * RAD).toFixed(1), y2: (-Math.cos(rad) * RAD).toFixed(1),
        opacity: big ? 1 : 0.5
      }));
    }
    // the field of view you can actually see, as a wedge at the top
    radarCone = el('path', { fill: 'rgba(140,255,193,.14)', stroke: 'none' });
    radar.appendChild(radarCone);
    radarSweep = el('line', { x1: 0, y1: 0, x2: 0, y2: -RAD, opacity: 0.35 });
    radar.appendChild(radarSweep);
    radar.appendChild(el('path', { d: 'M0,-7 L5,5 L0,2 L-5,5 Z', fill: 'currentColor' })); // own ship
    var cap = el('text', { x: -RAD, y: -RAD - 10 });
    cap.textContent = 'CONTACTS';
    radar.appendChild(cap);

    targets.forEach(function (t) {
      var g = el('g', { class: 'blip' });
      g.appendChild(el('rect', { x: -4, y: -4, width: 8, height: 8 }));
      var lbl = el('text', { x: 8, y: 4 });
      lbl.textContent = (t.dataset.label || '').slice(0, 3);
      g.appendChild(lbl);
      radar.appendChild(g);
      blips.push({ g: g, el: t, yaw: parseFloat(t.dataset.yaw) || 0 });
    });
    svg.appendChild(radar);
  }

  function drawRadar(yaw) {
    // half the horizontal field of view, from the CSS perspective on #pano
    var pano = document.getElementById('pano');
    var half = 50;
    if (pano) {
      var P = parseFloat(getComputedStyle(pano).perspective);
      if (isFinite(P) && P > 0) half = Math.atan((innerWidth / 2) / P) * 180 / Math.PI;
    }
    var a0 = (-half) * Math.PI / 180, a1 = half * Math.PI / 180;
    radarCone.setAttribute('d',
      'M0,0 L' + (Math.sin(a0) * RAD).toFixed(1) + ',' + (-Math.cos(a0) * RAD).toFixed(1) +
      ' A' + RAD + ',' + RAD + ' 0 0 1 ' + (Math.sin(a1) * RAD).toFixed(1) + ',' + (-Math.cos(a1) * RAD).toFixed(1) + ' Z');
    blips.forEach(function (b) {
      var rel = shortestDelta(yaw, b.yaw) * Math.PI / 180;
      var r = RAD * 0.72;
      xf(b.g, Math.sin(rel) * r, -Math.cos(rel) * r);
      b.g.classList.toggle('is-locked', b.el.classList.contains('is-locked'));
    });
  }

  // ---------------------------------------------------------------- system gauges
  // Fictional readouts. They drift rather than sit still, so the panel reads as live.
  var GAUGES = [
    { key: 'PROP', base: 0.78, drift: 0.05, unit: '%' },
    { key: 'COOL', base: 0.61, drift: 0.09, unit: '%' },
    { key: 'PWR', base: 0.92, drift: 0.03, unit: '%' },
    { key: 'P-INT', base: 0.24, drift: 0.14, unit: '%' }
  ];
  var gaugeBox = el('g', { class: 'gauges' });
  function buildGauges() {
    var w = 108, rowH = 22;
    gaugeBox.appendChild(el('rect', { x: -6, y: -16, width: w + 54, height: GAUGES.length * rowH + 22, rx: 2, fill: 'rgba(6,10,18,.55)', opacity: 0.9 }));
    GAUGES.forEach(function (g, i) {
      var y = i * rowH;
      var lbl = el('text', { x: 0, y: y + 4 });
      lbl.textContent = g.key;
      gaugeBox.appendChild(lbl);
      gaugeBox.appendChild(el('rect', { x: 46, y: y - 6, width: w - 46, height: 9 }));
      g.fill = el('rect', { x: 47, y: y - 5, width: 1, height: 7, fill: 'currentColor', stroke: 'none' });
      gaugeBox.appendChild(g.fill);
      g.txt = el('text', { x: w + 10, y: y + 4 });
      gaugeBox.appendChild(g.txt);
    });
    svg.appendChild(gaugeBox);
  }
  function drawGauges(now) {
    GAUGES.forEach(function (g, i) {
      var v = clamp(g.base + Math.sin(now / (3100 + i * 900) + i) * g.drift, 0.02, 1);
      g.fill.setAttribute('width', (1 + v * 60).toFixed(1));
      g.txt.textContent = Math.round(v * 100) + g.unit;
      g.fill.setAttribute('fill', v < 0.2 ? 'var(--lock, #FF3347)' : 'currentColor');
    });
  }

  // ---------------------------------------------------------------- caution banner
  // Fires at random intervals, holds a few seconds, clears itself. Fictional faults.
  var CAUTIONS = [
    'PARTICLE INTERFERENCE RISING',
    'COOLANT LOOP 2 OFF NOMINAL',
    'HULL STRESS / SECTOR 7',
    'SENSOR GHOST BEARING 214',
    'PROPELLANT RESERVE LOW',
    'IFF HANDSHAKE TIMEOUT'
  ];
  var warn = el('g', { class: 'warn', opacity: 0 });
  var warnText = el('text', { x: 0, y: 5, 'text-anchor': 'middle' });
  function buildWarn() {
    warn.appendChild(el('rect', { x: -170, y: -16, width: 340, height: 30, fill: 'rgba(6,10,18,.72)' }));
    warn.appendChild(el('path', { d: 'M-152,7 L-142,-11 L-132,7 Z' }));
    warn.appendChild(el('line', { x1: -142, y1: -5, x2: -142, y2: 1 }));
    warn.appendChild(warnText);
    svg.appendChild(warn);
  }
  function scheduleCaution() {
    var wait = 9000 + Math.random() * 16000;
    setTimeout(function () {
      warnText.textContent = CAUTIONS[Math.floor(Math.random() * CAUTIONS.length)];
      warn.setAttribute('opacity', 1);
      warn.classList.toggle('is-blinking', !ARGUS.reduce);
      setTimeout(function () {
        warn.setAttribute('opacity', 0);
        warn.classList.remove('is-blinking');
        scheduleCaution();
      }, 4200);
    }, wait);
  }

  // ---------------------------------------------------------------- responsive placement
  function place() {
    W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    barH = Math.round(clamp(H * 0.2, 70, 160));
    var cx = W / 2, cy = H / 2;

    xf(hdg, cx, Math.max(40, H * 0.055));
    xf(bore, cx, cy);
    status.setAttribute('x', cx);
    status.setAttribute('y', H - Math.max(26, H * 0.05));

    [spd, alt].forEach(function (b) {
      b.rule.setAttribute('y1', -barH); b.rule.setAttribute('y2', barH);
      b.cap.setAttribute('y', -barH - 12);
      b.readout.setAttribute('y', barH + 26);
      setBar(b, b.frac);
    });
    var inset = clamp(W * 0.05, 52, 120);
    xf(spd.g, inset, cy);
    xf(alt.g, W - inset, cy);

    if (!isPage) {
      // the scope needs real estate; drop it on small screens rather than crush it
      var room = W > 760 && H > 520;
      radar.setAttribute('opacity', room ? 1 : 0);
      gaugeBox.setAttribute('opacity', room ? 1 : 0);
      xf(radar, inset + RAD + 20, H - RAD - Math.max(70, H * 0.12));
      xf(gaugeBox, inset + 12, Math.max(84, H * 0.11));  // above the SPD cap at cy-barH-12
      xf(warn, cx, clamp(H * 0.26, 90, 260));
      if (ladder) xf(ladder, cx, cy, ' rotate(' + lastRoll.toFixed(2) + ')');
      if (fpm) xf(fpm, cx, cy);
    }
  }

  var ladder = null, fpm = null, lastRoll = 0;

  if (!isPage) {
    // -- pitch ladder: rungs regenerated around the current pitch, banks slightly with vx --
    ladder = el('g');
    svg.appendChild(ladder);
    function drawLadder(pitch, roll) {
      lastRoll = roll;
      clear(ladder);
      xf(ladder, W / 2, H / 2, ' rotate(' + roll.toFixed(2) + ')');
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

    // -- flight-path marker: lags the pointer via a CSS transition, recentres when idle --
    fpm = el('g');
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
      xf(fpm, W / 2 + ox, H / 2 + oy);
      clearTimeout(fpmIdleTimer);
      fpmIdleTimer = setTimeout(function () { xf(fpm, W / 2, H / 2); }, 1500);
    });

    buildRadar(); buildGauges(); buildWarn();
    place();
    drawHeading(0); drawLadder(0, 0); drawRadar(0);

    ARGUS.on('view', function (d) {
      drawHeading(d.yaw);
      drawLadder(d.pitch, clamp((d.vx || 0) * 1.2, -6, 6));
      drawRadar(d.yaw);
      setBar(spd, clamp(Math.abs(d.vx || 0) / 6, 0, 1));
      setBar(alt, clamp((d.pitch + 12) / 24, 0, 1), (d.pitch >= 0 ? '+' : '') + Math.round(d.pitch));
    });
    ARGUS.on('lock', function (d) {
      status.textContent = d.id ? 'LOCK: ' + d.label : IDLE_STATUS;
      drawRadar(ARGUS.state.yaw);
    });
    ARGUS.on('boot-done', function () {
      status.textContent = 'ALL SYSTEMS NOMINAL';
      scheduleCaution();
    });

    // gauges tick on their own clock; cheap, and pauses with the tab
    (function tick() {
      requestAnimationFrame(tick);
      if (document.hidden) return;
      drawGauges(performance.now());
    })();
  } else {
    // -- sub-pages: reduced set, driven by scroll --
    place();
    drawHeading(0);
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

  var resizeTimer = null;
  addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(place, 120);
  });
})();
