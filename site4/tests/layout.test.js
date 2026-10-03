// Hub layout: the HUD's parts keep their order down the screen and stay in the window at every
// size -- the heading scale between the rim and the reticle, the reticle's apex above the rail, the
// lock readout under the rail -- and nothing runs off the sides. Screenshots go to tests/out/.
const path = require('path');
const { launch, check } = require('./cdp');
const SIZES = [[2560, 1440], [1920, 1080], [1440, 900], [1366, 768], [1024, 768], [375, 812]];
const PROBE = `JSON.stringify((() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const rim = r('#hud .rim'), hdg = r('#hud .hdg'), tri = r('#hud .tri-panel'), cl = r('#hud .cluster');
  const clamps = [...document.querySelectorAll('#hud .clamp')].map(c => { const b = c.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; });
  const mode = r('#hud .mode');
  return { W: innerWidth, H: innerHeight, rim, hdg, tri, cl, clamps, mode, over: document.documentElement.scrollWidth > innerWidth };
})())`;

(async () => {
  const p = await launch({ width: 1440, height: 900 });
  for (const [w, h] of SIZES) {
    await p.size(w, h);
    await p.goto('index.html', 1200);
    await p.key('2', 'Digit2', 50); await p.sleep(1500);   // locked, so the readout is at its longest
    const g = JSON.parse(await p.eval(PROBE)), tag = `layout ${w}x${h}:`;
    const railY = g.clamps.length ? (g.clamps[0].t + g.clamps[0].b) / 2 : null;
    check(`${tag} the parts are drawn`, !!(g.rim && g.hdg && g.tri && g.cl && g.mode && g.clamps.length === 2));
    if (!(g.rim && g.hdg && g.tri && g.cl && g.mode && railY)) continue;
    check(`${tag} the heading sits between the rim and the reticle`, g.hdg.t >= g.rim.b - 2 && g.hdg.b <= g.tri.t, `rim ${g.rim.b.toFixed(0)} hdg ${g.hdg.t.toFixed(0)}-${g.hdg.b.toFixed(0)} tri ${g.tri.t.toFixed(0)}`);
    check(`${tag} the reticle's apex clears the rail`, g.tri.b <= railY - 4, `apex ${g.tri.b.toFixed(0)} rail ${railY.toFixed(0)}`);
    check(`${tag} the lock readout sits under the rail, on screen`, g.cl.t > railY && g.cl.b <= g.H, `rail ${railY.toFixed(0)} readout ${g.cl.t.toFixed(0)}-${g.cl.b.toFixed(0)}`);
    check(`${tag} the readout clears both clamps`, g.clamps.every(c => g.cl.t >= c.b), g.clamps.map(c => c.b.toFixed(0)).join(','));
    check(`${tag} the mode word is inside the reticle`, g.mode.l >= g.tri.l && g.mode.r <= g.tri.r && g.mode.t >= g.tri.t - 2, JSON.stringify(g.mode));
    check(`${tag} the clamps are on screen`, g.clamps.every(c => c.l >= 0 && c.r <= g.W));
    check(`${tag} no h-overflow`, !g.over);
    await p.shot(path.join(__dirname, `out/hub-${w}.png`), false);
  }
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();
})();
