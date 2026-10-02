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
// the ladder group carries class="ladder" so tests can find it without a global.
// Returns null (not 0) when the selector or the rotate() match fails, so a caller has
// to notice a broken lookup instead of it silently reading as "no roll" -- Math.abs(0)
// and Math.abs(null) are the same value, so treating them the same used to let a
// broken selector pass every roll check for free.
function ladderRollOf(pg) {
  return pg.eval(`(() => {
    const l = document.querySelector('.ladder');
    const m = l && /rotate\\(([-\\d.]+)/.exec(l.getAttribute('transform'));
    return m ? parseFloat(m[1]) : null;
  })()`);
}
// Task 3: COMMS beside the SPD bar, the caution banner under TARGET ID's alarm log.
// rectExpr takes a JS expression (not just a selector) so it can also pick an element
// out by its content, the way panelSel() below already does for the left-column panels.
function rectExpr(pg, expr) {
  return pg.eval(`(() => { const e = ${expr}; if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, opacity: e.getAttribute('opacity') }; })()`);
}
function rectOf(pg, sel) { return rectExpr(pg, `document.querySelector(${JSON.stringify(sel)})`); }
function overlaps(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
// Important 2 (final review): the ladder's rungs, as their own real screen rects -- not
// the whole .ladder group's bounding box, which spans the gaps between rungs too and
// would over-report an overlap that never touches real ink. updateLadder() appends each
// rung as [rung line, tickL, tickR], in that order, so every 3rd <line> is a rung.
function ladderRungRects(pg) {
  return pg.eval(`(() => {
    const lines = [...document.querySelectorAll('#hud .ladder > line')];
    return lines.filter((_, i) => i % 3 === 0).map(l => {
      const r = l.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
  })()`);
}
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
function BUNNYS_delta(a, b) { return ((b - a + 540) % 360) - 180; }
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  await p.goto('index.html', 800);
  // T6: boot runs, finishes and can be skipped
  check('boot overlay present', await p.eval("!!document.getElementById('boot')"));
  await p.sleep(11000);  // the boot runs about 9.0s once the page has loaded
  check('boot done fires', await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true'));
  check('boot overlay gone', await p.eval("!document.getElementById('boot') || getComputedStyle(document.getElementById('boot')).display === 'none'"));
  check('boot canvas gone', await p.eval("!document.getElementById('boot-scene')"));
  // the unit insignia turns in the top band's corner, above the right column, for good
  check('cockpit shows the unit insignia', await p.eval("(() => { const e = document.getElementById('insignia'); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 30 && r.left > innerWidth / 2 && r.top >= 0 && cs.visibility === 'visible' && +cs.opacity > 0.5; })()"));
  check('the insignia turns', /insignia-spin/.test(await p.eval("getComputedStyle(document.querySelector('#insignia .insignia-coin')).animationName")));

  // The boot is one continuous shot in four stages (boot.js): COCKPIT, UNIT CHECK, PILOT ID,
  // LAUNCH. Sample the live page every ~60ms across the whole boot instead of trusting a
  // couple of fixed-time snapshots, which could miss a stage or catch one out of order.
  {
    const b = await launch({ width: 1440, height: 900 });
    await b.eval("sessionStorage.clear()");
    await b.goto('index.html', 300);
    const samples = [];
    for (let i = 0; i < 220 && !(await b.eval('!!window.BUNNYS && BUNNYS.state.booted === true')); i++) {
      samples.push(await b.eval(`(() => {
        const bar = document.querySelector('.boot-bar i');
        const m = bar && new DOMMatrix(getComputedStyle(bar).transform);
        const q = s => (document.querySelector(s) || {}).textContent || '';
        // how much of the canvas's middle is lifted off the #060A12 ground: the suit figure under the IFF brackets
        let fig = 0;
        const c = document.getElementById('boot-scene');
        if (c && c.width) {
          const w = c.width * .3, h = c.height * .5, d = c.getContext('2d').getImageData(c.width * .35, c.height * .25, w, h).data;
          let n = 0; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - 6) + Math.abs(d[i + 1] - 10) + Math.abs(d[i + 2] - 18) > 40) n++;
          fig = n / (d.length / 16);
        }
        return { scaleX: m ? m.a : 0, stage: q('.boot-stage-txt'), note: q('.boot-note'), log: q('#boot-log'),
                 powering: !!document.querySelector('#screens.powering'), fig: fig };
      })()`));
      await b.sleep(60);
    }
    check('boot samples collected', samples.length > 5, 'n=' + samples.length);
    // every stage shows, in order, and none repeats after the next has begun
    const order = [];
    samples.forEach(s => { const n = (s.stage.match(/^0(\d)/) || [])[1]; if (n && order[order.length - 1] !== n) order.push(n); });
    check('the four stages run in order', order.join('') === '1234', order.join(','));
    check('the pilot is connected on screen', samples.some(s => s.note === 'PILOT CONNECTED'));
    const figAt = samples.filter(s => /PILOT ID/.test(s.stage)).map(s => s.fig);
    check('PILOT ID shows the suit figure under the brackets', figAt.length && figAt.slice().sort((a, b) => a - b)[figAt.length >> 1] > 0.08, 'coverage ' + figAt.map(v => v.toFixed(3)).join(','));
    check('the launch call shows', samples.some(s => s.note === 'LAUNCHING'));
    check('the blueprint stage is gone', !samples.some(s => /DRAFTING|DESIGNED BY/.test(s.note)), samples.map(s => s.note).filter((v, i, a) => v && a.indexOf(v) === i).join(','));
    check('stage 2 verifies the unit', samples.some(s => s.note === 'UNIT VERIFIED'));
    check('the log runs', samples.some(s => s.log.trim().length > 0));
    // one clock: the log is already rolling while the bar is still near-empty, and the bar
    // does reach the end before the hub takes over
    check('log starts while the bar is still near-empty', samples.some(s => s.log.trim() && s.scaleX < 0.25));
    check('the bar does reach full width', samples.some(s => s.scaleX >= 0.95));
    const screensMidBoot = samples.some(s => s.powering);
    check('the five screens power up during the boot', screensMidBoot, 'never saw #screens.powering before boot-done');
    check('the launch arrives facing PILOT', Math.abs(((await b.eval('BUNNYS.state.yaw') + 52 + 540) % 360) - 180) < 3);
    b.close();
  }

  // One clock: the bar only moves once boot.js's run() starts (it adds #boot.is-booting),
  // never at first paint, and boot.js is what drives its scaleX from then on.
  {
    const g = await launch({ width: 1440, height: 900 });
    await g.eval("sessionStorage.clear()");
    await g.goto('index.html', 0);
    let sawUngatedAtZero = false, grew = false;
    for (let i = 0; i < 150 && !grew; i++) {
      const s = await g.eval(`(() => {
        const boot = document.getElementById('boot');
        const bar = document.querySelector('.boot-bar i');
        const tf = bar ? getComputedStyle(bar).transform : 'none';
        return { gated: !!(boot && boot.classList.contains('is-booting')), sx: tf === 'none' ? 0 : new DOMMatrix(tf).a };
      })()`);
      if (!s) { await g.sleep(20); continue; }   // page not there yet mid-navigation
      if (!s.gated && s.sx < 0.01) sawUngatedAtZero = true;
      if (s.gated && s.sx > 0.05) grew = true;
      await g.sleep(20);
    }
    check('bar sits empty until the boot clock starts', sawUngatedAtZero);
    check('bar fills once the boot clock runs', grew);
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
  // the cockpit powers on in sequence after the boot: every group gets its own delay (DOM order is not
  // sequence order, so compare as a set), then the class clears
  const pwDelays = await p.eval("[...document.querySelectorAll('.pw')].map(n => parseFloat(n.style.getPropertyValue('--d')))");
  check('power-on staggers the instruments', pwDelays.length >= 8 && new Set(pwDelays).size === pwDelays.length && Math.max(...pwDelays) > 0, pwDelays.join(','));
  for (let i = 0; i < 30 && await p.eval("!!document.querySelector('.pw')"); i++) await p.sleep(100);
  check('power-on classes clear afterwards', !(await p.eval("!!document.querySelector('.pw')")));
  check('five canopy screens are drawn', await p.eval("document.querySelectorAll('#screens .screen').length === 5"));
  for (let i = 0; i < 30 && await p.eval("document.getElementById('screens').classList.contains('powering')"); i++) await p.sleep(100);
  check('screens finish powering on and clear', await p.eval("!document.getElementById('screens').classList.contains('powering') && [...document.querySelectorAll('#screens .shutter')].every(s => getComputedStyle(s).opacity === '0')"));
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
  await p.key('Enter', 'Enter', 13); await p.sleep(450);
  // the canopy shutters (js/link.js) close over the cockpit before it leaves, on its real seams
  check('firing closes the canopy shutters', await p.eval("(()=>{const l=document.getElementById('link');return !!l && l.querySelectorAll('.link-blade').length===5})()"));
  // #link polygon's points are percentages (its svg is a 0-100 viewBox, preserveAspectRatio="none"),
  // so they're converted back to px on each axis before comparing against the cockpit's own seam
  check('the closed glass carries the emblem, already loaded', await p.eval("(() => { const i = document.querySelector('#link .link-emblem'); return !!i && i.complete && i.naturalWidth > 0; })()"));
  check('shutters sit on the cockpit seams', await p.eval("(()=>{const vb=document.getElementById('screens').viewBox.baseVal,k=innerWidth/vb.width,c=document.querySelectorAll('#screens .shutter')[1].points[0],l=document.querySelectorAll('#link polygon')[1].points[0],lx=l.x/100*innerWidth,ly=l.y/100*innerHeight;return Math.abs(c.x*k-lx)<1&&Math.abs(c.y*k-ly)<1})()"));
  await p.sleep(1050);
  check('Enter navigates to hangar', /hangar\.html$/.test(await p.eval('location.pathname')));
  check('arrival comes in through the shutters', await p.eval("document.documentElement.classList.contains('linked')"));
  await p.sleep(1500);
  check('arrival shutters open and clear', await p.eval("!document.getElementById('link') && !document.documentElement.classList.contains('link-in')"));
  // T5: the unknown target locks, and firing it opens its open channel (unknown.html)
  await p.goto('index.html', 800);
  // the boot now replays on a plain reload, so skip it before driving the view
  await ready(p);
  await p.eval("document.getElementById('skip') && document.getElementById('skip').click()");
  for (let i = 0; i < 20 && !(await p.eval('BUNNYS.state.booted === true')); i++) await p.sleep(100);
  await p.eval("window.BUNNYS && BUNNYS.emit('face', {yaw:180})"); await p.sleep(1500);
  const u = await p.eval("(()=>{const r=document.getElementById('t-unknown').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await p.mouse('mouseMoved', u.x, u.y); await p.sleep(600);
  check('unknown locks', /UNIDENTIFIED/.test(await p.eval("document.getElementById('lock-status').textContent")));
  check('unknown lock tells you how in', /OPEN CHANNEL/.test(await p.eval("document.getElementById('hud').textContent")));
  await p.mouse('mousePressed', u.x, u.y, 1); await p.mouse('mouseReleased', u.x, u.y); await p.sleep(1600);
  check('unknown opens the open channel', /unknown\.html$/.test(await p.eval('location.pathname')));

  // Enter fires whatever is locked, not just a focused nav link
  const backToHub = async () => {
    await p.goto('index.html', 800); await ready(p);
    await p.eval("document.getElementById('skip') && document.getElementById('skip').click()");
    for (let i = 0; i < 20 && !(await p.eval('BUNNYS.state.booted === true')); i++) await p.sleep(100);
  };
  await backToHub();
  // the one contacts table (bunnys.js) and the cockpit's targets must agree (checked back in the cockpit: the UNKNOWN click above now opens unknown.html)
  check('index targets match BUNNYS.contacts', await p.eval("BUNNYS.contacts.every(c => { const t = document.getElementById(c.id); return t && +t.dataset.yaw === c.yaw && t.dataset.label === c.label && (!c.rng || t.dataset.readout.includes(c.rng)); })"));
  await p.eval("BUNNYS.emit('face', {yaw:0}); document.activeElement && document.activeElement.blur()"); await p.sleep(1500);
  await p.key('Enter', 'Enter', 13); await p.sleep(1600);
  check('Enter opens the boresight lock', /missions\.html$/.test(await p.eval('location.pathname')));
  await backToHub();
  // a real Enter, with its text: without it the browser never clicks a focused button
  const enter = async () => { for (const type of ['keyDown', 'keyUp']) await p.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? String.fromCharCode(13) : undefined }); };
  await p.eval("document.querySelector('[data-slew=t-hangar]').focus()");
  await enter(); await p.sleep(1600);
  check('Enter on SLEW turns first', /index\.html$/.test(await p.eval('location.pathname')) && Math.abs(((await p.eval('BUNNYS.state.yaw')) - 52 + 540) % 360 - 180) < 3);
  await enter(); await p.sleep(1600);
  check('Enter on SLEW again opens it', /hangar\.html$/.test(await p.eval('location.pathname')));
  await backToHub();
  // number keys: 4 swings onto the unknown contact and locks it
  await p.key('4', 'Digit4', 52); await p.sleep(2200);
  check('4 locks the unknown contact', /UNIDENTIFIED/.test(await p.eval("document.getElementById('lock-status').textContent")));
  // Home turns the view, so it lets a number-key lock go: the lock follows the reticle again
  await p.key('1', 'Digit1', 49); await p.sleep(1500);
  await p.key('Home', 'Home', 36); await p.sleep(1800);
  check('Home releases a number-key lock', /MISSIONS|2 ACTIVE/.test(await p.eval("document.getElementById('lock-status').textContent")));
  // 3 only locks; Enter, even mid-swing, opens what 3 picked (not a contact the reticle crosses)
  await p.key('3', 'Digit3', 51); await p.sleep(1200);
  check('3 locks without leaving', /index\.html$/.test(await p.eval('location.pathname')) && /RX-124/.test(await p.eval("document.getElementById('lock-status').textContent")));
  await p.key('1', 'Digit1', 49); await p.sleep(150);
  await p.key('Enter', 'Enter', 13); await p.sleep(1800);
  check('Enter mid-swing opens the picked contact', /pilot\.html$/.test(await p.eval('location.pathname')));
  await backToHub();

  // Task 1: SPD and the pitch ladder are driven by a per-frame motion sampler off
  // state.yaw/pitch (every input source), not the drag-only vx the view event carries.
  const boreBefore = await p.eval("document.querySelector('.boresight').getAttribute('transform')");
  // key() sends down+up together; hold D by dispatching the two events ourselves
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  let keySpd = { frac: 0, readout: '000' }, keyRoll = null;
  for (let i = 0; i < 20; i++) {
    keySpd = await spdStateOf(p);
    keyRoll = await ladderRollOf(p);
    if (keySpd.frac > 0.3 && keyRoll !== null && Math.abs(keyRoll) > 2) break;
    await p.sleep(100);
  }
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  check('SPD rises on held key', keySpd.frac > 0.3 && parseInt(keySpd.readout, 10) > 0, JSON.stringify(keySpd));
  check('ladder tilts on held key', keyRoll !== null && Math.abs(keyRoll) > 2, 'roll ' + keyRoll);

  let restRoll = keyRoll, rollBack = false;
  for (let i = 0; i < 20; i++) {
    restRoll = await ladderRollOf(p);
    // null (the .ladder selector found nothing) must not read as "back at rest" --
    // Math.abs(null) coerces to 0, which used to make a broken selector pass this
    // check for free instead of failing it
    if (restRoll !== null && Math.abs(restRoll) < 0.5) { rollBack = true; break; }
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
    if (r !== null && Math.abs(r) > Math.abs(dragRollMax)) dragRollMax = r;
    await p.sleep(30);
  }
  await p.mouse('mouseReleased', 700 - 45 * 14, 450);
  check('SPD reads higher on drag than key', dragSpdMax > keySpd.frac, `drag ${dragSpdMax} vs key ${keySpd.frac}`);
  check('ladder tilts more on drag than key', keyRoll !== null && Math.abs(dragRollMax) > Math.abs(keyRoll), `drag ${dragRollMax} vs key ${keyRoll}`);
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
  check('reduced motion: the insignia holds still', await r.eval("(() => { const c = document.querySelector('#insignia .insignia-coin'); return !!c && getComputedStyle(c).animationName === 'none'; })()"));
  // Poll rather than sleep a fixed time: headless defers requestAnimationFrame until
  // something wakes the compositor, so the easing that applies the keypress can start
  // late. The keypress itself registers immediately.
  // Measured from where the view starts (the boot lands facing PILOT, not 0), so the check
  // can't pass on the starting heading alone.
  const rYaw0 = await r.eval('window.BUNNYS ? BUNNYS.state.yaw : 0');
  await r.key('ArrowLeft', 'ArrowLeft', 37);
  let rYaw = rYaw0, rTurn = 0;
  for (let i = 0; i < 25; i++) {
    rYaw = await r.eval('window.BUNNYS ? BUNNYS.state.yaw : 0');
    rTurn = Math.abs(((rYaw - rYaw0 + 540) % 360) - 180);
    if (rTurn > 5) break;
    await r.sleep(100);
  }
  check('reduced motion: arrows still turn', rTurn > 5, `${rYaw0} -> ${rYaw}`);
  // Task 1: reduced motion pins the ladder to plain pitch tracking -- no spring roll.
  // Guard against a vacuous pass: confirm D actually turned the view during the hold,
  // the same way the arrow-key check above does, so "roll stays 0" can't pass just
  // because the key never registered.
  const yawBeforeD = await r.eval('window.BUNNYS ? BUNNYS.state.yaw : 0');
  await r.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  await r.sleep(600);
  const reducedRoll = await ladderRollOf(r);
  const yawAfterD = await r.eval('window.BUNNYS ? BUNNYS.state.yaw : 0');
  await r.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  check('reduced motion: D actually turns the view (guards the roll check below)',
    Math.abs(((yawAfterD - yawBeforeD + 540) % 360) - 180) > 3, `${yawBeforeD} -> ${yawAfterD}`);
  check('reduced motion: ladder roll stays 0', reducedRoll === 0, 'roll ' + reducedRoll);
  r.close();

  // Task 2: ENVIRONMENT panel, placed under THRUSTER VECTOR and above SENSOR ARRAY in
  // the left column. reduce:true finishes boot instantly (see above) and the clock still
  // ticks under reduced motion, so it is also the fastest way to reach a settled layout.
  function panelSel(title) {
    return `[...document.querySelectorAll('#hud > g.panel')].find(g => g.querySelector('text').textContent === '${title}')`;
  }
  function panelRect(pg, title) { return rectExpr(pg, panelSel(title)); }
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
  let minGap = Infinity, gapSamples = 0;
  for (let i = 0; i < 10; i++) {
    const gap = await windGap();
    if (gap != null) { gapSamples++; if (gap < minGap) minGap = gap; }
    await e.sleep(300);
  }
  // minGap starts at Infinity, which trivially clears >=5.9 if windGap() never once
  // found the arrow/value pair -- guard against that vacuous pass by requiring at
  // least one real sample.
  check('wind gap was actually sampled', gapSamples > 0, 'samples ' + gapSamples);
  check('wind arrow stays >=6px clear of the value text across headings',
    gapSamples > 0 && minGap >= 5.9, 'min gap ' + minGap.toFixed(2));
  e.close();

  // boot stage 2 is the emblem (the blueprint is gone): it waits for the screens to light up
  // (LINEAR SEAT, boot clock 2300), holds well over a second, and is gone by PILOT ID (5000)
  {
    const b = await launch({ width: 1440, height: 900 });
    await b.eval("sessionStorage.clear()");
    await b.goto('index.html', 50);
    let beforeScreens = 0, peak = 0, atPilot = null, firstFull = null, lastFull = null;
    for (let i = 0; i < 400 && atPilot === null; i++) {
      const raw = await b.eval("JSON.stringify((() => { const e = document.querySelector('.boot-emblem'), q = s => (document.querySelector(s) || {}).textContent || ''; return { o: e ? +getComputedStyle(e).opacity : 0, log: q('#boot-log'), stage: q('.boot-stage-txt') }; })())");
      if (!raw) { await b.sleep(20); continue; }
      const s = JSON.parse(raw), now = Date.now();
      if (!/LINEAR SEAT/.test(s.log)) beforeScreens = Math.max(beforeScreens, s.o);
      peak = Math.max(peak, s.o);
      if (s.o >= 0.9) { if (firstFull === null) firstFull = now; lastFull = now; }
      if (/PILOT ID/.test(s.stage)) atPilot = s.o;
      await b.sleep(40);
    }
    check('the emblem waits for the screens to light up', beforeScreens < 0.05, 'before screens ' + beforeScreens);
    check('boot shows the emblem', peak >= 0.8, 'peak ' + peak);
    check('the emblem holds over a second', firstFull !== null && lastFull - firstFull >= 1000, 'held ' + (lastFull - firstFull) + 'ms');
    check('the emblem is gone by PILOT ID', atPilot !== null && atPilot < 0.05, 'at pilot ' + atPilot);
    b.close();
  }

  // phones: a finger swipe turns the view (pointer events; tilt is gone), and the lock-on card
  // fits the screen instead of running off both edges
  {
    const m = await launch({ width: 375, height: 812 });
    await m.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await m.goto('index.html', 900);
    for (let i = 0; i < 40 && !(await m.eval('BUNNYS.state.booted')); i++) { await m.key(' ', 'Space', 32); await m.sleep(150); }
    await m.sleep(1500);
    const y0 = await m.eval('BUNNYS.state.yaw');
    await m.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300, id: 1 }] });
    for (let k = 1; k <= 8; k++) { await m.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - k * 12, y: 300, id: 1 }] }); await m.sleep(30); }
    await m.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await m.sleep(600);
    check('a finger swipe turns the view', Math.abs(BUNNYS_delta(y0, await m.eval('BUNNYS.state.yaw'))) > 10);
    check('no tilt button', !(await m.eval("document.getElementById('tilt')")));
    await m.eval("BUNNYS.emit('face', {yaw: 52})"); await m.sleep(1800);
    const d = await m.eval("(() => { const b = document.querySelector('#hud > g.dossier > rect.plate').getBoundingClientRect(); return b.left >= 8 && b.right <= innerWidth - 8; })()");
    check('lock-on card fits a 375px screen', d);
    check('phone hint says tap', /TAP THE CONTACT/.test(await m.eval("document.querySelector('#hud .dos-hint').textContent")));
    m.close();
  }

  // stand-down order: ENVIRONMENT gives way before THRUSTER when the column is short. Since the
  // HUD scales itself down on laptop screens (K, hud.js uiScale), 1440x900 is no longer short --
  // every panel fits there -- so this needs a window that is short even after scaling.
  const s = await launch({ width: 1440, height: 760, reduce: true });
  await s.goto('index.html', 900);
  await bootedReduced(s);
  const envSmall = await panelRect(s, 'ENVIRONMENT');
  const thrSmall = await panelRect(s, 'THRUSTER VECTOR');
  check('ENVIRONMENT hidden at 1440x760', !!envSmall && envSmall.opacity === '0', JSON.stringify(envSmall));
  check('THRUSTER VECTOR still shown at 1440x760', !!thrSmall && thrSmall.opacity !== '0', JSON.stringify(thrSmall));
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
  // rectOf() reads getBoundingClientRect() whether or not the element is hidden, so a
  // COMMS that silently failed to open would collapse to a zero rect and pass every
  // "does not overlap" check below for free. Guard against that vacuous pass first.
  check('COMMS is visible at 1440x900 (guards the overlap checks below)',
    !!comms1440 && comms1440.right > comms1440.left && comms1440.bottom > comms1440.top,
    JSON.stringify(comms1440));
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

  // Important 2 (final review): below ~1080px tall, the banner falls back to TARGET ID's
  // own slot and COMMS/the toast used to stack into the shared centre slot right under
  // it -- which sits on top of the pitch ladder there. At 1366x768 COMMS covered the
  // solid +10 rung outright and the toast covered the +5 rung; 1280x800 and 1100x700 hit
  // the same overlap. Regression across all three, with COMMS open, the toast forced up
  // (via RUN DIAG, same as the review's own probe) and the banner forced visible.
  async function checkLadderClear(w, h) {
    const tag = w + 'x' + h;
    const t = await launch({ width: w, height: h, reduce: true });
    await t.goto('index.html', 900);
    await bootedReduced(t);
    await t.eval("document.querySelector('[data-mode=comms]').click(); document.querySelector('[data-mode=diag]').click()");
    await forceBanner(t, 'PROPELLANT RESERVE LOW');
    await t.sleep(150);
    const commsR = await rectOf(t, '#comms');
    const toastR = await rectOf(t, '#toast');
    const bannerR = (await warnGeom(t)).viewport;
    const rungs = await ladderRungRects(t);
    // Guard against vacuous passes: a hidden popup or a missed selector collapses to a
    // zero/absent rect, which would pass every "no overlap" check below for free.
    check(`COMMS is visible at ${tag} (guards the ladder-overlap check)`,
      !!commsR && commsR.right > commsR.left && commsR.bottom > commsR.top, JSON.stringify(commsR));
    check(`the toast is visible at ${tag} (guards the ladder-overlap check)`,
      !!toastR && toastR.right > toastR.left && toastR.bottom > toastR.top, JSON.stringify(toastR));
    check(`the banner is visible at ${tag} (guards the ladder-overlap check)`,
      !!bannerR && bannerR.right > bannerR.left && bannerR.bottom > bannerR.top, JSON.stringify(bannerR));
    check(`the ladder's 4 rungs were found at ${tag} (guards the ladder-overlap check)`,
      rungs.length === 4, 'rungs found: ' + rungs.length);
    const boxes = { comms: commsR, toast: toastR, banner: bannerR };
    const hits = [];
    Object.keys(boxes).forEach(k => rungs.forEach((r, i) => { if (overlaps(boxes[k], r)) hits.push(k + ' x rung' + i); }));
    check(`no overlap between COMMS/toast/banner and the ladder's rungs at ${tag}`,
      hits.length === 0, hits.join(', ') || 'none');
    await t.shot(path.join(__dirname, `out/ladder-clear-${tag}.png`), false);
    t.close();
  }
  await checkLadderClear(1366, 768);
  await checkLadderClear(1280, 800);
  await checkLadderClear(1100, 700);
})();
