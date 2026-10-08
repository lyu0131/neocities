/* manual.js: the field manual's COPY controls. Each code block's button puts the block's exact text on
   the clipboard (navigator.clipboard where the page is a secure context, a hidden textarea otherwise)
   and says so for a moment; the announcement goes to #fm-live for screen readers. No globals. */
(function () {
  'use strict';
  var live = document.getElementById('fm-live');

  function viaTextarea(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return viaTextarea(text); });
    }
    return Promise.resolve(viaTextarea(text));
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.fm-code button.copy');
    if (!b) return;
    var code = b.closest('.fm-code').querySelector('pre code');
    copy(code.textContent).then(function (ok) {
      b.textContent = ok ? 'TRANSMITTED' : 'SELECT TEXT';
      b.classList.toggle('is-done', ok);
      if (live) live.textContent = ok ? 'Code copied to the clipboard' : 'Copy failed; select the text instead';
      clearTimeout(b.fmTimer);
      b.fmTimer = setTimeout(function () { b.textContent = 'COPY'; b.classList.remove('is-done'); }, 1800);
    });
  });
})();
