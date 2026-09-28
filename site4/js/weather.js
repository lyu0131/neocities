/* weather.js: what the sky is doing. Loaded straight after bunnys.js, so BUNNYS.wx is set
   before hud.js, cockpit.js, fx.js or glass.js look at it.

   Two small tables composed rather than ten hand-written conditions: a BASE (what time of day
   it is, which panorama, how the scene is tinted) and a PRECIP (what is falling, how hard,
   and the wind behind it). BUNNYS.wx is one flat merge of a pair of them, and it is the ONLY
   source -- fx.js draws from it, glass.js draws from it, and the ENVIRONMENT panel reads from
   it, so the instrument and the visuals cannot disagree.

   Day or night follows the visitor's own clock; the precipitation is rolled. The result is
   frozen into sessionStorage so walking to a sub-page and back does not reroll the sky.
   ?wx=day-thunder overrides both, which is how the owner demos it and how the tests pin it. */
(function () {
  'use strict';
  var BUNNYS = window.BUNNYS;
  if (!BUNNYS) return;

  // caps: the six polar-cap colours cockpit.js paints the sphere's top and bottom with.
  // SKY_EDGE/SEA_EDGE are sampled from the rendered panorama's first and last pixel rows, so
  // the caps meet the strip with no seam. A base that ships no caps uses the night set --
  // which is correct while 'day' still renders the night panorama under a tint.
  var NIGHT_CAPS = {
    SKY_EDGE: [7, 12, 22], ZENITH: [3, 5, 11],
    SEA_EDGE: [9, 16, 31], NADIR: [4, 7, 14],
    CLOUD_LOW: [86, 63, 52], CLOUD_HIGH: [84, 96, 115]
  };
  // Measured off the rendered strips at full height, averaged across the row -- not guessed.
  // If gen_pano.py's sky or sea gradient moves, re-sample; tests/svg.test.js checks it.
  var DAY_CAPS = {
    SKY_EDGE: [71, 90, 107], ZENITH: [50, 70, 94],
    SEA_EDGE: [60, 83, 105], NADIR: [38, 55, 74],
    CLOUD_LOW: [168, 180, 192], CLOUD_HIGH: [198, 210, 221]
  };
  var BASE = {
    night: { pano: 'pano.svg', tempBias: 0, tint: null, caps: NIGHT_CAPS },
    // A real daylight strip, not a tint over the night one: a wash cannot put out 1100 lit
    // windows or the sodium reflection columns, and trying only muddied the scene.
    day: { pano: 'pano-day.svg', tempBias: 6, tint: null, caps: DAY_CAPS }
  };

  // label must stay <= 10 chars: the ENVIRONMENT panel's value column is right-anchored and
  // 'LIGHT RAIN' is the proven ceiling before it collides with the WX label.
  var PRECIP = {
    overcast: { label: 'OVERCAST', temp: 11, mm: 0.0, windKt: 8, windDeg: 255,
                kind: null, world: 0, beads: 70, runners: 2, spawn: 2, growth: 0.25,
                haze: 0.10, lightning: 0 },
    rain: { label: 'RAIN', temp: 13, mm: 3.8, windKt: 14, windDeg: 240,
            kind: 'rain', world: 70, beads: 520, runners: 20, spawn: 40, growth: 1,
            haze: 0.18, lightning: 0 },
    thunder: { label: 'THUNDER', temp: 15, mm: 9.4, windKt: 26, windDeg: 205,
               kind: 'rain', world: 120, beads: 620, runners: 32, spawn: 70, growth: 1.7,
               haze: 0.24, lightning: 1 },
    snow: { label: 'SNOW', temp: -2, mm: 1.4, windKt: 9, windDeg: 20,
            kind: 'snow', world: 90, beads: 150, runners: 3, spawn: 5, growth: 0.3,
            haze: 0.30, lightning: 0 },
    blizzard: { label: 'BLIZZARD', temp: -7, mm: 4.2, windKt: 34, windDeg: 355,
                kind: 'snow', world: 230, beads: 210, runners: 4, spawn: 9, growth: 0.4,
                haze: 0.62, lightning: 0 }
  };
  // Rain-family stays well over half: a visitor who rolls OVERCAST sees none of the water on
  // the glass, which is the whole point of the thing.
  var ODDS = [['rain', .40], ['thunder', .25], ['snow', .14], ['overcast', .15], ['blizzard', .06]];

  function store(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  function parse(id) {
    if (!id) return null;
    var p = String(id).toLowerCase().split('-');
    var b = null, pc = null, i;
    for (i = 0; i < p.length; i++) {
      if (BASE[p[i]]) b = p[i];
      if (PRECIP[p[i]]) pc = p[i];
    }
    if (!b && !pc) return null;
    return { base: b, precip: pc };
  }
  function roll() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < ODDS.length; i++) { acc += ODDS[i][1]; if (r < acc) return ODDS[i][0]; }
    return 'rain';
  }

  var q = null;
  try { q = parse((location.search.match(/[?&]wx=([^&]+)/) || [])[1]); } catch (e) {}
  var held = q ? null : parse(load('bunnys-wx'));
  var pick = q || held || {};
  var hour = new Date().getHours();
  var baseKey = pick.base || (hour >= 7 && hour < 19 ? 'day' : 'night');
  var precipKey = pick.precip || roll();
  store('bunnys-wx', baseKey + '-' + precipKey);

  var b = BASE[baseKey], p = PRECIP[precipKey];
  var wx = { id: baseKey + '-' + precipKey, base: baseKey, precip: precipKey };
  var k;
  for (k in b) wx[k] = b[k];
  for (k in p) wx[k] = p[k];
  wx.tempC = p.temp + b.tempBias;

  // Wind. windDeg is the bearing it blows FROM, which is the convention the ENVIRONMENT
  // panel's arrow already uses. One number feeds three consumers -- the world streaks' lean,
  // the runners' sideways pull on the glass, and the printed bearing -- so they agree by
  // construction. It is a function of where you are looking, so turning the cockpit turns you
  // into the wind and the rain leans the other way. One sin() per frame, not per particle.
  var WIND_K = 3.0;   // px/s per knot; calibrated so 14 kt matches the old hardcoded lean
  var yaw = 0;
  BUNNYS.on('view', function (d) { yaw = d.yaw || 0; });
  wx.shear = function () {
    return WIND_K * wx.windKt * Math.sin((wx.windDeg - 180 - yaw) * Math.PI / 180);
  };

  BUNNYS.wx = wx;
  document.documentElement.classList.add('wx-' + baseKey, 'wxp-' + precipKey);

  // The tint and haze are overlay divs at --z-fx with a blend mode, never a filter: a filter
  // anywhere near .pano-ring flattens preserve-3d and collapses the sphere. Same mechanism
  // the night-vision overlay already uses. Hub only -- a sub-page has no panorama to tint.
  function paint() {
    var t = document.querySelector('.wx-tint'), hz = document.querySelector('.wx-haze');
    if (t) {
      if (wx.tint) { t.style.background = wx.tint.color; t.style.mixBlendMode = wx.tint.blend; t.style.opacity = wx.tint.alpha; }
      else t.style.opacity = 0;
    }
    if (hz) hz.style.opacity = wx.haze;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
})();
