const path = require('path');
const { launch, check } = require('./cdp');
// Input sent before the deferred scripts have parsed is silently lost, and the suite
// starts Chrome three times over, so load time varies. Wait for the condition.
async function ready(pg, ms = 4000) {
  for (let i = 0; i < ms / 100; i++) {
    if (await pg.eval('!!window.BUNNYS && !!document.querySelector(".pano-slice")')) return true;
    await pg.sleep(100);
  }
  return false;
}
// Task 1: read the SPD bar's needle fraction and throttled readout straight off the
// DOM (no globals exposed for it) -- invert drawBar's y = barH - frac*barH*2.
function spdStateOf(pg) {
  return pg.eval(`(() => {
    const cap = Array.from(document.querySelectorAll('#hud text')).find(t => t.textContent === 'SPD');
    const g = cap.parentNode, lines = g.querySelectorAll('line');
    const barH = Math.abs(parseFloat(lines[0].getAttribute('y2')));
    const frac = (barH - parseFloat(lines[1].getAttribute('y1'))) / (barH * 2);
    return { frac, readout: g.querySelectorAll('text')[1].textContent };
  })()`);
}
// the ladder group carries class="ladder" so tests can find it without a global
function ladderRollOf(pg) {
  return pg.eval(`(() => {
    const m = /rotate\\(([-\\d.]+)/.exec(document.querySelector('.ladder').getAttribute('transform'));
    return m ? parseFloat(m[1]) : 0;
  })()`);
}
// Task 3: COMMS beside the SPD bar, the caution banner under TARGET ID's alarm log.
// rectExpr takes a JS expression (not just a selector) so it can also pick an element
// out by its content, the way panelSel() below already does for the left-column panels.
function rectExpr(pg, expr) {
  return pg.eval(`(() => { const e = ${expr}; if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
}
function rectOf(pg, sel) { return rectExpr(pg, `document.querySelector(${JSON.stringify(sel)})`); }
function overlaps(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
// hx.left/hx.right/hx.id/hxLog all carry class="hostile" with no id of their own --
// find the one that owns the given label text.
function hostileGroupWith(pg, label) {
  return rectExpr(pg, `[...document.querySelectorAll('#hud > g.hostile')].find(g =>
    [...g.querySelectorAll('text')].some(t => t.textContent === ${JSON.stringify(label)}))`);
}
function spdInsetOf(pg) {
  return pg.eval(`(() => {
    const cap = [...document.querySelectorAll('#hud text')].find(t => t.textContent === 'SPD');
    const m = /translate\\(([-\\d.]+)/.exec(cap.parentNode.getAttribute('transform'));
    return m ? parseFloat(m[1]) : 0;
  })()`);
}
// warnBox and warnInner are plain, unclassed <rect>s (first two direct children of
// .warn, in build order); warnPN is the only .stencil text inside .warn, warnTri the
// only <path>. `viewport` is real screen pixels (for comparing against COMMS/the alarm
// log, which live outside .warn's local space); box/inner/pn/tri/cap are all getBBox()
// in .warn's own local space -- the real rendered ink, not raw x/y/baseline coordinates:
// at a 7px font-size B612 Mono's cap-height alone spans most of the gap between
// warnInner's bottom and the box's, so coordinate arithmetic understated the overlap
// the owner actually saw on screen.
// innerStrokeHalf is warnInner's own rendered stroke width / 2 -- getBBox() is pure
// geometry and excludes stroke, but the stroke is real ink (amber, 1.5px, centred on
// the rect edge per the global `#hud :is(...,rect):not([fill])` rule), so a containment
// check against warnBox needs it added back in, or a poking-out stroke reads as clear.
function warnGeom(pg) {
  return pg.eval(`(() => {
    const g = document.querySelector('#hud .warn');
    const bb = el => { const b = el.getBBox(); return { y: b.y, bottom: b.y + b.height, x: b.x, right: b.x + b.width }; };
    const rects = g.querySelectorAll(':scope > rect');
    const boxEl = rects[0], innerEl = rects[1];
    const r = boxEl.getBoundingClientRect();
    return {
      viewport: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      box: bb(boxEl), inner: bb(innerEl),
      pn: bb(g.querySelector('.stencil')), tri: bb(g.querySelector('path')), cap: bb(g.querySelector('.warn-text')),
      innerStrokeHalf: (parseFloat(getComputedStyle(innerEl).strokeWidth) || 0) / 2
    };
  })()`);
}
// Forces the banner on screen deterministically instead of waiting on its 9-25s timer --
// place() sizes and positions it regardless of opacity, so this is enough to test geometry.
function forceBanner(pg, text) {
  return pg.eval(`(() => { const g = document.querySelector('#hud .warn');
    g.setAttribute('opacity', 1); g.querySelector('.warn-text').textContent = ${JSON.stringify(text)}; })()`);
}
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  await p.goto('index.html', 800);
  // T6: boot runs, finishes and can be skipped
  check('boot overlay present', await p.eval("!!document.getElementById('boot')"));
  await p.sleep(6800);
  check('boot done fires', await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true'));
  check('boot overlay gone', await p.eval("!document.getElementById('boot') || getComputedStyle(document.getElementById('boot')).display === 'none'"));

  // Task 4: one clock -- the splash+bar (css) and the log (boot.js) must never render at
  // the same time. Sample the live page every ~60ms across the whole boot instead of
  // trusting a couple of fixed-time snapshots, which could miss a real overlap.
  {
    const b = await launch({ width: 1440, height: 900 });
    await b.eval("sessionStorage.clear()");
    await b.goto('index.html', 300);
    const samples = [];
    for (let i = 0; i < 100 && !(await b.eval('!!window.BUNNYS && BUNNYS.state.booted === true')); i++) {
      samples.push(await b.eval(`(() => {
        const bar = document.querySelector('.boot-bar i');
        const m = bar && new DOMMatrix(getComputedStyle(bar).transform);
        const log = document.getElementById('boot-log');
        const splash = document.querySelector('.boot-splash');
        return {
          scaleX: m ? m.a : 0,
          hasLog: !!(log && log.textContent.trim().length),
          splashOpacity: splash ? parseFloat(getComputedStyle(splash).opacity) : 0
        };
      })()`));
      await b.sleep(60);
    }
    check('boot samples collected', samples.length > 5, 'n=' + samples.length);
    const withSplash = samples.find(s => s.hasLog && s.splashOpacity > 0.05);
    check('splash and log never on screen together', !withSplash, JSON.stringify(withSplash));
    const early = samples.find(s => s.hasLog && s.scaleX < 0.98);
    check('log never shown before the bar finishes', !early, JSON.stringify(early));
    check('the bar does reach full width', samples.some(s => s.scaleX >= 0.98));
    check('the log does run', samples.some(s => s.hasLog));
    b.close();
  }

  // Task 4: the bar's animation is gated on #boot.is-booting, which run() adds -- not
  // first paint. The sampling check above can't prove this on its own (a bar on its own
  // clock could just happen to finish before the log starts); check the gate directly.
  {
    const g = await launch({ width: 1440, height: 900 });
    await g.eval("sessionStorage.clear()");
    await g.goto('index.html', 0);
    let sawUngated = false, gatedName = '';
    for (let i = 0; i < 100; i++) {
      const s = await g.eval(`(() => {
        const boot = document.getElementById('boot');
        const bar = document.querySelector('.boot-bar i');
        return {
          gated: !!(boot && boot.classList.contains('is-booting')),
          name: bar ? getComputedStyle(bar).animationName : ''
        };
      })()`);
      if (!s.gated) { if (s.name === 'none') sawUngated = true; }
      else { gatedName = s.name; break; }
      await g.sleep(20);
    }
    check('bar does not animate before is-booting is added', sawUngated);
    check('bar animates once is-booting is added', gatedName === 'boot-fill', gatedName);
    g.close();
  }

  await p.eval("sessionStorage.clear()"); await p.goto('index.html', 600);
  // Retry the skip until it takes. A single keypress 600ms after navigation races
  // boot.js attaching its listener -- under load (the suite starts Chrome three times
  // over) the press lands first and is silently lost, the boot runs its full length, and
  // every interaction check below then fails against a hub that is not interactive yet.
  // That race was the whole of this file's intermittent failures.
  await ready(p);
  for (let i = 0; i < 30 && !(await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true')); i++) {
    await p.key(' ', 'Space', 32);
    await p.sleep(100);
  }
  check('skip boot works', await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true'));
  // Whether or not the skip landed, never drive the view until the hub is actually
  // interactive: cockpit.js drops every input while state.booted is false, so a drag sent
  // early is silently discarded and reads as "the drag did nothing". If the skip raced,
  // just let the boot finish on its own.
  for (let i = 0; i < 80 && !(await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true')); i++) await p.sleep(100);
  // T5: 24 slices, drag turns yaw, heading tape follows, arrows turn
  // the sphere is tessellated 24 longitude segments x N latitude bands
  const tiles = await p.eval("document.querySelectorAll('.pano-slice').length");
  check('sphere tessellated in 24-wide bands', tiles >= 24 && tiles % 24 === 0, tiles + ' tiles');
  const y0 = await p.eval('window.BUNNYS ? BUNNYS.state.yaw : 0');
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 10; k++) await p.mouse('mouseMoved', 700 - 30 * k, 450, 1); await p.mouse('mouseReleased', 400, 450);
  await p.sleep(900);
  const y1 = await p.eval('window.BUNNYS ? BUNNYS.state.yaw : 0');
  check('drag changes yaw', Math.abs(((y1 - y0 + 540) % 360) - 180) > 20, `${y0} -> ${y1}`);
  check('heading readout follows yaw', await p.eval("(()=>{const t=document.querySelector('#hud .hdg-readout');return !!t && Math.abs(((+t.textContent - ((BUNNYS.state.yaw%360)+360)%360)+540)%360-180) < 3})()"));
  await p.key('ArrowRight', 'ArrowRight', 39); await p.sleep(900);
  check('arrow key turns', Math.abs(await p.eval('window.BUNNYS ? BUNNYS.state.yaw : 0') - y1) > 5);
  // T5: focus a target link, view faces it, lock readout shows, Enter navigates
  await p.eval("document.querySelector('#targets-nav a[data-target=t-hangar]').focus()"); await p.sleep(1200);
  check('focus turns to hangar', Math.abs(((await p.eval('window.BUNNYS ? BUNNYS.state.yaw : 0') - 52 + 540) % 360) - 180) < 8);
  check('lock readout shown', /RX-124/.test(await p.eval("document.getElementById('lock-status').textContent")));
  await p.key('Enter', 'Enter', 13); await p.sleep(1500);
  check('Enter navigates to hangar', /hangar\.html$/.test(await p.eval('location.pathname')));
  // T5: unknown target locks but does not navigate
  await p.goto('index.html', 800);
  // the boot now replays on a plain reload, so skip it before driving the view
  await ready(p);
  await p.eval("document.getElementById('skip') && document.getElementById('skip').click()");
  for (let i = 0; i < 20 && !(await p.eval('BUNNYS.state.booted === true')); i++) await p.sleep(100);
  await p.eval("window.BUNNYS && BUNNYS.emit('face', {yaw:180})"); await p.sleep(1500);
  const u = await p.eval("(()=>{const r=document.getElementById('t-unknown').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await p.mouse('mouseMoved', u.x, u.y); await p.sleep(600);
  check('unknown locks', /UNIDENTIFIED/.test(await p.eval("document.getElementById('lock-status').textContent")));
  await p.mouse('mousePressed', u.x, u.y, 1); await p.mouse('mouseReleased', u.x, u.y); await p.sleep(900);
  check('unknown does not navigate', /index\.html$/.test(await p.eval('location.pathname')));

  // Task 1: SPD and the pitch ladder are driven by a per-frame motion sampler off
  // state.yaw/pitch (every input source), not the drag-only vx the view event carries.
  const boreBefore = await p.eval("document.querySelector('.boresight').getAttribute('transform')");
  // key() sends down+up together; hold D by dispatching the two events ourselves
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  let keySpd = { frac: 0, readout: '000' }, keyRoll = 0;
  for (let i = 0; i < 20; i++) {
    keySpd = await spdStateOf(p);
    keyRoll = await ladderRollOf(p);
    if (keySpd.frac > 0.3 && Math.abs(keyRoll) > 2) break;
    await p.sleep(100);
  }
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  check('SPD rises on held key', keySpd.frac > 0.3 && parseInt(keySpd.readout, 10) > 0, JSON.stringify(keySpd));
  check('ladder tilts on held key', Math.abs(keyRoll) > 2, 'roll ' + keyRoll);

  let restRoll = keyRoll, rollBack = false;
  for (let i = 0; i < 20; i++) {
    restRoll = await ladderRollOf(p);
    if (Math.abs(restRoll) < 0.5) { rollBack = true; break; }
    await p.sleep(100);
  }
  check('ladder returns within 2s of release', rollBack, 'roll ' + restRoll);

  let restSpd = keySpd, spdBack = false;
  for (let i = 0; i < 25; i++) {
    restSpd = await spdStateOf(p);
    if (restSpd.frac < 0.05) { spdBack = true; break; }
    await p.sleep(100);
  }
  check('SPD falls back within 2.5s of release', spdBack, 'frac ' + restSpd.frac);

  await p.mouse('mousePressed', 700, 450, 1);
  let dragSpdMax = 0, dragRollMax = 0;
  for (let k = 1; k <= 14; k++) {
    await p.mouse('mouseMoved', 700 - 45 * k, 450, 1);
    const s = await spdStateOf(p), r = await ladderRollOf(p);
    if (s.frac > dragSpdMax) dragSpdMax = s.frac;
    if (Math.abs(r) > Math.abs(dragRollMax)) dragRollMax = r;
    await p.sleep(30);
  }
  await p.mouse('mouseReleased', 700 - 45 * 14, 450);
  check('SPD reads higher on drag than key', dragSpdMax > keySpd.frac, `drag ${dragSpdMax} vs key ${keySpd.frac}`);
  check('ladder tilts more on drag than key', Math.abs(dragRollMax) > Math.abs(keyRoll), `drag ${dragRollMax} vs key ${keyRoll}`);
  await p.sleep(1200);
  const boreAfter = await p.eval("document.querySelector('.boresight').getAttribute('transform')");
  check('boresight untouched by motion sampler', boreBefore === boreAfter, `${boreBefore} vs ${boreAfter}`);

  check('no h-overflow', await p.eval('document.documentElement.scrollWidth <= innerWidth'));
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  await p.shot(path.join(__dirname, 'out/hub-1440.png'), false);
  p.close();
  // reduced motion: no boot animation, still interactive
  const r = await launch({ width: 1440, height: 900, reduce: true });
  await r.goto('index.html', 900);
  // wait for readiness instead of assuming a fixed load time: cockpit.js parses before
  // boot.js, so booted===true means its key listeners are attached. A bare sleep raced
  // script load and made the arrow check flaky.
  for (let i = 0; i < 40 && !(await r.eval('!!window.BUNNYS && BUNNYS.state.booted === true')); i++) await r.sleep(100);
  check('reduced motion: booted at once', await r.eval('!!window.BUNNYS && BUNNYS.state.booted === true'));
  // Task 4: #boot is already gone by now (finish(true) removes it synchronously before
  // run() ever adds .is-booting), so there's no live bar left to sample. Probe the CSS
  // rule itself with a detached element that matches the same selector.
  check('reduced motion: bar not animated', await r.eval(`(() => {
    const i = document.createElement('i');
    const div = document.createElement('div'); div.className = 'boot-bar'; div.appendChild(i);
    document.body.appendChild(div);
    const name = getComputedStyle(i).animationName;
    div.remove();
    return name === 'none';
  })()`));
  // Poll rather than sleep a fixed time: headless defers requestAnimationFrame until
  // something wakes the compositor, so the easing that applies the keypress can start
  // late. The keypress itself registers immediately.
  await r.key('ArrowLeft', 'ArrowLeft', 37);
  let rYaw = 0;
  for (let i = 0; i < 25; i++) {
    rYaw = await r.eval('window.BUNNYS ? BUNNYS.state.yaw : 0');
    if (Math.abs(rYaw) > 5) break;
    await r.sleep(100);
  }
  check('reduced motion: arrows still turn', Math.abs(rYaw) > 5, 'yaw ' + rYaw);
  // Task 1: reduced motion pins the ladder to plain pitch tracking -- no spring roll
  await r.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await r.sleep(600);
  const reducedRoll = await ladderRollOf(r);
  await r.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  check('reduced motion: ladder roll stays 0', reducedRoll === 0, 'roll ' + reducedRoll);
  r.close();

  // Task 2: ENVIRONMENT panel, placed under THRUSTER VECTOR and above SENSOR ARRAY in
  // the left column. reduce:true finishes boot instantly (see above) and the clock still
  // ticks under reduced motion, so it is also the fastest way to reach a settled layout.
  function panelSel(title) {
    return `[...document.querySelectorAll('#hud > g.panel')].find(g => g.querySelector('text').textContent === '${title}')`;
  }
  function panelRect(pg, title) {
    return pg.eval(`(() => { const g = ${panelSel(title)}; if (!g) return null;
      const r = g.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, opacity: g.getAttribute('opacity') };
    })()`);
  }
  function radarTop(pg) {
    return pg.eval("(() => { const g = document.querySelector('#hud > g.radar'); return g ? g.getBoundingClientRect().top : null; })()");
  }
  async function bootedReduced(pg) {
    for (let i = 0; i < 40 && !(await pg.eval('!!window.BUNNYS && BUNNYS.state.booted === true')); i++) await pg.sleep(100);
  }

  const e = await launch({ width: 1920, height: 1080, reduce: true });
  await e.goto('index.html', 900);
  await bootedReduced(e);
  const envRect = await panelRect(e, 'ENVIRONMENT');
  const thrRect = await panelRect(e, 'THRUSTER VECTOR');
  const radar1080 = await radarTop(e);
  check('ENVIRONMENT visible at 1920x1080', !!envRect && envRect.opacity !== '0', JSON.stringify(envRect));
  check('ENVIRONMENT sits below THRUSTER VECTOR', !!envRect && !!thrRect && envRect.top >= thrRect.bottom,
    `env.top ${envRect && envRect.top} vs thr.bottom ${thrRect && thrRect.bottom}`);
  check('ENVIRONMENT clears SENSOR ARRAY above it', !!envRect && radar1080 != null && envRect.bottom <= radar1080,
    `env.bottom ${envRect && envRect.bottom} vs radar.top ${radar1080}`);
  check('ENVIRONMENT shares THRUSTER VECTOR\'s column', !!envRect && !!thrRect &&
    Math.abs(envRect.left - thrRect.left) < 0.5 && Math.abs(envRect.right - thrRect.right) < 0.5,
    JSON.stringify({ env: envRect, thr: thrRect }));

  // the clock is this panel's one live instrument (the reactor has its trace, the
  // thruster its cross) -- it should visibly tick even with reduced motion on
  function clockText() {
    return e.eval(`(() => { const g = ${panelSel('ENVIRONMENT')};
      const t = g && [...g.querySelectorAll('text')].find(t => /^\\d{2}:\\d{2}:\\d{2}$/.test(t.textContent));
      return t ? t.textContent : null; })()`);
  }
  const c0 = await clockText();
  let c1 = c0, ticked = false;
  for (let i = 0; i < 20 && !ticked; i++) { await e.sleep(100); c1 = await clockText(); if (c1 && c1 !== c0) ticked = true; }
  check('ENVIRONMENT clock advances within 2s', ticked, `${c0} -> ${c1}`);

  // Fix round 1: the arrow's rotation must never bring it within 6px of the value text
  // at any heading it can reach -- flip reduce off on this already-booted page so the
  // wind direction actually drifts, then sample the live rendered gap across a few
  // frames instead of trusting the geometry on paper (BUNNYS.reduce is read fresh each
  // frame in drawPanels, so flipping it here takes effect without a reload)
  await e.eval('window.BUNNYS.reduce = false');
  function windGap() {
    return e.eval(`(() => {
      const g = ${panelSel('ENVIRONMENT')};
      const arrow = g.querySelector('path');
      const value = [...g.querySelectorAll('text')].find(t => /KT$/.test(t.textContent));
      if (!arrow || !value) return null;
      const a = arrow.getBoundingClientRect(), v = value.getBoundingClientRect();
      return v.left - a.right;
    })()`);
  }
  let minGap = Infinity;
  for (let i = 0; i < 10; i++) {
    const gap = await windGap();
    if (gap != null && gap < minGap) minGap = gap;
    await e.sleep(300);
  }
  check('wind arrow stays >=6px clear of the value text across headings', minGap >= 5.9, 'min gap ' + minGap.toFixed(2));
  e.close();

  // stand-down order: ENVIRONMENT gives way before THRUSTER when the column is short
  const s = await launch({ width: 1440, height: 900, reduce: true });
  await s.goto('index.html', 900);
  await bootedReduced(s);
  const envSmall = await panelRect(s, 'ENVIRONMENT');
  const thrSmall = await panelRect(s, 'THRUSTER VECTOR');
  check('ENVIRONMENT hidden at 1440x900', !!envSmall && envSmall.opacity === '0', JSON.stringify(envSmall));
  check('THRUSTER VECTOR still shown at 1440x900', !!thrSmall && thrSmall.opacity !== '0', JSON.stringify(thrSmall));
  s.close();

  // Task 3: COMMS beside the SPD bar, centred on it at 1920x1080; the caution banner
  // gets its own slot below TARGET ID's alarm log, and its stencil no longer overlaps
  // the box edges. The banner is forced visible through the DOM rather than waiting on
  // its 9-25s timer -- place() sizes/positions it regardless of opacity.
  const t3 = await launch({ width: 1920, height: 1080, reduce: true });
  await t3.goto('index.html', 900);
  await bootedReduced(t3);
  await t3.eval("document.querySelector('[data-mode=comms]').click()");
  await forceBanner(t3, 'PROPELLANT RESERVE LOW');
  await t3.sleep(150);
  const inset1920 = await spdInsetOf(t3);
  const comms1920 = await rectOf(t3, '#comms');
  const banner1920 = await warnGeom(t3);
  const log1920 = await rectOf(t3, '#hud .hx-log');
  const vh1920 = await t3.eval('innerHeight');
  check('COMMS sits right of the SPD bar at 1920x1080', comms1920.left >= inset1920 + 20,
    `left ${comms1920 && comms1920.left} vs inset+20 ${inset1920 + 20}`);
  check('COMMS is vertically centred on the SPD bar at 1920x1080',
    !!comms1920 && Math.abs((comms1920.top + comms1920.bottom) / 2 - vh1920 / 2) <= 4,
    `mid ${comms1920 && (comms1920.top + comms1920.bottom) / 2} vs ${vh1920 / 2}`);
  check('COMMS and the forced-visible banner do not overlap at 1920x1080',
    !overlaps(comms1920, banner1920.viewport), JSON.stringify({ comms: comms1920, banner: banner1920.viewport }));
  check("banner sits at/below TARGET ID's alarm log at 1920x1080",
    banner1920.viewport.top >= log1920.bottom - 0.5,
    `banner.top ${banner1920.viewport.top} vs log.bottom ${log1920.bottom}`);
  // The stencil's own rendered box (getBBox, real ink -- not the baseline y or the
  // rect attributes) vs warnInner's and the outer box's, since at 7px font-size the
  // cap-height alone consumed most of the coordinate-space gap: see warnGeom().
  check("banner stencil's rendered box clears warnInner's bottom by >=4px",
    banner1920.pn.y - banner1920.inner.bottom >= 4,
    `pn.y ${banner1920.pn.y} vs inner.bottom ${banner1920.inner.bottom}`);
  check("banner stencil's rendered box clears the outer box's bottom by >=4px",
    banner1920.box.bottom - banner1920.pn.bottom >= 4,
    `box.bottom ${banner1920.box.bottom} vs pn.bottom ${banner1920.pn.bottom}`);
  check("banner stencil's rendered box clears the outer box's right edge (brackets) by >=14px",
    banner1920.box.right - banner1920.pn.right >= 14,
    `box.right ${banner1920.box.right} vs pn.right ${banner1920.pn.right}`);
  check('the triangle and caption stay inside warnInner with >=2px (rendered)',
    banner1920.tri.y - banner1920.inner.y >= 2 && banner1920.inner.bottom - banner1920.tri.bottom >= 2 &&
    banner1920.cap.y - banner1920.inner.y >= 2 && banner1920.inner.bottom - banner1920.cap.bottom >= 2,
    JSON.stringify({ inner: banner1920.inner, tri: banner1920.tri, cap: banner1920.cap }));
  // warnInner (including half its own rendered stroke, which extends past its plain
  // geometry) must sit fully inside warnBox with >=4px to spare on every side -- the
  // WARN_CAP_LIFT fix's own regression: shifting warnInner's top along with its bottom
  // pushed its stroke ~1.75px outside warnBox's top edge on every viewport.
  check('warnInner (incl. its stroke) sits inside warnBox with >=4px on all sides',
    (banner1920.inner.y - banner1920.innerStrokeHalf) - banner1920.box.y >= 4 &&
    banner1920.box.bottom - (banner1920.inner.bottom + banner1920.innerStrokeHalf) >= 4 &&
    (banner1920.inner.x - banner1920.innerStrokeHalf) - banner1920.box.x >= 4 &&
    banner1920.box.right - (banner1920.inner.right + banner1920.innerStrokeHalf) >= 4,
    JSON.stringify({ box: banner1920.box, inner: banner1920.inner, strokeHalf: banner1920.innerStrokeHalf }));
  check("the outer box's bottom edge stays at its fixed local y=30 (never grows downward)",
    banner1920.box.bottom === 30, `box.bottom ${banner1920.box.bottom}`);
  check('no h-overflow with COMMS open and banner forced at 1920x1080',
    await t3.eval('document.documentElement.scrollWidth <= innerWidth'));
  await t3.shot(path.join(__dirname, 'out/task3-1920.png'), false);
  t3.close();

  // At 1440x900 the centred band is too narrow (POP_MIN), so COMMS slides up the bar
  // instead -- check it clears every neighbouring box in that mode.
  const t3b = await launch({ width: 1440, height: 900, reduce: true });
  await t3b.goto('index.html', 900);
  await bootedReduced(t3b);
  await t3b.eval("document.querySelector('[data-mode=comms]').click()");
  await forceBanner(t3b, 'PROPELLANT RESERVE LOW');
  await t3b.sleep(150);
  const comms1440 = await rectOf(t3b, '#comms');
  const readouts1440 = await hostileGroupWith(t3b, 'BEARING');
  const targetId1440 = await hostileGroupWith(t3b, 'TARGET ID');
  const dossier1440 = await rectOf(t3b, '#hud .dossier > rect');
  const banner1440 = await warnGeom(t3b);
  check('COMMS does not overlap the reticle readouts at 1440x900',
    !overlaps(comms1440, readouts1440), JSON.stringify({ comms: comms1440, readouts: readouts1440 }));
  check('COMMS does not overlap TARGET ID at 1440x900',
    !overlaps(comms1440, targetId1440), JSON.stringify({ comms: comms1440, id: targetId1440 }));
  check('COMMS does not overlap the dossier card at 1440x900',
    !overlaps(comms1440, dossier1440), JSON.stringify({ comms: comms1440, dossier: dossier1440 }));
  check('COMMS does not overlap the banner at 1440x900',
    !overlaps(comms1440, banner1440.viewport), JSON.stringify({ comms: comms1440, banner: banner1440.viewport }));
  check('no h-overflow with COMMS open and banner forced at 1440x900',
    await t3b.eval('document.documentElement.scrollWidth <= innerWidth'));
  await t3b.shot(path.join(__dirname, 'out/task3-1440.png'), false);
  t3b.close();
})();
