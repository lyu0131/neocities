/* hud.js: everything inside svg#hud — heading tape, pitch ladder, FPM, boresight,
   SPD/ALT bars, radar scope, system gauges, caution banner and status line.
   Hub: driven by bunnys:view/bunnys:lock. Sub-pages (body.page): a reduced set
   driven by scroll.

   Layout is responsive: the viewBox tracks the real viewport and every group is
   placed against an edge in place(). A fixed 1920x1080 viewBox desynced from
   frame.svg's xMidYMax crop at any aspect but 16:9, which pushed the status line
   and the bottoms of both bars off screen on a wide, short window. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  var wrap360 = BUNNYS.wrap360, shortestDelta = BUNNYS.shortestDelta, clamp = BUNNYS.clamp;
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
  function pad3(n) { n = Math.round(wrap360(n)); return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; } // clock fields: 0-59, no wrap
  // avoids touching the DOM every frame for a value that only changes once a second
  function setText(node, v) { if (node.textContent !== v) node.textContent = v; }
  function cardinal(h) { return h === 0 ? 'N' : h === 90 ? 'E' : h === 180 ? 'S' : h === 270 ? 'W' : null; }
  function xf(g, x, y, extra) { g.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')' + (extra || '')); }

  // -- mechanical framing: registration-mark corner brackets, ruler tick scales and
  // stencilled part-number captions, shared by every panel so they read as machined
  // housings rather than floating rectangles. Fictional but fixed, not per-frame. --
  function corners(x0, y0, w, h, len) {
    len = len || 10;
    var g = el('g', { class: 'brackets' });
    var pts = [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]];
    g.lines = pts.map(function (c) {
      var a = el('line', {}), b = el('line', {});
      g.appendChild(a); g.appendChild(b);
      return { a: a, b: b, sx: c[2], sy: c[3] };
    });
    updateCorners(g, x0, y0, w, h, len);
    return g;
  }
  function updateCorners(g, x0, y0, w, h, len) {
    len = len || 10;
    var pts = [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]];
    g.lines.forEach(function (ln, i) {
      var x = pts[i][0], y = pts[i][1];
      ln.a.setAttribute('x1', x); ln.a.setAttribute('y1', y);
      ln.a.setAttribute('x2', (x + len * ln.sx).toFixed(1)); ln.a.setAttribute('y2', y);
      ln.b.setAttribute('x1', x); ln.b.setAttribute('y1', y);
      ln.b.setAttribute('x2', x); ln.b.setAttribute('y2', (y + len * ln.sy).toFixed(1));
    });
  }
  function tickScale(container, x0, x1, y, step) {
    for (var x = x0; x <= x1; x += step) {
      container.appendChild(el('line', { x1: x, y1: y, x2: x, y2: y + 4, opacity: .35 }));
    }
  }
  function stencil(container, x, y, anchor, text) {
    // text-anchor goes through inline style, not just the attribute: the dossier's
    // own `text { text-anchor: middle }` rule would otherwise win and re-centre it
    var t = el('text', {
      x: x, y: y, 'text-anchor': anchor, class: 'stencil',
      style: 'font-size:7px;opacity:.55;letter-spacing:.08em;text-anchor:' + anchor
    });
    t.textContent = text;
    container.appendChild(t);
    return t;
  }
  // fictional identifiers, invented once and reused everywhere so they stay
  // consistent across redraws instead of drifting per frame
  var UNIT_SERIAL = 'RX-124', BLOCK_REV = 'BLOCK 04C';

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
    // Ticks belong to absolute headings and the tape slides past them. Generating them at
    // offsets from the rounded heading made a tick's value round(yaw) + d, so the 15-degree
    // labels only existed when round(yaw) was itself a multiple of 5: the numbers vanished
    // from the tape completely for four headings out of every five while turning.
    var first = Math.ceil((yaw - span) / step) * step;
    for (var a = first; a <= yaw + span; a += step) {
      var heading = wrap360(a);
      var major = heading % 15 === 0;
      var x = (a - yaw) * px;
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
  var IDLE_STATUS = 'ALL SYSTEMS NOMINAL';
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
    return { g: g, rule: rule, tick: tick, cap: t, readout: readout, frac: 0, want: 0, cur: null };
  }
  // SPD and ALT are fed by drag velocity and pitch, both of which jump about. Store the
  // target and let a frame loop ease the needle onto it, so the bars glide.
  function setBar(b, frac01, text) {
    b.want = frac01;
    if (text != null) b.readout.textContent = text;
  }
  function drawBar(b, dt) {
    if (b.cur == null) b.cur = b.want;
    b.cur += (b.want - b.cur) * (1 - Math.pow(0.0006, dt));
    b.frac = b.cur;
    var y = (barH - b.cur * barH * 2).toFixed(1);
    b.tick.setAttribute('y1', y); b.tick.setAttribute('y2', y);
  }
  var spd = bar('SPD'), alt = bar('ALT');

  // ---------------------------------------------------------------- radar scope
  // Heading-up: straight ahead is at the top, and a bearing to the right of the
  // nose plots to the right, so it agrees with the heading tape and the scene.
  var RAD = 108;   // with PAD 16 this makes the radar housing 248 -- exactly PANEL_W
  var radar = el('g', { class: 'radar' });
  var radarCone, blips = [];
  var targets = Array.prototype.slice.call(document.querySelectorAll('.target'));

  // R_HEAD: the band above the scope holding the header and its rule, on the same
  // header/rule/tick rhythm as buildPanel so SENSOR ARRAY lines up with the panels
  var PAD = 16, R_HEAD = 44;
  // the scanning sweep: a rotating arm with a decaying phosphor trail behind it,
  // and blips that brighten as the arm passes their bearing then fade back down
  var SWEEP_MS = 3400, SWEEP_RATE = 360 / SWEEP_MS, SWEEP_PARK = 0;
  var SWEEP_TRAIL = 6, SWEEP_STEP = 10; // SWEEP_TRAIL * SWEEP_STEP deg of decay behind the arm
  var SWEEP_BEAM = 4, SWEEP_DECAY = 900; // deg either side that "lights" a blip; ms to fade
  var sweepGroup;
  function buildRadar() {
    // housing first, so the scope sits inside a panel rather than floating on the scene
    var w = RAD * 2 + PAD * 2, h = R_HEAD + RAD * 2 + PAD;
    var bx = -w / 2, by = -RAD - R_HEAD, headRuleY = by + G_PAD + 20;
    radar.appendChild(el('rect', { x: bx, y: by, width: w, height: h, rx: 3, fill: 'rgba(6,10,18,.97)' }));
    radar.appendChild(corners(bx, by, w, h));
    radar.appendChild(el('line', { x1: bx + G_PAD, y1: headRuleY, x2: bx + w - G_PAD, y2: headRuleY, opacity: .55 }));
    tickScale(radar, bx + G_PAD, bx + w - G_PAD, headRuleY, 12);
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
    // sweep: sits under the own-ship marker and the blips, so it never swamps them
    sweepGroup = el('g', { class: 'sweep' });
    for (var si = 0; si < SWEEP_TRAIL; si++) {
      var a1 = -si * SWEEP_STEP, a0 = -(si + 1) * SWEEP_STEP;
      var x1 = (Math.sin(a1 * Math.PI / 180) * RAD).toFixed(1), y1 = (-Math.cos(a1 * Math.PI / 180) * RAD).toFixed(1);
      var x0 = (Math.sin(a0 * Math.PI / 180) * RAD).toFixed(1), y0 = (-Math.cos(a0 * Math.PI / 180) * RAD).toFixed(1);
      sweepGroup.appendChild(el('path', {
        d: 'M0,0 L' + x1 + ',' + y1 + ' A' + RAD + ',' + RAD + ' 0 0 0 ' + x0 + ',' + y0 + ' Z',
        fill: 'rgba(140,255,193,' + (0.18 * (1 - si / SWEEP_TRAIL)).toFixed(2) + ')', stroke: 'none'
      }));
    }
    sweepGroup.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: -RAD, opacity: .9 }));
    radar.appendChild(sweepGroup);
    radar.appendChild(el('path', { d: 'M0,-7 L5,5 L0,2 L-5,5 Z', fill: 'currentColor' })); // own ship
    var cap = el('text', { x: bx + G_PAD, y: by + G_PAD + 11 });
    cap.textContent = 'SENSOR ARRAY';
    radar.appendChild(cap);
    stencil(radar, bx + w - G_PAD, by + h - 7, 'end', UNIT_SERIAL + ' \u00B7 BNS-SNS-7741A');

    targets.forEach(function (t) {
      var g = el('g', { class: 'blip' });
      var glow = el('rect', { x: -7, y: -7, width: 14, height: 14, fill: 'currentColor', stroke: 'none', opacity: 0 });
      g.appendChild(glow);
      g.appendChild(el('rect', { x: -4, y: -4, width: 8, height: 8 }));
      var lbl = el('text', { x: 8, y: 4 });
      lbl.textContent = (t.dataset.label || '').slice(0, 3);
      g.appendChild(lbl);
      radar.appendChild(g);
      blips.push({ g: g, el: t, yaw: parseFloat(t.dataset.yaw) || 0, glow: glow, dispAngle: 0, litAt: null });
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
      b.dispAngle = shortestDelta(yaw, b.yaw); // remembered for drawSweep's beam check
      var rel = b.dispAngle * Math.PI / 180;
      var r = RAD * 0.72;
      xf(b.g, Math.sin(rel) * r, -Math.cos(rel) * r);
      b.g.classList.toggle('is-locked', b.el.classList.contains('is-locked'));
    });
  }

  function drawSweep(now) {
    var angle = BUNNYS.reduce ? SWEEP_PARK : (now * SWEEP_RATE) % 360;
    sweepGroup.setAttribute('transform', 'rotate(' + angle.toFixed(1) + ')');
    if (BUNNYS.reduce) return; // reduced motion: parked arm, blips left at their steady brightness
    blips.forEach(function (b) {
      if (Math.abs(shortestDelta(angle, b.dispAngle)) < SWEEP_BEAM) b.litAt = now;
      var bright = b.litAt == null ? 0 : clamp(1 - (now - b.litAt) / SWEEP_DECAY, 0, 1);
      b.glow.style.opacity = bright;
    });
  }

  // ---------------------------------------------------------------- system gauges
  // Fictional readouts. They drift rather than sit still, so the panel reads as live.
  function fmtVector(v) { var d = (v - 0.5) * 24; return (d >= 0 ? '+' : '') + d.toFixed(0) + '°'; }
  function fmtLink(v) { return v > 0.5 ? 'LINKED' : 'STANDBY'; }
  function fmtHardpoint(v) { return Math.max(1, Math.round(v * 6)) + '/6'; }
  // ------------------------------------------------------- instrument panels
  // Three panels, one builder, ONE width. This used to be a single hardcoded COMBAT
  // SYSTEM whose width fell out of its own content (204) while the damage map was 194 and
  // the slew panel 194 -- three widths across two columns, which is what made the columns
  // read as misaligned however carefully each box was positioned. PANEL_W is now the width
  // every column instrument is drawn at, and place() scales a whole column down together
  // when the gutter is too narrow for it, so the edges stay flush at every size.
  //
  // Each panel also carries its OWN extra instrument, so three boxes of bars don't read as
  // one panel repeated: the reactor gets the interference trace and the bus lamps, the
  // thrusters an attitude cross, the combat panel its hardpoint cells.
  var PANEL_W = 248, G_PAD = 14, rowH = 17;
  var LAMPS = ['IFF', 'LNK', 'NAV', 'GYR', 'THM', 'AUX', 'CORE']; // AUXILIARY BUS, CORE BLOCK
  // ENVIRONMENT's wind arrow: shape and radius live together so a future edit to one
  // is a prompt to check the other. WIND_ARROW_R is this shape's farthest vertex from
  // its own rotation origin (the tip, at (3.5,4): sqrt(3.5^2+4^2)) -- a polygon never
  // reaches farther from its origin than its farthest vertex, at any rotation, so this
  // is a true upper bound on how far the arrow can swing toward the value text next to it.
  var WIND_ARROW_D = 'M0,-5 L3.5,4 L0,1.5 L-3.5,4 Z';
  var WIND_ARROW_R = Math.sqrt(3.5 * 3.5 + 4 * 4);
  var PANELS = [
    { id: 'reactor', title: 'REACTOR STATUS', code: 'BNS-PWR-118R', extra: 'spark',
      rows: [{ key: 'OUTPT', base: 0.94, drift: 0.03 },
             { key: 'COOL', base: 0.65, drift: 0.09 },
             { key: 'P-INT', base: 0.38, drift: 0.16 },   // PARTICLE INTERFERENCE
             { key: 'CORE', base: 0.88, drift: 0.04 },    // CORE BLOCK
             { key: 'FLUX', base: 0.62, drift: 0.12 }] },
    { id: 'thruster', title: 'THRUSTER VECTOR', code: 'BNS-THR-204V', extra: 'cross',
      rows: [{ key: 'MAIN', base: 0.90, drift: 0.06 },
             { key: 'VRN-A', base: 0.72, drift: 0.11 },
             { key: 'VRN-B', base: 0.68, drift: 0.13 },
             { key: 'VRN-C', base: 0.75, drift: 0.09 }] },
    { id: 'combat', title: 'COMBAT SYSTEM', code: 'BNS-SYS-206C', extra: 'cells',
      rows: [{ key: 'SENSR', base: 0.70, drift: 0.11 },   // SENSOR ARRAY
             { key: 'FRAME', base: 0.88, drift: 0.04 },   // FRAME INTEGRITY
             { key: 'THR-V', base: 0.50, drift: 0.30, fmt: fmtVector },
             { key: 'WPN-L', base: 0.85, drift: 0.10, fmt: fmtLink },
             { key: 'HDPT', base: 0.83, drift: 0.15, fmt: fmtHardpoint }] },
    // Appended, not inserted -- PANELS[0..2] above keep the indices drawPanels() and
    // place() already key off of. rows: [] skips the bar-row loop in buildPanel below;
    // this panel's whole body is its own 'env' branch instead.
    { id: 'env', title: 'ENVIRONMENT', code: 'BNS-ENV-077W', extra: 'env', rows: [] }
  ];
  var sparkPts = [];

  // The two column lanes: a hairline down the middle of each gutter, which every
  // instrument in that column is centred on. Structure rather than decoration -- the
  // panels sit on top of it, so it shows only in the gaps and ties a column of separate
  // boxes into one line of instruments.
  var lane = el('g', { class: 'lane', opacity: 0 });
  var laneRuleL = el('line', { opacity: .22 });
  var laneRuleR = el('line', { opacity: .22 });
  function buildLane() {
    lane.appendChild(laneRuleL);
    lane.appendChild(laneRuleR);
    svg.appendChild(lane);   // appended first, so every panel paints over it
  }

  function buildPanel(spec) {
    var g = el('g', { class: 'panel' });
    // the group's origin is the housing's top-left corner, so place() positions a panel by
    // the same x/y it would use for any other box -- no padding offset to remember
    var x0 = G_PAD, x1 = PANEL_W - G_PAD, inner = x1 - x0;
    // label | bar | value, with a 10px gutter each side of the bar. The value column is
    // sized for the widest string it ever shows (STANDBY), not for a percentage.
    var labelW = 52, pctW = 64, barX = x0 + labelW, barW = inner - labelW - pctW - 10;
    // header a full line below the housing edge: at the old 9px baseline the caps touched
    // the top of the box, which is what read as the text being against the edge
    var headerY = G_PAD + 11, ruleY = headerY + 9, rowsY = ruleY + 17;

    spec.bg = el('rect', { x: 0, y: 0, width: PANEL_W, height: 10, rx: 3, fill: 'rgba(6,10,18,.97)' });
    g.appendChild(spec.bg);
    spec.cn = corners(0, 0, PANEL_W, 10);
    g.appendChild(spec.cn);
    var hdr = el('text', { x: x0, y: headerY });
    hdr.textContent = spec.title;
    g.appendChild(hdr);
    g.appendChild(el('line', { x1: x0, y1: ruleY, x2: x1, y2: ruleY, opacity: .55 }));
    tickScale(g, x0, x1, ruleY, 12);

    spec.rows.forEach(function (r, i) {
      var ry = rowsY + i * rowH;
      var lbl = el('text', { x: x0, y: ry + 4 });
      lbl.textContent = r.key;
      g.appendChild(lbl);
      g.appendChild(el('rect', { x: barX, y: ry - 6, width: barW, height: 9 }));
      r.fill = el('rect', { x: barX + 1, y: ry - 5, width: 1, height: 7, fill: 'currentColor', stroke: 'none' });
      g.appendChild(r.fill);
      r.txt = el('text', { x: x1, y: ry + 4, 'text-anchor': 'end' });
      g.appendChild(r.txt);
      r.barW = barW;
    });

    var y = rowsY + spec.rows.length * rowH + 2;
    if (spec.extra === 'spark') {
      var sl = el('text', { x: x0, y: y + 10 });
      sl.textContent = 'P-INT TREND';
      g.appendChild(sl);
      spec.sparkY = y + 18;
      g.appendChild(el('rect', { x: x0, y: spec.sparkY, width: inner, height: 30, opacity: .45 }));
      spec.spark = el('polyline', { points: '', opacity: .9 });
      g.appendChild(spec.spark);
      y = spec.sparkY + 30 + 16;
      g.appendChild(el('line', { x1: x0, y1: y - 8, x2: x1, y2: y - 8, opacity: .35 }));
      spec.lamps = [];
      var step = inner / LAMPS.length;
      LAMPS.forEach(function (name, i) {
        var lx = x0 + i * step;
        g.appendChild(el('rect', { x: lx, y: y, width: step - 8, height: 11, opacity: .8 }));
        var pip = el('rect', { x: lx + 2, y: y + 2, width: step - 12, height: 7, fill: 'currentColor', stroke: 'none' });
        var t = el('text', { x: lx + (step - 8) / 2, y: y + 22, 'text-anchor': 'middle', style: 'font-size:8px' });
        t.textContent = name;
        g.appendChild(pip); g.appendChild(t);
        spec.lamps.push(pip);
      });
      y += 30;
    } else if (spec.extra === 'cross') {
      // the one instrument here that shows a direction rather than a level
      var side = 62, ccx = x0 + inner / 2, ccy = y + side / 2;
      g.appendChild(el('rect', { x: ccx - side / 2, y: y, width: side, height: side, opacity: .45 }));
      g.appendChild(el('line', { x1: ccx - side / 2, y1: ccy, x2: ccx + side / 2, y2: ccy, opacity: .3 }));
      g.appendChild(el('line', { x1: ccx, y1: y, x2: ccx, y2: y + side, opacity: .3 }));
      for (var k = -1; k <= 1; k += 2) {
        g.appendChild(el('line', { x1: ccx + k * 16, y1: ccy - 4, x2: ccx + k * 16, y2: ccy + 4, opacity: .5 }));
        g.appendChild(el('line', { x1: ccx - 4, y1: ccy + k * 16, x2: ccx + 4, y2: ccy + k * 16, opacity: .5 }));
      }
      spec.crossC = [ccx, ccy, side / 2 - 6];
      spec.dot = el('circle', { cx: ccx, cy: ccy, r: 3.5, fill: 'currentColor', stroke: 'none' });
      g.appendChild(spec.dot);
      spec.roll = el('text', { x: x0, y: y + side + 15 });
      g.appendChild(spec.roll);
      spec.pitch = el('text', { x: x1, y: y + side + 15, 'text-anchor': 'end' });
      g.appendChild(spec.pitch);
      y += side + 23;
    } else if (spec.extra === 'cells') {
      var hl = el('text', { x: x0, y: y + 10 });
      hl.textContent = 'HARDPOINT STATUS';
      g.appendChild(hl);
      y += 18;
      spec.cells = [];
      var n = 6, cw = inner / n;
      for (var c = 0; c < n; c++) {
        var cxp = x0 + c * cw;
        g.appendChild(el('rect', { x: cxp, y: y, width: cw - 6, height: 16, opacity: .7 }));
        var cell = el('rect', { x: cxp + 2, y: y + 2, width: cw - 10, height: 12, fill: 'currentColor', stroke: 'none' });
        g.appendChild(cell);
        var ct = el('text', { x: cxp + (cw - 6) / 2, y: y + 28, 'text-anchor': 'middle', style: 'font-size:8px' });
        ct.textContent = 'H' + (c + 1);
        g.appendChild(ct);
        spec.cells.push(cell);
      }
      y += 36;
    } else if (spec.extra === 'env') {
      // three fake weather rows on the bar rows' own label/value rhythm -- rows: []
      // left spec.rows.forEach above with nothing to draw, so this is the whole panel
      ['WX', 'WIND', 'PRECIP'].forEach(function (label, i) {
        var ry = y + i * rowH;
        var lbl = el('text', { x: x0, y: ry + 4 });
        lbl.textContent = label;
        g.appendChild(lbl);
        var key = label === 'WX' ? 'wx' : label === 'WIND' ? 'wind' : 'precip';
        spec[key] = el('text', { x: x1, y: ry + 4, 'text-anchor': 'end' });
        g.appendChild(spec[key]);
        if (label === 'WIND') {
          // tip points at the compass heading the wind comes from. x is re-measured in
          // drawPanels off the value text's own rendered width -- "240 12 KT" and
          // "232 9 KT" aren't the same width, and pctW (sized for a percentage) is
          // narrower than either, so a fixed x here would run the arrow into the digits
          spec.windArrow = el('path', { d: WIND_ARROW_D, fill: 'currentColor', stroke: 'none' });
          spec.windArrowY = ry + 1;
          g.appendChild(spec.windArrow);
        }
      });
      y += 3 * rowH + 2;

      // the clock: this panel's own instrument, the way the reactor has its trace and
      // the thruster its cross -- and the one reading here that isn't fake
      spec.clockTime = el('text', { x: x0, y: y + 14, style: 'font-size:16px' });
      g.appendChild(spec.clockTime);
      spec.clockDate = el('text', { x: x1, y: y + 14, 'text-anchor': 'end' });
      g.appendChild(spec.clockDate);
      y += 24;
    }

    var h = y + G_PAD;
    spec.h = h;
    spec.bg.setAttribute('height', h);
    updateCorners(spec.cn, 0, 0, PANEL_W, h);
    stencil(g, x1, h - 7, 'end', UNIT_SERIAL + ' · ' + spec.code);
    spec.g = g;
    svg.appendChild(g);
  }
  function buildPanels() { PANELS.forEach(buildPanel); }

  function drawPanels(now) {
    PANELS.forEach(function (spec, pi) {
      spec.rows.forEach(function (r, i) {
        var v = clamp(r.base + Math.sin(now / (3100 + i * 900 + pi * 370) + i + pi) * r.drift, 0.02, 1);
        r.fill.setAttribute('width', (1 + v * (r.barW - 2)).toFixed(1));
        r.txt.textContent = r.fmt ? r.fmt(v) : Math.round(v * 100) + '%';
        r.fill.setAttribute('fill', v < 0.2 ? 'var(--lock, #FF3347)' : 'currentColor');
      });
      if (spec.extra === 'cross') {
        // drifts around the centre rather than tracking the view: this is the suit's
        // thrust vector, not the camera
        var a = clamp(Math.sin(now / 2600) * 0.8 + Math.sin(now / 910) * 0.3, -1, 1);
        var b = clamp(Math.cos(now / 3100) * 0.7 + Math.sin(now / 1270) * 0.3, -1, 1);
        spec.dot.setAttribute('cx', (spec.crossC[0] + a * spec.crossC[2]).toFixed(1));
        spec.dot.setAttribute('cy', (spec.crossC[1] + b * spec.crossC[2]).toFixed(1));
        spec.roll.textContent = 'ROLL ' + (a * 24).toFixed(0) + '°';
        spec.pitch.textContent = (b * 18).toFixed(0) + '° PITCH';
      } else if (spec.extra === 'cells') {
        spec.cells.forEach(function (cell, i) {
          var on = Math.sin(now / (2300 + i * 480) + i) > -0.55;
          cell.setAttribute('fill', on ? 'currentColor' : 'rgba(140,255,193,.16)');
        });
      } else if (spec.extra === 'env') {
        // fake weather: drifting sines like the bar rows above, held still under
        // reduced motion since it's decoration, not the clock below (that's information)
        var hold = BUNNYS.reduce;
        var temp = 14.2 + (hold ? 0 : Math.sin(now / 5000) * 0.4);
        setText(spec.wx, 'LIGHT RAIN ' + temp.toFixed(1) + '°C');

        var windDeg = 240 + (hold ? 0 : Math.sin(now / 6100) * 8);
        var windKt = 12 + (hold ? 0 : Math.sin(now / 4300 + 1) * 3);
        var windStr = windDeg.toFixed(0) + '° ' + windKt.toFixed(0) + ' KT';
        if (spec.wind.textContent !== windStr) {
          spec.wind.textContent = windStr;
          // just left of the value text's own rendered box, not a fixed offset --
          // "232 9 KT" and "248 15 KT" aren't the same width. WIND_ARROW_R clears the
          // shape's own farthest point from its rotation origin at any heading; the
          // +6 beyond that is the clearance still owed to the text, so together they
          // guarantee a real gap by construction instead of by the current numbers
          // happening not to collide
          spec.windArrowX = spec.wind.getBBox().x - WIND_ARROW_R - 6;
        }
        spec.windArrow.setAttribute('transform', 'translate(' + spec.windArrowX.toFixed(1) + ',' +
          spec.windArrowY.toFixed(1) + ') rotate(' + windDeg.toFixed(1) + ')');

        var precip = 3.75 + (hold ? 0 : Math.sin(now / 3700 + 2) * 1.25);
        setText(spec.precip, precip.toFixed(1) + ' MM/H');

        // the viewer's own clock, not a prop -- rewritten only when its string changes,
        // same as the fake rows above, so a steady second doesn't touch the DOM 60x/s
        var d = new Date();
        setText(spec.clockTime, pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()));
        setText(spec.clockDate, d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()));
      }
    });

    // A live interference trace, not a clean waveform: a slow drift, three beating
    // harmonics that never line up, and a noise floor that occasionally bursts. The
    // spikes clip against the clamp below, which is what interference should look like.
    // Sample on a fixed 30ms clock, not once per frame. Per frame the 58-point buffer held
    // under a second of signal, so the slow components just slid the whole trace up and
    // down instead of shaping it -- and the trace scrolled at whatever frame rate the
    // machine happened to run at. At 30ms the window is 1.7s, so every band below shows.
    var rx = PANELS[0];
    if (now >= (drawPanels.nextPt || 0)) {
      drawPanels.nextPt = now + 30;
      var burst = Math.sin(now / 3100) > 0.55 ? 1.25 : 0.32;
      sparkPts.push(Math.sin(now / 900) * 0.3 + Math.sin(now / 430) * 0.3
                  + Math.sin(now / 173) * 0.22 + Math.sin(now / 67) * 0.13
                  + (Math.random() - 0.5) * burst);
      if (sparkPts.length > 58) sparkPts.shift();
    }
    if (rx.spark) {
      var stepX = (PANEL_W - G_PAD * 2) / 58;
      rx.spark.setAttribute('points', sparkPts.map(function (v, i) {
        return (G_PAD + i * stepX).toFixed(1) + ',' + (rx.sparkY + 15 - clamp(v, -1, 1) * 12).toFixed(1);
      }).join(' '));
    }
    if (rx.lamps) rx.lamps.forEach(function (pip, i) {
      var on = Math.sin(now / (1700 + i * 600) + i * 2) > -0.75;
      pip.setAttribute('fill', on ? 'currentColor' : 'rgba(140,255,193,.18)');
    });
  }

  // ---------------------------------------------------------------- damage map
  // A rotating diagram of the suit, baked into js/dmgmap.js by tools/gen_dmgmap.py as
  // 24 frames (one per 15 degrees) of 8 zone paths plus a per-frame paint order (zones
  // overlap in projection -- without reordering an arm paints over the torso). Read
  // w/h/frame count off the data at runtime: the source mesh has already been
  // re-scaled once and will be again. Degrades to nothing if the data never loaded.
  // DMG_W tracks PANEL_W: the damage map is a column instrument like any other, and it
  // being 194 while COMBAT SYSTEM was 204 is half of why the columns looked ragged.
  var DMG_W = PANEL_W, DMG_PAD = 10, DMG_MIN_H = 110, DMG_MIN_SIDE = 90;
  // Text needs a bigger inset than the art does: the corner brackets occupy the first and
  // last 10px of each edge, so header and stencil set at DMG_PAD sat exactly flush against
  // them and read as touching the box. G_PAD matches the other panels' text inset exactly,
  // so all four headers start on the same line as each other.
  var DMG_TEXT_PAD = G_PAD;
  var dmgBox, dmgBg, dmgCorners, dmgStencil, dmgArt, dmgArtTop = 0, dmgOn = false;
  var dmgPaths = [], dmgZones = null, dmgStep = 15;
  // idle | ease (spinning to front-on the short way round) | hold (fronted, flashing)
  var dmgState = 'idle', dmgPhase = 0, dmgHoldUntil = 0, dmgLastIdx = -1, dmgH = 0;
  function buildDamage() {
    var D = window.BUNNYS_DMG;
    if (!D) return; // no data baked -- panel simply never exists
    // same vertical rhythm as buildPanel: at the old 9px baseline the header's caps sat
    // hard against the top edge of the housing, which is what read as touching
    var headerY = G_PAD + 11, ruleY = headerY + 9;
    dmgArtTop = ruleY + 12;
    dmgBox = el('g', { class: 'dmgmap', opacity: 0 });
    dmgBg = el('rect', { x: 0, y: 0, width: DMG_W, height: 10, rx: 3, fill: 'rgba(6,10,18,.97)' });
    dmgBox.appendChild(dmgBg);
    dmgCorners = corners(0, 0, DMG_W, 10);
    dmgBox.appendChild(dmgCorners);
    var hdr = el('text', { x: DMG_TEXT_PAD, y: headerY });
    hdr.textContent = 'DIAGNOSTIC MODE';
    dmgBox.appendChild(hdr);
    dmgBox.appendChild(el('line', { x1: DMG_TEXT_PAD, y1: ruleY, x2: DMG_W - DMG_TEXT_PAD, y2: ruleY, opacity: .55 }));
    tickScale(dmgBox, DMG_TEXT_PAD, DMG_W - DMG_TEXT_PAD, ruleY, 12);
    // the scaled artwork: 8 zone paths, built once and never recreated -- drawDamage
    // only rewrites their `d` and re-appends them in the current frame's paint order
    dmgArt = el('g', { class: 'dmg-art' });
    dmgBox.appendChild(dmgArt);
    dmgZones = {};
    D.zones.forEach(function (z) {
      // explicit fill attribute, not just a class: #hud path:not([fill]) forces
      // fill:none on anything that doesn't carry one, which would blank every zone
      var p = el('path', { class: 'dmg-zone', fill: 'rgba(140,255,193,.16)' });
      dmgArt.appendChild(p);
      dmgPaths.push(p);
      dmgZones[z.id] = { path: p, state: 'nominal', since: 0 };
    });
    dmgStep = 360 / D.frames.length;
    dmgStencil = stencil(dmgBox, DMG_W - DMG_TEXT_PAD, 0, 'end', UNIT_SERIAL + ' · BNS-DMG-220C');
    svg.appendChild(dmgBox);
    setFrame(0);
  }
  // sizes and positions the housing for the vertical space place() hands it, or
  // stands it down cleanly (opacity 0, rotation paused) when that space is too tight.
  // The housing shrink-wraps to the art instead of stretching to fill whatever range
  // place() hands over -- a tall mostly-empty box read as unfinished. Anchored to the
  // *bottom* of that range (flush above COMBAT SYSTEM) so anything the shrink frees up
  // opens as blank scene above the map, under the tape, rather than as a gap between
  // the two panels.
  function layoutDamage(x, top, bottom, room, sc) {
    var D = window.BUNNYS_DMG;
    if (!D || !dmgBox) return;
    sc = sc || 1;
    var avail = (bottom - top) / sc;   // measure in the panel's own units, then scale once
    // The art region is a SQUARE, by request -- a tall box with a small suit adrift in it
    // read as unfinished. Its side is the housing's inner width, unless the column is too
    // short for that, in which case it shrinks to whatever height is on offer.
    var side = Math.min(DMG_W - DMG_PAD * 2, avail - dmgArtTop - DMG_PAD);
    dmgOn = !!room && avail >= DMG_MIN_H && side >= DMG_MIN_SIDE;
    dmgBox.setAttribute('opacity', dmgOn ? 1 : 0);
    if (!dmgOn) return;
    // Fit the artwork inside that square on whichever axis constrains it. Do NOT assume
    // portrait: the source mesh is re-scaled from time to time and the art has already
    // been both taller and wider than square.
    var scale = Math.min(side / D.w, side / D.h);
    var artW = D.w * scale, artH = D.h * scale;
    var h = dmgArtTop + side + DMG_PAD;          // housing shrink-wraps the square art
    xf(dmgBox, x, top, ' scale(' + sc.toFixed(4) + ')');   // top of the column
    dmgBg.setAttribute('height', h);
    dmgH = h * sc;
    updateCorners(dmgCorners, 0, 0, DMG_W, h);
    dmgStencil.setAttribute('y', h - 6);
    xf(dmgArt, (DMG_W - artW) / 2, dmgArtTop + (side - artH) / 2,
       ' scale(' + scale.toFixed(4) + ')');
  }
  function setFrame(idx) {
    var D = window.BUNNYS_DMG;
    if (!D || idx === dmgLastIdx) return;
    dmgLastIdx = idx;
    var f = D.frames[idx];
    for (var i = 0; i < dmgPaths.length; i++) dmgPaths[i].setAttribute('d', f.d[i]);
    for (var j = 0; j < f.order.length; j++) dmgArt.appendChild(dmgPaths[f.order[j]]);
  }
  // public entry point -- Task 3 calls this when a zone is hit. No-ops cleanly if
  // the damage map never built (no window.BUNNYS_DMG).
  function setZone(id, state) {
    if (!dmgZones) return;
    var z = dmgZones[id];
    if (!z) return;
    z.state = state;
    z.since = performance.now();
    z.path.classList.remove('is-caution', 'is-hit');
    if (state === 'caution') z.path.classList.add('is-caution');
    else if (state === 'hit') {
      z.path.classList.add('is-hit');
      if (dmgState === 'idle') dmgState = 'ease'; // spin to front-on the short way round
    }
  }
  function drawDamage(now, dt) {
    if (!dmgOn) return;
    var D = window.BUNNYS_DMG;
    if (BUNNYS.reduce) {
      setFrame(0); // pinned, never advances
    } else {
      if (dmgState === 'hold') {
        if (now >= dmgHoldUntil) dmgState = 'idle';
      } else if (dmgState === 'ease') {
        var delta = shortestDelta(dmgPhase, 0), step = 720 * dt;
        if (Math.abs(delta) <= step) { dmgPhase = 0; dmgState = 'hold'; dmgHoldUntil = now + 3000; }
        else dmgPhase = wrap360(dmgPhase + (delta > 0 ? step : -step));
      } else {
        dmgPhase = wrap360(dmgPhase + dmgStep * 12 * dt); // idle: ~12fps through the ring
      }
      setFrame(Math.floor(dmgPhase / dmgStep) % D.frames.length);
    }
    for (var id in dmgZones) {
      var z = dmgZones[id];
      if (z.state !== 'nominal' && now - z.since >= 3000) {
        z.state = 'nominal';
        z.path.classList.remove('is-caution', 'is-hit');
      }
    }
  }

  // ---------------------------------------------------------------- target dossier
  // Filled whenever a target is acquired -- by hover, by keyboard focus, or by putting
  // the boresight on it. cockpit.js decides; this only renders.
  var dossier = el('g', { class: 'dossier', opacity: 0 });
  var dosLabel = el('text', { x: 0, y: 8, class: 'dos-title' });
  var dosRead = el('text', { x: 0, y: 30, class: 'dim' });
  // `#hud .dossier text` forces text-anchor:middle in cockpit.css; an inline style
  // beats that stylesheet rule (a bare attribute would not), so the start/end
  // alignment has to be set inline here to actually take effect
  var DOS_CAP_STYLE = 'font-size:10px;letter-spacing:.12em;opacity:.75;text-anchor:';
  var dosCap = el('text', { x: -200, y: -20, class: 'dos-cap', style: DOS_CAP_STYLE + 'start' });
  var dosSeq = el('text', { x: 200, y: -20, 'text-anchor': 'end', class: 'dos-seq', style: DOS_CAP_STYLE + 'end' });
  var dosBrief = [], dosHint = el('text', { x: 0, y: 0, class: 'dos-hint' });
  var dosBox, dosRule, dosSeqTimer = null, dosLastId = null;
  function buildDossier() {
    // TARGET ACQUISITION / LOCK SEQUENCE overline, then name, readout, rule, brief, hint
    var ruleY = 42, briefY0 = 64, briefStep = 18;
    var hintY = briefY0 + 2 * briefStep + 32;
    var boxTop = -36, boxBottom = hintY + 26, padX = 220; // extra room below the hint for the stencil line
    dosCap.textContent = 'TARGET ACQUISITION';
    dosBox = el('rect', { x: -padX, y: boxTop, width: padX * 2, height: boxBottom - boxTop, rx: 3, fill: 'rgba(6,10,18,.97)' });
    dossier.appendChild(dosBox);
    dossier.appendChild(corners(-padX, boxTop, padX * 2, boxBottom - boxTop));
    dossier.appendChild(el('rect', { x: -padX + 6, y: boxTop + 6, width: padX * 2 - 12, height: boxBottom - boxTop - 12, rx: 2, opacity: .45 }));
    dossier.appendChild(dosCap); dossier.appendChild(dosSeq);
    dosRule = el('line', { x1: -200, y1: ruleY, x2: 200, y2: ruleY, opacity: .5 });
    dossier.appendChild(dosLabel); dossier.appendChild(dosRead); dossier.appendChild(dosRule);
    tickScale(dossier, -200, 200, ruleY, 20);
    for (var i = 0; i < 3; i++) {
      var t = el('text', { x: 0, y: briefY0 + i * briefStep, class: 'dim' });
      dosBrief.push(t); dossier.appendChild(t);
    }
    dosHint.setAttribute('y', hintY);
    dossier.appendChild(dosHint);
    stencil(dossier, padX - 6, boxBottom - 8, 'end', 'BNS-TAQ-330B · ' + BLOCK_REV);
    svg.appendChild(dossier);
  }
  function setDossier(d) {
    if (!d || !d.id) { dossier.setAttribute('opacity', 0); clearTimeout(dosSeqTimer); dosLastId = null; return; }
    dosLabel.textContent = d.label || '';
    dosRead.textContent = d.readout || '';
    var lines = (d.brief || '').split('|');
    dosBrief.forEach(function (t, i) { t.textContent = lines[i] || ''; });
    // IFF STATUS: a target with an approach (href) reads as a friendly/known contact;
    // the unknown target (no href) never resolves an IFF handshake
    var iff = d.href ? 'IFF STATUS: FRIEND' : 'IFF STATUS: NO IFF';
    dosHint.textContent = (d.href ? 'PRESS ENTER OR CLICK TO OPEN' : 'NO APPROACH AUTHORISED') + ' — ' + iff;
    if (d.id !== dosLastId) {
      // LOCK SEQUENCE: acquiring for the same 350ms the target's own bracket
      // close-in takes (see .target transition in cockpit.css), then locked
      dosLastId = d.id;
      dosSeq.textContent = 'LOCK SEQUENCE: ACQUIRING';
      // `#hud text { fill: currentColor }` beats a plain fill attribute, same as the
      // text-anchor issue above, so the colour has to go through inline style too
      dosSeq.style.fill = 'var(--amber, #FFB02E)';
      dosSeq.classList.add('is-acquiring'); dosSeq.classList.remove('is-locked');
      clearTimeout(dosSeqTimer);
      dosSeqTimer = setTimeout(function () {
        dosSeq.textContent = 'LOCK SEQUENCE: LOCKED';
        dosSeq.style.fill = 'var(--lock, #FF3347)';
        dosSeq.classList.remove('is-acquiring'); dosSeq.classList.add('is-locked');
      }, 350);
    }
    dossier.setAttribute('opacity', 1);
  }

  // ---------------------------------------------------------------- caution banner
  // Fires at random intervals, holds a few seconds, clears itself. Fictional faults.
  // [text, zoneId|null] -- a caution that names a zone flashes it amber on the damage
  // map (setZone(zone,'caution')); the rest are just banner text, same as before.
  var CAUTIONS = [
    ['PARTICLE INTERFERENCE RISING', null],
    ['COOLANT LOOP 2 OFF NOMINAL', null],
    ['FRAME INTEGRITY: SECTOR 7 STRESS', 'body'],
    ['SENSOR ARRAY: GHOST CONTACT, BEARING 214', null],
    ['PROPELLANT RESERVE LOW', null],
    ['IFF STATUS: HANDSHAKE TIMEOUT', null],
    ['WEAPON LINK DEGRADED', 'weapon'],
    ['AUXILIARY BUS OVERLOAD', null],
    ['HARDPOINT STATUS: UNSECURED', null],
    ['SENSOR ARRAY CALIBRATION REQUIRED', 'head'],
    ['SYSTEM OVERRIDE ENGAGED', null]
  ];
  var warn = el('g', { class: 'warn', opacity: 0 });
  var warnText = el('text', { y: 8, 'text-anchor': 'middle', class: 'warn-text' });
  // The box spans -halfW..halfW so xf(warn, cx, ...) keeps it centred. The triangle
  // sits a fixed inset (WARN_PAD) off the box's *left* edge, so as halfW grows to
  // fit longer text both the triangle and the text's free span move outward together
  // and stay in step -- see layoutWarn(), which derives the text anchor from that
  // geometry instead of a hand-guessed constant.
  var WARN_MIN_HALF = 280, WARN_PAD = 32, WARN_TRI_W = 40, WARN_PAD_R = 0, WARN_MARGIN = 16;
  var warnBox, warnInner, warnTri, warnTick, warnDot, warnCorners, warnPN;
  function buildWarn() {
    warnBox = el('rect', { y: -30, height: 60, fill: 'rgba(6,10,18,.86)' });
    warnInner = el('rect', { y: -24, height: 48, opacity: .5 });
    warnTri = el('path', {});
    warnTick = el('line', { y1: -10, y2: 2 });
    warnDot = el('circle', { cy: 8, r: 1.6 });
    warn.appendChild(warnBox);
    warnCorners = corners(-WARN_MIN_HALF, -30, WARN_MIN_HALF * 2, 60);
    warn.appendChild(warnCorners);
    warn.appendChild(warnInner);
    warn.appendChild(warnTri);
    warn.appendChild(warnTick);
    warn.appendChild(warnDot);
    warn.appendChild(warnText);
    warnPN = stencil(warn, WARN_MIN_HALF - 8, 24, 'end', 'BNS-CTN-041A');
    layoutWarn(WARN_MIN_HALF);
    svg.appendChild(warn);
  }
  // positions every x-dependent part of the banner from a single half-width, so
  // growing/shrinking the box (to fit text, or to fit a narrow viewport) can never
  // throw the triangle, the text anchor or the frame out of sync with each other
  function layoutWarn(halfW) {
    warnBox.setAttribute('x', (-halfW).toFixed(1)); warnBox.setAttribute('width', (halfW * 2).toFixed(1));
    warnInner.setAttribute('x', (-halfW + 6).toFixed(1)); warnInner.setAttribute('width', (halfW * 2 - 12).toFixed(1));
    updateCorners(warnCorners, -halfW, -30, halfW * 2, 60);
    var triX0 = -halfW + WARN_PAD, triX1 = triX0 + WARN_TRI_W, triMidX = triX0 + WARN_TRI_W / 2;
    warnTri.setAttribute('d', 'M' + triX0.toFixed(1) + ',14 L' + triMidX.toFixed(1) + ',-22 L' + triX1.toFixed(1) + ',14 Z');
    warnTick.setAttribute('x1', triMidX.toFixed(1)); warnTick.setAttribute('x2', triMidX.toFixed(1));
    warnDot.setAttribute('cx', triMidX.toFixed(1));
    // the caption's free span runs from the triangle's right edge to the box's own
    // right edge (less its inset); anchor the centred text at that span's midpoint
    var textZoneRight = halfW - WARN_PAD_R;
    warnText.setAttribute('x', ((triX1 + textZoneRight) / 2).toFixed(1));
    warnPN.setAttribute('x', (halfW - 8).toFixed(1));
  }
  // grows the box to fit the current caution text (down to a viewport-clamped
  // maximum), and as a last resort compresses the glyphs so nothing can run past
  // the box's edge even on a 375px screen
  function fitWarn() {
    warnText.removeAttribute('textLength'); warnText.removeAttribute('lengthAdjust');
    var natural = warnText.getComputedTextLength ? warnText.getComputedTextLength() : 0;
    var maxHalf = Math.max(90, (W || 900) / 2 - 20);
    var idealHalf = (natural + WARN_MARGIN * 2 + WARN_PAD + WARN_TRI_W + WARN_PAD_R) / 2;
    var halfW = clamp(Math.max(idealHalf, WARN_MIN_HALF), 90, maxHalf);
    layoutWarn(halfW);
    var zoneWidth = 2 * halfW - WARN_PAD - WARN_TRI_W - WARN_PAD_R - WARN_MARGIN * 2;
    if (natural > 0 && zoneWidth > 20 && natural > zoneWidth) {
      warnText.setAttribute('textLength', zoneWidth.toFixed(1));
      warnText.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
  }
  // One scheduler, two modes, keyed off hxOn (not hxLockId): in general mode this runs
  // its own 9-25s cadence same as before; in hostile mode showHostile() below simply
  // never lets it fire, because the alarm log owns alerts while a lock is up. cautionTimer
  // is reused for both the "waiting" and "holding" phases so a mode switch can always
  // cancel whichever is pending with one clearTimeout.
  var cautionTimer = null;
  function scheduleCaution() {
    cautionTimer = setTimeout(function () {
      var pick = CAUTIONS[Math.floor(Math.random() * CAUTIONS.length)];
      warnText.textContent = pick[0];
      fitWarn();
      warn.setAttribute('opacity', 1);
      warn.classList.toggle('is-blinking', !BUNNYS.reduce);
      if (pick[1]) setZone(pick[1], 'caution');
      cautionTimer = setTimeout(function () {
        warn.setAttribute('opacity', 0);
        warn.classList.remove('is-blinking');
        scheduleCaution();
      }, 4200);
    }, 9000 + Math.random() * 16000);
  }
  // hides the banner and drops whatever phase of scheduleCaution was pending -- called
  // on every hostile mode switch, since the 4.2s hold means one can already be on
  // screen (and about to overprint TARGET ID, see showHostile) when a lock lands.
  function hideCaution() {
    clearTimeout(cautionTimer);
    warn.setAttribute('opacity', 0);
    warn.classList.remove('is-blinking');
  }


  // ---------------------------------------------------------------- hostile contact
  // A hostile contact does not get the single dossier card the friendly ones do. It gets
  // its own set of framed boxes: who it is, readouts flanking the reticle, a spec block,
  // what it is carrying, and a warning about the one system that can reach you. Content
  // is fixed, so it is built once; only BEARING and LOCK are live.
  var HX_YAW = 180;
  var HX_DATA = {
    mark: ['TARGET // MS-07B-3', 'GOUF CUSTOM'],
    idRows: [['TYPE', 'LIMITED-PRODUCTION GROUND MS', 1],
             ['AFFILIATION', 'PRINCIPALITY OF ZEON', 1],
             ['IFF', 'HOSTILE', 2]],
    spec: [['HEIGHT', '18.7 M', 1], ['EMPTY MASS', '58.5 T', 1], ['MAX MASS', '77.6 T', 1],
           ['REACTOR', 'MINOVSKY ULTRACOMPACT FUSION', 1, true], ['OUTPUT', '1034 KW', 1],
           ['MAX ACCEL', '0.53 G', 1], ['THRUST', '40,700 KG', 1],
           ['SENSOR RANGE', '3,600 M', 1], ['ARMOR', 'SUPER-HARD STEEL ALLOY', 1]],
    arms: [['75MM GATLING GUN', 'READY', 1], ['35MM TRIPLE GATLING', 'READY', 1],
           ['HEAT ROD / ANCHOR', 'ARMED', 2], ['HEAT SABER TYPE-DIII', 'STORED', 0],
           ['GOUF SHIELD', 'EQUIPPED', 1]],
    warn: ['HEAT ROD // ELECTRO-MAGNETIC', 'GRAPPLER RANGE: EXTENDED',
           'ELECTRICAL DISABLE CAPABILITY', '⚠ CLOSE-COMBAT THREAT'],
    ret: [['RNG', '01.42 KM', 1], ['REL VEL', '-032 M/S', 1], ['BEARING', null, 1],
          ['ALT', '041 M', 1], ['LOCK', null, 2], ['IFF', 'HOSTILE', 2]]
  };
  // 0 stored or inactive, 1 nominal, 2 hostile or armed. Fill goes through inline style:
  // the stylesheet's own `#hud text { fill: var(--ice) }` beats a presentation attribute.
  var HX_INK = ['rgba(221,231,238,.45)', 'var(--ice)', 'var(--lock)'];
  var HX_PAD = 11, HX_ROW = 15, HX_HEAD = 15;

  function hxBox(title, w, stamp, cls) {
    var g = el('g', { class: 'hostile' + (cls ? ' ' + cls : ''), opacity: 0 });
    g.body = el('rect', { x: -HX_PAD, y: -HX_PAD, width: w + HX_PAD * 2, height: 10,
                          fill: 'rgba(6,10,18,.97)' });
    g.appendChild(g.body);
    g.frame = corners(-HX_PAD, -HX_PAD, w + HX_PAD * 2, 10, 9);
    g.appendChild(g.frame);
    var cap = el('text', { x: 0, y: 0, style: 'font-size:10px;letter-spacing:.18em;fill:var(--lock);text-anchor:start' });
    cap.textContent = title;
    g.appendChild(cap);
    g.rule = el('line', { x1: 0, y1: 6, x2: w, y2: 6, opacity: .45 });
    g.appendChild(g.rule);
    g.w = w; g.stamp = stamp; g.y = HX_HEAD + 6; g.pairs = [];
    svg.appendChild(g);
    return g;
  }
  // a label/value row; dot draws the armament state pip the owner's mock asks for
  function hxRow(g, label, value, state, dot, wrap) {
    var y = g.y;
    var l = el('text', { x: dot ? 13 : 0, y: y, style: 'font-size:10px;letter-spacing:.1em;fill:var(--hud);text-anchor:start' });
    l.textContent = label;
    g.appendChild(l);
    var v = el('text', { x: g.w, y: wrap ? y + HX_ROW : y, style: 'font-size:10px;letter-spacing:.06em;text-anchor:end;fill:' + HX_INK[state] });
    v.textContent = value == null ? '' : value;
    g.appendChild(v);
    if (dot) {
      g.appendChild(el('circle', { cx: 4, cy: y - 3.5, r: 3.2,
        style: 'fill:' + (state ? HX_INK[state] : 'none') + ';stroke:' + HX_INK[state || 1] + ';stroke-width:1' }));
    }
    g.pairs.push({ l: l, v: v, dot: !!dot, wrap: !!wrap });
    g.y += wrap ? HX_ROW * 2 : HX_ROW;
    return v;
  }
  function hxSeal(g) {                       // close the housing round whatever it holds
    var h = g.y - HX_ROW + HX_PAD * 2 + 4;
    g.body.setAttribute('height', h);
    updateCorners(g.frame, -HX_PAD, -HX_PAD, g.w + HX_PAD * 2, h, 9);
    g.h = h;
    if (g.stamp && !g.stampEl) g.stampEl = stencil(g, g.w, g.y - HX_ROW + 13, 'end', g.stamp);
    else if (g.stampEl) g.stampEl.setAttribute('x', g.w);
  }
  // Grow a housing to whatever its widest label/value pair actually measures. Guessing the
  // width by eye put REACTOR straight through MINOVSKY ULTRACOMPACT FUSION, and the same
  // for two of the armament rows. Re-run once the webfont lands, since the fallback
  // metrics differ from B612 Mono's.
  var HX_GAP = 16;
  // minW lets two boxes that stack in one column be fitted to one shared width
  function hxFit(g, minW) {
    var need = Math.max(g.w, minW || 0);
    g.pairs.forEach(function (p) {
      var lw = 0, vw = 0;
      try { lw = p.l.getComputedTextLength(); vw = p.v.getComputedTextLength(); } catch (e) { return; }
      // a wrapped row puts its value on its own line, so it only has to be as wide as
      // the longer of the two rather than both plus a gap
      need = Math.max(need, p.wrap ? Math.max(lw, vw) : (p.dot ? 13 : 0) + lw + HX_GAP + vw);
    });
    need = Math.ceil(need);
    if (need === g.w) return;
    g.w = need;
    g.pairs.forEach(function (p) { p.v.setAttribute('x', need); });
    g.rule.setAttribute('x2', need);
    g.body.setAttribute('width', need + HX_PAD * 2);
    updateCorners(g.frame, -HX_PAD, -HX_PAD, need + HX_PAD * 2, g.h, 9);
    if (g.stampEl) g.stampEl.setAttribute('x', need);
  }

  var hxAll = [], hxBearing = null, hxLock = null;
  var hx = (function buildHostile() {
    var d = HX_DATA;
    var idb = hxBox('TARGET ID', 268, 'BNS-TAQ-0701');
    var mark = el('text', { x: 0, y: idb.y + 8, style: 'font-size:19px;letter-spacing:.06em;fill:var(--lock);text-anchor:start' });
    mark.textContent = d.mark[1];
    idb.appendChild(mark);
    var sub = el('text', { x: 0, y: idb.y + 24, style: 'font-size:9px;letter-spacing:.14em;fill:rgba(221,231,238,.6);text-anchor:start' });
    sub.textContent = d.mark[0];
    idb.appendChild(sub);
    idb.y += 38;
    d.idRows.forEach(function (r) { hxRow(idb, r[0], r[1], r[2]); });
    hxSeal(idb);

    var sp = hxBox('UNIT DATA', 196, 'BNS-TAQ-0704');
    d.spec.forEach(function (r) { hxRow(sp, r[0], r[1], r[2], false, r[3]); });
    hxSeal(sp);

    var ar = hxBox('ARMAMENT DETECTED', 190, 'BNS-TAQ-0708');
    d.arms.forEach(function (r) { hxRow(ar, r[0], r[1], r[2], true); });
    hxSeal(ar);

    var wn = hxBox('⚠ ANCHOR SYSTEM DETECTED', 268, 'BNS-TAQ-0712', 'hx-alarm');
    d.warn.forEach(function (line) {
      var t = el('text', { x: 0, y: wn.y, style: 'font-size:10px;letter-spacing:.1em;fill:var(--lock);text-anchor:start' });
      t.textContent = line;
      wn.appendChild(t); wn.y += HX_ROW;
    });
    hxSeal(wn);

    // the six readouts that flank the reticle, three a side
    var left = el('g', { class: 'hostile', opacity: 0 }), right = el('g', { class: 'hostile', opacity: 0 });
    d.ret.forEach(function (r, i) {
      var g = i < 3 ? left : right, y = (i % 3) * 18, end = i < 3;
      var lab = el('text', { x: 0, y: y, style: 'font-size:9px;letter-spacing:.14em;fill:var(--hud);text-anchor:' + (end ? 'end' : 'start') });
      lab.textContent = r[0];
      g.appendChild(lab);
      var val = el('text', { x: end ? -70 : 70, y: y, style: 'font-size:11px;letter-spacing:.04em;text-anchor:' + (end ? 'end' : 'start') + ';fill:' + HX_INK[r[2]] });
      val.textContent = r[1] || '';
      g.appendChild(val);
      if (r[0] === 'BEARING') hxBearing = val;
      if (r[0] === 'LOCK') hxLock = val;
    });
    svg.appendChild(left); svg.appendChild(right);
    hxAll = [idb, sp, ar, wn, left, right];
    return { id: idb, spec: sp, arms: ar, warn: wn, left: left, right: right };
  })();

  function hxFitAll() {
    [hx.id, hx.spec, hx.arms, hx.warn].forEach(function (g) { hxFit(g); });
    // UNIT DATA and ARMAMENT stack beside the contact as one column: one width, so
    // their edges line up the way every other column in the HUD does
    var w = Math.max(hx.spec.w, hx.arms.w);
    hxFit(hx.spec, w); hxFit(hx.arms, w);
  }
  hxFitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
    hxFitAll(); place();
    // the wind arrow's x is measured off spec.wind's own rendered width (see
    // drawPanels), cached until the string next changes. If that first measurement
    // landed before this promise resolved, it used the fallback font's metrics, not
    // B612 Mono's -- clearing the cached string forces a remeasure on the next frame
    var envSpec = PANELS[3];
    if (envSpec && envSpec.wind) envSpec.wind.textContent = '';
  });

  // ---------------------------------------------------------------- hostile alarm log
  // A 3-slot log under TARGET ID. Built once, per the house rule -- hxLogFire() below
  // only ever rewrites a row's text/classes/opacity, never creates new elements. Each
  // row is its own <g> with its own background <rect> so the .hx-alarm flash (which
  // animates rect/text inside that class) has something to invert; without a per-row
  // rect only the text would flash and the row would read as broken.
  var HOSTILE_ALARMS = [
    ['HEAT ROD CONTACT // L ARM', 'arm-l'],
    ['75MM GATLING FIRE // R LEG', 'leg-r'],
    ['35MM GATLING GRAZE // HEAD', 'head'],
    ['HEAT ROD DISCHARGE // FRAME', 'body'],
    ['GATLING ROUNDS // CHEST', 'chest'],
    ['IMPACT // WEAPON ARM', 'weapon'],
    ['HOSTILE LOCK-ON DETECTED', null]
  ];
  var HX_LOG_ROWS = 3, HX_LOG_ROW_H = 18, HX_LOG_GAP = 12, HX_LOG_LIFE = 6000,
      HX_LOG_WAIT_MIN = 2200, HX_LOG_WAIT_MAX = 4800, HX_LOG_FIRST = 600;
  var hxLogH = HX_LOG_ROWS * HX_LOG_ROW_H; // static geometry: 3 fixed-height rows, stacked flush
  var hxLog, hxLogRow = [], hxLogW = 0, hxLogQueue = [], hxLogTimer = null, hxLogBottom = 0;
  var hxLogLife = [];   // pending per-alarm expiry timers, so a re-lock cannot be pruned by the last lock's
  (function buildHxLog() {
    hxLogW = hx.id.w;
    hxLog = el('g', { class: 'hostile hx-log', opacity: 0 });
    for (var i = 0; i < HX_LOG_ROWS; i++) {
      var g = el('g', { class: 'hx-log-row' }), y = i * HX_LOG_ROW_H;
      var rect = el('rect', { x: -HX_PAD, y: y, width: hxLogW + HX_PAD * 2, height: HX_LOG_ROW_H,
                              fill: 'rgba(6,10,18,.97)' });
      g.appendChild(rect);
      var text = el('text', { x: 0, y: y + HX_LOG_ROW_H - 5,
                              style: 'font-size:10px;letter-spacing:.1em;fill:var(--lock);text-anchor:start' });
      g.appendChild(text);
      hxLog.appendChild(g);
      hxLogRow.push({ g: g, rect: rect, text: text });
    }
    svg.appendChild(hxLog);
  })();
  // re-syncs the row backgrounds to TARGET ID's current width -- called from place(),
  // not per frame, the same way hxFit only ever runs at build and again once fonts land
  function hxLogSetWidth(w) {
    hxLogW = w;
    hxLogRow.forEach(function (r) { r.rect.setAttribute('width', w + HX_PAD * 2); });
  }
  // repaints the 3 fixed rows from hxLogQueue (newest first); the log itself is only
  // visible while hostile *and* holding at least one live alarm -- otherwise it would
  // show as an empty flashing box in the ~0.6s before the first alarm arrives
  function hxLogPaint() {
    hxLog.setAttribute('opacity', hxOn && hxLogQueue.length ? 1 : 0);
    hxLogRow.forEach(function (r, i) {
      var entry = hxLogQueue[i];
      if (!entry) { r.g.setAttribute('opacity', 0); r.g.classList.remove('hx-alarm'); r.text.textContent = ''; return; }
      var newest = i === 0, flash = newest && !BUNNYS.reduce;
      // reduced motion: no flash, so the newest row gets a static marker instead
      r.text.textContent = (newest && BUNNYS.reduce ? '▶ ' : '') + entry[0];
      r.g.classList.toggle('hx-alarm', flash);
      r.g.setAttribute('opacity', newest ? 1 : .55); // older rows dim
    });
  }
  function hxLogFire() {
    var alarm = HOSTILE_ALARMS[Math.floor(Math.random() * HOSTILE_ALARMS.length)];
    hxLogQueue.unshift(alarm);
    hxLogQueue.length = Math.min(hxLogQueue.length, HX_LOG_ROWS);
    hxLogPaint();
    if (alarm[1]) setZone(alarm[1], 'hit');
    // HOSTILE_ALARMS entries are shared by reference, so an untracked expiry from an earlier
    // lock would find and splice an identical fresh alarm. Track it; hxLogReset() clears it.
    hxLogLife.push(setTimeout(function () {
      var idx = hxLogQueue.indexOf(alarm);
      if (idx !== -1) { hxLogQueue.splice(idx, 1); hxLogPaint(); }
    }, HX_LOG_LIFE));
    if (hxOn) hxLogTimer = setTimeout(hxLogFire, HX_LOG_WAIT_MIN + Math.random() * (HX_LOG_WAIT_MAX - HX_LOG_WAIT_MIN));
  }
  function hxLogReset() {
    clearTimeout(hxLogTimer);
    hxLogLife.forEach(clearTimeout);
    hxLogLife.length = 0;
    hxLogQueue.length = 0;
    hxLogPaint();
  }
  function hxLogStart() {
    hxLogReset();
    hxLogTimer = setTimeout(hxLogFire, HX_LOG_FIRST);
  }
  function hxLogStop() { hxLogReset(); }

  // Inverse-video alarm flash, driven from tick() rather than from CSS. The box and the ink
  // used to be two separate CSS animations, and each starts its own clock when its element
  // is attached -- re-appending a rect left them up to ~1.9s apart, so the pair spent much
  // of the cycle red-on-red or dark-on-dark, invisible exactly when it matters most.
  // One clock cannot drift against itself.
  var ALARM_HALF = 400;

  // ----------------------------------------------- HUD MODE, comms and status toast
  var modeEl = document.getElementById('hudmode');
  var commsEl = document.getElementById('comms'), toastEl = document.getElementById('toast');
  // Cockpit chatter from the suit's own world. Nothing here is about the owner, and the
  // hostile unit is never named outside HX_DATA -- it is "the contact at 180" here.
  var COMMS = [
    ['HQ-7', 'Patrol route confirmed. Hold bearing 180 and report any contact.'],
    ['HANGAR CONTROL', 'Bay 3 is clear. RX-124 is cleared for redeployment.'],
    ['HQ-7', 'Particle interference rising in sector 7. Expect sensor noise.'],
    ['MISSION LOG', 'Three waypoints marked on your panoramic monitor.'],
    ['LINEAR SEAT', 'Pilot biometrics nominal. Cockpit pressure holding.'],
    ['HQ-7', 'Deployment ready on your mark. All systems nominal.']
  ];
  // POP_H: the tallest a popup gets -- a three-line transmission at the narrowest slot
  // measured 136px -- so place() can tell whether the band clears the SPD/ALT captions
  var POP_MAX = 300, POP_MIN = 200, POP_H = 150;
  // Sizes a popup into the band [left, right]. Too narrow a band and it falls back to the
  // centre slot under the tape, stacked `drop` px down so comms and toast never share it.
  function popSlot(node, left, right, top, alignEnd, drop) {
    if (!node) return;
    var w = Math.min(POP_MAX, right - left);
    if (w >= POP_MIN) {
      node.style.left = (alignEnd ? right - w : left) + 'px';
      node.style.top = top + 'px';
      node.dataset.centre = '';
    } else {
      w = Math.min(POP_MAX, W - 48);
      node.style.left = (W / 2 - w / 2) + 'px';
      node.style.top = (top + drop) + 'px';
      node.dataset.centre = '1';   // shares TARGET ID's slot: stood down while it is up
    }
    node.style.width = w + 'px';
  }
  function blocked(node) { return node.dataset.centre === '1' && hxOn; }

  var toastTimer = null;
  function toast(msg) {
    if (!toastEl || blocked(toastEl)) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  var commsIdx = 0, commsTimer = null, commsHide = null, commsType = null;
  function showComms(from, msg) {
    if (!commsEl || blocked(commsEl)) return;
    commsEl.querySelector('.comms-from').textContent = 'INCOMING // ' + from;
    var out = commsEl.querySelector('.comms-msg');
    clearInterval(commsType);
    if (BUNNYS.reduce) out.textContent = msg;
    else {
      // typed out like a teleprinter; the full line is set as the accessible name first
      // so a screen reader is not fed it a character at a time
      out.setAttribute('aria-label', msg);
      var n = 0;
      out.textContent = '';
      commsType = setInterval(function () {
        out.textContent = msg.slice(0, ++n);
        if (n >= msg.length) clearInterval(commsType);
      }, 22);
    }
    commsEl.hidden = false;
    clearTimeout(commsHide);
    commsHide = setTimeout(hideComms, 11000);
  }
  function hideComms() {
    // never pull the panel out from under a keyboard user who is on its ACK button
    if (commsEl.contains(document.activeElement)) { commsHide = setTimeout(hideComms, 3000); return; }
    clearInterval(commsType);
    commsEl.hidden = true;
  }
  function nextComms() { var c = COMMS[commsIdx++ % COMMS.length]; showComms(c[0], c[1]); }
  function scheduleComms(delay) {
    clearTimeout(commsTimer);
    commsTimer = setTimeout(function () {
      nextComms();
      scheduleComms(30000 + Math.random() * 20000);
    }, delay);
  }

  // RUN DIAG: an amber sweep across every zone of the damage map, then the all-clear
  function runDiag() {
    var D = window.BUNNYS_DMG;
    if (!D) { toast('DIAGNOSTIC UNAVAILABLE'); return; }
    toast('DIAGNOSTIC SWEEP');
    D.zones.forEach(function (z, i) { setTimeout(function () { setZone(z.id, 'caution'); }, i * 220); });
    setTimeout(function () { toast('ALL SYSTEMS NOMINAL'); }, D.zones.length * 220 + 900);
  }
  function wireModes() {
    if (commsEl) commsEl.querySelector('.comms-ack').addEventListener('click', function () {
      commsEl.hidden = true;
      clearInterval(commsType);
      toast('TRANSMISSION ACKNOWLEDGED');
    });
    if (!modeEl) return;
    modeEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b) return;
      var m = b.dataset.mode;
      if (m === 'declutter' || m === 'nv') {
        var on = document.body.classList.toggle(m);
        b.setAttribute('aria-pressed', on);
        toast(m === 'nv' ? (on ? 'NIGHT VISION ENGAGED' : 'NIGHT VISION OFF')
                         : (on ? 'DECLUTTER ON' : 'FULL HUD RESTORED'));
      } else if (m === 'diag') runDiag();
      else if (m === 'comms') nextComms();
    });
  }
  function drawAlarmFlash(now) {
    var inv = !BUNNYS.reduce && Math.floor(now / ALARM_HALF) % 2 === 1;
    var on = document.querySelectorAll('#hud .hx-alarm');
    for (var i = 0; i < on.length; i++) on[i].classList.toggle('is-inv', inv);
  }

  var hxOn = false, hxSince = 0;
  function showHostile(on) {
    if (on === hxOn) return;
    hxOn = on;
    if (on) hxSince = performance.now();
    hxAll.forEach(function (g) { g.setAttribute('opacity', on ? 1 : 0); });
    // Every mode switch hides the general banner and drops its pending timer outright
    // (Part B): a hostile lock hands alerts to the log instead, and the banner's own
    // 4.2s hold means one can already be on screen, wide enough to overprint TARGET ID,
    // when a lock lands.
    hideCaution();
    if (on) {
      // a popup parked in the centre slot is sitting where TARGET ID is about to appear
      [commsEl, toastEl].forEach(function (n) { if (n && n.dataset.centre === '1') n.hidden = true; });
      hxLogStart();
      showComms('HQ-7', 'Hostile confirmed at bearing 180. Engage at your discretion.');
    }
    else { hxLogStop(); scheduleCaution(); }
  }
  // BEARING reads the contact's real bearing; LOCK counts the sequence in rather than
  // sitting at a fixed number next to a status line that already says LOCKED.
  function drawHostile(now) {
    if (!hxOn) return;
    if (hxBearing) hxBearing.textContent = pad3(HX_YAW);
    if (hxLock) {
      var p = BUNNYS.reduce ? 1 : Math.min(1, (now - hxSince) / 900);
      hxLock.textContent = Math.round(p * 100) + '%';
      hxLock.style.fill = p < 1 ? 'var(--amber)' : 'var(--lock)';
    }
  }


  // ---------------------------------------------------------------- foot bars
  // A row of live readouts across the foot of the canopy. img/frame.svg used to carry a
  // single painted gauge here, but painted art cannot move -- so the whole row lives in
  // the HUD instead and is driven from the same tick() loop as the gauges.
  // label, base level, drift amount, period ms
  var FOOT = [
    ['PROP', 0.78, 0.07, 3100],
    ['COOL', 0.62, 0.11, 2300],
    ['PWR',  0.90, 0.05, 4100],
    ['O2',   0.71, 0.06, 2700],
    ['HYD',  0.55, 0.13, 1900],
    ['AUX',  0.83, 0.08, 3500]
  ];
  var FOOT_H = 9, FOOT_SEGS = 8;
  var footWrap = el('g', { class: 'foot' }), footBars = [], footOn = false;
  function buildFoot() {
    FOOT.forEach(function (f) {
      var g = el('g');
      var cap = el('text', { x: 0, y: -4, style: 'font-size:8px;letter-spacing:.16em;fill:var(--hud);text-anchor:start' });
      cap.textContent = f[0];
      g.appendChild(cap);
      var track = el('rect', { x: 0, y: 0, height: FOOT_H, rx: 1,
                               fill: 'rgba(221,231,238,.10)', stroke: 'rgba(221,231,238,.42)', 'stroke-width': 1 });
      g.appendChild(track);
      var fill = el('rect', { x: 0.8, y: 1, height: FOOT_H - 2, stroke: 'none', fill: 'var(--hud)', opacity: .62 });
      g.appendChild(fill);
      var segs = [];
      for (var i = 1; i < FOOT_SEGS; i++) {
        var ln = el('line', { y1: 0, y2: FOOT_H, stroke: 'rgba(221,231,238,.30)', 'stroke-width': 1 });
        g.appendChild(ln);
        segs.push(ln);
      }
      var val = el('text', { y: -4, style: 'font-size:8px;letter-spacing:.06em;fill:var(--ice);text-anchor:end' });
      g.appendChild(val);
      footWrap.appendChild(g);
      footBars.push({ g: g, track: track, fill: fill, segs: segs, val: val, spec: f, w: 0 });
    });
    svg.appendChild(footWrap);
  }
  // Spread across the foot, but only across the span the corner instruments leave free --
  // the radar occupies the bottom left and the slew panel the bottom right.
  function layoutFoot(left, right, y) {
    var span = right - left;
    footOn = span > 340;
    footWrap.setAttribute('opacity', footOn ? 1 : 0);
    if (!footOn) return;
    var gap = 16, n = footBars.length;
    var w = (span - gap * (n - 1)) / n;
    footBars.forEach(function (b, i) {
      var x = left + i * (w + gap);
      b.w = w;
      xf(b.g, x, y);
      b.track.setAttribute('width', w);
      b.val.setAttribute('x', w);
      b.segs.forEach(function (ln, k) {
        var sx = w * (k + 1) / FOOT_SEGS;
        ln.setAttribute('x1', sx.toFixed(1));
        ln.setAttribute('x2', sx.toFixed(1));
      });
    });
  }
  function drawFoot(now) {
    if (!footOn) return;
    footBars.forEach(function (b) {
      var s = b.spec;
      var v = clamp(s[1] + Math.sin(now / s[3]) * s[2] + Math.sin(now / (s[3] * 0.37)) * s[2] * 0.4, 0.04, 1);
      b.fill.setAttribute('width', Math.max(1, (b.w - 1.6) * v).toFixed(1));
      b.fill.setAttribute('fill', v < 0.25 ? 'var(--lock)' : v < 0.4 ? 'var(--amber)' : 'var(--hud)');
      b.val.textContent = Math.round(v * 100) + '%';
    });
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
    var statusY = H - Math.max(26, H * 0.05);
    status.setAttribute('y', statusY);

    [spd, alt].forEach(function (b) {
      b.rule.setAttribute('y1', -barH); b.rule.setAttribute('y2', barH);
      b.cap.setAttribute('y', -barH - 12);
      b.readout.setAttribute('y', barH + 26);
      // the needle is redrawn from b.cur each frame, so resizing needs no re-set here
    });
    // keep the bars clear of the left instrument column, and mirror them so the
    // pair stays symmetric about the centre
    var colRight = 22 + (RAD + PAD) * 2;
    var inset = isPage ? clamp(W * 0.05, 52, 120) : clamp(colRight + 54, 60, W * 0.28);
    xf(spd.g, inset, cy);
    xf(alt.g, W - inset, cy);

    if (!isPage) {
      // the scope needs real estate; drop it on small screens rather than crush it
      var room = W > 760 && H > 520;
      // the heading tape's own housing reaches wide enough to run into both columns
      // below about W=1222, so anything sitting under it has to clear this, not just
      // a fixed margin
      var tapeBottom = Math.max(40, H * 0.055) + 42;

      // -- two columns, each centred on the middle of its own gutter --
      // The gutter is the band between the screen edge and the SPD (or ALT) bar. Its
      // midline is the lane every box in that column centres on, so a column reads as one
      // line of instruments instead of a stack that each found its own margin. Every
      // column instrument is PANEL_W wide and the whole column scales together when the
      // gutter is too narrow, so their edges stay flush at every viewport size.
      var colW = Math.min(PANEL_W, inset - 30);
      var colS = colW / PANEL_W;
      var laneL = inset / 2, laneR = W - inset / 2;
      var colLx = laneL - colW / 2, colRx = laneR - colW / 2;
      var colTop = Math.max(72, H * 0.11 - 12, tapeBottom + 10);
      lane.setAttribute('opacity', room ? 1 : 0);
      if (room) {
        laneRuleL.setAttribute('x1', laneL); laneRuleL.setAttribute('x2', laneL);
        laneRuleR.setAttribute('x1', laneR); laneRuleR.setAttribute('x2', laneR);
        [laneRuleL, laneRuleR].forEach(function (r) {
          r.setAttribute('y1', colTop - 16); r.setAttribute('y2', statusY - 6);
        });
      }

      var reactor = PANELS[0], thruster = PANELS[1], combat = PANELS[2], env = PANELS[3];
      PANELS.forEach(function (sp) { sp.g.setAttribute('opacity', room ? 1 : 0); });

      // LEFT column, top to bottom: REACTOR STATUS, THRUSTER VECTOR, ENVIRONMENT, SENSOR ARRAY
      radar.setAttribute('opacity', room ? 1 : 0);
      // the radar's housing is PANEL_W wide by construction, so the same colS fits it
      var radarCy = H - 26 - (RAD + PAD) * colS;
      var radarTop = radarCy - (RAD + R_HEAD) * colS;
      xf(radar, laneL, radarCy, ' scale(' + colS.toFixed(4) + ')');
      xf(reactor.g, colLx, colTop, ' scale(' + colS.toFixed(4) + ')');
      var thrusterY = colTop + reactor.h * colS + 14;
      xf(thruster.g, colLx, thrusterY, ' scale(' + colS.toFixed(4) + ')');
      // stand-down order under a short column: ENVIRONMENT gives way first (it sits
      // lowest, so it hits the radar first), then THRUSTER -- each stands down rather
      // than running into the radar below it
      var thrusterFits = thrusterY + thruster.h * colS <= radarTop - 12;
      if (!thrusterFits) thruster.g.setAttribute('opacity', 0);
      var envY = thrusterY + thruster.h * colS + 14;
      xf(env.g, colLx, envY, ' scale(' + colS.toFixed(4) + ')');
      if (!thrusterFits || envY + env.h * colS > radarTop - 12) env.g.setAttribute('opacity', 0);

      // RIGHT column, top to bottom: DIAGNOSTIC MODE, COMBAT SYSTEM, SLEW TO.
      // The slew panel is a CSS-positioned HTML panel (its buttons are real links), so it
      // is driven onto the same lane and the same width here rather than in the stylesheet.
      var slewEl = document.getElementById('slew'), slewR = slewEl && slewEl.getBoundingClientRect();
      if (slewEl && room) {
        slewEl.style.left = colRx + 'px';
        slewEl.style.right = 'auto';
        slewEl.style.width = colW + 'px';
        slewR = slewEl.getBoundingClientRect();
      }
      var slewVisible = !!(slewR && slewR.height);
      var modeR = null;
      if (modeEl && room && slewVisible) {
        modeEl.style.left = colRx + 'px';
        modeEl.style.width = colW + 'px';
        modeEl.style.top = (slewR.top - 14 - modeEl.offsetHeight) + 'px';
        modeR = modeEl.getBoundingClientRect();
      }
      // the slew panel's own media query hides it below 860px wide / 520px tall, and a
      // hidden element's rect is all zeros -- fall back to a fixed foot margin
      // Stacked from the TOP, mirroring the left column: DIAGNOSTIC MODE at colTop,
      // COMBAT SYSTEM straight under it, SLEW TO pinned to the foot. The map takes the
      // largest square that still leaves COMBAT SYSTEM room above the slew panel.
      var rightFloor = modeR ? (modeR.top - 14) : slewVisible ? (slewR.top - 14) : (H - 26);
      layoutDamage(colRx, colTop, rightFloor - combat.h * colS - 14, room, colS);
      var combatY = dmgOn ? colTop + dmgH + 14 : colTop;
      xf(combat.g, colRx, combatY, ' scale(' + colS.toFixed(4) + ')');

      // the foot row runs between the two bottom-corner instruments
      var slewLeft = slewVisible ? slewR.left : (W - 22);
      layoutFoot(laneL + colW / 2 + 26, slewLeft - 26, statusY + 16);

      // Low, not mid-screen: at 0.62 the card sat straight over the enemy suit's head and
      // torso, which is the one contact big enough to be worth looking at. Keep it under
      // the reticle but down in the lower third, still clear of the status line.
      // Derived, not dialled in: the card's own box height decides how high it has to
      // sit. A fixed fraction put it over the enemy suit's head at tall sizes and through
      // the status line at short ones. Sit it low, but never closer than 18px to the line.
      var dosBot = parseFloat(dosBox.getAttribute('y')) + parseFloat(dosBox.getAttribute('height'));
      var dosY = clamp(H * 0.74, 200, statusY - 18 - dosBot);
      xf(dossier, cx, dosY);

      // The hostile set fills the whole frame, so it has to be placed round the two things
      // beside the contact, not in a column: UNIT DATA and ARMAMENT read as belonging to
      // the suit you are looking at, and both side columns stay free for your own
      // instruments. If the pair will not fit, the set stands down and the plain dossier
      // card covers the contact instead.
      // Measured, not guessed: the ALT / LOCK / IFF readouts' own box decides where the
      // pair may go. An hx box spans x-HX_PAD .. x+w+HX_PAD, hence the HX_PAD terms.
      var rb = hx.right.getBBox();
      var readR = cx + 92 + rb.x + rb.width;
      var readTop = cy - 17 + rb.y, readBot = readTop + rb.height;
      var boxW = hx.spec.w + HX_PAD * 2, rightLimit = colRx - 16;
      var specX, specY, armsY;
      if (readR + 16 + boxW <= rightLimit) {
        // wide screens: the pair stands to the right of the readouts, beside the contact
        specX = readR + 16 + HX_PAD;
        specY = cy - 128;
        armsY = specY + hx.spec.h + 16;
      } else {
        // narrower: the pair straddles the readouts' band instead -- UNIT DATA above it,
        // ARMAMENT below it -- flush to the right column, so it still never covers them
        specX = rightLimit - boxW + HX_PAD;
        specY = readTop - 14 - hx.spec.h + HX_PAD;
        armsY = readBot + 14 + HX_PAD;
      }
      var specLeft = specX - HX_PAD, specTop = specY - HX_PAD;
      hxArmsBottom = armsY - HX_PAD + hx.arms.h;
      // TARGET ID's own top and bottom, and the alarm log flush beneath it -- computed
      // here (not inside logBottom()) so the hxRoom check below and the xf() calls
      // further down share one set of numbers and can't drift apart.
      var idY = Math.max(112, H * 0.135);
      var idBottom = idY - HX_PAD + hx.id.h;
      var logY = idBottom + HX_LOG_GAP;
      hxLogBottom = logY + hxLogH;
      hxRoom = room && W > 1100
            && specLeft >= cx + hx.id.w / 2 + HX_PAD + 12   // clear of TARGET ID
            && specLeft >= cx + hx.warn.w / 2 + HX_PAD + 12 // and of the anchor warning
            && specTop >= tapeBottom + 8                     // under the heading tape
            && hxArmsBottom + 14 <= statusY - 20             // over the status line
            && logBottom() <= cy - 40;            // Task 3's alarm log; see logBottom() below
      xf(hx.id, cx - hx.id.w / 2, idY);
      // Popup slots in the open sky either side of TARGET ID, top-aligned with it. On a
      // tall screen the SPD/ALT captions (cy - barH - 12) start below the whole popup band,
      // so the slots may reach out to the columns; on a short one the band would run into
      // those captions, so the bars' own x becomes the bound. Too narrow either way, and
      // the popup takes the centre slot instead.
      var popTop = idY - HX_PAD, idHalf = hx.id.w / 2 + HX_PAD;
      var clearOfBars = popTop + POP_H <= cy - barH - 24;
      popSlot(commsEl, clearOfBars ? colLx + colW + 24 : inset + 24, cx - idHalf - 24, popTop, true, 0);
      // 132: a two-line transmission at full width is 121px tall, plus an 11px gap
      popSlot(toastEl, cx + idHalf + 24, clearOfBars ? colRx - 24 : W - inset - 24, popTop, false, 132);
      xf(hx.spec, specX, specY);
      xf(hx.arms, specX, armsY);
      xf(hx.warn, cx - hx.warn.w / 2, statusY - 26 - hx.warn.h);
      xf(hx.left, cx - 92, cy - 17);
      xf(hx.right, cx + 92, cy - 17);
      if (hxLogW !== hx.id.w) hxLogSetWidth(hx.id.w);
      xf(hxLog, cx - hx.id.w / 2, logY);
      var hostileNow = hxRoom && hxLockId === 't-unknown';
      showHostile(hostileNow);
      if (hostileNow) dossier.setAttribute('opacity', 0);
      xf(warn, cx, clamp(H * 0.26, 90, 260));
      fitWarn(); // re-clamp the banner's width to the (possibly new) viewport
      // ladder's own transform is re-applied by tick() every frame off the spring's
      // current values, so a resize needs no extra push here
      if (fpm) xf(fpm, cx, cy);
    }
  }

  var ladder = null, fpm = null, hxRoom = false, hxLockId = null, hxArmsBottom = 0;
  // the alarm log's real measured bottom edge, set alongside idY/logY above; checked
  // against cy - 40 so the log always clears the reticle readouts (hx.left/hx.right).
  function logBottom() { return hxLogBottom; }

  if (!isPage) {
    // -- pitch ladder: rungs built once (house rule -- this runs beside a 360-element
    // CSS-3D panorama, so no per-frame DOM churn), values rewritten per frame by
    // updateLadder(). Roll/dx/dy are driven by a damped spring in tick() below, off
    // real yaw/pitch rate rather than drag-only vx, so WASD and a held key bank it too.
    ladder = el('g', { class: 'ladder' });
    svg.appendChild(ladder);
    var ladderRungs = [-10, -5, 5, 10].map(function (r) {
      var w = r > 0 ? 90 : 60, tick = r > 0 ? 8 : -8;
      var rung = el('line', { x1: -w, y1: 0, x2: w, y2: 0 });
      if (r < 0) rung.setAttribute('stroke-dasharray', '6 6');
      var tickL = el('line', { x1: -w, y1: 0, x2: -w, y2: tick });
      var tickR = el('line', { x1: w, y1: 0, x2: w, y2: tick });
      ladder.appendChild(rung); ladder.appendChild(tickL); ladder.appendChild(tickR);
      return { r: r, tick: tick, rung: rung, tickL: tickL, tickR: tickR };
    });
    function updateLadder(pitch, roll, dx, dy) {
      ladderRungs.forEach(function (rg) {
        var y = -(rg.r - pitch) * 14;
        rg.rung.setAttribute('y1', y); rg.rung.setAttribute('y2', y);
        rg.tickL.setAttribute('y1', y); rg.tickL.setAttribute('y2', y + rg.tick);
        rg.tickR.setAttribute('y1', y); rg.tickR.setAttribute('y2', y + rg.tick);
      });
      xf(ladder, W / 2 + dx, H / 2 + dy, ' rotate(' + roll.toFixed(2) + ')');
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

    buildLane(); buildRadar(); buildPanels(); buildDamage(); buildFoot(); buildWarn(); buildDossier();
    place();
    drawHeading(0); updateLadder(0, 0, 0, 0); drawRadar(0);

    BUNNYS.on('view', function (d) {
      drawHeading(d.yaw);
      drawRadar(d.yaw);
      // SPD and the ladder's roll/dx/dy come from tick()'s motion sampler instead --
      // vx here is drag-only and never carries a 0 once the view stops moving.
      setBar(alt, clamp((d.pitch + 12) / 24, 0, 1), (d.pitch >= 0 ? '+' : '') + Math.round(d.pitch));
    });
    BUNNYS.on('lock', function (d) {
      status.textContent = d.id ? 'LOCK SEQUENCE: ' + d.label : IDLE_STATUS;
      setDossier(d);
      // A hostile contact gets its own boxes instead of the generic card, so the two never
      // stack. setDossier() has just raised the card, so this has to lower it again after.
      hxLockId = d.id || null;
      var hostile = hxRoom && hxLockId === 't-unknown';
      showHostile(hostile);
      if (hostile) dossier.setAttribute('opacity', 0);
      drawRadar(BUNNYS.state.yaw);
    });
    BUNNYS.on('boot-done', function () {
      status.textContent = IDLE_STATUS;
      scheduleCaution();
      scheduleComms(8000);
    });
    wireModes();

    // -- motion sampler: state.yaw/pitch is what every input source (drag, keys, wheel,
    // slew, magnetism, tilt) eases into each frame, so sampling it here -- rather than
    // the drag-only vx the view event carries -- is the one place all of them show up.
    // Feeds the SPD bar and the ladder's banking spring, both in tick() below.
    var prevYaw = BUNNYS.state.yaw, prevPitch = BUNNYS.state.pitch;
    var SPD_TAU = 0.35, spdEma = 0, spdTextAt = 0;
    var LADDER_OMEGA = 12, LADDER_ZETA = 0.55;
    var ladderRoll = { cur: 0, vel: 0 }, ladderDx = { cur: 0, vel: 0 }, ladderDy = { cur: 0, vel: 0 };
    // semi-implicit Euler step of a damped spring toward target, mutating axis in place
    function springStep(axis, target, h) {
      var acc = LADDER_OMEGA * LADDER_OMEGA * (target - axis.cur) - 2 * LADDER_ZETA * LADDER_OMEGA * axis.vel;
      axis.vel += acc * h;
      axis.cur += axis.vel * h;
    }

    // gauges tick on their own clock; cheap, and pauses with the tab
    (function tick(now) {
      requestAnimationFrame(tick);
      if (document.hidden) return;
      var t = now || performance.now();
      var dt = tick.last == null ? 1 / 60 : Math.min(0.25, (t - tick.last) / 1000);
      tick.last = t;
      drawPanels(t);
      drawFoot(t);
      drawSweep(t);
      drawHostile(t);
      drawAlarmFlash(t);
      drawDamage(t, dt);
      drawBar(spd, dt); drawBar(alt, dt);

      // dt floored so a near-zero frame interval can't blow the rate up
      var rdt = Math.max(dt, 1 / 240);
      var yawRate = shortestDelta(prevYaw, BUNNYS.state.yaw) / rdt;
      var pitchRate = (BUNNYS.state.pitch - prevPitch) / rdt;
      prevYaw = BUNNYS.state.yaw; prevPitch = BUNNYS.state.pitch;

      // SPD: smoothed angular speed through a saturating curve -- WASD's 70deg/s lands
      // around 0.54, a fast drag saturates near 1, idle sway (~0.3deg/s) reads ~0
      var speed = Math.sqrt(yawRate * yawRate + pitchRate * pitchRate);
      spdEma += (speed - spdEma) * (1 - Math.exp(-dt / SPD_TAU));
      var spdFrac = 1 - Math.exp(-spdEma / 90);
      setBar(spd, spdFrac);
      if (t - spdTextAt >= 200) { spdTextAt = t; spd.readout.textContent = pad3(spdFrac * 240); }

      // ladder: a damped spring banks and drifts the rungs off yaw/pitch rate, so it
      // overshoots slightly on release instead of snapping straight to a value. Reduced
      // motion skips the spring outright and only tracks pitch.
      if (BUNNYS.reduce) {
        updateLadder(BUNNYS.state.pitch, 0, 0, 0);
      } else {
        var rollG = BUNNYS.state.dragging ? 0.09 : 0.05, rollCap = BUNNYS.state.dragging ? 13 : 7;
        var rollTarget = clamp(yawRate * rollG, -rollCap, rollCap);
        var dxTarget = clamp(-yawRate * 0.12, -16, 16);
        var dyTarget = clamp(-pitchRate * 0.35, -10, 10);
        // sub-step so a slow (deferred-rAF) frame can't overdrive the spring
        var subDt = 1 / 30, steps = dt > subDt ? Math.ceil(dt / subDt) : 1, h = dt / steps;
        for (var i = 0; i < steps; i++) {
          springStep(ladderRoll, rollTarget, h);
          springStep(ladderDx, dxTarget, h);
          springStep(ladderDy, dyTarget, h);
        }
        updateLadder(BUNNYS.state.pitch, ladderRoll.cur, ladderDx.cur, ladderDy.cur);
      }
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
    (function tick(now) {
      requestAnimationFrame(tick);
      if (document.hidden) return;
      var t = now || performance.now();
      var dt = tick.last == null ? 1 / 60 : Math.min(0.25, (t - tick.last) / 1000);
      tick.last = t;
      drawBar(spd, dt); drawBar(alt, dt);
    })();
  }

  var resizeTimer = null;
  addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(place, 120);
  });
})();
