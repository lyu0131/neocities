// Hub layout invariants the owner asked for by name: each column's instruments share one
// left and one right edge, every column header sits at the same inset, and no two HUD
// boxes overlap -- idle, and with the hostile set up. Screenshots go to tests/out/.
const path = require('path');
const { launch, check } = require('./cdp');
const SIZES = [[1920, 1080], [1440, 900], [1366, 768]];
const LEFT = ['REACTOR STATUS', 'THRUSTER VECTOR', 'ENVIRONMENT', 'SENSOR ARRAY'];
const RIGHT = ['DIAGNOSTIC MODE', 'COMBAT SYSTEM', 'HUD MODE', 'SLEW TO'];
const PROBE = `(() => {
  const vis = e => { for (let n = e; n && n !== document; n = n.parentNode) {
    if (n.hidden) return false; const cs = getComputedStyle(n);
    if (cs.display === 'none' || +cs.opacity === 0) return false; } return true; };
  const box = (name, e) => { if (!e || !vis(e)) return null; const b = e.getBoundingClientRect();
    return b.width ? { name, l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) } : null; };
  const hud = document.getElementById('hud'), rectOf = g => g && g.querySelector(':scope > rect');
  const titled = g => [...g.querySelectorAll(':scope > text')].find(t => /^[A-Z][A-Z ]+$/.test(t.textContent));
  const radar = [...hud.querySelectorAll(':scope > g')].find(g => [...g.querySelectorAll('text')].some(t => t.textContent === 'SENSOR ARRAY'));
  const cols = [...hud.querySelectorAll(':scope > g.panel'), document.querySelector('.dmgmap'), radar].filter(Boolean);
  const all = [
    ...cols.map(g => box(g === radar ? 'SENSOR ARRAY' : titled(g).textContent, rectOf(g))),
    box('SLEW TO', document.getElementById('slew')), box('HUD MODE', document.getElementById('hudmode')),
    box('COMMS', document.getElementById('comms')), box('TOAST', document.getElementById('toast')),
    ...[...hud.querySelectorAll(':scope > g.hostile')].map((g, i) =>
      rectOf(g) ? box('hx:' + g.querySelector('text').textContent, rectOf(g)) : box('readouts' + i, g))
  ].filter(Boolean);
  const hits = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) hits.push(a.name + ' x ' + b.name);
  }
  const insets = cols.filter(vis).map(g => {
    const t = g === radar ? [...g.querySelectorAll('text')].find(t => t.textContent === 'SENSOR ARRAY') : titled(g);
    return Math.round(t.getBoundingClientRect().left - rectOf(g).getBoundingClientRect().left);
  });
  return JSON.stringify({ all, hits, insets });
})()`;
const edges = (all, names) => [...new Set(all.filter(b => names.includes(b.name)).map(b => b.l + '..' + b.r))];

(async () => {
  for (const [w, h] of SIZES) {
    const p = await launch({ width: w, height: h });
    await p.goto('index.html', 800);
    for (let i = 0; i < 40 && !(await p.eval('!!window.BUNNYS && BUNNYS.state.booted === true')); i++) {
      await p.key(' ', 'Space', 32); await p.sleep(150);
    }
    await p.eval("document.querySelector('[data-mode=comms]').click()");  // popups count too
    await p.sleep(1200);
    for (const state of ['idle', 'locked']) {
      if (state === 'locked') { await p.eval("BUNNYS.emit('face', {yaw:180})"); await p.sleep(2500); }
      const r = JSON.parse(await p.eval(PROBE));
      const tag = `layout ${w}x${h} ${state}:`;
      const names = r.all.map(b => b.name);
      // Check that required panels are present (not just missing silently)
      if (w === 1920 && h === 1080) {
        const required = ['REACTOR STATUS', 'THRUSTER VECTOR', 'ENVIRONMENT', 'SENSOR ARRAY', 'DIAGNOSTIC MODE', 'COMBAT SYSTEM', 'HUD MODE', 'SLEW TO'];
        const missing = required.filter(name => !names.includes(name));
        check(`${tag} all 8 column instruments present`, missing.length === 0, missing.join(', '));
      }
      const anchors = ['REACTOR STATUS', 'SENSOR ARRAY', 'DIAGNOSTIC MODE', 'SLEW TO'];
      const missingAnchors = anchors.filter(name => !names.includes(name));
      check(`${tag} column anchors present (top and bottom)`, missingAnchors.length === 0, missingAnchors.join(', '));
      check(`${tag} no two boxes overlap`, r.hits.length === 0, r.hits.join(', '));
      check(`${tag} left column shares one edge`, edges(r.all, LEFT).length === 1, edges(r.all, LEFT).join(' | '));
      check(`${tag} right column shares one edge`, edges(r.all, RIGHT).length === 1, edges(r.all, RIGHT).join(' | '));
      check(`${tag} every column header at one inset`, new Set(r.insets).size === 1, r.insets.join(','));
      const plates = JSON.parse(await p.eval("JSON.stringify([...document.querySelectorAll('#hud rect.plate')].map(r => r.getAttribute('rx') + '|' + r.getAttribute('fill')))"));
      check(`${tag} every housing is one plate style`, plates.length >= 10 && new Set(plates).size === 1, plates.length + ' plates: ' + [...new Set(plates)].join(' / '));
      const pair = r.all.filter(b => b.name === 'hx:UNIT DATA' || b.name === 'hx:ARMAMENT DETECTED');
      if (pair.length === 2) check(`${tag} UNIT DATA and ARMAMENT share one edge`, pair[0].l === pair[1].l && pair[0].r === pair[1].r);
      await p.shot(path.join(__dirname, `out/layout-${w}-${state}.png`), false);
    }
    check(`layout ${w}x${h}: no JS errors`, p.errors.length === 0, p.errors.join(' | '));
    p.close();
  }
})();
