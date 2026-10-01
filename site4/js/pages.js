/* pages.js: sub-page behaviour — the mission reveal. (The hangar's model is js/hangar.js.)
   The hub's own scripts (cockpit.js, boot.js) are not loaded here. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;

  // mission entries reveal as they scroll in; with reduced motion they are simply there
  var items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  if (BUNNYS && BUNNYS.reduce || !window.IntersectionObserver) {
    Array.prototype.forEach.call(items, function (n) { n.classList.add('is-in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  Array.prototype.forEach.call(items, function (n) { io.observe(n); });
})();
