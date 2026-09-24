/* play.js: the light table. Scatter, drag, photocopy, lift, ransom letters,
   scanner and drift, each opt-in through data-attributes (see DESIGN.md). */
(function () {
  'use strict';
  var mq = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  var REDUCE = mq('(prefers-reduced-motion: reduce)');
  var FINE = mq('(pointer: fine)');
  var KEY = 'lighttable:' + (location.pathname.split('/').pop() || 'index.html');
  var STACK_BELOW = 700;
  var topZ = 100; // item z-indexes live inside the table's isolated stacking context

  function mulberry32(a) {
    return function () {
      a = a + 0x6d2b79f5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(s) { for (var h = 2166136261, i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function rnd32() { return (Math.random() * 4294967296) >>> 0; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function all(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /* ---------- scatter: throw items on the table, keep text readable ---------- */
  var tables = [];

  // sheets, [data-keep] and anything holding a link must never be covered
  function isKept(el) { return el.matches('.sheet, [data-keep]') || !!el.querySelector('a, button'); }
  function overlap(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function itemsOf(t) { return [].filter.call(t.el.children, function (c) { return c.classList.contains('item') && !c.classList.contains('copy'); }); }

  function layout(t) {
    var items = itemsOf(t), rand = mulberry32(t.seed);
    all(':scope > .copy', t.el).forEach(function (c) { c.remove(); });
    all('img[data-copy]', t.el).forEach(function (im) { im._copies = null; });
    if (t.el.clientWidth < STACK_BELOW) return stack(t, items, rand);

    t.el.classList.add('is-scattered');
    items.forEach(function (el) { el.style.left = el.style.top = '0px'; el.style.transform = 'none'; });
    var W = t.el.clientWidth;
    var boxes = items.map(function (el) { return { el: el, w: el.offsetWidth, h: el.offsetHeight, keep: isKept(el) }; });
    var area = boxes.reduce(function (s, b) { return s + b.w * b.h; }, 0);
    var H = Math.max(innerHeight * 0.8, area / W * (t.tight ? 1.3 : 1.9));
    var shuffle = function (a) { return a.map(function (b) { return [rand(), b]; }).sort(function (p, q) { return p[0] - q[0]; }).map(function (p) { return p[1]; }); };
    // loose things first, keepers last so they land on top and stay whole
    var order = shuffle(boxes.filter(function (b) { return !b.keep; })).concat(shuffle(boxes.filter(function (b) { return b.keep; })));
    var placed = [], saved = load(), bottom = 0;

    order.forEach(function (b) {
      var best = null, bestScore = -Infinity;
      for (var round = 0; round < 6 && !best; round++) {
        for (var i = 0; i < 70; i++) {
          var c = { x: rand() * Math.max(0, W - b.w), y: rand() * Math.max(0, H - b.h), w: b.w, h: b.h };
          var ok = true, ov = 0;
          for (var j = 0; j < placed.length && ok; j++) {
            var p = placed[j], o = overlap(c, p);
            if (o && (p.keep || (b.keep && p.keep) || p.cov + o > 0.65 * p.w * p.h)) ok = false;
            ov += o;
          }
          if (!ok) continue;
          // aim for a little overlap (more when tight) and fill from the top, so no dead gaps open up
          var score = -Math.abs(ov / (b.w * b.h) - (t.tight ? 0.2 : 0.05)) * 2 - c.y / H * 0.9 + rand() * 0.35;
          if (score > bestScore) { bestScore = score; best = c; }
        }
        if (!best) H *= 1.2;
      }
      if (!best) best = { x: rand() * Math.max(0, W - b.w), y: bottom + 24, w: b.w, h: b.h };
      placed.forEach(function (p) { p.cov += overlap(best, p); });
      best.keep = b.keep; best.cov = 0; placed.push(best);

      var tilt = parseFloat(b.el.getAttribute('data-tilt') || 7);
      var rot = (rand() * 2 - 1) * (b.keep ? Math.min(tilt, 2.5) : tilt);
      var s = b.el.id && saved[b.el.id];
      var x = s ? s.x * W : best.x, y = s ? s.y : best.y;
      if (s) rot = s.r;
      b.el.dataset.rot = rot.toFixed(2);
      b.el.style.left = x.toFixed(1) + 'px';
      b.el.style.top = y.toFixed(1) + 'px';
      b.el.style.transform = 'rotate(' + rot.toFixed(2) + 'deg)';
      b.el.style.zIndex = ++topZ;
      bottom = Math.max(bottom, y + b.h);
    });
    t.el.style.height = Math.ceil(bottom + 60) + 'px';
  }

  // phones: a jittered, slightly overlapping pile instead of a scatter
  function stack(t, items, rand) {
    t.el.classList.remove('is-scattered');
    t.el.style.height = '';
    items.forEach(function (el) {
      el.style.left = el.style.top = el.style.zIndex = '';
      el.style.transform = 'translateX(' + ((rand() * 2 - 1) * 14).toFixed(1) + 'px) rotate(' + ((rand() * 2 - 1) * (isKept(el) ? 1.5 : 4)).toFixed(2) + 'deg)';
    });
  }

  function layoutAll(force) {
    tables.forEach(function (t) {
      var w = t.el.clientWidth;
      if (force || w !== t.w) { t.w = w; layout(t); }
    });
  }

  /* ---------- drag, with saved positions and arrow-key nudging ---------- */
  function remember(el) {
    var table = el.parentElement;
    if (!el.id || !table) return;
    var s = load();
    s[el.id] = { x: el.offsetLeft / table.clientWidth, y: el.offsetTop, r: +el.dataset.rot || 0 };
    save(s);
    var need = el.offsetTop + el.offsetHeight + 60;
    if (need > table.offsetHeight) table.style.height = need + 'px';
  }
  function swallowNextClick() {
    var stop = function (e) { e.stopPropagation(); e.preventDefault(); };
    document.addEventListener('click', stop, true);
    setTimeout(function () { document.removeEventListener('click', stop, true); }, 0);
  }

  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('[data-drag]');
    if (!el || e.button !== 0 || el.classList.contains('lifted')) return;
    if (!el.parentElement.classList.contains('is-scattered')) return;
    var sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop, id = e.pointerId, moved = false;
    function move(ev) {
      if (ev.pointerId !== id) return;
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        try { el.setPointerCapture(id); } catch (err) {}
        el.classList.add('dragging');
        el.style.zIndex = ++topZ;
      }
      ev.preventDefault();
      el.style.left = ox + dx + 'px';
      el.style.top = Math.max(0, oy + dy) + 'px';
    }
    function up(ev) {
      if (ev.pointerId !== id) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (!moved) return;
      el.classList.remove('dragging');
      remember(el);
      swallowNextClick();
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  });
  document.addEventListener('dragstart', function (e) { if (e.target.closest('.item, .rl')) e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    var el = document.activeElement;
    var dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir || !el || !el.matches('[data-drag]') || !el.parentElement.classList.contains('is-scattered')) return;
    e.preventDefault();
    var step = e.shiftKey ? 40 : 8;
    el.style.left = el.offsetLeft + dir[0] * step + 'px';
    el.style.top = Math.max(0, el.offsetTop + dir[1] * step) + 'px';
    el.style.zIndex = ++topZ;
    remember(el);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-reset]')) return;
    forget();
    tables.forEach(function (t) { t.seed = rnd32(); layout(t); });
  });

  /* ---------- photocopy: each copy is made from the last one ---------- */
  function degrade(src, orig, g) {
    var sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    var w = Math.min(720, sw), h = Math.round(w * sh / sw);
    var c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = w; c.height = h;
    try {
      x.drawImage(src, 0, 0, w, h);
      var d = x.getImageData(0, 0, w, h), p = d.data, k = 1.15 + g * 0.3, push = 0.05 * g;
      for (var i = 0; i < p.length; i += 4) {
        var v = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) / 255;
        v = (v - 0.5) * k + 0.52 + (Math.random() - 0.5) * 0.1 * g;
        if (g > 2) v += v > 0.5 ? push : -push;
        p[i] = p[i + 1] = p[i + 2] = v < 0 ? 0 : v > 1 ? 255 : v * 255;
      }
      x.putImageData(d, 0, 0);
      var by = Math.random() * h * 0.8, bh = h * (0.04 + Math.random() * 0.1);
      x.drawImage(c, 0, by, w, bh, (Math.random() - 0.5) * 6 * g, by, w, bh);   // a slipped band
      x.fillStyle = 'rgba(0,0,0,.55)';
      x.fillRect(Math.random() * w, 0, 1 + g * 0.6, h);                     // drum streak
      return c;
    } catch (err) {
      // file:// pages taint the canvas; fall back to a filtered clone of the original
      var im = new Image();
      im.src = orig.currentSrc || orig.src;
      im.alt = '';
      im.style.filter = 'grayscale(1) contrast(' + (1.2 + 0.3 * g).toFixed(2) + ') brightness(' + (1 + 0.04 * g).toFixed(2) + ') blur(' + (0.2 * g).toFixed(1) + 'px)';
      return im;
    }
  }

  function photocopy(img) {
    var list = img._copies || (img._copies = []);
    if (list.length >= 8) { list.forEach(function (c) { c.remove(); }); list.length = 0; return; }
    var host = img.closest('.table.is-scattered') || img.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var g = list.length + 1, prev = list[list.length - 1];
    var hr = host.getBoundingClientRect(), ir = img.getBoundingClientRect();
    var base = prev ? prev._pos : { x: ir.left - hr.left, y: ir.top - hr.top };
    var ang = Math.random() * Math.PI * 2, dist = 10 + Math.random() * 14;
    var pos = { x: base.x + Math.cos(ang) * dist, y: base.y + Math.sin(ang) * dist };
    var wrap = document.createElement('div');
    wrap.className = 'copy';
    wrap.setAttribute('aria-hidden', 'true');
    wrap._node = degrade(prev ? prev._node : img, img, g);
    wrap._pos = pos;
    wrap.appendChild(wrap._node);
    wrap.style.width = img.offsetWidth + 'px';
    wrap.style.left = pos.x.toFixed(1) + 'px';
    wrap.style.top = pos.y.toFixed(1) + 'px';
    wrap.style.transform = 'rotate(' + ((Math.random() * 2 - 1) * 4).toFixed(2) + 'deg)';
    wrap.style.zIndex = host.classList.contains('table') ? ++topZ : 5 + g;
    host.appendChild(wrap);
    list.push(wrap);
  }
  document.addEventListener('click', function (e) {
    var img = e.target.closest('img[data-copy]');
    if (img) photocopy(img);
  });

  /* ---------- lift: bring a print up to look closer ---------- */
  var lifted = null, opener = null, backdrop = null;
  function lift(el) {
    var table = el.closest('.table');
    opener = document.activeElement;
    backdrop = document.createElement('div');
    backdrop.className = 'lift-backdrop';
    backdrop.addEventListener('click', drop);
    (table || el.parentElement).appendChild(backdrop);
    if (table) table.classList.add('has-lifted');
    el.classList.add('lifted');
    el.setAttribute('aria-expanded', 'true');
    lifted = el;
    el.focus({ preventScroll: true });
  }
  function drop() {
    if (!lifted) return;
    var table = lifted.closest('.table');
    lifted.classList.remove('lifted');
    lifted.setAttribute('aria-expanded', 'false');
    if (table) table.classList.remove('has-lifted');
    if (backdrop) backdrop.remove();
    lifted = backdrop = null;
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  function toggleLift(el) { if (lifted === el) drop(); else { drop(); lift(el); } }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-lift]');
    if (el && !e.target.closest('a')) toggleLift(el);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') return drop();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-lift]')) {
      e.preventDefault();
      toggleLift(e.target);
    }
  });

  /* ---------- ransom headings from real cut-out letters ---------- */
  var LETTERS = 'R7k5AdXmSz91QBgJ2tLeKv3fUiWhaYo6D4pcGnE8bMxZrO'; // letter-01 … letter-46
  function letterIndex(ch) {
    var i = LETTERS.indexOf(ch);
    if (i < 0) i = LETTERS.indexOf(ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase());
    if (i < 0 && ch === '0') i = LETTERS.indexOf('O');
    return i;
  }
  function ransom(el) {
    var text = (el.getAttribute('aria-label') || el.textContent).replace(/\s+/g, ' ').trim(); // re-cuts reuse the real text
    var base = el.getAttribute('data-ransom-src') || 'img/cut/';
    var r = mulberry32(rnd32()), used = {}, count = 0, last = 0;
    var typed = el.getAttribute('data-ransom') === 'type'; // typed tiles instead of cut-out scans: crisp at poster size
    el.setAttribute('aria-label', text);
    var box = document.createElement('span');
    box.className = 'ransom';
    box.setAttribute('aria-hidden', 'true');
    text.split(' ').forEach(function (word, wi) {
      if (wi) box.appendChild(Object.assign(document.createElement('span'), { className: 'rgap' }));
      var w = document.createElement('span');
      w.className = 'rword';
      word.split('').forEach(function (ch) {
        var i = typed ? -1 : letterIndex(ch), n, k;
        if (i >= 0) {
          n = document.createElement('img');
          n.className = 'rl';
          n.alt = '';
          n.draggable = false;
          n.src = base + 'letter-' + ('0' + (i + 1)).slice(-2) + '.png';
        } else {
          n = document.createElement('span');
          do { k = 1 + (r() * 6 | 0); } while (k === last); // never the same clipping twice in a row
          last = k;
          n.className = 'r-' + k;
          n.textContent = ch;
        }
        var key = typed ? ch.toLowerCase() : i;
        var again = used[key] = (used[key] || 0) + 1; // repeats get a stronger twist so they don't read as copies
        var rot = (r() * 2 - 1) * (again > 1 ? 14 : 8);
        n.style.transform = 'translateY(' + ((r() * 2 - 1) * 0.08).toFixed(3) + 'em) rotate(' + rot.toFixed(1) + 'deg) scale(' + (0.86 + r() * 0.26).toFixed(2) + ')';
        n.style.setProperty('--i', count++); // paste order, for staggered entrances
        w.appendChild(n);
      });
      box.appendChild(w);
    });
    el.textContent = '';
    el.appendChild(box);
  }

  /* ---------- scanner: a copier light bar that follows the mouse ---------- */
  function scanner() {
    if (!document.body.hasAttribute('data-scanner') || REDUCE || !FINE) return;
    var bar = document.createElement('div'), x = -300, tx = -300, running = false;
    bar.className = 'scanner';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    function step() {
      x += (tx - x) * 0.16;
      bar.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
      if (Math.abs(tx - x) > 0.4) requestAnimationFrame(step); else running = false;
    }
    addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX - bar.offsetWidth / 2;
      bar.classList.add('on');
      if (!running) { running = true; requestAnimationFrame(step); }
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { bar.classList.remove('on'); });
  }

  /* ---------- drift: slow words that pause when you reach for them ---------- */
  function drift() {
    var els = all('[data-drift]');
    if (!els.length || innerWidth < STACK_BELOW) return; // phones: the cover is a plain list
    var r = mulberry32(rnd32());
    var ds = els.map(function (el, i) {
      var d = { el: el, x: 0, y: 0, vx: (r() < 0.5 ? -1 : 1) * (7 + r() * 9), vy: (r() < 0.5 ? -1 : 1) * (4 + r() * 7), hold: false, bw: 0, bh: 0 };
      ['pointerenter', 'focusin'].forEach(function (ev) { el.addEventListener(ev, function () { d.hold = true; }); });
      ['pointerleave', 'focusout'].forEach(function (ev) { el.addEventListener(ev, function () { d.hold = false; }); });
      return d;
    });
    function measure() {
      ds.forEach(function (d) {
        var p = d.el.offsetParent || document.body;
        d.bw = Math.max(0, p.clientWidth - d.el.offsetWidth);
        d.bh = Math.max(0, p.clientHeight - d.el.offsetHeight);
      });
    }
    function place(d) { d.el.style.transform = 'translate(' + d.x.toFixed(1) + 'px,' + d.y.toFixed(1) + 'px)'; }
    measure();
    // start one word per quadrant so they don't clump
    ds.forEach(function (d, i) {
      d.x = ((i % 2) * 0.5 + 0.05 + r() * 0.35) * d.bw;
      d.y = ((i >> 1) % 2 * 0.5 + 0.05 + r() * 0.35) * d.bh;
      place(d);
    });
    addEventListener('resize', debounce(measure, 150));
    if (REDUCE) return;
    var last = performance.now();
    requestAnimationFrame(function tick(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) ds.forEach(function (d) {
        if (d.hold) return;
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < 0 || d.x > d.bw) { d.vx = -d.vx; d.x = Math.max(0, Math.min(d.bw, d.x)); }
        if (d.y < 0 || d.y > d.bh) { d.vy = -d.vy; d.y = Math.max(0, Math.min(d.bh, d.y)); }
        place(d);
      });
      requestAnimationFrame(tick);
    });
  }

  // [data-recut]: click to cut the ransom heading again (on the heading itself, or a button naming it)
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-recut]');
    if (!b) return;
    var el = b.matches('[data-ransom]') ? b : document.querySelector(b.getAttribute('data-recut'));
    if (el) ransom(el);
  });

  /* ---------- parallax: the board's layers shift with the mouse ---------- */
  function parallax() {
    var root = document.querySelector('[data-parallax]');
    if (!root || REDUCE || !FINE) return;
    var els = all('[data-depth]', root).map(function (el) { return { el: el, d: parseFloat(el.getAttribute('data-depth')) || 0 }; });
    var x = 0, y = 0, tx = 0, ty = 0, running = false;
    function step() {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      // the individual translate property leaves each element's own rotate/transform alone
      els.forEach(function (o) { o.el.style.translate = (-x * o.d * 24).toFixed(1) + 'px ' + (-y * o.d * 16).toFixed(1) + 'px'; });
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.002) requestAnimationFrame(step); else running = false;
    }
    root.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = root.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width * 2 - 1;
      ty = (e.clientY - r.top) / r.height * 2 - 1;
      if (!running) { running = true; requestAnimationFrame(step); }
    }, { passive: true });
  }

  /* ---------- pile: pieces fly in as a [data-pile] section scrolls into view ---------- */
  function pile() {
    var secs = all('[data-pile]');
    if (!secs.length) return;
    if (REDUCE) return secs.forEach(function (s) { s.style.setProperty('--p', 1); });
    var queued = false;
    function update() {
      queued = false;
      var vh = innerHeight;
      // 0 while the section's top is at the bottom of the screen, 1 once it has scrolled half a screen past the top
      secs.forEach(function (s) {
        var p = (vh - s.getBoundingClientRect().top) / (vh * 1.5);
        s.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
      });
    }
    addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ---------- start ---------- */
  all('[data-ransom]').forEach(ransom);
  all('[data-lift]').forEach(function (el) {
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-expanded', 'false');
  });
  tables = all('[data-scatter]').map(function (el) {
    var s = el.getAttribute('data-seed');
    return { el: el, seed: s ? hash(s) : rnd32(), tight: el.getAttribute('data-density') === 'tight', w: 0 };
  });
  layoutAll(true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layoutAll(true); });
  addEventListener('resize', debounce(function () { layoutAll(false); }, 150));
  scanner();
  drift();
  parallax();
  pile();
})();
