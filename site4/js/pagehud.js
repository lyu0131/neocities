/* pagehud.js: the sub-pages' own HUD, built from the page itself. The cockpit HUD (hud.js) is
   hub-only; on a page you read, the instruments are about reading:
   - a sector ladder (left): one rung per panel, the one under the eye lit, a fill for how far
     down you are; a rung jumps to its panel;
   - a contact scope (right): pilot, missions and hangar at their real cockpit bearings, this page
     locked, the other two links (they take the canopy shutters, js/link.js); bearing, range,
     sector and progress readouts under it;
   - a status line and progress bar along the foot (the only parts shown on a narrow screen). */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS, pad = BUNNYS.pad, clamp = BUNNYS.clamp;
  var reduce = BUNNYS.reduce;
  var screen = document.querySelector('.screen');
  if (!screen) return;

  // the unit's emblem, giant and turning slowly behind the panels: the cockpit insignia's coin
  // (two faces, so it never reads mirrored), over the dimmed panorama and under everything else
  var bg = el('div', 'bg-emblem'), coin = el('div', 'bg-coin');
  bg.setAttribute('aria-hidden', 'true');
  for (var f = 0; f < 2; f++) { var face = el('img'); face.src = 'img/emblem-hud.webp'; face.alt = ''; coin.appendChild(face); }
  bg.appendChild(coin);
  document.body.insertBefore(bg, document.body.firstChild);

  // the cockpit's contacts (bunnys.js), each with its bearing on the scope; the pages among them
  // are Q/E's order; link.js has already named the page we're on
  // (copies, so the scope's DOM nodes don't land on the shared table)
  var CONTACTS = BUNNYS.contacts.map(function (c) { return Object.assign({ brg: BUNNYS.wrap360(c.yaw) }, c); });
  var PAGES = BUNNYS.contacts.filter(function (c) { return c.page; }).map(function (c) { return c.page; });
  var here = document.documentElement.dataset.page;
  var me = CONTACTS.filter(function (c) { return c.page === here; })[0] || CONTACTS[0];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---- sectors: every panel on the page, in reading order ----
  var sectors = Array.prototype.map.call(screen.querySelectorAll('.panel'), function (p, i) {
    var h = p.querySelector('h2, h3');
    // a panel with a long title names its own rung (data-sector), so the ladder stays legible
    var name = p.dataset.sector || (h ? h.textContent : 'Sector');
    p.id = p.id || 's-' + (i + 1);
    return { el: p, name: name.trim() };
  });
  if (!sectors.length) return;

  // ---- left: the sector ladder ----
  var ladder = el('nav', 'phud-ladder');
  ladder.setAttribute('aria-label', 'Sections on this page');
  var cap = el('p', 'phud-cap', 'SECTORS ');
  cap.insertAdjacentHTML('beforeend', '<kbd aria-hidden="true">J</kbd><kbd aria-hidden="true">K</kbd>');
  ladder.appendChild(cap);
  var track = el('b', 'phud-track'), fill = el('i', 'phud-fill');
  track.appendChild(fill); ladder.appendChild(track);
  var ol = el('ol');
  var rungs = sectors.map(function (s, i) {
    var li = el('li'), a = el('a');
    a.href = '#' + s.el.id;
    a.appendChild(el('i', null, pad(i + 1, 2)));
    a.appendChild(el('span', null, s.name));
    a.addEventListener('click', function (e) { e.preventDefault(); goSector(i); });
    li.appendChild(a); ol.appendChild(li);
    return a;
  });
  ladder.appendChild(ol);

  // ---- right: the contact scope and readouts ----
  var side = el('aside', 'phud-scope');
  side.setAttribute('aria-label', 'Contacts');
  var scap = el('p', 'phud-cap', 'CONTACTS ');
  scap.insertAdjacentHTML('beforeend', '<kbd aria-hidden="true">1-4</kbd>');
  side.appendChild(scap);
  var dial = el('div', 'phud-dial');
  dial.appendChild(el('i', 'phud-sweep'));
  CONTACTS.forEach(function (c) {
    var th = c.brg * Math.PI / 180, x = 50 + Math.sin(th) * 34, y = 50 - Math.cos(th) * 34;
    var mine = c === me, node;
    if (c.page && !mine) {
      node = el('a', 'phud-blip'); node.href = c.page + '.html';
      node.setAttribute('aria-label', c.label + ', bearing ' + pad(c.brg, 3));
    } else {
      node = el('span', 'phud-blip' + (mine ? ' is-me' : ' is-unk'));
      if (mine) node.setAttribute('aria-label', c.label + ', this page');
      else node.setAttribute('aria-hidden', 'true');
    }
    node.style.left = x.toFixed(1) + '%'; node.style.top = y.toFixed(1) + '%';
    node.appendChild(el('span', null, c.code));
    dial.appendChild(node);
    c.node = node;
  });
  side.appendChild(dial);
  var dl = el('dl', 'phud-tel');
  function row(k, v) { dl.appendChild(el('dt', null, k)); var d = el('dd', null, v); dl.appendChild(d); return d; }
  row('BRG', pad(me.brg, 3));
  row('RNG', me.rng);
  var secOut = row('SECTOR', '');
  var pctOut = row('READ', '');
  side.appendChild(dl);

  // ---- foot: status line and progress ----
  var status = el('p', 'phud-status'); status.setAttribute('aria-hidden', 'true');
  var prog = el('i', 'phud-prog'); prog.setAttribute('aria-hidden', 'true');

  document.body.appendChild(ladder);
  document.body.appendChild(side);
  document.body.appendChild(status);
  document.body.appendChild(prog);

  // ---- follow the scroll. The window is the page's scroller (body.page has no height or
  // overflow of its own -- see cockpit.css), so a plain bubbling 'scroll' listener on the
  // window sees it, and document.scrollingElement (not body) reports its position. ----
  var sc = document.scrollingElement;
  var cur = -1, queued = false, locked = null;
  // J/K (and a rung click) keep their own cursor, shown until the next manual scroll. Reading it
  // back off the scroll position fails three ways: two panels side by side share a top, the last
  // few panels can never scroll up to the reading line, and a smooth scroll is mid-flight when the
  // next key lands.
  var forced = null;
  function goSector(i) {
    forced = clamp(i, 0, sectors.length - 1);
    sectors[forced].el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    update();
  }
  function manual() { if (forced !== null) { forced = null; queue(); } }
  ['wheel', 'touchstart', 'mousedown'].forEach(function (t) { addEventListener(t, manual, { passive: true }); });
  function update() {
    queued = false;
    var frac = clamp(sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight), 0, 1);
    // the panel under the reading line (40% down the viewport); the last one once at the bottom
    // (a panel beside another shares its top: the first of the row is the one being read)
    var line = innerHeight * 0.4, at = 0, atTop = -Infinity;
    sectors.forEach(function (sec, i) {
      var t = sec.el.getBoundingClientRect().top;
      if (t <= line && t > atTop + 1) { at = i; atTop = t; }
    });
    if (frac > 0.995) at = sectors.length - 1;
    if (forced !== null) at = forced;
    if (at !== cur) {
      if (cur >= 0) { rungs[cur].classList.remove('is-on'); rungs[cur].removeAttribute('aria-current'); }
      rungs[at].classList.add('is-on'); rungs[at].setAttribute('aria-current', 'location');
      cur = at;
    }
    var n = pad(at + 1, 2) + '/' + pad(sectors.length, 2);
    // text only when it changed: a rewrite every scroll frame re-lays-out the readouts for nothing
    setText(secOut, n);
    setText(pctOut, pad(Math.round(frac * 100), 3) + '%');
    setText(status, locked
      ? 'LOCK ▸ ' + locked.label + ' · ENTER TO OPEN · ESC TO RELEASE'
      : 'LINK ▸ ' + me.label + ' · ' + n + ' · ' + sectors[at].name.toUpperCase());
    fill.style.transform = 'scaleY(' + frac.toFixed(4) + ')';
    prog.style.transform = 'scaleX(' + frac.toFixed(4) + ')';
  }
  function setText(node, s) { if (node.textContent !== s) node.textContent = s; }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  // <details> opening (the hangar's history) changes the page's length
  document.addEventListener('toggle', queue, true);
  update();

  // ---- keys, the same map as the cockpit's: 1-4 lock a contact on the scope and Enter opens it
  // (the unknown one opens the cockpit facing it), Esc releases a lock or else goes back to the
  // cockpit, J/K the next/previous sector ----
  function go(href) { BUNNYS.link.go(href); }   // link.js: the shutters, or straight there under reduced motion
  function lock(c) {
    if (locked) locked.node.classList.remove('is-lock');
    locked = c === me ? null : c;            // this page's own contact is already "locked": it's here
    if (locked) locked.node.classList.add('is-lock');
    update();
  }
  document.addEventListener('keydown', function (e) {
    if (!BUNNYS.keyable(e) || e.repeat) return;
    var n = '1234'.indexOf(e.key);
    if (n >= 0) { e.preventDefault(); lock(CONTACTS[n]); return; }
    if (e.key === 'Enter' && locked && !(e.target.closest && e.target.closest('a, button, summary, input, select, textarea'))) {
      e.preventDefault(); go(locked.page ? locked.page + '.html' : 'index.html?face=t-unknown'); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); if (locked) lock(null); else go('index.html'); return; }
    var k = e.key.toLowerCase();
    // Q / E: the page to the left / right, in the cockpit's order, wrapping
    var at = PAGES.indexOf(here);
    if ((k === 'q' || k === 'e') && at >= 0) {
      e.preventDefault(); go(PAGES[(at + (k === 'e' ? 1 : PAGES.length - 1)) % PAGES.length] + '.html'); return;
    }
    if (k === 'j' || k === 'k') { e.preventDefault(); goSector(cur + (k === 'j' ? 1 : -1)); return; }
    // any other way of scrolling hands the ladder back to the scroll position
    if (/^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key)) manual();
  });
})();
