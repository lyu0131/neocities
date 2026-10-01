/* link.js: the handover between pages. Leaving a page, the five canopy screens shutter closed
   in the order they power on (left, centre, right, top, console) and LINK > <page> reads out on
   the closed glass; the next page starts on that same closed glass and opens it, so the page
   load happens behind the shutters. The cockpit opens with its own screen power-on (hud.js
   powerScreens), which is the same move.
   Loaded in <head> without defer, so an arriving page is dark from its first paint. */
(function () {
  'use strict';
  var KEY = 'bunnys-link';      // {to, polys, W, H, t}: written as a page leaves, read once by the next
  var GEO = 'bunnys-canopy';    // the cockpit's last measured screens {polys, W, H}
  var OWN = /^(index|pilot|missions|hangar)\.html$/;
  var LABEL = { index: 'COCKPIT', pilot: 'PILOT', missions: 'MISSIONS', hangar: 'HANGAR' };
  // A rough canopy at 1440x900, scaled to the viewport, for a page that has never measured the
  // cockpit's own (a visitor who landed straight on a sub-page).
  var FALLBACK = [
    '0,80 432,104 346,235 346,665 460,832 330,832 240,652 0,652',
    '432,104 1010,104 1094,235 1094,665 980,832 460,832 346,665 346,235',
    '1440,80 1008,104 1094,235 1094,665 980,832 1110,832 1200,652 1440,652',
    '0,0 1440,0 1440,80 1010,104 432,104 0,80',
    '0,652 240,652 330,832 1110,832 1200,652 1440,652 1440,900 0,900'
  ];
  var EASE_IN = 'cubic-bezier(.55,0,1,.45)', EASE_IO = 'cubic-bezier(.65,0,.35,1)';
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var root = document.documentElement;

  function read(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // 'hangar.html', '/site4/hangar' and '/site4/' all name a page; a bare directory is the cockpit
  function pageOf(path) { var m = /([^\/]*?)(?:\.html)?$/.exec(path); return (m && m[1]) || 'index'; }

  var arriving = read(KEY);
  try { sessionStorage.removeItem(KEY); } catch (e) {}
  if (reduce || !arriving || Date.now() - arriving.t > 6000 || arriving.to !== pageOf(location.pathname)) arriving = null;
  if (arriving) root.classList.add('link-in', 'linked');

  function scale(p, sx, sy) {
    return p.trim().split(/\s+/).map(function (q) { q = q.split(','); return (q[0] * sx).toFixed(1) + ',' + (q[1] * sy).toFixed(1); }).join(' ');
  }
  // The cockpit's screens, read straight off hud.js's #screens in document order (L, C, R, T, B).
  // Their points are in HUD units (hud.js scales the whole HUD down on small screens), so they go
  // through #screens' viewBox to come out in px.
  function geometry() {
    var el = document.getElementById('screens'), s = el ? el.querySelectorAll('.shutter') : [], g = null;
    var vb = el && el.viewBox && el.viewBox.baseVal;
    if (s.length === 5 && s[0].getAttribute('points') && vb && vb.width) {
      var sx = innerWidth / vb.width, sy = innerHeight / vb.height;
      g = { W: innerWidth, H: innerHeight, polys: [].map.call(s, function (p) { return scale(p.getAttribute('points'), sx, sy); }) };
      write(GEO, g);
    } else g = read(GEO);
    if (g && g.W === innerWidth && g.H === innerHeight) return g.polys;
    return FALLBACK.map(function (p) { return scale(p, innerWidth / 1440, innerHeight / 900); });
  }

  var ov = null, blades = [], seams = null, label = null;
  function build(polys, to) {
    if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'link'; ov.setAttribute('aria-hidden', 'true');
    blades = polys.map(function (p) {
      var s = document.createElement('div'), b = document.createElement('div');
      s.className = 'link-shut'; b.className = 'link-blade';
      s.style.clipPath = 'polygon(' + p.trim().split(/\s+/).map(function (q) { return q.replace(',', 'px ') + 'px'; }).join(',') + ')';
      s.appendChild(b); ov.appendChild(s);
      return b;
    });
    var ns = 'http://www.w3.org/2000/svg';
    seams = document.createElementNS(ns, 'svg');
    seams.setAttribute('viewBox', '0 0 ' + innerWidth + ' ' + innerHeight);
    polys.forEach(function (p) { var e = document.createElementNS(ns, 'polygon'); e.setAttribute('points', p); seams.appendChild(e); });
    ov.appendChild(seams);
    // the readout sits in the middle of the centre screen
    var ys = polys[1].trim().split(/\s+/).map(function (q) { return +q.split(',')[1]; });
    label = document.createElement('p'); label.className = 'link-label';
    label.style.top = ((Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2).toFixed(0) + 'px';
    label.textContent = 'LINK ▸ ' + (LABEL[to] || to.toUpperCase());
    var small = document.createElement('small'); small.textContent = 'CHANNEL OPEN'; label.appendChild(small);
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
    anim(seams, [{ opacity: 0 }, { opacity: 0 }], 1);
    anim(label, [{ opacity: 0 }, { opacity: 0 }], 1);
    lead = lead || 0;
    blades.forEach(function (b, i) {
      anim(b, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], 260, lead + i * 55, EASE_IN);
    });
    var shut = lead + 260 + 4 * 55;
    anim(seams, [{ opacity: 0 }, { opacity: 1 }, { opacity: .35 }], 260, shut);
    anim(label, [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], 200, shut, 'steps(8, end)');
    setTimeout(function () {
      write(KEY, { to: to, polys: polys, W: innerWidth, H: innerHeight, t: Date.now() });
      location.href = href;
    }, shut + 260);
  }

  // Open whatever shutters are closed, then clear them away.
  function open(hold) {
    if (!ov) return;
    var o = ov;
    anim(label, [{ opacity: 1 }, { opacity: 0 }], 90, hold);
    blades.forEach(function (b, i) {
      anim(b, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(100% 0 0 0)' }], 300, hold + i * 45, EASE_IO);
    });
    anim(seams, [{ opacity: .35 }, { opacity: 0 }], 520, hold).finished.then(function () { o.remove(); if (ov === o) ov = null; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.BUNNYS) window.BUNNYS.link = { go: go };

    if (arriving) {
      // The cockpit brings its own screens up (hud.js, at boot-done), so it only needs the dark
      // cover lifted. A sub-page shows the glass exactly as the last page left it, waits for its
      // type, then opens.
      if (!document.getElementById('screens')) {
        var polys = arriving.W === innerWidth && arriving.H === innerHeight ? arriving.polys : geometry();
        build(polys, arriving.to);
        anim(seams, [{ opacity: .35 }, { opacity: .35 }], 1);
        anim(label, [{ opacity: 1 }, { opacity: 1 }], 1);
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
      if (!OWN.test(href) || pageOf(href) === pageOf(location.pathname)) return;
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
