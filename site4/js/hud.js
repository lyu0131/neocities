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
  var UNIT_SERIAL = 'SL-01', BLOCK_REV = 'BLOCK 04C';

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
  var RAD = 100;
  var radar = el('g', { class: 'radar' });
  var radarCone, blips = [];
  var targets = Array.prototype.slice.call(document.querySelectorAll('.target'));

  var PAD = 16, HEAD = 22;
  // the scanning sweep: a rotating arm with a decaying phosphor trail behind it,
  // and blips that brighten as the arm passes their bearing then fade back down
  var SWEEP_MS = 3400, SWEEP_RATE = 360 / SWEEP_MS, SWEEP_PARK = 0;
  var SWEEP_TRAIL = 6, SWEEP_STEP = 10; // SWEEP_TRAIL * SWEEP_STEP deg of decay behind the arm
  var SWEEP_BEAM = 4, SWEEP_DECAY = 900; // deg either side that "lights" a blip; ms to fade
  var sweepGroup;
  function buildRadar() {
    // housing first, so the scope sits inside a panel rather than floating on the scene
    var w = RAD * 2 + PAD * 2, h = RAD * 2 + PAD * 2 + HEAD;
    var bx = -w / 2, by = -RAD - PAD - HEAD, headRuleY = -RAD - PAD;
    radar.appendChild(el('rect', { x: bx, y: by, width: w, height: h, rx: 3, fill: 'rgba(6,10,18,.82)' }));
    radar.appendChild(corners(bx, by, w, h));
    radar.appendChild(el('line', { x1: bx, y1: headRuleY, x2: bx + w, y2: headRuleY, opacity: .6 }));
    tickScale(radar, bx + 4, bx + w - 4, headRuleY, 10);
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
    var cap = el('text', { x: bx + 8, y: headRuleY - 7 });
    cap.textContent = 'SENSOR ARRAY';
    radar.appendChild(cap);
    stencil(radar, bx + w - 6, by + h - 6, 'end', 'BNS-SNS-7741A');

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
  var GAUGES = [
    { key: 'REACT', base: 0.92, drift: 0.03 },      // REACTOR STATUS
    { key: 'COOL',  base: 0.61, drift: 0.09 },
    { key: 'P-INT', base: 0.24, drift: 0.14 },      // PARTICLE INTERFERENCE
    { key: 'FRAME', base: 0.88, drift: 0.04 },      // FRAME INTEGRITY
    { key: 'THR-V', base: 0.50, drift: 0.30, fmt: fmtVector },     // THRUSTER VECTOR
    { key: 'SENSR', base: 0.70, drift: 0.11 },      // SENSOR ARRAY
    { key: 'WPN-L', base: 0.85, drift: 0.10, fmt: fmtLink },       // WEAPON LINK
    { key: 'HDPT',  base: 0.83, drift: 0.15, fmt: fmtHardpoint }   // HARDPOINT STATUS
  ];
  var LAMPS = ['IFF', 'LNK', 'NAV', 'GYR', 'THM', 'AUX', 'CORE']; // AUXILIARY BUS, CORE BLOCK
  var gaugeBox = el('g', { class: 'gauges' });
  var sparkPts = [], spark = null, lamps = [];
  // panel metrics: buildGauges (layout) and drawGauges (per-frame values) share these
  // instead of each hardcoding its own copy, so the two can't drift out of sync
  var G_PAD = 12, rowH = 20, barX = 46, barW = 72, sparkY = 0;
  function buildGauges() {
    var pctX = barX + barW + 10, pctW = 52; // wide enough for "STANDBY", not just "100%"
    var contentW = pctX + pctW; // widest row (label..bar..readout) sets the panel width

    var headerY = 9;                              // header baseline
    var ruleY = headerY + 9;
    var rowsY = ruleY + 16;                        // first gauge row baseline
    var rowsBottom = rowsY + GAUGES.length * rowH;
    var sparkLabelY = rowsBottom + 16;
    sparkY = sparkLabelY + 8;                      // sparkline frame top, shared with drawGauges
    var sparkH = 30;
    var lampsTop = sparkY + sparkH + 16;
    var lampH = 11;
    var lampLabelY = lampsTop + lampH + 11;
    var contentBottom = lampLabelY + 14;           // room for the lamp labels, then the stencil line below them

    // housing first, sized from the content above rather than a fixed guess
    var bx = -G_PAD, by = -G_PAD, bw = contentW + G_PAD * 2, bh = contentBottom + G_PAD * 2;
    gaugeBox.appendChild(el('rect', { x: bx, y: by, width: bw, height: bh, rx: 3, fill: 'rgba(6,10,18,.85)' }));
    gaugeBox.appendChild(corners(bx, by, bw, bh));
    var hdr = el('text', { x: 0, y: headerY });
    hdr.textContent = 'COMBAT SYSTEM';
    gaugeBox.appendChild(hdr);
    gaugeBox.appendChild(el('line', { x1: 0, y1: ruleY, x2: contentW, y2: ruleY, opacity: .55 }));
    tickScale(gaugeBox, 0, contentW, ruleY, 12);
    GAUGES.forEach(function (g, i) {
      var y = rowsY + i * rowH;
      var lbl = el('text', { x: 0, y: y + 4 });
      lbl.textContent = g.key;
      gaugeBox.appendChild(lbl);
      gaugeBox.appendChild(el('rect', { x: barX, y: y - 6, width: barW, height: 9 }));
      g.fill = el('rect', { x: barX + 1, y: y - 5, width: 1, height: 7, fill: 'currentColor', stroke: 'none' });
      gaugeBox.appendChild(g.fill);
      g.txt = el('text', { x: pctX + pctW, y: y + 4, 'text-anchor': 'end' });
      gaugeBox.appendChild(g.txt);
    });
    // particle-interference trend, so the panel has something moving that is not a bar
    var sl = el('text', { x: 0, y: sparkLabelY });
    sl.textContent = 'P-INT TREND';
    gaugeBox.appendChild(sl);
    gaugeBox.appendChild(el('rect', { x: 0, y: sparkY, width: contentW, height: sparkH, opacity: .45 }));
    spark = el('polyline', { points: '', opacity: .9 });
    gaugeBox.appendChild(spark);
    gaugeBox.appendChild(el('line', { x1: 0, y1: lampsTop - 8, x2: contentW, y2: lampsTop - 8, opacity: .35 }));
    stencil(gaugeBox, contentW, contentBottom - 3, 'end', UNIT_SERIAL + ' · BNS-SYS-206C');
    // status lamps -- box+pip+label, all measured down from lampsTop so the labels
    // land inside the housing instead of on its bottom edge
    LAMPS.forEach(function (name, i) {
      var lx = i * 26;
      var box = el('rect', { x: lx, y: lampsTop, width: 18, height: lampH, opacity: .8 });
      var pip = el('rect', { x: lx + 2, y: lampsTop + 2, width: 14, height: lampH - 4, fill: 'currentColor', stroke: 'none' });
      var t = el('text', { x: lx + 9, y: lampLabelY, 'text-anchor': 'middle', style: 'font-size:8px' });
      t.textContent = name;
      gaugeBox.appendChild(box); gaugeBox.appendChild(pip); gaugeBox.appendChild(t);
      lamps.push(pip);
    });
    svg.appendChild(gaugeBox);
  }

  function drawGauges(now) {
    GAUGES.forEach(function (g, i) {
      var v = clamp(g.base + Math.sin(now / (3100 + i * 900) + i) * g.drift, 0.02, 1);
      g.fill.setAttribute('width', (1 + v * (barW - 2)).toFixed(1));
      g.txt.textContent = g.fmt ? g.fmt(v) : Math.round(v * 100) + '%';
      g.fill.setAttribute('fill', v < 0.2 ? 'var(--lock, #FF3347)' : 'currentColor');
    });
    sparkPts.push(Math.sin(now / 900) * 0.4 + Math.sin(now / 340) * 0.3 + (Math.random() - 0.5) * 0.25);
    if (sparkPts.length > 58) sparkPts.shift();
    spark.setAttribute('points', sparkPts.map(function (v, i) {
      return (3 + i * 3) + ',' + (sparkY + 15 - clamp(v, -1, 1) * 12).toFixed(1);
    }).join(' '));
    lamps.forEach(function (pip, i) {
      var on = Math.sin(now / (1700 + i * 600) + i * 2) > -0.75;
      pip.setAttribute('fill', on ? 'currentColor' : 'rgba(140,255,193,.18)');
    });
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
    dosBox = el('rect', { x: -padX, y: boxTop, width: padX * 2, height: boxBottom - boxTop, rx: 3, fill: 'rgba(6,10,18,.9)' });
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
  var CAUTIONS = [
    'PARTICLE INTERFERENCE RISING',
    'COOLANT LOOP 2 OFF NOMINAL',
    'FRAME INTEGRITY: SECTOR 7 STRESS',
    'SENSOR ARRAY: GHOST CONTACT, BEARING 214',
    'PROPELLANT RESERVE LOW',
    'IFF STATUS: HANDSHAKE TIMEOUT',
    'WEAPON LINK DEGRADED',
    'AUXILIARY BUS OVERLOAD',
    'HARDPOINT STATUS: UNSECURED',
    'SENSOR ARRAY CALIBRATION REQUIRED',
    'SYSTEM OVERRIDE ENGAGED'
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
  function scheduleCaution() {
    var wait = 9000 + Math.random() * 16000;
    setTimeout(function () {
      warnText.textContent = CAUTIONS[Math.floor(Math.random() * CAUTIONS.length)];
      fitWarn();
      warn.setAttribute('opacity', 1);
      warn.classList.toggle('is-blinking', !BUNNYS.reduce);
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
      radar.setAttribute('opacity', room ? 1 : 0);
      gaugeBox.setAttribute('opacity', room ? 1 : 0);
      var colX = 22 + RAD + PAD;                       // centre of the left instrument column
      xf(radar, colX, H - RAD - PAD - 26);
      xf(gaugeBox, 34, Math.max(84, H * 0.11));
      // Low, not mid-screen: at 0.62 the card sat straight over the enemy suit's head and
      // torso, which is the one contact big enough to be worth looking at. Keep it under
      // the reticle but down in the lower third, still clear of the status line.
      // Derived, not dialled in: the card's own box height decides how high it has to
      // sit. A fixed fraction put it over the enemy suit's head at tall sizes and through
      // the status line at short ones. Sit it low, but never closer than 18px to the line.
      var dosBot = parseFloat(dosBox.getAttribute('y')) + parseFloat(dosBox.getAttribute('height'));
      xf(dossier, cx, clamp(H * 0.74, 200, statusY - 18 - dosBot));
      xf(warn, cx, clamp(H * 0.26, 90, 260));
      fitWarn(); // re-clamp the banner's width to the (possibly new) viewport
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

    buildRadar(); buildGauges(); buildWarn(); buildDossier();
    place();
    drawHeading(0); drawLadder(0, 0); drawRadar(0);

    BUNNYS.on('view', function (d) {
      drawHeading(d.yaw);
      drawLadder(d.pitch, clamp((d.vx || 0) * 1.2, -6, 6));
      drawRadar(d.yaw);
      setBar(spd, clamp(Math.abs(d.vx || 0) / 6, 0, 1));
      setBar(alt, clamp((d.pitch + 12) / 24, 0, 1), (d.pitch >= 0 ? '+' : '') + Math.round(d.pitch));
    });
    BUNNYS.on('lock', function (d) {
      status.textContent = d.id ? 'LOCK SEQUENCE: ' + d.label : IDLE_STATUS;
      setDossier(d);
      drawRadar(BUNNYS.state.yaw);
    });
    BUNNYS.on('boot-done', function () {
      status.textContent = IDLE_STATUS;
      scheduleCaution();
    });

    // gauges tick on their own clock; cheap, and pauses with the tab
    (function tick(now) {
      requestAnimationFrame(tick);
      if (document.hidden) return;
      var t = now || performance.now();
      var dt = tick.last == null ? 1 / 60 : Math.min(0.25, (t - tick.last) / 1000);
      tick.last = t;
      drawGauges(t);
      drawSweep(t);
      drawBar(spd, dt); drawBar(alt, dt);
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
