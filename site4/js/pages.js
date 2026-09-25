/* pages.js: sub-page behaviour — callout highlighting, mission reveal, entrance.
   The hub's own scripts (cockpit.js, boot.js) are not loaded here. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;

  // hangar callouts: hover or keyboard focus lights the part they point at.
  // Parts share ids across the three inlined views, so light every match.
  function setHot(id, on) {
    var all = document.querySelectorAll('[id="' + id + '"]');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('is-hot', on);
  }
  var callouts = document.querySelectorAll('button[data-part]');
  Array.prototype.forEach.call(callouts, function (b) {
    var id = b.dataset.part;
    ['mouseenter', 'focus'].forEach(function (e) { b.addEventListener(e, function () { setHot(id, true); }); });
    ['mouseleave', 'blur'].forEach(function (e) { b.addEventListener(e, function () { setHot(id, false); }); });
  });

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
