/* manual-fx.js: the field manuals' motion (GSAP, js/vendor/). Each effect plays once, nothing loops while someone
   reads. Content is readable without it: only an element about to animate is ever put in its start state, and only
   once GSAP and every plugin are here. Reduced motion: nothing runs. */
(function () {
  'use strict';
  var g = window.gsap, ST = window.ScrollTrigger;
  if (!g || !ST || !window.ScrambleTextPlugin || !window.DrawSVGPlugin || !window.SplitText) return;
  g.registerPlugin(ST, window.ScrambleTextPlugin, window.DrawSVGPlugin, window.SplitText);
  // the HUD's decode glyphs. ScrambleText writes HTML, so never < > or &: they'd be escaped to entities and cut in half
  var CHARS = '█▓▒░/\\|01';
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  // a paused timeline that plays the first time its element comes into view
  function once(el, start, tl) { ST.create({ trigger: el, start: start, once: true, onEnter: function () { tl.play(); } }); return tl; }
  function decode(h, dur) { return { duration: dur, scrambleText: { text: h.dataset.text, chars: CHARS, speed: 0.6 } }; }

  g.matchMedia().add('(prefers-reduced-motion: no-preference)', function () {
    document.documentElement.classList.add('fx');
    var h1 = document.querySelector('.screen h1');
    if (h1) g.from(window.SplitText.create(h1, { type: 'chars', aria: 'auto' }).chars, { autoAlpha: 0, stagger: 0.025, duration: 0.4 });

    // library: a volume boots in -- frame draws, title decodes, details come up
    var vols = $$('.fm-vol');
    vols.forEach(function (v) {
      var h = v.querySelector('h2');
      once(v, 'top bottom', g.timeline({ paused: true })
        .fromTo($$('.fm-frame rect', v), { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.5 })
        .to(h, decode(h, 0.6))
        // opacity, not autoAlpha: visibility:hidden would drop the Open link from the tab order and screen readers
        .from($$('.fm-blurb, .rail, .fm-open', v), { opacity: 0, y: 8, duration: 0.3, stagger: 0.05 }));
    });
    // inside a manual: each section's heading decodes as it arrives (the text is there all along)
    if (!vols.length) $$('.panel > h2').forEach(function (h) { once(h, 'top 80%', g.timeline({ paused: true }).to(h, decode(h, 0.5))); });
    // the agent-loop diagram draws its lines
    $$('.fm-loop svg').forEach(function (svg) {
      once(svg, 'top 90%', g.timeline({ paused: true })
        .fromTo($$('path', svg), { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.8, stagger: 0.15 }));
    });
    return function () { document.documentElement.classList.remove('fx'); };
  });
})();
