// Hub layout invariants the owner asked for by name: each column's instruments share one
// left and one right edge, every column header sits at the same inset, and no two HUD
// boxes overlap -- idle, and with the hostile set up. Screenshots go to tests/out/.
const path = require('path');
const { launch, check } = require('./cdp');
const SIZES = [[2560, 1440], [1920, 1080], [1440, 900], [1366, 768]];
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
    box('COMMS', document.getElementById('comms')), box('DOSSIER', document.querySelector('#hud > g.dossier > rect.plate')),
    box('TOAST', document.getElementById('toast')),
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
    // wait out the cockpit power-on: groups sit at opacity 0 until their turn in the sequence
    for (let i = 0; i < 40 && await p.eval("!!document.querySelector('.pw')"); i++) await p.sleep(100);
    await p.eval("document.querySelector('[data-mode=comms]').click()");  // popups count too
    await p.sleep(1200);
    for (const state of ['idle', 'locked']) {
      if (state === 'locked') { await p.eval("BUNNYS.emit('face', {yaw:180})"); await p.sleep(2500); }
      const r = JSON.parse(await p.eval(PROBE));
      const tag = `layout ${w}x${h} ${state}:`;
      const names = r.all.map(b => b.name);
      if (state === 'locked' && w >= 1440) {
        const hostileNames = ['hx:TARGET ID', 'hx:UNIT DATA', 'hx:ARMAMENT DETECTED'];
        const missingHostile = hostileNames.filter(n => !names.includes(n));
        check(`${tag} hostile set up`, missingHostile.length === 0, missingHostile.join(', '));
      }
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
      const css = JSON.parse(await p.eval(`JSON.stringify((() => {
        const normalize = (color) => { const el = document.createElement('div'); el.style.backgroundColor = color.trim(); document.body.appendChild(el); const result = getComputedStyle(el).backgroundColor; el.remove(); return result; };
        const tokRaw = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
        const tok = normalize(tokRaw);
        const plates = [...document.querySelectorAll('#hud rect.plate')].map(r => normalize(r.getAttribute('fill')));
        const comms = document.getElementById('comms');
        const slew = document.getElementById('slew');
        const hudmode = document.getElementById('hudmode');
        const bgSlew = slew ? getComputedStyle(slew).backgroundColor : null;
        const bgHudmode = hudmode ? getComputedStyle(hudmode).backgroundColor : null;
        const bgComms = comms ? getComputedStyle(comms).backgroundColor : null;
        const br = id => getComputedStyle(document.getElementById(id), '::before').backgroundImage;
        const brackets = br('slew') === br('comms') && br('slew') !== 'none';
        const allPlatesSame = plates.length > 0 && plates.every(p => p === tok);
        const bgMatch = bgSlew === tok && bgHudmode === tok && bgComms === tok;
        return { tokRaw, tok, plates: plates.length, allPlatesSame, bgSlew, bgHudmode, bgComms, bgMatch, brackets, hasComms: !!comms };
      })())`));
      check(`${tag} --panel token ties CSS backgrounds to SVG plates`, css.allPlatesSame && css.bgMatch && css.hasComms && css.brackets, JSON.stringify(css));
      const pair = r.all.filter(b => b.name === 'hx:UNIT DATA' || b.name === 'hx:ARMAMENT DETECTED');
      if (pair.length === 2) check(`${tag} UNIT DATA and ARMAMENT share one edge`, pair[0].l === pair[1].l && pair[0].r === pair[1].r);
      const rails = JSON.parse(await p.eval(`JSON.stringify((() => {
        const boxes = [...document.querySelectorAll('#hud rect.plate')].filter(r => getComputedStyle(r.parentNode).opacity !== '0').map(r => r.getBoundingClientRect()).filter(b => b.width)
          .concat(['slew', 'hudmode'].map(id => document.getElementById(id).getBoundingClientRect()));
        const br = [...document.querySelectorAll('#hud .rail-br')].filter(g => g.getAttribute('opacity') !== '0').map(g => g.getBoundingClientRect());
        return { n: br.length, hits: br.filter(b => boxes.some(x => b.left < x.right && x.left < b.right && b.top < x.bottom && x.top < b.bottom)).length };
      })())`));
      check(`${tag} rail brackets sit in the gaps`, rails.n >= 2 && rails.hits === 0, JSON.stringify(rails));
      // The canopy seams are cut around the instruments: none may run through a box. Sampled
      // every 2px along each seam; the console edge's third point is the lower centre edge.
      // UNIT DATA and ARMAMENT are exempt: a lock overlay whose narrow fallback (flush to the
      // right column) already sits over the ALT bar, so a wing behind it is no worse.
      // Seam points are in HUD units: below ~1800x940 hud.js lays the HUD out at a scale K < 1
      // (viewBox = viewport / K), so map them through #screens' viewBox into the px the boxes use.
      const { k, seams } = JSON.parse(await p.eval(`JSON.stringify((() => {
        const svg = document.getElementById('screens'), vb = svg.viewBox.baseVal;
        const kx = svg.clientWidth / vb.width, ky = svg.clientHeight / vb.height;
        return { k: ky, seams: [...svg.querySelectorAll('.seam-line')]
          .map(l => l.getAttribute('points').split(' ').map(q => q.split(',').map(Number)).map(([x, y]) => [x * kx, y * ky])) };
      })())`));
      // the tape as its two real boxes: the tick strip and the readout housing under it
      const tape = JSON.parse(await p.eval(`JSON.stringify((g => [g.querySelector(':scope > g'), g.querySelector(':scope > rect')]
        .map((e, i) => (b => ({ name: 'TAPE' + i, l: b.left, t: b.top, r: b.right, b: b.bottom }))(e.getBoundingClientRect())))(document.querySelector('.hdg-readout').parentNode))`));
      const crossed = new Set();
      for (const pts of seams) for (let k = 1; k < pts.length; k++) {
        const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2);
        for (let j = 0; j <= n; j++) {
          const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n;
          for (const b of r.all.concat(tape)) if (!/^hx:(UNIT|ARMAMENT)/.test(b.name) && x > b.l + 1 && x < b.r - 1 && y > b.t + 1 && y < b.b - 1) crossed.add(b.name);
        }
      }
      check(`${tag} no seam runs through a box`, seams.length === 4 && crossed.size === 0, [...crossed].join(', '));
      const deck = seams[3][2][1];
      // Where both columns are full, they line up in rows and both console pods share one top
      // line. On a short screen the pods keep to their own stacks rather than cost a panel.
      const at = n => r.all.find(b => b.name === n);
      const [rea, dia, thr, com] = ['REACTOR STATUS', 'DIAGNOSTIC MODE', 'THRUSTER VECTOR', 'COMBAT SYSTEM'].map(at);
      if (rea && dia && thr && com) {
        check(`${tag} columns line up in rows`, rea.b === dia.b && thr.t === com.t && thr.b === com.b, JSON.stringify({ rea, dia, thr, com }));
        check(`${tag} both console pods share one top line`, seams[3][0][1] === seams[3][5][1], seams[3][0][1] + ' vs ' + seams[3][5][1]);
        const [sa, hm, sl] = ['SENSOR ARRAY', 'HUD MODE', 'SLEW TO'].map(at);
        check(`${tag} the pods' instruments sit level, top and bottom`, Math.abs(sa.t - hm.t) <= 1 && Math.abs(sa.b - sl.b) <= 1, JSON.stringify({ sa, hm, sl }));
      }
      const statusTop = await p.eval("[...document.querySelectorAll('#hud > text')].find(t => /NOMINAL|SEQUENCE|ONLINE/.test(t.textContent)).getBoundingClientRect().top");
      // these gaps are layout rules in HUD units (DESIGN.md: 16 over the status line, the dossier 20
      // above the edge), so measure them in HUD units, not in px that shrink with the scale k
      const statusGap = (statusTop - deck) / k;
      check(`${tag} status line sits just under the console edge`, statusGap >= 10 && statusGap <= 24, statusGap.toFixed(1) + ' units');
      const dos = r.all.find(b => b.name === 'DOSSIER');
      if (dos) check(`${tag} dossier sits on the console`, (deck - dos.b) / k >= 16 && (deck - dos.b) / k <= 24, ((deck - dos.b) / k).toFixed(1) + ' units');
      await p.shot(path.join(__dirname, `out/layout-${w}-${state}.png`), false);
    }
    check(`layout ${w}x${h}: no JS errors`, p.errors.length === 0, p.errors.join(' | '));
    p.close();
  }
})();
