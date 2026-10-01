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
    // the sub-page HUD (js/pagehud.js): one ladder rung per panel, and it follows the scroll
    check(`${pg} HUD has a rung per panel`, await p.eval("document.querySelectorAll('.phud-ladder li').length === document.querySelectorAll('.screen .panel').length"));
    check(`${pg} background bearing matches its contact`, await p.eval("(() => { const c = BUNNYS.contacts.find(c => c.page === document.documentElement.dataset.page); return +getComputedStyle(document.body).getPropertyValue('--brg') === BUNNYS.wrap360(c.yaw); })()"));
    check(`${pg} has none of the cockpit HUD`, await p.eval("!document.getElementById('hud') && !document.getElementById('frame')"));
    // J/K step one sector at a time, fast presses included, and K comes back from the very end
    const rung = () => p.eval("[...document.querySelectorAll('.phud-ladder a')].findIndex(a => a.classList.contains('is-on')) + 1");
    const nRungs = await p.eval("document.querySelectorAll('.phud-ladder li').length");
    for (let i = 0; i < 3; i++) { await p.key('j', 'KeyJ', 74); await p.sleep(100); }
    await p.sleep(900);
    check(`${pg} J x3 lands on sector 4`, (await rung()) === 4, await rung());
    for (let i = 0; i < nRungs; i++) await p.key('j', 'KeyJ', 74);
    await p.sleep(900);
    await p.key('k', 'KeyK', 75); await p.sleep(900);
    check(`${pg} K from the end steps back one`, (await rung()) === nRungs - 1, await rung());
    await p.eval("document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight"); await p.sleep(400);
    await p.mouse('mouseMoved', 700, 400); await p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 400, deltaX: 0, deltaY: 40 }); await p.sleep(400);
    check(`${pg} HUD follows the scroll`, await p.eval("(()=>{const r=[...document.querySelectorAll('.phud-ladder a')];return r[r.length-1].classList.contains('is-on')})()"));
    check(`${pg} links LinkedIn only on pilot`, pg !== 'pilot.html' || await p.eval("!!document.querySelector('a[href^=\"https://www.linkedin.com/in/sylas-lyu-73815525\"]')"));
  }
  if (fs.existsSync(path.join(SITE, 'hangar.html'))) {
    await p.goto('hangar.html', 900);
    const n = await p.eval("document.querySelectorAll('button[data-zone]').length");
    check('hangar has a callout per zone', n === 8, n + ' callouts');
    // the owner's own mesh, drawn: the canvas has real pixels in it, not just the grid behind
    // (read inside a frame, straight after hangar.js has drawn: outside one the buffer is cleared)
    check('hangar draws the model', await p.eval("new Promise(r=>requestAnimationFrame(()=>{const c=document.getElementById('suit');const g=c&&c.getContext('webgl2');if(!g)return r(false);const px=new Uint8Array(4*64*64);g.readPixels((c.width>>1)-32,(c.height>>1)-32,64,64,g.RGBA,g.UNSIGNED_BYTE,px);let n=0;for(let i=3;i<px.length;i+=4)if(px[i]>0)n++;r(n>200)}))"));
    check('hangar callout lights its zone', await p.eval("(()=>{const b=document.querySelector('button[data-zone=chest]');b.focus();return document.getElementById('suit').dataset.hot==='chest'})()"));
  }
  // Folded in from the retired a11y-audit.js: the four of its checks no other test covered.
  for (const pg of ['index.html', ...PAGES]) {
    await p.goto(pg, 900);
    check(`${pg} lang="en"`, await p.eval("document.documentElement.lang === 'en'"));
    check(`${pg} has one h1`, await p.eval("document.querySelectorAll('h1').length === 1"));
    const dups = await p.eval("(()=>{const s=new Set(),d=new Set();document.querySelectorAll('[id]').forEach(e=>s.has(e.id)?d.add(e.id):s.add(e.id));return [...d].join(',')})()");
    check(`${pg} no duplicate ids`, dups === '', dups);
  }
  await p.goto('index.html', 900);
  check('hub #lock-status is aria-live polite', await p.eval("document.getElementById('lock-status').getAttribute('aria-live') === 'polite'"));
  check('hub svg#hud is aria-hidden', await p.eval("document.getElementById('hud').getAttribute('aria-hidden') === 'true'"));

  // Q / E switch pages left / right, wrapping
  await p.goto('pilot.html', 1200);
  await p.key('e', 'KeyE', 69); await p.sleep(2200);
  check('E goes to the page on the right', /missions\.html$/.test(await p.eval('location.pathname')));
  await p.goto('pilot.html', 1200);
  await p.key('q', 'KeyQ', 81); await p.sleep(2200);
  check('Q wraps to the far page', /hangar\.html$/.test(await p.eval('location.pathname')));
  // 2 locks the missions contact, Enter opens it
  await p.goto('pilot.html', 1200);
  await p.key('2', 'Digit2', 50); await p.sleep(200);
  check('2 locks a contact on the scope', /LOCK/.test(await p.eval("document.querySelector('.phud-status').textContent")) && /pilot\.html$/.test(await p.eval('location.pathname')));
  await p.key('Enter', 'Enter', 13); await p.sleep(2200);
  check('Enter opens the scope lock', /missions\.html$/.test(await p.eval('location.pathname')));
  // with a contact locked, Enter on a focused <summary> still opens that section, not the page
  await p.goto('hangar.html', 1500);
  await p.key('2', 'Digit2', 50);
  await p.eval("document.querySelectorAll('details.log summary')[1].focus()");
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await p.sleep(1500);
  check('Enter on a summary opens it, even with a lock', /hangar\.html$/.test(await p.eval('location.pathname')) && await p.eval("document.querySelectorAll('details.log')[1].open"));
  // Esc on a sub-page goes back to the cockpit (through the shutters)
  await p.goto('missions.html', 1200);
  await p.key('Escape', 'Escape', 27); await p.sleep(2200);
  check('Esc returns to the cockpit', /index\.html$/.test(await p.eval('location.pathname')));
  check('no JS errors on sub-pages', p.errors.length === 0, p.errors.join(' | '));
  p.close();
})();
