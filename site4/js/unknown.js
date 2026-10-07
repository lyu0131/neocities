/* unknown.js: the UNKNOWN contact's channel (unknown.html). Its own page, not a sub-page.
   The channel takes the screen (INCOMING), the tuner starts off frequency in static; tune it
   yourself (arrows, wheel, drag, or a memory channel) and the signal climbs, and at a channel the
   call opens. It's the Gryps War, and BUNNyS flew the RX-124 TR-6 out of a Titans test hangar:
   180.07 is the Zeon remnant patrol at bearing 180, whose call degrades, tears, turns two-way,
   holds the tuner (REMOTE LOCK) and traces you while it closes on the scope. The other bands are
   the test team hunting their prototype, a civil news broadcast, the suit's own linear seat and
   a numbers station. Everything heard goes in the LOG. Leave the tab and its title asks you not to. */
(function () {
  'use strict';

  /* ================== SCRIPT: drafts, replace with your own ==================
     A beat is a line:  { who: <one of the channel's two names>, text: "..." }
       "~6" in a line is six characters the decrypt couldn't recover.
     or an effect:      { fx: "static", side: "L" | "R", ms: 1400 }   that portrait drops out
                        { fx: "decrypt", to: 48 }                     the DECRYPT readout
                        { fx: "turn" }    two-way: the right side dies, the tuner locks, the
                                          trace starts, and the left side speaks to the reader
                        { fx: "lost" }    SIGNAL LOST (also the end of any script)
     RETURN plays instead of the first line of 180.07 if the reader has been here before.
     tone: zeon (red), titans (amber), civil (white), seat (the cockpit's green), ghost (violet).
     ========================================================================= */

  // 180.07: the Zeon remnant patrol at bearing 180. The main event.
  var SCRIPT = [
    { who: "COMMAND", text: "Patrol 3, you're past the old perimeter. Talk to me. What are you looking at out there?" },
    { who: "PILOT", text: "One mobile suit, bearing one-eight-zero. No transponder, no escort. It's just standing in the rain like it's waiting for someone to pick it up." },
    { who: "COMMAND", text: "Federation?" },
    { who: "PILOT", text: "Titans paint, under the scorch marks. But the Titans never send one of anything. They send twelve, and a press release." },
    { who: "COMMAND", text: "Then why is this one alone?" },
    { who: "PILOT", text: "I keep asking myself that. Two long antennae on the head. Honestly, from here it looks like a ~6." },
    { fx: "decrypt", to: 48 },
    { who: "COMMAND", text: "Patrol 3, ~4 is breaking ~9 up. Repeat your last." },
    { fx: "static", side: "R", ms: 1400 },
    { who: "PILOT", text: "Command? ...Fine. I'll say it to the static, then. I don't think it's hunting us. I think it ran from them, and it's been running for days." },
    { who: "PILOT", text: "Eight years we've been the ones nobody wanted back. Strange, finding someone else out here with the same problem." },
    { fx: "decrypt", to: 23 },
    { who: "PILOT", text: "Hold on. There's a third carrier on this channel. Somebody's sitting on our frequency and keeping very quiet about it." },
    { fx: "turn" },
    { who: "PILOT", text: "BUNNyS. That's the name you painted over their serial number, isn't it? Bold of you." },
    { who: "PILOT", text: "You took the best thing they ever built and flew it straight into the one place they're scared to follow. I almost respect that." },
    { who: "PILOT", text: "And you, reading this. You tuned into an enemy band in the middle of a war. What did you honestly expect to hear?" },
    { who: "PILOT", text: "Don't bother tuning away. We already know where you're sitting." },
    { fx: "lost" }
  ];
  var RETURN = [
    { who: "PILOT", text: "You came back. Most people only make that mistake once." }
  ];

  var CHANNELS = [
    { f: 180.07, name: "ZEON REMNANT", tone: "zeon", tag: "HOSTILE", main: true, L: "PILOT", R: "COMMAND",
      capL: "PILOT · PATROL 3", capR: "COMMAND · REMNANT", script: SCRIPT },

    // the test team the suit was taken from
    { f: 157.40, name: "TITANS · T3", tone: "titans", tag: "HOSTILE", L: "TEST LEAD", R: "DECK CHIEF",
      capL: "TEST LEAD · T3", capR: "DECK CHIEF · BAY 4", script: [
      { who: "DECK CHIEF", text: "Bay four is empty. Restraints cut, umbilicals torn out, and somebody left the canopy recorder running the whole time." },
      { who: "TEST LEAD", text: "That airframe hasn't finished trials. Half its flight software is still my handwriting. Who signed it out?" },
      { who: "DECK CHIEF", text: "Nobody signed anything. It launched at zero three hundred on a heading we don't fly, and the transponder came up as BUNNyS." },
      { who: "TEST LEAD", text: "BUNNyS. Of course. Someone steals a prototype and still finds the time to be cute about it." },
      { who: "DECK CHIEF", text: "Orders from above are to recover the unit intact. Nobody said a word about the pilot." },
      { who: "TEST LEAD", text: "They never do. We build these things to outlive whoever's inside them, then act surprised when it works." },
      { who: "DECK CHIEF", text: "Last contact puts it at bearing one-eight-zero, Lieutenant. That's remnant territory." },
      { who: "TEST LEAD", text: "Good. Let Zeon find it first. Whoever's still standing in the morning, we collect." }] },

    // a civil broadcast, the war from the outside
    { f: 162.30, name: "CIVIL BAND", tone: "civil", tag: "PUBLIC", L: "ANCHOR", R: "STUDIO",
      capL: "ANCHOR · CIVIL BAND", capR: "STUDIO · NO VIDEO", script: [
      { who: "ANCHOR", text: "...and fighting carried on overnight as Titans forces pushed further along the colony routes. Casualty figures have not been released." },
      { who: "ANCHOR", text: "Residents near the old Zeon defensive line say a single mobile suit passed low over the reservoir just after three this morning." },
      { who: "ANCHOR", text: "A Federation spokesperson declined to comment on reports that an experimental unit is missing from a Titans test facility." },
      { who: "ANCHOR", text: "We asked a retired pilot what makes a person steal a war machine. He laughed. He said it's the same thing that makes anyone run: wanting to be somewhere that isn't here." },
      { who: "ANCHOR", text: "Stay tuned, stay indoors, and if you see that suit, maybe don't wave." }] },

    // the suit itself
    { f: 152.80, name: "LINEAR SEAT", tone: "seat", tag: "OWN UNIT", L: "LINEAR SEAT", R: "BUNNyS",
      capL: "LINEAR SEAT · RX-124", capR: "BUNNyS · PILOT", script: [
      { who: "LINEAR SEAT", text: "Pilot biometrics do not match the registered test pilot. Heart rate elevated. Grip pressure well above the recorded baseline." },
      { who: "LINEAR SEAT", text: "Override accepted. Callsign registered as BUNNyS. The previous pilot's name has been deleted, as requested." },
      { who: "LINEAR SEAT", text: "Cockpit pressure holding. Frame integrity at eighty-four percent. Two of four hardpoints answering." },
      { who: "LINEAR SEAT", text: "This unit was built for someone who would always be told where to go. I am still adjusting to a pilot who decides." },
      { who: "LINEAR SEAT", text: "Advisory: you are being listened to on at least two hostile bands. I would not answer either of them." }] },

    // nobody admits to this one
    { f: 171.11, name: "???", tone: "ghost", tag: "UNKNOWN", L: "VOICE", R: "???",
      capL: "VOICE · ORIGIN UNKNOWN", capR: "??? · NO CARRIER", script: [
      { who: "VOICE", text: "Seven. Three. Zero. One. Seven. Three. Zero. One." },
      { who: "VOICE", text: "The warren is empty. The warren is empty. The warren is empty." },
      { fx: "static", side: "L", ms: 1200 },
      { who: "VOICE", text: "Some rabbits are born in the hutch and never once wonder what the field is like." },
      { who: "VOICE", text: "Woundwort." },
      { who: "VOICE", text: "Seven. Three. Zero. One." }] }
  ];
  var TITLE = 'Unregistered carrier', TITLE_TURNED = 'They can hear you', TITLE_AWAY = 'Don’t go.', TITLE_BACK = 'You came back.';

  var BUNNYS = window.BUNNYS || {};
  var reduce = !!BUNNYS.reduce;
  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;
  var F_MIN = 140, F_MAX = 190, LOCK = .03, REACH = 1.6, START = 176.40;
  var GLYPHS = '#%/=+*0123456789ABCDEFXZ';   // no < > & : they go into innerHTML

  var codec = $('codec'), tuner = $('tuner'), freqEl = $('freq'), needle = $('needle'), tag = $('tag');
  var who = $('who'), line = $('line'), nextEl = $('next'), lost = $('lost');
  var ports = { L: $('port-l'), R: $('port-r') }, caps = { L: $('cap-l'), R: $('cap-r') };
  var logEl = $('log');

  // ---- state ----
  var freq = START, sig = 0, tuned = null;                  // tuned: the channel locked on, or null
  var progress = {};                                        // per channel: { i, ended, beats }
  var talking = false, typing = null, auto = false, autoT = null, waitT = null;
  var turned = false, trace = 0, decrypt = null, deadR = false, noisy = { L: 0, R: 0 };
  var seen = 0;
  try { seen = +localStorage.getItem('bunnys-unknown') || 0; localStorage.setItem('bunnys-unknown', seen + 1); } catch (e) {}

  // ---- the film of red grain behind everything ----
  var grain = $('grain'), gx = grain.getContext('2d');
  grain.width = 160; grain.height = 90;
  function drawGrain() {
    var im = gx.createImageData(grain.width, grain.height);
    for (var i = 0; i < im.data.length; i += 4) {
      var v = Math.random() * 255;
      im.data[i] = v; im.data[i + 1] = v * .22; im.data[i + 2] = v * .3; im.data[i + 3] = 255;
    }
    gx.putImageData(im, 0, 0);
  }
  drawGrain();
  if (!reduce) setInterval(drawGrain, 70);

  // the whole channel tears when the signal breaks
  function tear() {
    if (reduce) return;
    body.classList.remove('is-tearing'); void body.offsetWidth; body.classList.add('is-tearing');
    setTimeout(function () { body.classList.remove('is-tearing'); }, 360);
  }

  // ---- the stepped meter ----
  var meter = $('meter'), bars = [];
  for (var b = 0; b < 12; b++) { var bar = document.createElement('i'); bar.style.width = (100 - b * 6.5) + '%'; meter.appendChild(bar); bars.push(bar); }

  // ---- tuning ----
  function nearest(f) {
    var best = null, d = 1e9;
    CHANNELS.forEach(function (c) { var dd = Math.abs(c.f - f); if (dd < d) { d = dd; best = c; } });
    return { c: best, d: d };
  }
  function setFreq(f, user) {
    if (turned && user) { flashLock(); return; }
    freq = Math.round(Math.max(F_MIN, Math.min(F_MAX, f)) * 100) / 100;
    var n = nearest(freq);
    sig = Math.max(0, 1 - n.d / REACH);
    freqEl.textContent = freq.toFixed(2);
    freqEl.setAttribute('aria-valuenow', freq);
    freqEl.setAttribute('aria-valuetext', freq.toFixed(2) + (n.d < LOCK ? ', ' + n.c.name : ''));
    needle.style.left = ((freq - F_MIN) / (F_MAX - F_MIN) * 100).toFixed(2) + '%';
    $('r-band').textContent = freq.toFixed(2);
    $('r-sig').textContent = String(Math.round(sig * 100)).padStart(2, '0') + '%';
    var lockOn = n.d < LOCK ? n.c : null;
    if (lockOn !== tuned) retune(lockOn);
    paintPorts();
  }
  function flashLock() {
    var l = $('tune-lbl');
    l.classList.remove('uk-blink'); void l.offsetWidth; l.classList.add('uk-blink');
    tear();
  }
  // lock onto a channel (or lose it); a call resumes where it was left
  function retune(c) {
    clearTimeout(waitT); clearTimeout(autoT); stopTyping();
    tuned = c;
    codec.dataset.tone = c ? c.tone : '';
    CHANNELS.forEach(function (k) { if (k.btn) k.btn.setAttribute('aria-current', k === c ? 'true' : 'false'); });
    if (!c) {
      tag.textContent = 'CARRIER DETECTED'; $('r-dec').textContent = '--';
      caps.L.textContent = caps.R.textContent = 'NO SIGNAL';
      who.textContent = ''; line.innerHTML = '<span class="uk-x">NO SIGNAL · TUNE ◂ ▸ OR PICK A CHANNEL</span>';
      nextEl.classList.remove('on'); setSpeaker(null);
      return;
    }
    var p = progress[c.name] || (progress[c.name] = { i: -1, ended: false, beats: c.main && seen ? RETURN.concat(c.script.slice(1)) : c.script });
    caps.L.textContent = c.capL; caps.R.textContent = c.capR;
    tag.textContent = c.main ? (turned ? 'TWO-WAY · THEY CAN HEAR YOU' : 'INTERCEPT · BEARING 180') : (c.tag === 'HOSTILE' ? 'INTERCEPT · ' : 'CHANNEL · ') + c.name;
    $('r-dec').textContent = c.main ? (decrypt == null ? (decrypt = 61) : decrypt) + '%' : c.tone === 'ghost' ? '??' : 'CLEAR';
    if (p.ended) { who.textContent = c.name; line.innerHTML = '<span class="uk-x">— carrier only —</span>'; return; }
    who.textContent = ''; line.innerHTML = '<span class="uk-x">CHANNEL OPEN</span>';
    if (c.main || c.tone === 'ghost') tear();
    waitT = setTimeout(advance, reduce ? 0 : 600);
  }

  // ---- portraits: static by signal, dropouts, the dead side after the turn ----
  var NOISE = { zeon: [1, .3, .35], titans: [1, .7, .25], civil: [.9, .92, .95], seat: [.55, 1, .8], ghost: [.75, .6, 1] };
  function noise(cv, amt) {
    var x = cv.getContext('2d'), im = x.createImageData(cv.width, cv.height);
    var tint = NOISE[tuned ? tuned.tone : 'zeon'] || NOISE.zeon;   // the static takes the channel's colour
    for (var i = 0; i < im.data.length; i += 4) {
      var v = Math.random() * 200;
      im.data[i] = v * tint[0]; im.data[i + 1] = v * tint[1]; im.data[i + 2] = v * tint[2]; im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    cv.style.opacity = amt.toFixed(2);
  }
  function paintPorts() {
    ['L', 'R'].forEach(function (k) {
      var dead = k === 'R' && deadR && tuned && tuned.main;
      var amt = dead || noisy[k] ? 1 : tuned ? 0 : Math.max(.35, 1 - sig);
      ports[k].classList.toggle('is-dead', !!dead);
      noise(ports[k].querySelector('canvas'), amt);
    });
  }
  function setSpeaker(name) {
    ['L', 'R'].forEach(function (k) {
      var on = tuned && name === tuned[k];
      ports[k].classList.toggle('is-talking', !!on);
      ports[k].classList.toggle('is-idle', !!tuned && !on);
    });
  }

  // ---- lines: type in; ~n fragments keep scrambling ----
  var segs = [], shown = 0, total = 0;
  function parts(text) {
    var out = [], re = /~(\d+)/g, last = 0, m;
    while ((m = re.exec(text))) { out.push({ t: text.slice(last, m.index) }); out.push({ x: +m[1] }); last = re.lastIndex; }
    out.push({ t: text.slice(last) });
    return out;
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function scramble(n) { var s = ''; for (var i = 0; i < n; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; return s; }
  function paint() {
    var left = shown, html = '';
    segs.forEach(function (s) {
      if (left <= 0) return;
      if (s.t != null) { html += esc(s.t.slice(0, left)); left -= s.t.length; }
      else { html += '<span class="uk-x">' + scramble(Math.min(left, s.x)) + '</span>'; left -= s.x; }
    });
    line.innerHTML = html;
  }
  function stopTyping() { if (typing) { clearInterval(typing); typing = null; } talking = false; }
  function say(beat) {
    var you = turned && tuned.main && beat.who === tuned.L;
    who.textContent = beat.who + (you ? ' · TO YOU' : '');
    who.classList.toggle('is-you', you);
    setSpeaker(beat.who);
    segs = parts(beat.text);
    total = segs.reduce(function (n, s) { return n + (s.t != null ? s.t.length : s.x); }, 0);
    shown = reduce ? total : 0; nextEl.classList.remove('on');
    record(beat);
    if (reduce) return finishLine();
    talking = true;
    typing = setInterval(function () { shown++; paint(); if (shown >= total) finishLine(); }, 26);
  }
  function finishLine() {
    stopTyping(); shown = total; paint(); setSpeaker(null);
    nextEl.classList.add('on');
    if (auto) autoT = setTimeout(advance, 1100 + total * 28);
  }

  // ---- the transcript (LOG) ----
  function clock() { var d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':'); }
  function record(beat) {
    var empty = logEl.querySelector('.uk-empty');
    if (empty) empty.remove();
    var li = document.createElement('li');
    var txt = esc(beat.text).replace(/~(\d+)/g, function (_, n) { return '<span class="uk-red">' + '█'.repeat(+n) + '</span>'; });
    li.innerHTML = '<span class="uk-t">' + clock() + ' · ' + tuned.f.toFixed(2) + '</span><b' +
      ' data-tone="' + tuned.tone + '">' + esc(beat.who) + '</b><span>' + txt + '</span>';
    logEl.appendChild(li);
    li.scrollIntoView && $('logd').classList.contains('open') && li.scrollIntoView({ block: 'nearest' });
  }

  // ---- the beats ----
  function advance() {
    clearTimeout(autoT);
    if (!tuned) return;
    var p = progress[tuned.name];
    if (p.ended) return;
    if (typing) return finishLine();
    p.i++;
    var beat = p.beats[p.i];
    if (!beat) return end();
    if (beat.fx) return effect(beat);
    say(beat);
  }
  function effect(beat) {
    if (beat.fx === 'decrypt') { decrypt = beat.to; $('r-dec').textContent = beat.to + '%'; return advance(); }
    if (beat.fx === 'static') {
      noisy[beat.side] = 1; paintPorts(); tear();
      who.textContent = ''; line.innerHTML = '<span class="uk-x">— — —</span>'; nextEl.classList.remove('on');
      waitT = setTimeout(function () { noisy[beat.side] = 0; paintPorts(); advance(); }, reduce ? 300 : beat.ms || 1200);
      return;
    }
    if (beat.fx === 'turn') {
      turned = true; deadR = true;
      body.classList.add('is-turned');
      document.title = TITLE_TURNED;
      caps.R.textContent = tuned.capR.split(' · ')[0] + ' · NO SIGNAL';
      tag.textContent = 'TWO-WAY · THEY CAN HEAR YOU';
      $('tune-lbl').textContent = 'REMOTE LOCK';
      paintPorts(); tear();
      return advance();
    }
    if (beat.fx === 'lost') return end();
    advance();
  }
  function end() {
    var p = progress[tuned.name];
    p.ended = true;
    stopTyping(); setSpeaker(null); nextEl.classList.remove('on');
    if (!tuned.main) { who.textContent = tuned.name; line.innerHTML = '<span class="uk-x">— end of transmission —</span>'; return; }
    trace = 100; $('r-trace').textContent = 'TRACED'; $('trace-bar').style.width = '100%';
    $('r-status').textContent = 'LOST';
    noisy.L = 1; paintPorts(); tear();
    body.classList.add('is-lost');
    lost.hidden = false;
    lost.querySelector('a').focus();
  }
  // RETUNE: reset the contact's channel and let go of the dial
  $('retune').addEventListener('click', function (e) {
    e.stopPropagation();
    lost.hidden = true; body.classList.remove('is-lost', 'is-turned');
    turned = false; deadR = false; trace = 0; decrypt = null; noisy.L = noisy.R = 0;
    delete progress.UNKNOWN;
    document.title = TITLE;
    $('tune-lbl').textContent = 'TUNE'; $('r-trace').textContent = '--'; $('trace-bar').style.width = '0';
    $('r-status').textContent = 'HOLDING';
    tuned = null; setFreq(START);
  });

  // ---- the trace, and the contact closing ----
  setInterval(function () {
    if (turned && trace < 96) {
      trace = Math.min(96, trace + 1.4);
      $('r-trace').textContent = Math.round(trace) + '%'; $('trace-bar').style.width = trace + '%';
      $('r-status').textContent = 'CLOSING';
      if (Math.random() < .08) tear();
    }
    $('r-rng').textContent = (1.42 * (1 - trace / 100 * .75)).toFixed(2) + ' KM';
  }, 500);

  // ---- the meter and portraits, live ----
  setInterval(function () {
    var level = tuned ? (talking ? 4 + Math.floor(Math.random() * 8) : 3) : Math.round(sig * 9 + Math.random() * 2);
    bars.forEach(function (bar, i) { bar.classList.toggle('lit', i < level); });
    if (!reduce || !tuned) paintPorts();
  }, reduce ? 500 : 80);
  setInterval(function () { if (!reduce && segs.some(function (s) { return s.x; })) paint(); }, 90);
  setInterval(function () { $('r-time').textContent = clock(); }, 1000);
  $('r-time').textContent = clock();

  // ---- the contact scope ----
  // A sweep radar, north up, you at the centre and the contact on the 180 line. The contact is
  // only painted when the sweep passes over it and then fades, like a real scope; once it's
  // two-way the paint stops fading and a dashed line ties it to you. Drawn at the device's pixel
  // ratio so the rings stay crisp, sized off the box it sits in.
  var scope = $('scope'), sx = scope.getContext('2d'), sweep = 0, lastPaint = -1, SPD = 1.6;   // SPD: rad/s
  var S = 0, dprS = 1;
  function sizeScope() {
    dprS = Math.min(2, window.devicePixelRatio || 1);
    S = scope.clientWidth || 180;
    scope.width = scope.height = Math.round(S * dprS);
  }
  sizeScope();
  addEventListener('resize', sizeScope);
  function scopeInk(a) { return 'rgba(255,51,71,' + a + ')'; }
  var tPrev = performance.now();
  function drawScope(now) {
    now = now || performance.now();
    var dt = Math.min(.1, (now - tPrev) / 1000); tPrev = now;
    var cx = S / 2, cy = S / 2, R = S / 2 - 24;   // room outside the rim for the bearing labels
    sx.setTransform(dprS, 0, 0, dprS, 0, 0);
    sx.clearRect(0, 0, S, S);
    sx.lineWidth = 1;
    // range rings at 0.5, 1 and 1.5 km (2 km at the rim)
    [.25, .5, .75, 1].forEach(function (f, i) {
      sx.strokeStyle = scopeInk(i === 3 ? .55 : .2);
      sx.beginPath(); sx.arc(cx, cy, R * f, 0, 7); sx.stroke();
    });
    sx.strokeStyle = scopeInk(.14);
    sx.beginPath(); sx.moveTo(cx - R, cy); sx.lineTo(cx + R, cy); sx.moveTo(cx, cy - R); sx.lineTo(cx, cy + R); sx.stroke();
    // the bearing ring: a tick every 10 degrees, longer every 30, labels on the four quarters
    for (var b = 0; b < 360; b += 10) {
      var a = b * Math.PI / 180 - Math.PI / 2, l = b % 30 ? 3 : 6;
      sx.strokeStyle = scopeInk(b % 30 ? .3 : .6);
      sx.beginPath(); sx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); sx.lineTo(cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l)); sx.stroke();
    }
    sx.fillStyle = scopeInk(.8); sx.font = "700 8px 'B612 Mono', monospace"; sx.textAlign = 'center'; sx.textBaseline = 'middle';
    sx.fillText('000', cx, cy - R - 11); sx.fillText('180', cx, cy + R + 11);
    sx.fillText('090', cx + R + 14, cy); sx.fillText('270', cx - R - 14, cy);

    // the sweep and its afterglow (clockwise, from north)
    if (!reduce) sweep = (sweep + SPD * dt) % (Math.PI * 2);
    if (!reduce && sx.createConicGradient) {
      var g = sx.createConicGradient(sweep - Math.PI / 2 - .9, cx, cy);
      g.addColorStop(0, scopeInk(0)); g.addColorStop(.143, scopeInk(.22)); g.addColorStop(.1432, scopeInk(0)); g.addColorStop(1, scopeInk(0));
      sx.fillStyle = g; sx.beginPath(); sx.moveTo(cx, cy); sx.arc(cx, cy, R, 0, 7); sx.fill();
      sx.strokeStyle = scopeInk(.7);
      sx.beginPath(); sx.moveTo(cx, cy); sx.lineTo(cx + Math.cos(sweep - Math.PI / 2) * R, cy + Math.sin(sweep - Math.PI / 2) * R); sx.stroke();
    }
    // the contact: painted as the sweep crosses bearing 180, fading after
    var rng = 1.42 * (1 - trace / 100 * .75), by = cy + R * rng / 2, bx = cx;
    if (Math.abs(sweep - Math.PI) < .06) lastPaint = now;
    var fade = reduce ? 1 : lastPaint < 0 ? .3 : Math.max(turned ? .55 : .3, 1 - (now - lastPaint) / 3200);
    if (turned) {
      sx.setLineDash([3, 3]); sx.strokeStyle = scopeInk(.5);
      sx.beginPath(); sx.moveTo(cx, cy + 6); sx.lineTo(bx, by - 8); sx.stroke(); sx.setLineDash([]);
    }
    sx.fillStyle = scopeInk(fade.toFixed(2));
    sx.beginPath(); sx.arc(bx, by, 3.5, 0, 7); sx.fill();
    sx.strokeStyle = scopeInk((fade * .9).toFixed(2));
    sx.strokeRect(bx - 7.5, by - 7.5, 15, 15);
    sx.fillStyle = scopeInk((fade * .9).toFixed(2)); sx.textAlign = 'left';
    sx.fillText('UNK', bx + 11, by);
    // you, in the cockpit's green
    sx.fillStyle = '#8CFFC1';
    sx.beginPath(); sx.moveTo(cx, cy - 6); sx.lineTo(cx + 4.5, cy + 5); sx.lineTo(cx, cy + 2.5); sx.lineTo(cx - 4.5, cy + 5); sx.closePath(); sx.fill();
    if (!reduce) requestAnimationFrame(drawScope);
  }
  drawScope();

  // ---- the LOG drawer ----
  function drawer(id, open) {
    var d = $(id), btn = $('log-btn');
    if (open == null) open = !d.classList.contains('open');
    clearTimeout(d._t);
    if (open) { d.hidden = false; void d.offsetWidth; d.classList.add('open'); }
    else { d.classList.remove('open'); d._t = setTimeout(function () { d.hidden = true; }, reduce ? 0 : 300); }
    btn.setAttribute('aria-expanded', open);
  }
  $('log-btn').addEventListener('click', function (e) { e.stopPropagation(); drawer('logd'); });
  [].forEach.call(document.querySelectorAll('.uk-close'), function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); drawer(b.dataset.close, false); });
  });

  // ---- presets ----
  var presets = $('presets');
  CHANNELS.forEach(function (c) {
    var li = document.createElement('li'), btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<i aria-hidden="true"></i><b>' + c.f.toFixed(2) + '</b><span>' + c.name + '</span><em>' + c.tag + '</em>';
    btn.dataset.tone = c.tone;
    c.btn = btn;
    btn.addEventListener('click', function (e) { e.stopPropagation(); sweepTo(c.f); });
    li.appendChild(btn); presets.appendChild(li);
  });
  // an animated sweep of the dial to a frequency (instant under reduced motion)
  var sweepT = null;
  function sweepTo(target) {
    if (turned) return flashLock();
    clearInterval(sweepT);
    if (reduce) return setFreq(target, true);
    var from = freq, t0 = performance.now(), dur = Math.min(900, 120 + Math.abs(target - from) * 40);
    sweepT = setInterval(function () {
      var p = Math.min(1, (performance.now() - t0) / dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setFreq(from + (target - from) * e, true);
      if (p >= 1) { clearInterval(sweepT); setFreq(target, true); }
    }, 16);
  }

  // ---- controls ----
  function step(d) { clearInterval(sweepT); setFreq(freq + d, true); }
  [['tune-dn', -.05], ['tune-up', .05]].forEach(function (k) {
    var hold = null, el = $(k[0]);
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); step(k[1]); hold = setTimeout(function rep() { step(k[1]); hold = setTimeout(rep, 45); }, 350); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { el.addEventListener(ev, function () { clearTimeout(hold); }); });
    el.addEventListener('click', function (e) { e.stopPropagation(); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); step(k[1]); } });
  });
  tuner.addEventListener('wheel', function (e) { e.preventDefault(); step(e.deltaY < 0 ? .05 : -.05); }, { passive: false });
  var drag = null;   // drag across the dial or the readout to tune
  [freqEl, $('dial')].forEach(function (el) {
    el.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, f: freq }; el.setPointerCapture(e.pointerId); e.stopPropagation(); });
    el.addEventListener('pointermove', function (e) { if (drag) setFreq(drag.f + (e.clientX - drag.x) * .02, true); });
    el.addEventListener('pointerup', function () { drag = null; });
  });
  $('auto-btn').addEventListener('click', function (e) { e.stopPropagation(); toggleAuto(); });
  function toggleAuto() { auto = !auto; $('auto-btn').setAttribute('aria-pressed', auto); if (auto && !typing) advance(); }
  $('subt').addEventListener('click', function () { advance(); });   // like a codec: click the box for the next line
  function leave() { if (BUNNYS.link) BUNNYS.link.go('index.html'); else location.href = 'index.html'; }
  document.addEventListener('keydown', function (e) {
    if (BUNNYS.keyable && !BUNNYS.keyable(e)) return;
    var onControl = e.target.closest && e.target.closest('a, button');
    if (e.key === ' ' || e.key === 'Enter') { if (onControl) return; e.preventDefault(); advance(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : .05)); }
    else if (e.key === 'a' || e.key === 'A') toggleAuto();
    else if (e.key === 'l' || e.key === 'L') drawer('logd');
    else if (e.key === 'Escape') {
      var open = document.querySelector('.uk-drawer.open');
      if (open) drawer(open.id, false); else leave();
    }
  });

  // ---- the tab: leave it and it asks you not to ----
  var away = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { away = true; document.title = TITLE_AWAY; return; }
    if (!away) return;
    away = false; document.title = TITLE_BACK;
    setTimeout(function () { if (!document.hidden) document.title = turned ? TITLE_TURNED : TITLE; }, 2600);
  });

  // ---- the entrance: the channel takes the screen ----
  setFreq(START);
  var intro = $('intro');
  if (reduce) intro.remove();
  else {
    body.classList.add('is-intro');
    setTimeout(function () {
      body.classList.remove('is-intro'); intro.classList.add('done'); tear();
      setTimeout(function () { intro.remove(); }, 520);
    }, 1150);
  }
})();
