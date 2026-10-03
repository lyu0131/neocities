// site5 checks, on site4's headless-Chrome harness: the ball renders, the HUD draws, the scripted flight
// moves the suit and the seat, keys take it over and it hands back, drag turns the head, reduced motion
// holds still, every look loads, it fits a phone. Run: node site5/tests/cockpit.test.js
const { launch, check } = require('../../site4/tests/cdp');
const PAGE = '../site5/index.html';
const pose = (p, expr) => p.eval(`(() => { const s = SITE5.pose; return ${expr}; })()`);
async function ready(p) { for (let i = 0; i < 60 && !(await p.eval('!!(window.SITE5 && SITE5.pose && SITE5.frames > 5)')); i++) await p.sleep(100); }

(async () => {
  const p = await launch({ width: 1440, height: 900 });
  await p.goto(PAGE, 300); await ready(p);
  check('WebGL2 is up', await p.eval('!!SITE5.gl && !document.documentElement.classList.contains("nogl")'));
  // read the ball's picture inside a frame, straight after it's drawn
  check('the ball draws a picture', await p.eval(`new Promise(r => requestAnimationFrame(() => { const g = SITE5.gl, w = g.drawingBufferWidth, h = g.drawingBufferHeight, px = new Uint8Array(4 * 64);
    g.readPixels(w >> 1, h >> 2, 8, 8, g.RGBA, g.UNSIGNED_BYTE, px); let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 12) lit++; r(lit > 32); }))`));
  check('the HUD draws', await p.eval(`(() => { const c = document.getElementById('hud'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i]) n++; return n > 200; })()`));

  // the scripted flight turns the suit, and the seat swings inside the ball
  const a0 = await pose(p, 's.heading'); let maxSeat = 0;
  for (let i = 0; i < 30; i++) { await p.sleep(100); maxSeat = Math.max(maxSeat, await pose(p, 'Math.hypot(s.eye[0], s.eye[1] - .05, s.eye[2] + .1)')); }
  check('AUTO flies: the heading changes', Math.abs(((await pose(p, 's.heading')) - a0 + 540) % 360 - 180) > 3);
  check('AUTO says so', (await pose(p, 's.mode')) === 'AUTO');
  check('the seat sways inside the ball', maxSeat > 0.004 && maxSeat < 0.3, maxSeat.toFixed(4));

  // keys take it over (MANUAL) and turn it; it hands back after 4s
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  const h0 = await pose(p, 's.heading'); await p.sleep(1200);
  check('a key takes over: MANUAL', (await pose(p, 's.mode')) === 'MANUAL');
  check('left turns it left', ((await pose(p, 's.heading')) - h0 + 540) % 360 - 180 < -15);
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await p.sleep(4600);
  check('it hands back to AUTO', (await pose(p, 's.mode')) === 'AUTO');

  // a drag turns the pilot's head, not the suit
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 8; k++) await p.mouse('mouseMoved', 700 - 25 * k, 450, 1); await p.mouse('mouseReleased', 500, 450);
  check('a drag turns the head', Math.abs(await pose(p, 's.head.yaw')) > 20, String(await pose(p, 's.head.yaw')));
  check('the seat edge moves with the head', await p.eval("/translate\\((?!0\\.0px)/.test(document.getElementById('seat').style.transform)"));
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  check('frames hold up (avg under 25ms)', (await p.eval('SITE5.frameMs')) < 25, (await p.eval('SITE5.frameMs')).toFixed(1) + 'ms');

  for (const look of ['xi', 'penelope']) {
    await p.goto(`${PAGE}?look=${look}`, 300); await ready(p);
    check(`?look=${look} loads and draws`, (await p.eval('SITE5.look')) === look && await p.eval('!!SITE5.gl'));
  }
  check('looks: no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();

  // reduced motion: no auto flight, no sway
  {
    const r = await launch({ width: 1440, height: 900, reduce: true });
    await r.goto(PAGE, 300); await ready(r);
    const h0 = await pose(r, 's.heading'), e0 = await pose(r, 'JSON.stringify(s.eye)');
    await r.sleep(2000);
    check('reduced motion: the suit holds still', Math.abs((await pose(r, 's.heading')) - h0) < 0.01 && (await pose(r, 'JSON.stringify(s.eye)')) === e0);
    r.close();
  }

  // phones
  {
    const m = await launch({ width: 375, height: 812 });
    await m.goto(PAGE, 300); await ready(m);
    check('phone: no h-overflow', await m.eval('document.documentElement.scrollWidth <= innerWidth'));
    check('phone: draws', await m.eval('!!SITE5.gl') && m.errors.length === 0, m.errors.join(' | '));
    m.close();
  }
})();
