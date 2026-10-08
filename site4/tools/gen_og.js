// Link-preview pictures: every image a page's og:image asks for (img/og/<page>.png), taken from that page at
// 1200x630, the large-card size. Run from site4/ after a page's look changes:  node tools/gen_og.js
const fs = require('fs'), path = require('path');
const { launch, SITE } = require('../tests/cdp');
const shots = new Set();
for (const f of fs.readdirSync(SITE).filter(f => f.endsWith('.html'))) {
  const m = fs.readFileSync(path.join(SITE, f), 'utf8').match(/property="og:image" content="[^"]*\/img\/og\/([^"]+)\.png"/);
  if (m) shots.add(m[1]);
}
(async () => {
  fs.mkdirSync(path.join(SITE, 'img/og'), { recursive: true });
  const p = await launch({ width: 1200, height: 630 });
  for (const name of [...shots].sort()) {
    await p.goto(name + '.html', 1500);
    if (name === 'index') { await p.key(' ', 'Space', 32); await p.sleep(6000); }   // past the boot, screens up
    if (name === 'hangar') await p.sleep(2500);                                    // the 3D model draws
    await p.eval('scrollTo(0, 0); true');
    await p.shot(path.join(SITE, 'img/og', name + '.png'), false);
    console.log('img/og/' + name + '.png');
  }
  p.close();
})();
