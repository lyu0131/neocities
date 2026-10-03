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

  // going up, the pilot looks up into the climb: the HUD (on the ball) drops down the screen, as in the FPV clip
  const noseY = () => p.eval('(SITE5.project([0, 0, 1]) || [0, NaN])[1]');
  await p.sleep(400);
  const y0 = await noseY();
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await p.sleep(900);
  const y1 = await noseY();
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  check('climbing shifts the HUD down the screen', y1 - y0 > 40, `${y0.toFixed(0)} -> ${y1.toFixed(0)}`);
  await p.sleep(4600);
  // the mouse steers the gaze a little: the HUD slides away from where you look
  await p.mouse('mouseMoved', 720, 450); await p.sleep(900);
  const g0 = await p.eval('SITE5.project([0, 0, 1])[0]');
  await p.mouse('mouseMoved', 1400, 450); await p.sleep(1200);
  const g1 = await p.eval('SITE5.project([0, 0, 1])[0]');
  check('looking right with the mouse slides the HUD left', g0 - g1 > 25, `${g0.toFixed(0)} -> ${g1.toFixed(0)}`);
  // the triangle is smaller: its face under a third of the screen wide
  check('the triangle is smaller', await p.eval('SITE5.triWidth') < 1440 * 0.33, String(await p.eval('SITE5.triWidth')));

  // the side scales are live: the pitch tape and the altitude tape scroll as you climb, the roll scale
  // turns as you bank, the ladder rulers stream with airspeed (SITE5.tapes: what each drew this frame)
  const tapes = () => p.eval('JSON.stringify(SITE5.tapes)').then(JSON.parse);
  const t0 = await tapes();
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  await p.sleep(1000);
  const t1 = await tapes();
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
  check('the pitch tape scrolls when climbing', t0 && t1 && t1.pitchLabels.join() !== t0.pitchLabels.join(), t0 && t1 && t0.pitchLabels.join() + ' -> ' + t1.pitchLabels.join());
  check('the altitude reads higher after a climb', t1 && t1.alt > t0.alt + 5, t0 && t1 && t0.alt + ' -> ' + t1.alt);
  check('the ladder rulers stream', t1 && t1.stream !== t0.stream);
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await p.sleep(1000);
  const t2 = await tapes();
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  check('the roll scale turns with the bank', t2 && Math.abs(t2.roll) > 8, t2 && String(t2.roll));
  await p.sleep(4600);

  // the side ladders and tapes are circular arcs centred on the sight, as in the FPV frames: points on
  // the ruler sit at one distance from where the nose projects (a meridian would not)
  const circ = await p.eval(`(() => { const c = SITE5.project([0, 0, 1]), pts = SITE5.arcSample || [];
    const r = pts.map(q => { const s = SITE5.project(q); return s ? Math.hypot(s[0] - c[0], s[1] - c[1]) : NaN; }).filter(v => v === v);
    return JSON.stringify({ n: r.length, min: Math.min(...r), max: Math.max(...r) }); })()`).then(JSON.parse);
  check('the side ladders are circular arcs round the sight', circ.n >= 5 && (circ.max - circ.min) / circ.max < 0.08, JSON.stringify(circ));

  // a drag turns the pilot's head, not the suit
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 8; k++) await p.mouse('mouseMoved', 700 - 25 * k, 450, 1); await p.mouse('mouseReleased', 500, 450);
  check('a drag turns the head', Math.abs(await pose(p, 's.head.yaw')) > 20, String(await pose(p, 's.head.yaw')));
  // looking round to the tail: the monitor's rear set is there (heading tape, AFT marker, ladders)
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 8; k++) await p.mouse('mouseMoved', 700 - 75 * k, 450, 1); await p.mouse('mouseReleased', 100, 450);
  await p.sleep(200);
  check('the rear of the monitor has its own HUD', await p.eval('SITE5.parts.rear === true'));
  // looking down (dragging the view up): the arm rails and grips are there, drawn in perspective
  await p.goto(PAGE, 300); await ready(p);
  await p.mouse('mousePressed', 700, 650, 1); for (let k = 1; k <= 8; k++) await p.mouse('mouseMoved', 700, 650 - 40 * k, 1); await p.mouse('mouseReleased', 700, 330);
  await p.sleep(200);
  check('looking down shows the controls', await p.eval('SITE5.parts.seat.grip > 4 && SITE5.parts.seat.rail > 4'), JSON.stringify(await p.eval('SITE5.parts.seat')));
  check('the mix has no big outer ring', await p.eval('SITE5.parts.ring === false'));
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
    check('phone: the grip heads show at rest', await m.eval('SITE5.parts.seat.grip > 0'), JSON.stringify(await m.eval('SITE5.parts.seat')));
    await m.mouse('mousePressed', 187, 650, 1); for (let k = 1; k <= 8; k++) await m.mouse('mouseMoved', 187, 650 - 40 * k, 1); await m.mouse('mouseReleased', 187, 330);
    await m.sleep(200);
    check('phone: looking down shows the rails and grips', await m.eval('SITE5.parts.seat.grip > 4 && SITE5.parts.seat.rail > 4'), JSON.stringify(await m.eval('SITE5.parts.seat')));
    m.close();
  }
})();
