/* link.js: the handover between pages. Leaving a page, the five canopy screens shutter closed
   in the order they power on (left, centre, right, top, console) and LINK > <page> reads out on
   the closed glass; the next page starts on that same closed glass and opens it, so the page
   load happens behind the shutters. The cockpit opens with its own screen power-on (hud.js
   powerScreens), which is the same move.
   Loaded in <head> without defer, so an arriving page is dark from its first paint. */
(function () {
  'use strict';
  var KEY = 'bunnys-link';      // {to, t}: written as a page leaves, read once by the next
  var GEO = 'bunnys-canopy';
  var EMBLEM = 'img/emblem-hud.webp';   // the owner's emblem in HUD phosphor, shown on the closed glass    // the cockpit's last measured screens, as 5 polys of viewport percentages
  // every page of the site (unknown: the UNKNOWN contact's open channel; manual*: the library and its manuals),
  // with or without a #section
  var OWN = /^(index|pilot|missions|hangar|manual(-[a-z][a-z0-9-]*(-\d+)?)?|unknown)\.html(#.*)?$/;
  // A rough canopy, as percentages of the viewport (originally measured at 1440x900), for a page
  // that has never measured the cockpit's own (a visitor who landed straight on a sub-page).
  var FALLBACK = [
    '0.00,8.89 30.00,11.56 24.03,26.11 24.03,73.89 31.94,92.44 22.92,92.44 16.67,72.44 0.00,72.44',
    '30.00,11.56 70.14,11.56 75.97,26.11 75.97,73.89 68.06,92.44 31.94,92.44 24.03,73.89 24.03,26.11',
    '100.00,8.89 70.00,11.56 75.97,26.11 75.97,73.89 68.06,92.44 77.08,92.44 83.33,72.44 100.00,72.44',
    '0.00,0.00 100.00,0.00 100.00,8.89 70.14,11.56 30.00,11.56 0.00,8.89',
    '0.00,72.44 16.67,72.44 22.92,92.44 77.08,92.44 83.33,72.44 100.00,72.44 100.00,100.00 0.00,100.00'
  ];
  var EASE_IN = 'cubic-bezier(.55,0,1,.45)', EASE_IO = 'cubic-bezier(.65,0,.35,1)';
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var root = document.documentElement;

  function read(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // 'hangar.html', '/site4/hangar' and '/site4/' all name a page; a bare directory is the cockpit
  function pageOf(path) { var m = /([^\/]*?)(?:\.html)?$/.exec(path); return (m && m[1]) || 'index'; }

  // the page we're on, once, for every script after this one (pagehud reads it)
  var here = root.dataset.page = pageOf(location.pathname);
  var arriving = read(KEY);
  try { sessionStorage.removeItem(KEY); } catch (e) {}
  if (reduce || !arriving || Date.now() - arriving.t > 6000 || arriving.to !== here) arriving = null;
  if (arriving) root.classList.add('link-in', 'linked');

  function scale(p, sx, sy) {
    return p.trim().split(/\s+/).map(function (q) { q = q.split(','); return (q[0] * sx).toFixed(2) + ',' + (q[1] * sy).toFixed(2); }).join(' ');
  }
  // The cockpit's screens, read straight off hud.js's #screens in document order (L, C, R, T, B).
  // Their points are in HUD units (hud.js scales the whole HUD down on small screens); dividing by
  // the viewBox size turns them into percentages of the viewport, which need no further unit
  // conversion and stay correct even if the next page opens at a different size than this one
  // measured at -- no W/H to cache and compare against, the way a px-based geometry would need.
  function geometry() {
    var el = document.getElementById('screens'), s = el ? el.querySelectorAll('.shutter') : [];
    var vb = el && el.viewBox && el.viewBox.baseVal;
    if (s.length === 5 && s[0].getAttribute('points') && vb && vb.width) {
      var polys = [].map.call(s, function (p) { return scale(p.getAttribute('points'), 100 / vb.width, 100 / vb.height); });
      write(GEO, polys);
      return polys;
    }
    var cached = read(GEO);
    return (cached && cached.length === 5) ? cached : FALLBACK;
  }

  var ov = null, blades = [], seams = null, label = null;
  function build(polys, to) {
    if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'link'; ov.setAttribute('aria-hidden', 'true');
    blades = polys.map(function (p) {
      var s = document.createElement('div'), b = document.createElement('div');
      s.className = 'link-shut'; b.className = 'link-blade';
      // polys are percentages (0-100) of the viewport; the clip-path needs the unit on each number
      s.style.clipPath = 'polygon(' + p.trim().split(/\s+/).map(function (q) { return q.replace(',', '% ') + '%'; }).join(',') + ')';
      s.appendChild(b); ov.appendChild(s);
      return b;
    });
    var ns = 'http://www.w3.org/2000/svg';
    seams = document.createElementNS(ns, 'svg');
    // A 0-100 viewBox stretched independently on each axis (preserveAspectRatio="none") so the
    // same percentage points used for the clip-path above also work as plain SVG coordinates here
    // -- no innerWidth/innerHeight to read or re-set on resize. #link polygon's non-scaling-stroke
    // (cockpit.css) keeps the seam's stroke-width a constant px despite the anisotropic stretch.
    seams.setAttribute('viewBox', '0 0 100 100');
    seams.setAttribute('preserveAspectRatio', 'none');
    polys.forEach(function (p) { var e = document.createElementNS(ns, 'polygon'); e.setAttribute('points', p); seams.appendChild(e); });
    ov.appendChild(seams);
    // the readout sits in the middle of the centre screen
    var ys = polys[1].trim().split(/\s+/).map(function (q) { return +q.split(',')[1]; });
    label = document.createElement('p'); label.className = 'link-label';
    label.style.top = ((Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2).toFixed(2) + '%';
    var key = /^manual/.test(to) ? 'manual' : to;   // the library and every manual page are the FIELD MANUAL contact
    var c = key === 'index' ? { label: 'COCKPIT' } : (window.BUNNYS.contacts.filter(function (k) { return k.page === key; })[0] || {});
    label.textContent = 'LINK ▸ ' + (c.label || to.toUpperCase());
    var small = document.createElement('small'); small.textContent = 'CHANNEL OPEN'; label.appendChild(small);
    // the emblem on the closed glass (preloaded at DOMContentLoaded, so it never pops in late)
    var em = document.createElement('img'); em.className = 'link-emblem'; em.src = EMBLEM; em.alt = '';
    label.insertBefore(em, label.firstChild);
    ov.appendChild(label);
    document.body.appendChild(ov);
  }
  function anim(el, kf, ms, delay, easing) {
    return el.animate(kf, { duration: ms, delay: delay || 0, easing: easing || 'linear', fill: 'both' });
  }

  var leaving = false;
  // Close the shutters, then go. `lead` holds them open a beat (the cockpit's lock blink).
  function go(href, lead) {
    if (leaving) return;
    if (reduce) { location.href = href; return; }
    leaving = true;
    var to = pageOf(href.split(/[?#]/)[0]), polys = geometry();
    build(polys, to);
    // start fetching the next page now, so it loads behind the shutters, not after them
    var pre = document.createElement('link'); pre.rel = 'prefetch'; pre.href = href; document.head.appendChild(pre);
    lead = lead || 0;
    // blades slide (transform, composited) inside each screen's clip, rather than animating a clip
    blades.forEach(function (b, i) {
      anim(b, [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }], 260, lead + i * 55, EASE_IN);
    });
    var shut = lead + 260 + 4 * 55;
    anim(seams, [{ opacity: 0 }, { opacity: 1 }, { opacity: .35 }], 260, shut);
    anim(label, [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], 200, shut, 'steps(8, end)');
    setTimeout(function () {
      write(KEY, { to: to, t: Date.now() });
      location.href = href;
    }, shut + 260);
  }

  // Open whatever shutters are closed, then clear them away.
  function open(hold) {
    if (!ov) return;
    var o = ov;
    anim(label, [{ opacity: 1 }, { opacity: 0 }], 90, hold);
    blades.forEach(function (b, i) {
      anim(b, [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], 300, hold + i * 45, EASE_IO);
    });
    anim(seams, [{ opacity: .35 }, { opacity: 0 }], 520, hold).finished.then(function () { o.remove(); if (ov === o) ov = null; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.BUNNYS) window.BUNNYS.link = { go: go };
    if (!reduce) new Image().src = EMBLEM;   // warm the cache for the closed glass

    if (arriving) {
      // The cockpit brings its own screens up (hud.js, at boot-done), so it only needs the dark
      // cover lifted. A sub-page shows the glass exactly as the last page left it, waits for its
      // type, then opens.
      if (!document.getElementById('screens')) {
        // the same glass the last page closed (geometry() reads back the cockpit's saved screens)
        build(geometry(), arriving.to);
        blades.forEach(function (b) { b.style.transform = 'none'; });
        seams.style.opacity = .35; label.style.opacity = 1;
        var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
        Promise.race([fonts, new Promise(function (r) { setTimeout(r, 700); })]).then(function () { open(150); });
      }
      root.classList.remove('link-in');
    }

    // Links between the four pages take the shutters; anything else (new tab, modifier keys,
    // off-site, the page you're already on) is left to the browser.
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download')) return;
      var href = a.getAttribute('href');
      if (!OWN.test(href) || pageOf(href.split('#')[0]) === here) return;
      e.preventDefault();
      go(href);
    });
  });

  // Back/forward can restore a page from the cache with its shutters still shut.
  addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    leaving = false;
    root.classList.remove('link-in');
    open(0);
  });
})();
