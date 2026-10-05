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
  for (let i = 0; i < 30; i++) { await p.sleep(100); maxSeat = Math.max(maxSeat, await pose(p, 'Math.hypot(s.eye[0], s.eye[1], s.eye[2] + .4)')); }
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
  // the layout is measured off the owner's front frame: the anchors sit where that frame has them (checked
  // still, in the reduced-motion run below); here, live: the rail, its caps, the rulers stream, three contacts
  const parts = () => p.eval('JSON.stringify(SITE5.parts)').then(JSON.parse);
  let pt = await parts();
  check('the pink rail is drawn with its two diamond caps', pt.rail === true && pt.caps === 2, JSON.stringify({ rail: pt.rail, caps: pt.caps }));
  check('three contacts in the world', (await pose(p, 's.contacts.length')) === 3);
  const st0 = await p.eval('SITE5.tapes.stream'); await p.sleep(500);
  check('the ruler dashes move with the pitch', (await p.eval('SITE5.tapes.stream')) !== st0);
  const hdg0 = await p.eval('SITE5.tapes.heading');
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await p.sleep(900); pt = await parts(); pt.hdgBefore = hdg0;
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  check('the heading ticks scroll with the heading', pt.hdgBefore !== (await p.eval('SITE5.tapes.heading')), String(await p.eval('SITE5.tapes.heading')));
  await p.sleep(4600);
  // the triangle sight is always up, and the coffin cells glow in turn (a lit run that moves on)
  // the sight: faint at idle, closing in (and jittering) while a lock builds, full and blinking on lock
  // (E: springs open and closes in, clunks into the lock; brackets and V follow the target; pings while held)
  const seen = {}; let maxK = 1, minK = 9, follow = null, pinged = false, onFor = 0;
  const sightNow = () => p.eval('JSON.stringify({ s: SITE5.parts.sightStage, k: SITE5.parts.sightScale, cue: SITE5.parts.sightCue, err: SITE5.parts.sightCueErr, pings: SITE5.parts.sightPings, fly: SITE5.parts.sightFly, sway: SITE5.parts.sightSway })').then(JSON.parse);
  for (let i = 0; i < 500 && !(seen.idle && seen.acquire && seen.blink && seen.on && onFor > 40); i++) {
    const st = await sightNow();
    seen[st.s] = true; if (st.s === 'acquire') maxK = Math.max(maxK, st.k);
    if (st.s === 'on' || st.s === 'blink') minK = Math.min(minK, st.k);
    if (st.s === 'on') { onFor++; if (st.pings) pinged = true; if (onFor > 25 && st.cue && Math.hypot(st.cue[0], st.cue[1]) > 0.002 && (!follow || st.err < follow.err)) follow = st; }
    await p.sleep(12);
  }
  check('the sight sits faint on the nose at idle', !!seen.idle);
  check('it closes in while the lock builds', !!seen.acquire && maxK > 1.15, 'max scale ' + maxK.toFixed(2));
  check('on lock it blinks and holds', !!seen.blink && !!seen.on, Object.keys(seen).join(','));
  check('it springs into the lock, overshooting', minK < 0.985, 'min scale ' + minK.toFixed(3));
  check('locked, the brackets and V follow the target off the nose', !!follow && follow.err < 0.004, JSON.stringify(follow && { cue: follow.cue, err: follow.err }));
  check('a ping goes out while the lock is held', pinged);
  // turning hard off the target breaks the lock: the brackets fly apart, and the big triangle sways with the turn
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  let flew = false, sx = [];
  for (let i = 0; i < 120 && !(flew && sx.length > 60); i++) { const st = await sightNow(); if (st.fly > 0 && st.fly < 1) flew = true; sx.push(st.sway[0]); await p.sleep(12); }
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  check('a broken lock: the brackets fly apart', flew);
  check('the big triangle sways with the turn', Math.max(...sx) - Math.min(...sx) > 0.003, (Math.max(...sx) - Math.min(...sx)).toFixed(4));
  // targeting: a lock goes to the contact nearest the boresight, and the HUD marks that one
  let tg = null;
  for (let i = 0; i < 80 && !tg; i++) { await p.sleep(100); tg = await p.eval(`(() => { const s = SITE5.pose; if (!s.locked) return null;
    const near = s.contacts.reduce((a, b) => b.off < a.off ? b : a); return JSON.stringify({ lockId: s.lockId, near: near.id, off: near.off, marked: SITE5.parts.target }); })()`); }
  tg = tg && JSON.parse(tg);
  check('a lock goes to the contact nearest the sight', !!tg && tg.lockId === tg.near && tg.off < 7, JSON.stringify(tg));
  check('and the HUD marks that contact as the target', !!tg && tg.marked === tg.lockId);
  // the hierarchy: only the sight / active target (tier 1) and the rail's core (tier 2) carry a halo
  const halo = await p.eval('JSON.stringify(SITE5.parts.halo)').then(JSON.parse);
  check('only the sight, the target and the rail core glow', halo[1] > 0 && halo[2] > 0 && !halo[3] && !halo[4], JSON.stringify(halo));
  // one sphere: line weight follows depth (nearer parts of the monitor a touch heavier), and changes smoothly --
  // round the rail, no step between neighbouring points is more than a few percent
  const dep = JSON.parse(await p.eval(`(() => { const d = (az, el) => [Math.cos(el * Math.PI / 180) * Math.sin(az * Math.PI / 180), Math.sin(el * Math.PI / 180), Math.cos(el * Math.PI / 180) * Math.cos(az * Math.PI / 180)];
    const r = []; for (let a = 0; a <= 360; a += 3) r.push(SITE5.depthScale(d(a, -22)));
    let jump = 0; for (let i = 1; i < r.length; i++) jump = Math.max(jump, Math.abs(r[i] - r[i - 1]));
    return JSON.stringify({ front: r[0], rear: r[60], jump }); })()`));
  check('lines weigh more on the near side of the sphere', dep.rear > dep.front + 0.1, JSON.stringify(dep));
  check('and the weight changes smoothly round the rail', dep.jump < 0.03, dep.jump.toFixed(3));
  const lit = () => p.eval('SITE5.parts.litCells');
  const l0 = await lit(); await p.sleep(400);
  check('the coffin glow moves from cell to cell', (await lit()) !== l0 && (await lit()) !== undefined, l0 + ' -> ' + (await lit()));

  // a drag turns the pilot's head, not the suit
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 8; k++) await p.mouse('mouseMoved', 700 - 25 * k, 450, 1); await p.mouse('mouseReleased', 500, 450);
  check('a drag turns the head', Math.abs(await pose(p, 's.head.yaw')) > 20, String(await pose(p, 's.head.yaw')));
  // looking round to the tail: the rail runs on, and a coffin ring sits on it behind the seat too
  await p.mouse('mousePressed', 700, 450, 1); for (let k = 1; k <= 8; k++) await p.mouse('mouseMoved', 700 - 75 * k, 450, 1); await p.mouse('mouseReleased', 100, 450);
  await p.sleep(200);
  check('the rear of the monitor has its own HUD', await p.eval('SITE5.parts.rear === true && SITE5.parts.ringCells > 10'), String(await p.eval('SITE5.parts.ringCells')));
  // looking down (dragging the view up): the arm rails and grips are there, drawn in perspective
  await p.goto(PAGE, 300); await ready(p);
  await p.mouse('mousePressed', 700, 650, 1); for (let k = 1; k <= 8; k++) await p.mouse('mouseMoved', 700, 650 - 40 * k, 1); await p.mouse('mouseReleased', 700, 330);
  await p.sleep(200);
  check('looking down shows the controls', await p.eval('SITE5.parts.seat.grip > 4 && SITE5.parts.seat.rail > 4'), JSON.stringify(await p.eval('SITE5.parts.seat')));
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  check('frames hold up (avg under 25ms)', (await p.eval('SITE5.frameMs')) < 25, (await p.eval('SITE5.frameMs')).toFixed(1) + 'ms');

  await p.goto(`${PAGE}?look=penelope`, 300); await ready(p);
  check('?look=penelope loads and draws', (await p.eval('SITE5.look')) === 'penelope' && await p.eval('!!SITE5.gl'));
  check('looks: no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();

  // reduced motion: no auto flight, no sway
  {
    const r = await launch({ width: 1440, height: 810, reduce: true });   // 16:9, as the reference frame
    await r.goto(PAGE, 300); await ready(r);
    const h0 = await pose(r, 's.heading'), e0 = await pose(r, 'JSON.stringify(s.eye)');
    await r.sleep(2000);
    check('reduced motion: the suit holds still', Math.abs((await pose(r, 's.heading')) - h0) < 0.01 && (await pose(r, 'JSON.stringify(s.eye)')) === e0);
    check('reduced motion: the sight does not sway', (await r.eval('JSON.stringify(SITE5.parts.sightSway)')) === '[0,0,0]', await r.eval('JSON.stringify(SITE5.parts.sightSway)'));
    // the triangle sits in front of the eyes (near the screen's centre), the rail and the cluster below it, and
    // the rulers still where the owner's front frame has them (scaled to the current view width)
    const sc = JSON.parse(await r.eval("JSON.stringify(Object.fromEntries(Object.entries(SITE5.anchors).map(([k, v]) => { const s = SITE5.project(v); return [k, s ? [s[0] / innerWidth * 100, s[1] / innerHeight * 100] : null]; })))"));
    check('the triangle is in front of the eyes', Math.abs(sc.nose[0] - 50) < 1 && Math.abs(sc.nose[1] - 50) < 3, JSON.stringify(sc.nose));
    check('the rail and the cluster sit below the triangle', sc.capL[1] > sc.apex[1] + 4 && sc.cluster[1] > sc.apex[1] + 8, JSON.stringify({ apex: sc.apex, cap: sc.capL, cluster: sc.cluster }));
    const k = await r.eval('SITE5.camRef / SITE5.cam.tx');
    check('the rulers sit where the reference frame has them', Math.abs(sc.rulerL[0] - (50 - 36.5 * k)) < 2.5, sc.rulerL[0].toFixed(1) + ' vs ' + (50 - 36.5 * k).toFixed(1));
    // turn the head to the right side: the coffin ring there projects as a circle round its centre
    await r.mouse('mousePressed', 1200, 400, 1); for (let k = 1; k <= 14; k++) await r.mouse('mouseMoved', 1200 - 40 * k, 400, 1);
    await r.sleep(150);
    const circ = JSON.parse(await r.eval(`(() => { const pts = SITE5.ringSample.map(q => SITE5.project(q)); const c = pts.pop();
      const d = pts.filter(Boolean).map(s => Math.hypot(s[0] - c[0], s[1] - c[1])); return JSON.stringify({ n: d.length, min: Math.min(...d), max: Math.max(...d) }); })()`));
    await r.mouse('mouseReleased', 640, 400);
    // seen from the eye, 0.4 behind the ball's centre, the ring is foreshortened into an ellipse round its centre
    check('the side coffin ring closes round its centre on the rail', circ.n === 6 && (circ.max - circ.min) / circ.max < 0.3, JSON.stringify(circ));
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
