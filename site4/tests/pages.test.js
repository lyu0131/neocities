// Sub-pages: no overflow at every test width, one h1, return link, nav with aria-current,
// hangar callouts light up their part. Screenshots go to tests/out/.
const fs = require('fs'), path = require('path');
const { launch, check, SITE } = require('./cdp');
const PAGES = ['pilot.html', 'missions.html', 'hangar.html'];
const SIZES = [[375, 740], [768, 1024], [1024, 768], [1366, 600], [1440, 900], [1920, 1080]];
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  for (const pg of PAGES) {
    if (!fs.existsSync(path.join(SITE, pg))) { check(`${pg} exists`, false); continue; }
    for (const [w, h] of SIZES) {
      await p.size(w, h); await p.goto(pg, 900);
      check(`${pg} @${w} no h-overflow`, await p.eval('document.documentElement.scrollWidth <= innerWidth'));
      await p.shot(path.join(__dirname, `out/${pg.replace('.html', '')}-${w}.png`));
    }
    await p.size(1440, 900); await p.goto(pg, 900);
    check(`${pg} has one h1`, await p.eval("document.querySelectorAll('h1').length === 1"));
    check(`${pg} body.page`, await p.eval("document.body.classList.contains('page')"));
    check(`${pg} return link to index`, await p.eval("[...document.querySelectorAll('a')].some(a => /index\\.html$/.test(a.getAttribute('href')||'') && /return/i.test(a.textContent))"));
    check(`${pg} nav marks current page`, await p.eval(`!!document.querySelector('a[aria-current="page"][href$="${pg}"]')`));
    check(`${pg} links LinkedIn only on pilot`, pg !== 'pilot.html' || await p.eval("!!document.querySelector('a[href^=\"https://www.linkedin.com/in/steven-lyu-73815525b\"]')"));
  }
  if (fs.existsSync(path.join(SITE, 'hangar.html'))) {
    await p.goto('hangar.html', 900);
    const n = await p.eval("document.querySelectorAll('button[data-part]').length");
    check('hangar has callout buttons', n >= 4, n + ' callouts');
    check('hangar callout lights its part', await p.eval("(()=>{const b=document.querySelector('button[data-part]');if(!b)return false;b.focus();const id=b.dataset.part;return [...document.querySelectorAll('[id=\"'+id+'\"]')].some(e=>e.classList.contains('is-hot'))})()"));
  }
  check('no JS errors on sub-pages', p.errors.length === 0, p.errors.join(' | '));
  p.close();
})();
