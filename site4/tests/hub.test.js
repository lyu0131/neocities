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
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  await p.goto('index.html', 800);
  // T6: boot runs, finishes and can be skipped
  check('boot overlay present', await p.eval("!!document.getElementById('boot')"));
  await p.sleep(6800);
  check('boot done fires', await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true'));
  check('boot overlay gone', await p.eval("!document.getElementById('boot') || getComputedStyle(document.getElementById('boot')).display === 'none'"));
  await p.eval("sessionStorage.clear()"); await p.goto('index.html', 600);
  await p.key(' ', 'Space', 32); await p.sleep(700);
  check('skip boot works', await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true'));
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
  check('lock readout shown', /SL-01/.test(await p.eval("document.getElementById('lock-status').textContent")));
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
  r.close();
})();
