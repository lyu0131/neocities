// The library as a bookshelf (manual.html, js/library.js): a display shelf and one shelf per subject; clicking or
// Enter on a spine pulls that book out onto the display. The site has one manual, so the pull-out is tested on a
// two-manual library the real generator builds into tests/fixtures/ (never deployed: tests/ isn't a page folder).
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { launch, check, SITE } = require('./cdp');
const PY = `
import sys; sys.path.insert(0, 'tools')
from gen_manual import parse_header, split_sections, build_manual, library, fingerprint
docs = [("alpha", "---\\ntitle: Alpha guide\\nblurb: The first one.\\ndate: 2026-10-01\\nsubject: Design\\n---\\n## 1. One\\na\\n## 2. Two\\nb\\n"),
        ("beta", "---\\ntitle: Beta guide\\nblurb: The newer one.\\ndate: 2026-10-05\\nsubject: AI tools\\nspine: Beta\\n---\\n## 1. One\\na\\n## 2. Two\\nb\\n## 3. Three\\nc\\n## 4. Four\\nd\\n")]
sums = []
for vol, (slug, text) in enumerate(docs, 1):
    m, b = parse_header(text, slug + ".md")
    sums.append(build_manual(slug, m, split_sections(b, slug), vol)[1])
html = fingerprint(library(sums)).replace("<head>", '<head>\\n<base href="../../">', 1)
open("tests/fixtures/library-2.html", "w", encoding="utf-8").write(html)
`;
fs.mkdirSync(path.join(SITE, 'tests/fixtures'), { recursive: true });
const gen = spawnSync('python', ['-c', PY], { cwd: SITE, encoding: 'utf8' });
if (gen.status !== 0) { console.log('FAIL fixture build  ' + gen.stderr); process.exit(1); }
const FIX = 'tests/fixtures/library-2.html';
const onDisplay = "(document.querySelector('.fm-display .fm-cover b') || {}).textContent";
const out = "[...document.querySelectorAll('.fm-spine.is-out')].map(s => s.dataset.fm).join(',')";

(async () => {
  const p = await launch({ width: 1440, height: 900 });
  // the real library: every manual a spine linking its manual, the newest on display
  await p.goto('manual.html', 1200);
  const SOURCES = fs.readdirSync(path.join(SITE, 'docs/manuals')).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3));
  const hrefs = await p.eval("[...document.querySelectorAll('.fm-shelf .fm-spine')].map(a => a.getAttribute('href'))");
  check('one spine per manual, each linking it', hrefs.length === SOURCES.length && SOURCES.every(s => hrefs.includes(`manual-${s}.html`)), hrefs.join(','));
  check('the real library has a book on display', /^FM-\d\d$/.test(await p.eval(onDisplay)));
  // the books are drawn: an emblem on every cover and spine, each book its own, every spine title fully in
  check('every spine title fits its spine', await p.eval("[...document.querySelectorAll('.fm-spine-t')].every(t => t.scrollHeight <= t.clientHeight + 1 && t.scrollWidth <= t.clientWidth + 1)"),
    await p.eval("[...document.querySelectorAll('.fm-spine-t')].filter(t => t.scrollHeight > t.clientHeight + 1).map(t => t.textContent).join(', ')"));
  check('every spine carries an emblem', await p.eval("[...document.querySelectorAll('.fm-shelf .fm-spine')].every(a => a.querySelector('svg.fm-emblem'))"));
  check('the cover on display carries an emblem', await p.eval("!!document.querySelector('.fm-display .fm-cover svg.fm-emblem')"));
  check('each book has its own emblem', await p.eval("(() => { const m = [...document.querySelectorAll('.fm-shelf .fm-spine svg.fm-emblem')].map(s => s.innerHTML); return new Set(m).size === m.length; })()"));

  // the two-manual fixture
  await p.goto(FIX, 1200);
  check('a shelf per subject, A to Z', (await p.eval("[...document.querySelectorAll('.fm-shelf')].map(s => s.dataset.sector).join('|')")) === 'AI tools|Design');
  check('the newest is on display', await p.eval(onDisplay) === 'FM-02');
  check("its spine is an empty slot, marked current", await p.eval(out) === 'FM-02' && await p.eval("document.querySelector('.fm-spine.is-out').getAttribute('aria-current') === 'true'"));
  check('a spine reads its spine: line, else the title', await p.eval("document.querySelector('[data-fm=FM-02] .fm-spine-t').textContent.trim() === 'Beta' && document.querySelector('[data-fm=FM-01] .fm-spine-t').textContent.trim() === 'Alpha guide'"));
  check('a longer manual is a taller spine', await p.eval("document.querySelector('[data-fm=FM-02]').offsetHeight > document.querySelector('[data-fm=FM-01]').offsetHeight"));
  await p.eval("document.querySelector('[data-fm=FM-01]').click(); true"); await p.sleep(1600);
  check('clicking a spine pulls that book out', await p.eval(onDisplay) === 'FM-01' && await p.eval(out) === 'FM-01');
  check('the address names it, the page stays', await p.eval('location.hash') === '#fm-01' && (await p.eval('location.pathname')).endsWith('library-2.html'));
  check('the display says what it is', /The first one\./.test(await p.eval("document.querySelector('.fm-display').textContent")) && await p.eval("!!document.querySelector('.fm-display a.fm-open[href=\"manual-alpha.html\"]')"));
  await p.eval("document.querySelector('[data-fm=FM-02]').focus(); true");
  await p.key('Enter', 'Enter', 13); await p.sleep(1600);
  check('Enter on a spine pulls it out', await p.eval(onDisplay) === 'FM-02');
  await p.goto(FIX + '#fm-01', 1200);
  check('the address picks the book on arrival', await p.eval(onDisplay) === 'FM-01');
  for (const [w, h] of [[375, 740], [768, 1024], [1366, 600], [1920, 1080]]) {
    await p.size(w, h);
    for (const pg of ['manual.html', FIX]) {
      await p.goto(pg, 700);
      check(`${pg} @${w} no h-overflow`, await p.eval('document.documentElement.scrollWidth <= innerWidth'));
    }
    await p.shot(path.join(__dirname, `out/library-${w}.png`), false);
  }
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();

  // reduced motion: the books swap in place
  const r = await launch({ width: 1440, height: 900, reduce: true });
  await r.goto(FIX, 1200);
  await r.eval("document.querySelector('[data-fm=FM-01]').click(); true"); await r.sleep(60);
  check('reduced motion swaps at once', await r.eval(onDisplay) === 'FM-01' && await r.eval('document.getAnimations().length') === 0);
  r.close();

  // no JavaScript: every spine still goes straight in, and the newest is already on display
  const n = await launch({ width: 1440, height: 900 });
  await n.send('Emulation.setScriptExecutionDisabled', { value: true });
  await n.goto(FIX, 1200);
  check('without JS the spines are links', await n.eval("[...document.querySelectorAll('.fm-spine')].every(a => /^manual-(alpha|beta)\\.html$/.test(a.getAttribute('href')))"));
  check('without JS the newest is on display', await n.eval(onDisplay) === 'FM-02');
  n.close();
})();
