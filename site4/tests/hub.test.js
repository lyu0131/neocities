const path = require('path');
const { launch, check } = require('./cdp');
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  await p.goto('index.html', 800);
  // T6: boot runs, finishes and can be skipped
  check('boot overlay present', await p.eval("!!document.getElementById('boot')"));
  await p.sleep(6800);
  check('boot done fires', await p.eval('!!window.ARGUS && ARGUS.state.booted === true'));
  check('boot overlay gone', await p.eval("!document.getElementById('boot') || getComputedStyle(document.getElementById('boot')).display === 'none'"));
  await p.eval("sessionStorage.clear()"); await p.goto('index.html', 600);
  await p.key(' ', 'Space', 32); await p.sleep(700);
  check('skip boot works', await p.eval('!!window.ARGUS && ARGUS.state.booted === true'));
  // T5: 24 slices, drag turns yaw, heading tape follows, arrows turn
  check('24 pano slices', await p.eval("document.querySelectorAll('.pano-slice').length === 24"));
  const y0 = await p.eval('window.ARGUS ? ARGUS.state.yaw : 0');
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 10; k++) await p.mouse('mouseMoved', 700 - 30 * k, 450, 1); await p.mouse('mouseReleased', 400, 450);
  await p.sleep(900);
  const y1 = await p.eval('window.ARGUS ? ARGUS.state.yaw : 0');
  check('drag changes yaw', Math.abs(((y1 - y0 + 540) % 360) - 180) > 20, `${y0} -> ${y1}`);
  check('heading readout follows yaw', await p.eval("(()=>{const t=document.querySelector('#hud .hdg-readout');return !!t && Math.abs(((+t.textContent - ((ARGUS.state.yaw%360)+360)%360)+540)%360-180) < 3})()"));
  await p.key('ArrowRight', 'ArrowRight', 39); await p.sleep(900);
  check('arrow key turns', Math.abs(await p.eval('window.ARGUS ? ARGUS.state.yaw : 0') - y1) > 5);
  // T5: focus a target link, view faces it, lock readout shows, Enter navigates
  await p.eval("document.querySelector('#targets-nav a[data-target=t-hangar]').focus()"); await p.sleep(1200);
  check('focus turns to hangar', Math.abs(((await p.eval('window.ARGUS ? ARGUS.state.yaw : 0') - 52 + 540) % 360) - 180) < 8);
  check('lock readout shown', /SL-01/.test(await p.eval("document.getElementById('lock-status').textContent")));
  await p.key('Enter', 'Enter', 13); await p.sleep(1500);
  check('Enter navigates to hangar', /hangar\.html$/.test(await p.eval('location.pathname')));
  // T5: unknown target locks but does not navigate
  await p.goto('index.html', 800);
  await p.eval("window.ARGUS && ARGUS.emit('face', {yaw:180})"); await p.sleep(1500);
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
  check('reduced motion: booted at once', await r.eval('!!window.ARGUS && ARGUS.state.booted === true'));
  await r.key('ArrowLeft', 'ArrowLeft', 37); await r.sleep(400);
  check('reduced motion: arrows still turn', Math.abs(await r.eval('window.ARGUS ? ARGUS.state.yaw : 0')) > 5);
  r.close();
})();
