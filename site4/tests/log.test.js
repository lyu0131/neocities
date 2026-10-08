// The pilot log: badges a visitor earns by exploring, kept in their browser (localStorage 'bunnys-log') and shown
// under the sub-pages' contact scope. A fresh profile starts empty and reaches 7/7 by visiting everything.
const path = require('path');
const { launch, check } = require('./cdp');
const logged = "JSON.parse(localStorage.getItem('bunnys-log') || '[]')";
(async () => {
  const p = await launch({ width: 1440, height: 900 });   // a fresh user-data-dir: nothing logged
  await p.goto('index.html', 1500);
  await p.key(' ', 'Space', 32); await p.sleep(2500);
  check('booting logs BOOT', (await p.eval(logged)).includes('boot'));
  await p.goto('pilot.html', 1200);
  check('a contact page logs itself', (await p.eval(logged)).includes('pilot'));
  check('the scope shows the log', /PILOT LOG\s*2\/7/.test(await p.eval("document.querySelector('.phud-log').textContent")));
  check('earned badges are lit, the rest are not', await p.eval("document.querySelector('.phud-log [data-badge=pilot]').classList.contains('is-on') && !document.querySelector('.phud-log [data-badge=hangar]').classList.contains('is-on')"));
  check('each badge says what it is for', await p.eval("[...document.querySelectorAll('.phud-log [data-badge]')].every(b => b.getAttribute('aria-label').length > 6)"));
  for (const pg of ['missions.html', 'hangar.html', 'manual-claude-2.html', 'unknown.html']) await p.goto(pg, 1500);
  const all = await p.eval(logged);
  check('every contact logged', ['boot', 'pilot', 'missions', 'hangar', 'manual', 'unknown'].every(b => all.includes(b)), all.join(','));
  await p.goto('manual.html', 1200);
  check('all six earn the full sweep', /7\/7/.test(await p.eval("document.querySelector('.phud-log').textContent")) && await p.eval("document.querySelector('.phud-log [data-badge=all]').classList.contains('is-on')"));
  await p.shot(path.join(__dirname, 'out/log-1440.png'), false);
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();
})();
