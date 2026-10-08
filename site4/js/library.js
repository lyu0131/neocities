/* library.js: the bookshelf (manual.html). Clicking a spine, or Enter on it, pulls that book out onto the display:
   the old cover tilts back, the spine lifts off its shelf and travels to the display, the new cover turns to face you.
   Each book's display is a <template id="tpl-fm-NN"> the generator wrote. Without this file a spine is a plain link;
   with reduced motion the books swap in place. The address (#fm-NN) names the book on display. */
(function () {
  'use strict';
  var stage = document.querySelector('.fm-stage');
  if (!stage) return;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var spines = [].slice.call(document.querySelectorAll('.fm-spine'));
  var busy = false;

  function current() { return document.querySelector('.fm-spine[aria-current]'); }
  function mark(sp) {
    spines.forEach(function (s) {
      s.classList.toggle('is-out', s === sp);
      if (s === sp) s.setAttribute('aria-current', 'true'); else s.removeAttribute('aria-current');
    });
  }
  function show(sp) {
    var t = document.getElementById('tpl-' + sp.dataset.fm.toLowerCase());
    stage.textContent = '';
    stage.appendChild(t.content.cloneNode(true));
    mark(sp);
  }

  function pull(sp, animate) {
    if (busy || sp === current()) return;
    history.replaceState(null, '', location.href.split('#')[0] + '#' + sp.dataset.fm.toLowerCase());
    if (!animate || reduce || !stage.animate) { show(sp); return; }
    busy = true;
    var from = sp.getBoundingClientRect(), to = stage.getBoundingClientRect();
    var old = stage.querySelector('.fm-cover'), info = stage.querySelector('.fm-info');
    // 1. the book on display tilts back and goes, its details clear
    old.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(30px) rotateY(-80deg)', opacity: 0 }],
      { duration: 320, easing: 'ease-in', fill: 'forwards' });
    if (info) info.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    // 2. the picked spine lifts off its shelf and travels to the display (a copy; its slot empties)
    var g = sp.cloneNode(true);
    g.className = 'fm-spine fm-ghost';
    g.removeAttribute('href'); g.removeAttribute('aria-current'); g.setAttribute('aria-hidden', 'true');
    g.style.left = from.left + 'px'; g.style.top = from.top + 'px';
    document.body.appendChild(g);
    sp.classList.add('is-out');
    var dx = to.left - from.left + (old.offsetWidth - from.width) / 2, dy = to.top - from.top;
    g.animate([
      { transform: 'translate(0, 0)' },
      { transform: 'translate(0, -26px)', offset: 0.35 },
      { transform: 'translate(' + dx + 'px, ' + dy + 'px)' }
    ], { duration: 560, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' }).finished.then(function () {
      g.remove();
      show(sp);
      // 3. the new book turns to face you, its details come up
      stage.querySelector('.fm-cover').animate([{ transform: 'rotateY(80deg)', opacity: 0.4 }, { transform: 'none', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.2, .7, .2, 1)' });
      var i = stage.querySelector('.fm-info');
      if (i) i.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 200, fill: 'backwards' });
      busy = false;
    });
  }

  spines.forEach(function (sp) {
    sp.addEventListener('click', function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // new tab etc.: the plain link
      e.preventDefault();   // link.js's shutters see this and leave the click alone
      pull(sp, true);
    });
  });

  // the address names the book: arriving at manual.html#fm-NN, or the hash changing (back, forward, an edited address)
  function fromHash() {
    var named = location.hash && document.querySelector('.fm-spine[data-fm="' + location.hash.slice(1).toUpperCase() + '"]');
    if (named) pull(named, false);
  }
  addEventListener('hashchange', fromHash);
  fromHash();
})();
