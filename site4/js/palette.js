/* palette.js: Ctrl+K (Cmd+K) anywhere -- a SLEW TO box that finds any page, manual or manual section by name
   (the list is js/site-index.js, which gen_manual.py writes) and goes there through the shutters. */
(function () {
  'use strict';
  var INDEX = window.BUNNYS_INDEX || [];
  var dlg = null, input, list, shown = [], picked = 0;
  var bare = function (f) { return (f || 'index').replace(/\.html$/, ''); };

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'go';
    dlg.setAttribute('aria-label', 'Go anywhere');
    dlg.innerHTML = '<p class="go-head">SLEW TO</p>' +
      '<input type="text" role="combobox" aria-expanded="true" aria-controls="go-list" aria-autocomplete="list" ' +
      'placeholder="Page, manual or section" autocomplete="off" spellcheck="false">' +
      '<ul id="go-list" role="listbox" aria-label="Destinations"></ul>' +
      '<p class="go-foot" aria-hidden="true">&#8593;&#8595; PICK &#183; ENTER GO &#183; ESC CLOSE</p>';
    document.body.appendChild(dlg);
    input = dlg.querySelector('input');
    list = dlg.querySelector('ul');
    input.addEventListener('input', render);
    // the box's keys stay in the box: a sub-page's own Esc would otherwise leave for the cockpit
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pick(picked + (e.key === 'ArrowDown' ? 1 : -1)); }
      else if (e.key === 'Enter' && shown[picked]) { e.preventDefault(); go(shown[picked].h); }
      else if (e.key === 'Escape') { e.preventDefault(); dlg.close(); }
    });
    list.addEventListener('click', function (e) {
      var o = e.target.closest('[role=option]');
      if (o) go(o.dataset.href);
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });   // the backdrop
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    shown = INDEX.filter(function (x) { return !q || (x.t + ' ' + x.s).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    list.textContent = '';
    if (!shown.length) {
      var none = document.createElement('li');
      none.className = 'go-none';
      none.textContent = 'NO MATCH';
      list.appendChild(none);
    }
    shown.forEach(function (x, i) {
      var li = document.createElement('li'), b = document.createElement('b'), s = document.createElement('span');
      li.setAttribute('role', 'option');
      li.id = 'go-' + i;
      li.dataset.href = x.h;
      b.textContent = x.t; s.textContent = x.s;
      li.appendChild(b); li.appendChild(s);
      list.appendChild(li);
    });
    pick(0);
  }

  function pick(i) {
    var opts = list.querySelectorAll('[role=option]');
    if (!opts.length) { input.removeAttribute('aria-activedescendant'); return; }
    picked = (i + opts.length) % opts.length;
    for (var k = 0; k < opts.length; k++) opts[k].setAttribute('aria-selected', k === picked ? 'true' : 'false');
    input.setAttribute('aria-activedescendant', 'go-' + picked);
    opts[picked].scrollIntoView({ block: 'nearest' });
  }

  function go(href) {
    dlg.close();
    var file = href.split('#')[0], frag = href.split('#')[1];
    // a section of this page: just scroll to it
    if (bare(file) === bare(location.pathname.split('/').pop())) { if (frag) location.hash = frag; return; }
    if (window.BUNNYS && window.BUNNYS.link) window.BUNNYS.link.go(href); else location.href = href;
  }

  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
    e.preventDefault();
    if (!dlg) build();
    if (dlg.open) { dlg.close(); return; }
    input.value = '';
    render();
    dlg.showModal();
    input.focus();
  });
})();
