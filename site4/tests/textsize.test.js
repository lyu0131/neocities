// Text size (the strip's Aa menu): S / M / L / XL scales the reading column on every sub-page, is remembered
// across pages, never pushes the page sideways, and never runs the column into the side instruments.
const path = require('path');
const { launch, check } = require('./cdp');
const scale = "+getComputedStyle(document.querySelector('main.screen')).zoom / (+getComputedStyle(document.documentElement).getPropertyValue('--z') || 1)";
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  await p.goto('pilot.html', 900);
  check('every strip has the Aa menu', await p.eval("document.querySelectorAll('.strip-aa input[name=textsize]').length === 4"));
  check('M is the default', Math.abs(await p.eval(scale) - 1) < .01 && await p.eval("document.querySelector('.strip-aa input[value=m]').checked"));
  await p.eval("document.querySelector('.strip-aa summary').click(); document.querySelector('.strip-aa input[value=xl]').click(); true");
  await p.sleep(200);
  const xl = await p.eval(scale);
  check('XL scales the reading column', xl > 1.25, String(xl));
  // remembered: another page opens at XL with no jump (set before first paint, so it is on <html> at once)
  await p.goto('manual-claude-4.html', 900);
  check('XL is remembered on the next page', await p.eval("document.documentElement.dataset.text") === 'xl' && Math.abs(await p.eval(scale) - xl) < .01);
  check('the menu shows the remembered size', await p.eval("document.querySelector('.strip-aa input[value=xl]').checked"));
  for (const [w, h] of [[375, 740], [1366, 768], [1920, 1080], [2560, 1440]]) {
    await p.size(w, h);
    for (const pg of ['pilot.html', 'missions.html', 'manual-claude-4.html', 'resume.html']) {
      await p.goto(pg, 700);
      check(`XL ${pg} @${w} no h-overflow`, await p.eval('document.documentElement.scrollWidth <= innerWidth'));
      // the column stays clear of the side instruments where they show
      check(`XL ${pg} @${w} column clear of the rails`, await p.eval(`(() => {
        const m = document.querySelector('main.screen').getBoundingClientRect();
        return [...document.querySelectorAll('.phud-ladder, .phud-scope')].filter(e => getComputedStyle(e).display !== 'none')
          .every(e => { const r = e.getBoundingClientRect(); return r.right <= m.left + 1 || r.left >= m.right - 1; });
      })()`));
    }
    await p.shot(path.join(__dirname, `out/textsize-xl-${w}.png`), false);
  }
  // back to M for whoever runs next
  await p.eval("localStorage.removeItem('bunnys-text'); true");
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();
})();
