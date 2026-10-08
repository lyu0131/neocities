// resume.html, the recruiter's fast lane: readable at every width, linked from the boot screen,
// every role on it, prints black on white, and resume.pdf is a real PDF made from it.
const fs = require('fs'), path = require('path');
const { launch, check, SITE } = require('./cdp');
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  for (const [w, h] of [[375, 740], [768, 1024], [1366, 600], [1920, 1080]]) {
    await p.size(w, h); await p.goto('resume.html', 700);
    check(`resume @${w} no h-overflow`, await p.eval('document.documentElement.scrollWidth <= innerWidth'));
    await p.shot(path.join(__dirname, `out/resume-${w}.png`), false);
  }
  await p.size(1440, 900); await p.goto('resume.html', 900);
  check('resume has one h1', await p.eval("document.querySelectorAll('h1').length === 1"));
  const text = await p.eval('document.querySelector("main").textContent');
  const facts = ['UNC NIcE X Lab', 'Human Betterment Analytics Research Lab', 'Brown University CNTR', 'Antagen Biotech', 'BrainCo Inc.',
    'Purdue University', 'yutinglyu050131@gmail.com', 'USACO Platinum'];
  const missing = facts.filter(f => !text.includes(f));
  check('every role and the contact are on it', missing.length === 0, missing.join(', '));
  check('it offers the PDF', await p.eval("!!document.querySelector('a[href=\"resume.pdf\"][download]')"));
  // on paper: no cockpit, black on white
  await p.send('Emulation.setEmulatedMedia', { media: 'print' });
  check('print drops the cockpit', await p.eval("getComputedStyle(document.querySelector('.strip')).display === 'none' && getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)'"));
  await p.send('Emulation.setEmulatedMedia', { media: '' });
  const pdf = path.join(SITE, 'resume.pdf');
  check('resume.pdf is a PDF', fs.existsSync(pdf) && fs.readFileSync(pdf).slice(0, 5).toString() === '%PDF-' && fs.statSync(pdf).size > 10000);
  // reachable from the boot screen; not a strip tab (the owner keeps the strip to the cockpit's contacts)
  await p.goto('index.html', 900);
  check('the boot screen links the résumé', await p.eval("!!document.querySelector('#boot a[href=\"resume.html\"]')"));
  await p.goto('pilot.html', 600);
  check('no résumé tab in the strip', !(await p.eval("!!document.querySelector('.strip a[href=\"resume.html\"]')")));
  // on a phone every strip item is on screen (the strip is fixed, so a clipped item never shows as page overflow)
  await p.size(375, 740);
  for (const pg of ['pilot.html', 'resume.html', 'manual-claude-2.html']) {
    await p.goto(pg, 700);
    const out = await p.eval("[...document.querySelectorAll('.strip a, .strip summary')].filter(e => e.checkVisibility()).filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(e => e.textContent.trim()).join(', ')");
    check(`${pg} @375 every strip item on screen`, out === '', out);
  }
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();
})();
