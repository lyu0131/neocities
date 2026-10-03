// The hub (index.html): the panorama, the triangle-reticle HUD (js/hud.js), the four contacts as
// arrowheads, and every way to turn, lock and open. No boot and no instrument panels on the hub for
// now: the cockpit is live from the first frame.
const { launch, check } = require('./cdp');
// Input sent before the deferred scripts have parsed is silently lost, and the suite starts
// Chrome several times over, so load time varies. Wait for the condition.
async function ready(pg, ms = 4000) {
  for (let i = 0; i < ms / 100; i++) {
    if (await pg.eval('!!window.BUNNYS && BUNNYS.state.booted === true && !!document.querySelector(".pano-slice")')) return true;
    await pg.sleep(100);
  }
  return false;
}
function delta(a, b) { return ((b - a + 540) % 360) - 180; }
const lockText = pg => pg.eval("document.getElementById('lock-status').textContent");
const hudText = (pg, sel) => pg.eval(`(document.querySelector('#hud ${sel}') || {}).textContent || ''`);

(async () => {
  const p = await launch({ width: 1440, height: 900 });
  await p.goto('index.html', 300);
  check('the hub is live at once (no boot)', await ready(p));
  check('no boot, panels, frame or canopy screens', await p.eval("!['boot', 'boot-scene', 'screens', 'frame', 'fx', 'slew', 'hudmode', 'comms', 'toast'].some(id => document.getElementById(id))"));

  // the HUD: the triangle reticle and its mode word, the rim, the rail's clamps, the lock readout
  check('the triangle reticle is drawn', await p.eval("!!document.querySelector('#hud .tri-panel') && document.querySelectorAll('#hud .tri-bar').length === 4"));
  check('the rail has its two hex clamps', await p.eval("document.querySelectorAll('#hud .clamp').length === 2"));
  check('the city is dimmed under the HUD', await p.eval("/gradient/.test(getComputedStyle(document.querySelector('.pano-slice')).backgroundImage)"));

  // the four contacts: arrowheads on the horizon, pointing in, labels facing the centre
  check('index targets match BUNNYS.contacts', await p.eval("BUNNYS.contacts.every(c => { const t = document.getElementById(c.id); return t && +t.dataset.yaw === c.yaw && t.dataset.label === c.label && (!c.rng || t.dataset.readout.includes(c.rng)); })"));
  await p.eval("BUNNYS.emit('face', {yaw: 15})"); await p.sleep(1500);
  check('a contact left of the nose is marked left, one right is marked right', await p.eval("document.getElementById('t-missions').classList.contains('is-left') && document.getElementById('t-hangar').classList.contains('is-right')"));
  check('the arrow is a shape, not a box', await p.eval("getComputedStyle(document.getElementById('t-hangar'), '::before').clipPath.startsWith('polygon')"));
  // UNKNOWN sits behind (180): it rides the rail's end instead
  check('a contact out of view is named at the rail\'s end', /UNKNOWN 180/.test(await p.eval("[...document.querySelectorAll('#hud .edge text')].map(t => t.textContent).join('|')")));

  // the sphere turns: drag, heading follows, arrows turn
  const tiles = await p.eval("document.querySelectorAll('.pano-slice').length");
  check('sphere tessellated in 24-wide bands', tiles >= 24 && tiles % 24 === 0, tiles + ' tiles');
  const y0 = await p.eval('BUNNYS.state.yaw');
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 10; k++) await p.mouse('mouseMoved', 700 - 30 * k, 450, 1); await p.mouse('mouseReleased', 400, 450);
  await p.sleep(900);
  const y1 = await p.eval('BUNNYS.state.yaw');
  check('drag changes yaw', Math.abs(delta(y0, y1)) > 20, `${y0} -> ${y1}`);
  check('heading readout follows yaw', await p.eval("(() => { const t = document.querySelector('#hud .hdg'); return !!t && Math.abs(((+t.textContent - ((BUNNYS.state.yaw % 360) + 360) % 360) + 540) % 360 - 180) < 3; })()"));
  await p.key('ArrowRight', 'ArrowRight', 39); await p.sleep(900);
  check('arrow key turns', Math.abs(delta(y1, await p.eval('BUNNYS.state.yaw'))) > 5);

  // locking: the mode word and the readout under the rail say so
  await p.key('3', 'Digit3', 51); await p.sleep(1500);
  check('3 locks hangar without leaving', /index\.html$/.test(await p.eval('location.pathname')) && /HANGAR/.test(await lockText(p)));
  check('the mode word reads LOCKED', (await hudText(p, '.mode')) === 'LOCKED');
  check('the readout names the lock and what Enter does', /LOCKED\s+HANGAR/.test(await hudText(p, '.lock-line')) && /ENTER TO OPEN/.test(await hudText(p, '.hint-line')));
  check('the locked contact carries its brackets', await p.eval("document.getElementById('t-hangar').classList.contains('is-locked') && /svg/.test(getComputedStyle(document.getElementById('t-hangar')).backgroundImage)"));
  // a manual turn lets a number-key lock go; it ends at rest (a last zero move) so it can't coast
  // on into another contact's pull -- from 52 it stops near 27, out of reach of 0 and 52 both
  await p.mouse('mousePressed', 700, 450, 1);
  for (let k = 1; k <= 5; k++) await p.mouse('mouseMoved', 700 + 20 * k, 450, 1);
  await p.mouse('mouseMoved', 800, 450, 1); await p.mouse('mouseReleased', 800, 450); await p.sleep(1200);
  check('turning away lets the lock go: MANUAL', (await hudText(p, '.mode')) === 'MANUAL' && /NO LOCK/.test(await hudText(p, '.lock-line')));

  // focus a target link: the view faces it, the lock shows, Enter goes through the shutters
  await p.eval("document.querySelector('#targets-nav a[data-target=t-hangar]').focus()"); await p.sleep(1200);
  check('focus turns to hangar', Math.abs(delta(await p.eval('BUNNYS.state.yaw'), 52)) < 8);
  check('lock readout shown', /HANGAR/.test(await lockText(p)));
  await p.key('Enter', 'Enter', 13); await p.sleep(450);
  check('firing closes the canopy shutters', await p.eval("(() => { const l = document.getElementById('link'); return !!l && l.querySelectorAll('.link-blade').length === 5; })()"));
  check('the closed glass carries the emblem, already loaded', await p.eval("(() => { const i = document.querySelector('#link .link-emblem'); return !!i && i.complete && i.naturalWidth > 0; })()"));
  await p.sleep(1050);
  check('Enter navigates to hangar', /hangar\.html$/.test(await p.eval('location.pathname')));
  check('arrival comes in through the shutters', await p.eval("document.documentElement.classList.contains('linked')"));
  await p.sleep(1500);
  check('arrival shutters open and clear', await p.eval("!document.getElementById('link') && !document.documentElement.classList.contains('link-in')"));

  const backToHub = async () => { await p.goto('index.html', 300); await ready(p); };
  // the cockpit, arriving back from a page, opens its own shutters (link.js, no canopy screens now)
  await backToHub();
  await p.sleep(1200);
  check('the hub opens its shutters on arrival', await p.eval("!document.getElementById('link')"));

  // UNKNOWN: hovering locks it (in red), clicking opens its channel
  await p.eval("BUNNYS.emit('face', {yaw: 180})"); await p.sleep(1500);
  const u = await p.eval("(() => { const r = document.getElementById('t-unknown').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  await p.mouse('mouseMoved', u.x, u.y); await p.sleep(600);
  check('unknown locks', /UNKNOWN/.test(await lockText(p)));
  check('the unknown lock reads hostile', await p.eval("document.querySelector('#hud .lock-line').classList.contains('is-hostile')"));
  await p.mouse('mousePressed', u.x, u.y, 1); await p.mouse('mouseReleased', u.x, u.y); await p.sleep(1600);
  check('unknown opens the open channel', /unknown\.html$/.test(await p.eval('location.pathname')));

  // Enter fires the boresight lock
  await backToHub();
  await p.eval("BUNNYS.emit('face', {yaw: 0}); document.activeElement && document.activeElement.blur()"); await p.sleep(1500);
  await p.key('Enter', 'Enter', 13); await p.sleep(1600);
  check('Enter opens the boresight lock', /missions\.html$/.test(await p.eval('location.pathname')));

  // number keys: 4 locks UNKNOWN; Home lets a number-key lock go; Enter mid-swing opens the pick
  await backToHub();
  await p.key('4', 'Digit4', 52); await p.sleep(2200);
  check('4 locks the unknown contact', /UNKNOWN/.test(await lockText(p)));
  await p.key('1', 'Digit1', 49); await p.sleep(1500);
  await p.key('Home', 'Home', 36); await p.sleep(1800);
  check('Home releases a number-key lock', /MISSIONS/.test(await lockText(p)));
  await p.key('3', 'Digit3', 51); await p.sleep(150);
  await p.key('1', 'Digit1', 49); await p.sleep(150);
  await p.key('Enter', 'Enter', 13); await p.sleep(1800);
  check('Enter mid-swing opens the picked contact', /pilot\.html$/.test(await p.eval('location.pathname')));

  // a sub-page's 4 + Enter comes back facing UNKNOWN
  await p.goto('index.html?face=t-unknown', 300); await ready(p); await p.sleep(1800);
  check('?face=t-unknown arrives facing it', Math.abs(delta(await p.eval('BUNNYS.state.yaw'), 180)) < 8);

  // the unit insignia turns in the top-right corner, at the radar's old sweep rate
  check('cockpit shows the unit insignia, top right', await p.eval("(() => { const e = document.getElementById('insignia'), r = e.getBoundingClientRect(); return r.width > 30 && r.left > innerWidth / 2 && r.top >= 0 && r.top < 60; })()"));
  check('the insignia turns once every 3.4s', await p.eval("(() => { const c = getComputedStyle(document.querySelector('#insignia .insignia-coin')); return c.animationName === 'insignia-spin' && c.animationDuration === '3.4s'; })()"));
  check('no h-overflow', await p.eval('document.documentElement.scrollWidth <= innerWidth'));
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();

  // reduced motion: interactive, still
  {
    const r = await launch({ width: 1440, height: 900, reduce: true });
    await r.goto('index.html', 300);
    check('reduced motion: live at once', await ready(r));
    check('reduced motion: the insignia holds still', await r.eval("getComputedStyle(document.querySelector('#insignia .insignia-coin')).animationName === 'none'"));
    const a0 = await r.eval('BUNNYS.state.yaw');
    await r.key('ArrowRight', 'ArrowRight', 39);
    let turned = 0;
    for (let i = 0; i < 30 && turned <= 5; i++) { await r.sleep(100); turned = Math.abs(delta(a0, await r.eval('BUNNYS.state.yaw'))); }
    check('reduced motion: arrows still turn', turned > 5, 'turned ' + turned.toFixed(1));
    check('reduced motion: no JS errors', r.errors.length === 0, r.errors.join(' | '));
    r.close();
  }

  // phones: a finger swipe turns the view; the insignia gives the top to the rim; it all fits
  {
    const m = await launch({ width: 375, height: 812 });
    await m.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await m.goto('index.html', 300); await ready(m); await m.sleep(800);
    const y0 = await m.eval('BUNNYS.state.yaw');
    await m.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300, id: 1 }] });
    for (let k = 1; k <= 8; k++) { await m.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - k * 12, y: 300, id: 1 }] }); await m.sleep(30); }
    await m.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await m.sleep(600);
    check('phone: a finger swipe turns the view', Math.abs(delta(y0, await m.eval('BUNNYS.state.yaw'))) > 10);
    await m.eval("BUNNYS.emit('face', {yaw: 26})"); await m.sleep(1500);   // nothing on that bearing
    check('phone: the hint says swipe', /SWIPE/.test(await hudText(m, '.hint-line')), await hudText(m, '.hint-line'));
    await m.eval("BUNNYS.emit('face', {yaw: 52})"); await m.sleep(1800);
    check('phone: the hint says tap once locked', /TAP TO OPEN/.test(await hudText(m, '.hint-line')));
    check('phone: no insignia (the rim has the top)', await m.eval("getComputedStyle(document.getElementById('insignia')).display === 'none'"));
    check('phone: the mode word is readable', await m.eval("document.querySelector('#hud .mode').getBoundingClientRect().height >= 9"));
    check('phone: no h-overflow', await m.eval('document.documentElement.scrollWidth <= innerWidth'));
    check('phone: no JS errors', m.errors.length === 0, m.errors.join(' | '));
    m.close();
  }
})();
