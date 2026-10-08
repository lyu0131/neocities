// Ctrl+K: the go-anywhere box (js/palette.js over the generated js/site-index.js). Opens on every page, finds
// pages, manuals and their sections by name, arrows pick, Enter goes (through the shutters), Esc closes.
const { launch, check } = require('./cdp');
const ctrlK = p => p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 })
  .then(() => p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 }));
const type = (p, text) => p.send('Input.insertText', { text });
const isOpen = "!!document.querySelector('dialog.go[open]')";
const items = "[...document.querySelectorAll('dialog.go [role=option]')].map(o => o.textContent)";
(async () => {
  const p = await launch({ width: 1440, height: 900 });
  for (const pg of ['pilot.html', 'manual-claude-2.html', 'unknown.html']) {
    await p.goto(pg, 1200);
    await ctrlK(p); await p.sleep(200);
    check(`Ctrl+K opens the box on ${pg}`, await p.eval(isOpen));
    check(`${pg}: the search field has focus`, await p.eval("document.activeElement === document.querySelector('dialog.go input')"));
    await p.key('Escape', 'Escape', 27); await p.sleep(200);
    check(`${pg}: Esc closes it and stays put`, !(await p.eval(isOpen)) && (await p.eval('location.pathname')).endsWith(pg));
  }
  await p.goto('index.html', 1500); await p.key(' ', 'Space', 32); await p.sleep(2500);
  await ctrlK(p); await p.sleep(200);
  check('Ctrl+K opens the box in the cockpit', await p.eval(isOpen));
  await type(p, 'hangar'); await p.sleep(150);
  check('typing finds a page', /HANGAR|Hangar/.test((await p.eval(items))[0] || ''), (await p.eval(items)).join(' | '));
  await p.key('Escape', 'Escape', 27);
  await p.goto('pilot.html', 1200);
  await ctrlK(p); await p.sleep(200); await type(p, 'hooks'); await p.sleep(150);
  const found = await p.eval(items);
  check('typing finds a manual section', found.some(t => /Hooks/.test(t)), found.join(' | '));
  check('the first result is picked', await p.eval("document.querySelector('dialog.go [role=option][aria-selected=true]') === document.querySelector('dialog.go [role=option]')"));
  await p.key('ArrowDown', 'ArrowDown', 40);
  check('ArrowDown picks the next', await p.eval("document.querySelectorAll('dialog.go [role=option]')[1].getAttribute('aria-selected') === 'true'") || found.length < 2);
  await p.key('ArrowUp', 'ArrowUp', 38);
  const target = await p.eval("document.querySelector('dialog.go [role=option][aria-selected=true]').dataset.href");
  await p.key('Enter', 'Enter', 13); await p.sleep(1800);
  check('Enter goes there', (await p.eval('location.pathname + location.hash')).endsWith(target), target);
  await ctrlK(p); await p.sleep(200); await type(p, 'zzzqqq'); await p.sleep(150);
  check('no match says so', /NO MATCH/i.test(await p.eval("document.querySelector('dialog.go').textContent")));
  check('no JS errors', p.errors.length === 0, p.errors.join(' | '));
  p.close();
})();
