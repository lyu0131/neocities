// Regenerates the SL-01 "ARGUS" art: img/ms/sl01-{front,side,back}.svg and img/ms/decals.svg,
// plus check pages in tests/out/ (ms-sheet.html, ms-detail.html). No dependencies.
// Run: node site4/tools/ms-gen.js   then   node site4/tests/svg.test.js ms
'use strict';
const fs = require('fs'), path = require('path');
const MS = path.resolve(__dirname, '..', 'img', 'ms');
const OUT = path.resolve(__dirname, '..', 'tests', 'out');

// ---------- primitives ----------
const f = n => Math.round(n * 10) / 10;
const pp = p => f(p[0]) + ' ' + f(p[1]);
const P = pts => 'M' + pts.map(pp).join('L') + 'Z';
const L = pts => 'M' + pts.map(pp).join('L');
const mir = pts => pts.map(([x, y]) => [800 - x, y]);
const sym = h => { const m = mir(h).reverse(); if (h[h.length - 1][0] === 400) m.shift(); if (h[0][0] === 400) m.pop(); return h.concat(m); };
const circ = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0Z`;
const ell = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}a${rx} ${ry} 0 1 0 ${f(2 * rx)} 0a${rx} ${ry} 0 1 0 ${f(-2 * rx)} 0Z`;
const hl = (x1, x2, y) => `M${f(x1)} ${f(y)}H${f(x2)}`;
const vl = (x, y1, y2) => `M${f(x)} ${f(y1)}V${f(y2)}`;
const vents = (x1, x2, y, n, gap) => Array.from({ length: n }, (_, i) => hl(x1, x2, y + i * gap)).join('');
const vvents = (x, y1, y2, n, gap) => Array.from({ length: n }, (_, i) => vl(x + i * gap, y1, y2)).join('');
const move = (pts, dx, dy = 0) => pts.map(([x, y]) => [x + dx, y + dy]);
const xf = (pts, tx, ty, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [tx + x * c - y * s, ty + x * s + y * c]); };
// A-stance: legs cant outward toward the feet (0 at the hip, y=556; K units at the sole)
const K = -30;
const cl = pts => pts.map(([x, y]) => [x + K * Math.max(0, y - 556) / 784, y]);
function inset(pts, d) { // parallel inner outline, for panel lines
  let a = 0; const n = pts.length;
  for (let i = 0; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; a += x1 * y2 - x2 * y1; }
  const s = a > 0 ? 1 : -1, ls = [];
  for (let i = 0; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
    ls.push([x1 - dy / l * s * d, y1 + dx / l * s * d, dx, dy]); }
  return ls.map((B, i) => { const A = ls[(i - 1 + n) % n], den = A[2] * B[3] - A[3] * B[2];
    if (Math.abs(den) < 1e-9) return [B[0], B[1]];
    const t = ((B[0] - A[0]) * B[3] - (B[1] - A[1]) * B[2]) / den; return [A[0] + A[2] * t, A[1] + A[3] * t]; });
}

// ---------- part builder ----------
// Tones: base #0E1830 = shadow planes; l = light-facing facets; d = frame/joints; v = voids (visor, vents, nozzles).
const HUD = '#8CFFC1', TONE = { l: '#1B2C52', d: '#0A1122', v: '#03060C' };
const MIRROR = 'matrix(-1 0 0 1 800 0)';
const S = (pts, t, m) => ({ k: 's', d: P(pts), t, m });          // filled plate (part of the silhouette)
const SD = (d, t, m) => ({ k: 's', d, t, m });
// faceted plate: shadow-plane fill, lit facets (crease lines = facet edges), then the outline re-stroked on top
const FP = (pts, facets, t, m) => [{ k: 's', d: P(pts), t, m, ns: 1 }, ...facets.map(q => ({ k: 'c', d: P(q), m })), { k: 'o', d: P(pts), m }];
const edge = (pts, m) => S(move(pts, 0, 7), 'd', m);              // stacked-plate lamella peeking below a plate
const ln = (d, m) => ({ k: 'l', d, m });                          // fine panel line
const ac = (d, m) => ({ k: 'a', d, m });                          // --hud accent stroke
const af = (d, m) => ({ k: 'f', d, m });                          // --hud accent fill
const gl = (d, m) => ({ k: 'g', d, m });                          // --hud faint glow
const plate = (pts, t, m, dd = 6) => [S(pts, t, m), ln(P(inset(pts, dd)), m)];
const ATTR = { l: ' fill="none" stroke-width="1.2" stroke-opacity=".6"', a: ` fill="none" stroke="${HUD}"`, f: ` stroke="none" fill="${HUD}"`,
  g: ` stroke="none" fill="${HUD}" fill-opacity=".16"`, c: ` fill="${TONE.l}" stroke-width="1.2" stroke-opacity=".55"`, o: ' fill="none"' };
function emit(d, k, t, m, ns) {
  const p = `<path d="${d}"${k === 's' ? (t ? ` fill="${TONE[t]}"` : '') + (ns ? ' stroke="none"' : '') : ATTR[k]}/>`;
  return m ? p + p.replace('/>', ` transform="${MIRROR}"/>`) : p;
}
function part(id, items, tr) {
  items = items.flat(Infinity).filter(Boolean);
  const sh = items.filter(i => i.k === 's');
  // heavier silhouette: a 2.4px underlay of the part's outline; the plates' fills cover its inner half
  let o = `<g id="${id}"${tr ? ` transform="${tr}"` : ''}><path d="${sh.map(s => s.d).join('')}" stroke-width="2.4"/>`;
  const um = sh.filter(s => s.m).map(s => s.d).join('');
  if (um) o += `<path d="${um}" stroke-width="2.4" transform="${MIRROR}"/>`;
  for (let i = 0; i < items.length;) {
    const it = items[i];
    if (it.k === 's' || it.k === 'o') { o += emit(it.d, it.k, it.t, it.m, it.ns); i++; continue; }
    let d = '', j = i; while (j < items.length && items[j].k === it.k && !!items[j].m === !!it.m) d += items[j++].d;
    o += emit(d, it.k, null, it.m); i = j;
  }
  return o + '</g>';
}
const svg = (label, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1400" role="img" aria-label="${label}">`
  + `<g fill="#0E1830" stroke="#DDE7EE" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>\n`;

// =====================================================================
// Shared levels (all views): crest tip 72, head 130-248, shoulder/binder top ~228-234, chest 238-458,
// waist 492-500, crotch ~620, knee centre ~905, ankle ~1270, sole 1340.
// Front/back halves are drawn on the viewer-left (x<400) and mirrored about x=400.
// -l / -r ids are the suit's own left/right.
// =====================================================================

// ---------- FRONT / BACK shared outlines (viewer-left) ----------
const finF = [[360, 294], [344, 278], [308, 210], [274, 146], [250, 88], [266, 98], [292, 128], [334, 192], [374, 262], [378, 290]];
const helm = sym([[400, 130], [378, 132], [360, 142], [350, 158], [346, 184], [350, 208], [360, 226], [400, 238]]);
const crestHalf = [[398, 72], [398, 154], [382, 158], [384, 130], [390, 100]];
const earF = [[332, 172], [352, 162], [358, 172], [358, 214], [344, 222], [330, 200]];
const neckF = [[380, 218], [420, 218], [422, 258], [378, 258]];
// torso: strong V from a 232-wide chest to a 52-wide waist
const chestSil = sym([[400, 238], [364, 240], [322, 246], [296, 260], [284, 288], [288, 334], [300, 376], [322, 410], [352, 436], [378, 452], [400, 458]]);
const collar = sym([[400, 234], [376, 236], [356, 246], [354, 262], [376, 272], [400, 274]]);
const collarIn = sym([[400, 244], [380, 246], [366, 254], [380, 264], [400, 266]]);
const ab = sym([[400, 448], [380, 450], [376, 474], [374, 500], [400, 502]]);
const belt = sym([[400, 494], [362, 494], [346, 506], [342, 532], [400, 536]]);
const sideSkirt = [[346, 504], [308, 508], [276, 592], [284, 642], [316, 620], [344, 542]];
const frontSkirt = [[394, 526], [360, 526], [338, 536], [300, 612], [312, 662], [364, 640], [394, 598]];
// binders: an inverted-triangle mass sweeping up and out; lower plates narrow and rise toward the outside
const bA = [[306, 262], [290, 242], [240, 228], [190, 224], [146, 216], [118, 204], [128, 236], [140, 282], [160, 314], [248, 306], [300, 290]];
const bAf = [[306, 262], [290, 242], [240, 228], [190, 224], [146, 216], [118, 204], [128, 236], [190, 248], [250, 252]];
const bB = [[160, 310], [252, 302], [256, 366], [244, 396], [182, 390], [142, 370], [134, 334]];
const bBf = [[160, 312], [252, 304], [253, 330], [138, 340]];
const bC = [[168, 380], [244, 388], [238, 436], [216, 466], [178, 458], [148, 436], [150, 404]];
const bCf = [[168, 382], [244, 390], [241, 408], [151, 410]];
// arms
const upperArm = [[238, 318], [288, 318], [290, 468], [240, 468]];
const elbow = [[232, 460], [294, 460], [296, 508], [230, 508]];
const forearm = [[216, 500], [296, 500], [306, 536], [302, 620], [288, 684], [244, 684], [228, 640], [212, 560]];
const forePlate = [[202, 526], [230, 500], [240, 640], [226, 676], [206, 614]];
const wrist = [[244, 680], [286, 680], [284, 700], [246, 700]];
const fist = [[236, 696], [288, 696], [296, 720], [292, 752], [266, 762], [240, 752], [232, 722]];
// legs: massive thigh tapering into a pointed knee; calves flare into thruster blocks; pointed feet
const thigh = cl([[290, 566], [384, 566], [388, 620], [380, 720], [368, 820], [356, 850], [326, 850], [312, 820], [298, 720], [288, 620]]);
const thighF = cl([[314, 572], [366, 572], [374, 624], [366, 730], [346, 818], [332, 818], [318, 730], [308, 624]]);
const thighOut = cl([[288, 610], [304, 596], [312, 712], [302, 770], [292, 716]]);
const kneeJ = cl([[320, 836], [364, 836], [362, 884], [322, 884]]);
const knee = cl([[300, 880], [318, 848], [340, 804], [362, 848], [380, 880], [376, 934], [340, 976], [304, 934]]);
const kneeF = cl([[318, 848], [340, 806], [362, 848], [340, 866]]);
const calfOut = cl([[304, 990], [272, 1040], [254, 1130], [262, 1196], [302, 1190], [306, 1100]]);
const calfOutF = cl([[304, 990], [272, 1040], [268, 1062], [304, 1040]]);
const calfIn = cl([[376, 1004], [396, 1054], [400, 1140], [390, 1180], [378, 1168]]);
const shin = cl([[310, 940], [370, 940], [378, 1020], [380, 1140], [372, 1222], [362, 1252], [318, 1252], [308, 1222], [300, 1140], [302, 1020]]);
const shinArm = cl([[316, 966], [364, 966], [372, 1056], [364, 1168], [340, 1198], [316, 1168], [308, 1056]]);
const shinArmF = cl([[332, 968], [348, 968], [354, 1060], [348, 1160], [340, 1190], [332, 1160], [326, 1060]]);
const ankleJ = cl([[316, 1244], [364, 1244], [362, 1284], [318, 1284]]);
const foot = cl([[272, 1316], [296, 1290], [322, 1280], [358, 1280], [384, 1290], [408, 1316], [412, 1340], [268, 1340]]);
const toeCap = cl([[322, 1282], [358, 1282], [374, 1334], [306, 1334]]);
const ankleGuard = cl([[306, 1196], [374, 1196], [380, 1250], [340, 1278], [300, 1250]]);
const ankleGuardF = cl([[306, 1196], [374, 1196], [377, 1222], [303, 1222]]);
const calfSlits = ac(L(cl([[266, 1092], [292, 1086]])) + L(cl([[264, 1112], [292, 1106]])) + L(cl([[262, 1132], [292, 1126]])));

// ---------- FRONT ----------
function front() {
  const o = [];
  o.push(part('backpack', [S(finF, 'd', 1), ln(L([[362, 280], [320, 200], [262, 100]]), 1)]));
  const kv = 836 - 556;
  const leg = [
    ...FP(thigh, [thighF]), ln(L(cl([[340, 580], [340, 812]]))), S(thighOut, 'd'),
    S(kneeJ, 'd'), ln(vents(320 + K * kv / 784, 362 + K * kv / 784, 848, 4, 10)),
    ...FP(calfOut, [calfOutF]), calfSlits, S(calfIn),
    S(shin), ...FP(shinArm, [shinArmF]), ln(P(cl([[334, 1080], [346, 1080], [346, 1120], [334, 1120]])) + L(cl([[302, 1030], [300, 1200]]))),
    S(ankleJ, 'd'), ...FP(foot, [toeCap]), ln(L(cl([[340, 1284], [340, 1334]])) + hl(268 + K, 412 + K, 1334)),
    ...FP(ankleGuard, [ankleGuardF]),
    ...FP(knee, [kneeF]), ln(L(cl([[340, 866], [340, 974]]))), ac(L(cl([[340, 886], [340, 926]]))),
  ];
  o.push(part('leg-r', leg), part('leg-l', leg, MIRROR));
  o.push(part('waist', [
    S(ab, 'd'), ln(hl(378, 422, 466) + hl(376, 424, 484) + vl(400, 450, 500)),
    ...FP(sideSkirt, [[[346, 504], [308, 508], [298, 534], [345, 528]]], null, 1), ln(L([[290, 572], [336, 562]]), 1),
    ...FP(belt, [sym([[400, 496], [362, 496], [352, 504], [400, 504]])]),
    ...FP(frontSkirt, [[[394, 528], [360, 528], [340, 538], [322, 574], [394, 572]]], null, 1),
    ln(P([[340, 598], [372, 594], [372, 618], [344, 622]]), 1),
    ...FP(sym([[400, 530], [390, 532], [386, 596], [394, 620], [400, 624]]), [sym([[400, 532], [392, 534], [390, 590], [400, 600]])]),
    ac(vl(400, 548, 584)),
  ]));
  const arm = [
    SD(circ(262, 300, 30), 'd'),
    ...FP(upperArm, [[[254, 320], [276, 320], [278, 466], [256, 466]]]), ln(vents(242, 286, 360, 2, 60)),
    S(elbow, 'd'), ln(vents(234, 292, 472, 3, 11)),
    ...FP(forearm, [[[246, 506], [294, 506], [302, 538], [298, 610], [284, 660], [262, 662], [250, 620]]]),
    ln(P([[264, 560], [284, 558], [284, 596], [266, 598]])),
    ...plate(forePlate, 'd', 0, 5),
    S(wrist, 'd'), ...FP(fist, [[[236, 698], [288, 698], [294, 716], [234, 718]]]),
    ln(vents(238, 292, 730, 2, 12) + L([[286, 702], [298, 724], [290, 738]])),
  ];
  o.push(part('arm-r', arm), part('arm-l', arm, MIRROR));
  o.push(part('chest', [
    S(neckF, 'd'), ln(vents(382, 418, 228, 3, 8)),
    ...FP(chestSil, [sym([[400, 240], [364, 242], [322, 248], [297, 261], [308, 270], [352, 262], [400, 262]])]),
    ln(L([[292, 300], [300, 362]]) + L([[304, 380], [330, 416]]), 1),
    // forward-projecting sculpted chest plate: lit top plane + lit keel
    ...FP(sym([[400, 276], [372, 276], [340, 284], [312, 300], [302, 334], [314, 366], [346, 382], [382, 386], [400, 392]]),
      [sym([[400, 278], [372, 278], [341, 286], [314, 301], [334, 316], [372, 308], [400, 308]]), sym([[400, 310], [391, 312], [389, 382], [400, 392]])]),
    ln(L([[334, 316], [318, 360]]) + hl(390, 396, 340), 1),
    // intake pair
    S([[316, 380], [354, 394], [358, 428], [338, 430], [322, 410]], 'v', 1),
    ln(L([[324, 394], [352, 404]]) + L([[328, 405], [354, 414]]) + L([[332, 416], [356, 423]]), 1),
    // collar ring
    ...FP(collar, [sym([[400, 236], [376, 238], [357, 247], [376, 250], [400, 250]])]), S(collarIn, 'd'),
    SD('M400 286L406 294L400 302L394 294Z', 'v'), ac('M400 286L406 294L400 302L394 294Z'),
  ]));
  o.push(part('head', [
    S(helm), ...plate(earF, 'l', 1, 4), ln(vents(338, 352, 184, 3, 9), 1),
    ...plate(sym([[400, 134], [380, 136], [364, 146], [357, 164], [378, 162], [400, 166]]), 'l', 0, 4),
    S(sym([[400, 198], [376, 200], [364, 210], [370, 228], [386, 242], [400, 248]])),
    ln(hl(386, 414, 216) + hl(389, 411, 224) + L([[374, 206], [388, 238]]) + L([[426, 206], [412, 238]])),
    S(sym([[400, 170], [372, 170], [356, 176], [356, 194], [372, 200], [400, 196]]), 'v'),
    ac(L([[362, 185], [376, 187], [424, 187], [438, 185]])),
    gl(circ(400, 187, 9)), af(circ(400, 187, 3.2)),
    S(crestHalf, 'l', 1), ac(vl(400, 86, 150)),
  ]));
  const binder = [
    edge(bC), ...FP(bC, [bCf]), ln(circ(196, 446, 3) + L([[152, 422], [238, 426]])),
    edge(bB), ...FP(bB, [bBf]), ln(P([[186, 344], [218, 342], [218, 366], [188, 368]])),
    edge(bA), ...FP(bA, [bAf]), ln(circ(206, 282, 3) + circ(268, 280, 3)), ac(L([[160, 298], [238, 294]])),
  ];
  o.push(part('binder-r', binder), part('binder-l', binder, MIRROR));
  return svg('SL-01 ARGUS, front view', o.join(''));
}

// ---------- SIDE (faces right; the suit's right side is nearest) ----------
function side() {
  const o = [];
  const finS = [[326, 284], [302, 294], [278, 266], [258, 190], [242, 86], [270, 114], [300, 178], [334, 262]];
  const finSf = [[242, 86], [270, 114], [300, 178], [334, 262], [322, 268], [288, 186], [260, 120]];
  const pack = [[340, 262], [300, 256], [266, 272], [250, 310], [248, 430], [262, 478], [300, 498], [338, 492]];
  o.push(part('backpack', [
    S(move(finS, -24, 10), 'd'), ln(L(move([[312, 280], [278, 196], [252, 104]], -24, 10))),
    ...FP(pack, [[[340, 262], [300, 256], [266, 272], [250, 310], [276, 310], [306, 276], [340, 272]]]),
    ln(P([[262, 330], [284, 326], [286, 440], [264, 446]]) + vents(294, 332, 330, 6, 14) + hl(270, 330, 470)),
    S([[258, 484], [316, 488], [328, 532], [246, 532]], 'd'), SD(ell(287, 532, 41, 6), 'v'), ac(vvents(267, 518, 528, 5, 10)),
    ...FP(finS, [finSf]), ln(L([[312, 280], [278, 196], [252, 104]])), ac(L([[282, 236], [292, 262]]) + L([[290, 232], [300, 258]])),
    SD(circ(318, 278, 13), 'd'), ln(circ(318, 278, 6)),
  ]));
  const thighS = [[364, 556], [452, 556], [464, 640], [458, 740], [446, 830], [430, 862], [388, 862], [374, 780], [364, 680]];
  const kneeS = [[404, 862], [426, 836], [450, 842], [496, 898], [472, 930], [440, 950], [410, 938], [400, 904]];
  const shinS = [[386, 944], [446, 944], [456, 1030], [452, 1140], [444, 1224], [436, 1258], [380, 1258], [370, 1210], [366, 1120], [372, 1010]];
  const calfS = [[380, 962], [322, 1012], [314, 1150], [356, 1196], [384, 1196], [386, 1010]];
  const ankS = [[378, 1206], [446, 1204], [458, 1250], [436, 1284], [376, 1280]];
  const footS = [[346, 1296], [370, 1274], [444, 1272], [482, 1288], [520, 1310], [546, 1330], [548, 1340], [340, 1340]];
  o.push(part('leg-r', [
    ...FP(thighS, [[[418, 558], [452, 558], [464, 640], [458, 740], [446, 830], [430, 820], [428, 700]]]),
    S([[364, 610], [380, 600], [388, 720], [378, 776], [368, 720]], 'd'), ln(L([[372, 600], [450, 600]])),
    SD(circ(412, 904, 30), 'd'), SD(circ(412, 904, 15)), ln(circ(412, 904, 22)),
    ...FP(shinS, [[[420, 948], [446, 948], [456, 1030], [452, 1140], [444, 1220], [428, 1210], [430, 1100], [426, 1010]]]),
    ln(P([[432, 1060], [444, 1060], [444, 1100], [432, 1100]])),
    ...FP(calfS, [[[380, 962], [322, 1012], [320, 1034], [385, 1008]]]), ln(L([[314, 1150], [386, 1140]])),
    S([[328, 1044], [350, 1040], [352, 1146], [330, 1150]], 'd'), ac(vents(334, 347, 1056, 5, 20)),
    ...FP(footS, [[[370, 1276], [444, 1274], [468, 1284], [372, 1290]]]),
    ...FP([[468, 1284], [520, 1308], [546, 1330], [548, 1340], [468, 1340]], [[[470, 1286], [520, 1310], [544, 1330], [470, 1318]]]),
    S([[354, 1294], [322, 1316], [312, 1330], [322, 1340], [354, 1340]], 'd'), ln(hl(316, 546, 1334)),
    ...FP(ankS, [[[378, 1206], [446, 1204], [450, 1222], [378, 1224]]]),
    ...FP(kneeS, [[[426, 836], [450, 842], [496, 898], [448, 884], [416, 866], [404, 862]]]),
    ln(L([[448, 884], [440, 950]])), ac(L([[456, 898], [470, 915]])),
  ]));
  o.push(part('waist', [
    S([[380, 450], [430, 450], [426, 500], [384, 500]], 'd'), ln(hl(382, 428, 468) + hl(383, 427, 486)),
    ...FP([[364, 494], [446, 494], [456, 532], [360, 534]], [[[364, 496], [446, 496], [449, 508], [363, 508]]]),
    ...plate([[358, 512], [330, 522], [312, 598], [330, 642], [360, 612]], 'd', 0, 5),
    ...FP([[444, 522], [476, 528], [500, 598], [480, 656], [452, 630]], [[[444, 524], [476, 530], [488, 562], [452, 560]]]),
    ...FP([[356, 508], [448, 504], [466, 540], [458, 620], [426, 652], [378, 644], [350, 598]], [[[356, 510], [448, 506], [462, 538], [354, 544]]]),
    ln(P([[384, 566], [426, 566], [426, 604], [384, 604]])),
  ]));
  const chestS = [[346, 250], [396, 240], [452, 246], [488, 270], [506, 312], [502, 356], [482, 398], [452, 436], [414, 456], [380, 452], [352, 426], [336, 370], [332, 300]];
  o.push(part('chest', [
    S([[386, 222], [416, 222], [422, 258], [382, 258]], 'd'), ln(vents(388, 416, 232, 3, 8)),
    ...FP(chestS, [[[430, 244], [452, 246], [488, 270], [506, 312], [484, 328], [456, 300], [436, 270]]]),
    ln(L([[484, 328], [500, 344]]) + L([[364, 440], [414, 456], [450, 436]]) + L([[344, 330], [356, 420]])),
    S([[446, 368], [486, 360], [474, 404], [444, 406]], 'v'), ln(L([[450, 378], [482, 372]]) + L([[448, 388], [479, 382]]) + L([[446, 398], [476, 392]])),
    ...FP([[374, 244], [420, 236], [446, 244], [440, 264], [392, 270]], [[[376, 244], [420, 237], [444, 245], [400, 252]]]),
  ]));
  o.push(part('head', [
    S([[366, 180], [372, 152], [390, 136], [414, 130], [436, 138], [448, 154], [452, 170], [444, 174], [446, 198], [448, 214], [438, 236], [420, 246], [400, 238], [380, 228], [368, 210]]),
    ln(L([[388, 140], [440, 150]]) + L([[372, 186], [366, 200]])),
    S([[436, 174], [450, 172], [450, 196], [436, 198]], 'v'), ac(L([[438, 186], [449, 185]])), af(circ(446, 185, 2.4)),
    ...plate([[428, 200], [448, 198], [450, 214], [440, 236], [422, 244], [416, 222]], 'l', 0, 4), ln(L([[430, 212], [446, 210]])),
    ...plate([[376, 164], [404, 160], [412, 174], [410, 206], [390, 214], [374, 196]], 'l', 0, 4), ln(vents(384, 402, 178, 3, 9)),
    S([[426, 156], [418, 128], [400, 96], [384, 72], [390, 98], [402, 130], [404, 150]], 'l'), ac(L([[414, 146], [408, 124], [390, 86]])),
  ]));
  // two-point carry: right hand on the grip at hip height, stock braced at the hip, barrel down and forward
  const E = [400, 494], FA = -20;                       // elbow centre, forearm swing (degrees)
  const hand = xf([[0, 176]], E[0], E[1], FA)[0];      // grip centre in world space
  const RA = 26, rad = RA * Math.PI / 180;
  const rifleAt = `translate(${f(hand[0] + 31 * Math.sin(rad))} ${f(hand[1] - 31 * Math.cos(rad))}) rotate(${RA})`;
  o.push(part('rifle', [
    ...FP([[-150, -22], [-62, -28], [-42, -10], [-46, 8], [-122, 16], [-154, 4]], [[[-150, -22], [-62, -28], [-56, -18], [-146, -12]]]),
    ln(L([[-150, 0], [-124, 8]])),
    S([[-14, 8], [12, 8], [16, 54], [-6, 54]], 'd'),
    ...FP([[-62, -32], [84, -32], [96, -20], [96, 12], [-50, 12]], [[[-62, -32], [84, -32], [92, -24], [-58, -22]]]),
    ln(P([[-30, -10], [20, -10], [20, 4], [-30, 4]]) + vvents(34, -12, 4, 4, 10)),
    S([[30, 12], [72, 12], [68, 44], [36, 44]], 'd'), ln(hl(36, 68, 22) + hl(37, 67, 32)),
    ...FP([[-6, -48], [58, -48], [70, -38], [70, -32], [-6, -32]], [[[-6, -48], [58, -48], [64, -42], [-6, -42]]]),
    SD(circ(62, -40, 4), 'v'), af(circ(62, -40, 2)),
    ...FP([[96, -24], [206, -22], [216, -14], [216, 8], [96, 10]], [[[96, -24], [206, -22], [212, -17], [96, -14]]]),
    ln(vvents(118, -12, 6, 5, 18) + hl(104, 208, 2)),
    S([[216, -9], [282, -8], [282, 3], [216, 4]], 'd'),
    ...FP([[282, -14], [308, -14], [314, -8], [314, 7], [282, 9]], [[[282, -14], [308, -14], [312, -10], [282, -8]]]), ac(vl(312, -6, 5)),
  ], rifleAt));
  const fore = xf([[-26, 6], [24, 2], [34, 48], [30, 118], [18, 150], [-18, 150], [-28, 112], [-34, 44]], E[0], E[1], FA);
  const foreF = xf([[4, 4], [24, 2], [34, 48], [30, 118], [18, 148], [6, 120], [8, 48]], E[0], E[1], FA);
  o.push(part('arm-r', [
    ...FP([[382, 410], [424, 408], [424, 484], [384, 486]], [[[404, 409], [424, 408], [424, 484], [404, 485]]]),
    SD(circ(E[0], E[1], 22), 'd'), ln(circ(E[0], E[1], 10)),
    S(xf([[-24, -2], [-46, 18], [-40, 56], [-26, 70]], E[0], E[1], FA), 'd'),
    ...FP(fore, [foreF]), ln(P(xf([[-14, 60], [2, 60], [2, 100], [-14, 100]], E[0], E[1], FA))),
    S(xf([[-16, 146], [16, 146], [15, 162], [-15, 162]], E[0], E[1], FA), 'd'),
    ...FP(xf([[-20, 158], [22, 158], [30, 178], [26, 202], [4, 212], [-18, 204], [-26, 180]], E[0], E[1], FA),
      [xf([[-20, 158], [22, 158], [26, 168], [-22, 170]], E[0], E[1], FA)]),
    ln(L(xf([[-22, 184], [28, 184]], E[0], E[1], FA)) + L(xf([[-18, 197], [27, 195]], E[0], E[1], FA))),
  ]));
  const sA = [[342, 268], [364, 244], [418, 230], [454, 238], [468, 264], [458, 300], [410, 312], [354, 318], [326, 316], [336, 290]];
  const sAf = [[364, 244], [418, 230], [454, 238], [468, 264], [412, 258], [352, 274], [342, 268]];
  const sB = [[340, 310], [450, 298], [452, 338], [432, 366], [372, 384], [318, 396], [330, 352]];
  const sBf = [[340, 312], [450, 300], [451, 318], [335, 330]];
  const sC = [[346, 378], [430, 370], [424, 404], [400, 424], [356, 446], [312, 472], [330, 424]];
  const sCf = [[346, 380], [430, 372], [428, 388], [340, 396]];
  o.push(part('binder-r', [
    edge(sC), ...FP(sC, [sCf]), ln(circ(352, 426, 3)),
    edge(sB), ...FP(sB, [sBf]), ln(P([[372, 334], [404, 330], [404, 354], [374, 358]])),
    edge(sA), ...FP(sA, [sAf]), SD(circ(404, 290, 13), 'd'), ln(circ(404, 290, 6) + circ(360, 306, 3) + circ(446, 296, 3)),
    ac(L([[350, 314], [390, 311]])),
  ]));
  return svg('SL-01 ARGUS, right side view with beam rifle', o.join(''));
}

// ---------- BACK (viewer-left is the suit's left) ----------
function back() {
  const o = [];
  const leg = [
    S(knee),                                             // knee guard edges peek past the joint
    ...FP(thigh, [thighF]), S(thighOut, 'd'),
    S(cl([[306, 836], [378, 836], [384, 952], [298, 952]]), 'd'),
    ln(L(cl([[322, 846], [322, 940]])) + L(cl([[358, 846], [358, 940]])) + circ(...cl([[322, 850]])[0], 4) + circ(...cl([[358, 850]])[0], 4) + circ(...cl([[340, 900]])[0], 10)),
    ...FP(calfOut, [calfOutF]), calfSlits, S(calfIn), S(shin),
    ...plate(cl([[312, 996], [368, 996], [376, 1150], [340, 1184], [304, 1150]]), 'd', 0, 5),
    ac(L(cl([[320, 1024], [360, 1024]])) + L(cl([[318, 1046], [362, 1046]])) + L(cl([[317, 1068], [364, 1068]])) + L(cl([[316, 1090], [366, 1090]])) + L(cl([[316, 1112], [367, 1112]]))),
    ln(L(cl([[302, 1030], [300, 1200]])) + L(cl([[378, 1030], [380, 1200]]))),
    S(ankleJ, 'd'), S(foot),
    ...FP(cl([[316, 1284], [364, 1284], [360, 1324], [340, 1340], [320, 1324]]), [cl([[316, 1286], [364, 1286], [363, 1300], [317, 1300]])]),
    ...FP(cl([[306, 1204], [374, 1204], [378, 1250], [302, 1250]]), [cl([[306, 1204], [374, 1204], [376, 1222], [304, 1222]])]),
  ];
  o.push(part('leg-l', leg), part('leg-r', leg, MIRROR));
  o.push(part('waist', [
    S(ab, 'd'), ln(hl(378, 422, 466) + hl(376, 424, 484)),
    ...FP(sideSkirt, [[[346, 504], [308, 508], [298, 534], [345, 528]]], null, 1), ...FP(belt, [sym([[400, 496], [362, 496], [352, 504], [400, 504]])]),
    S(sym([[400, 522], [386, 524], [384, 640], [400, 650]]), 'd'), ln(vents(390, 410, 540, 6, 16)),
    ...FP([[394, 522], [352, 524], [330, 562], [338, 634], [372, 658], [394, 640]], [[[394, 524], [352, 526], [340, 546], [394, 544]]], null, 1),
    ln(P([[352, 596], [378, 596], [378, 618], [354, 618]]), 1),
  ]));
  const arm = [
    SD(circ(262, 300, 30), 'd'), ...FP(upperArm, [[[254, 320], [276, 320], [278, 466], [256, 466]]]), ln(vents(242, 286, 360, 2, 60)),
    S(elbow, 'd'), SD(circ(262, 484, 14)), ln(circ(262, 484, 6)),
    ...FP(forearm, [[[246, 506], [294, 506], [302, 538], [298, 610], [284, 660], [262, 662], [250, 620]]]),
    ...plate([[252, 540], [290, 540], [292, 620], [276, 656], [256, 626]], 'd', 0, 5),
    ...plate(forePlate, 'd', 0, 5), S(wrist, 'd'), ...FP(fist, [[[236, 698], [288, 698], [294, 716], [234, 718]]]),
    ln(L([[240, 730], [290, 730]])),
  ];
  o.push(part('arm-l', arm), part('arm-r', arm, MIRROR));
  o.push(part('chest', [
    S(neckF, 'd'), ln(vents(382, 418, 230, 3, 8)),
    ...FP(chestSil, [sym([[400, 240], [364, 242], [322, 248], [297, 261], [308, 270], [352, 262], [400, 262]])]),
    ...FP([[388, 262], [340, 262], [306, 282], [300, 340], [320, 404], [388, 424]], [[[388, 264], [340, 264], [308, 283], [304, 306], [388, 300]]], null, 1),
    ln(vl(400, 250, 452) + L([[352, 436], [378, 450]]), 0),
    ...FP(collar, [sym([[400, 236], [376, 238], [357, 247], [376, 250], [400, 250]])]), S(collarIn, 'd'),
  ]));
  o.push(part('head', [
    S(helm), ...plate(earF, 'l', 1, 4), ln(vents(338, 352, 184, 3, 9), 1),
    ...plate(sym([[400, 148], [370, 150], [358, 170], [360, 212], [372, 226], [400, 230]]), 'l', 0, 5),
    ln(vents(378, 422, 196, 3, 9)),
    S(crestHalf, 'l', 1),
  ]));
  const binder = [
    edge(bC), ...FP(bC, [bCf]), edge(bB), ...FP(bB, [bBf]), edge(bA), ...FP(bA, [bAf]),
    ln(circ(206, 282, 3) + circ(268, 280, 3) + L([[152, 422], [238, 426]])),
    S([[176, 428], [222, 430], [218, 452], [182, 452]], 'v'), ac(vvents(186, 434, 448, 4, 9)),
  ];
  o.push(part('binder-l', binder), part('binder-r', binder, MIRROR));
  o.push(part('backpack', [
    ...FP(finF, [[[250, 88], [266, 98], [292, 128], [334, 192], [374, 262], [362, 266], [322, 196], [282, 128]]], null, 1),
    ln(L([[362, 280], [320, 200], [262, 100]]), 1),
    ...FP(sym([[400, 258], [360, 260], [336, 274], [326, 300], [324, 436], [334, 476], [352, 492], [400, 494]]), [sym([[400, 260], [360, 262], [337, 275], [330, 292], [362, 284], [400, 284]])]),
    ...plate(sym([[400, 290], [374, 292], [362, 310], [362, 400], [374, 420], [400, 424]]), 'l', 0, 5),
    ln(vents(336, 354, 318, 6, 14), 1), ln(hl(380, 420, 440) + hl(376, 424, 452)),
    SD(circ(364, 282, 14), 'd', 1), ln(circ(364, 282, 6), 1),
    S([[336, 290], [352, 300], [346, 316], [330, 306]], 'v', 1), ac(L([[334, 300], [348, 308]]), 1),
    S([[330, 472], [382, 472], [394, 524], [318, 524]], 'd', 1), ln(hl(328, 386, 490), 1), SD(ell(356, 524, 38, 7), 'v', 1), ac(vvents(338, 510, 522, 5, 9), 1),
  ]));
  return svg('SL-01 ARGUS, back view', o.join(''));
}

// ---------- DECALS (approved; keep byte-identical) ----------
// stroke font on a 6x10 grid (no <text>): only the glyphs we need
const G = {
  S: 'M6 1L5 0H1L0 1V4L1 5H5L6 6V9L5 10H1L0 9', L: 'M0 0V10H6', '-': 'M1 5H5',
  0: 'M1 0H5L6 1V9L5 10H1L0 9V1ZM1.5 8.5L4.5 1.5', 1: 'M1 2L3 0V10M1 10H5',
  N: 'M0 10V0L6 10V0', O: 'M1 0H5L6 1V9L5 10H1L0 9V1Z', T: 'M0 0H6M3 0V10', E: 'M6 0H0V10H6M0 5H4.5', P: 'M0 10V0H5L6 1V4L5 5H0', ' ': '',
};
const word = (s, x, y, k, gap = 3) => [...s].map((c, i) => G[c] ? `<path transform="translate(${f(x + i * (6 + gap) * k)} ${y}) scale(${k})" d="${G[c]}"/>` : '').join('');
function decals() {
  const hex = [[32, 4], [56.2, 18], [56.2, 46], [32, 60], [7.8, 46], [7.8, 18]];
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<symbol id="unit-mark" viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">`
    + `<path d="${P(hex)}"/><path stroke-width="1" d="${P(inset(hex, 4))}"/>`
    + `<path d="M13 32Q32 15 51 32Q32 49 13 32Z"/><path d="M4 32H13M51 32H60"/>`
    + `<circle cx="32" cy="32" r="7"/><circle cx="32" cy="32" r="2.6" fill="currentColor" stroke="none"/></g></symbol>
<symbol id="serial" viewBox="0 0 164 48"><g fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="square" stroke-linejoin="miter">${word('SL-01', 4.4, 4, 4, 2.2)}</g></symbol>
<symbol id="caution-chevron" viewBox="0 0 64 48"><g fill="none" stroke="#FFB02E" stroke-width="2" stroke-linejoin="miter">`
    + `<path d="M32 4L60 30V44L32 20L4 44V30Z"/><path stroke-width="1.2" d="${P(inset([[32, 4], [60, 30], [60, 44], [32, 20], [4, 44], [4, 30]], 4))}"/></g></symbol>
<symbol id="no-step" viewBox="0 0 120 40"><g fill="none" stroke="currentColor" stroke-linejoin="miter">`
    + `<path stroke-width="1.5" d="M8 2H112L118 8V32L112 38H8L2 32V8Z"/>`
    + `<g stroke-width=".7" stroke-linecap="square">${word('NO STEP', 17.7, 12.5, 1.5, 2.4)}</g></g></symbol>
</svg>\n`;
}

fs.mkdirSync(MS, { recursive: true });
const files = { 'sl01-front.svg': front(), 'sl01-side.svg': side(), 'sl01-back.svg': back(), 'decals.svg': decals() };
for (const [n, s] of Object.entries(files)) { fs.writeFileSync(path.join(MS, n), s); console.log(n, (s.length / 1024).toFixed(1) + 'KB'); }

// ---------- check pages (tests/out is git-ignored) ----------
fs.mkdirSync(OUT, { recursive: true });
const guides = [72, 234, 496, 905, 1340].map(y => `<div class="g" style="top:${y}px"><b>${y}</b></div>`).join('');
const views = ['front', 'side', 'back'];
fs.writeFileSync(path.join(OUT, 'ms-sheet.html'), `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#060A12;width:2400px}.row{position:relative;display:flex;height:1400px}
.row img{width:800px;height:1400px;display:block}.g{position:absolute;left:0;right:0;border-top:1px dashed rgba(255,176,46,.35)}
.g b{font:11px monospace;color:#FFB02E;position:absolute;left:4px;top:-14px;font-weight:400}</style>
<div class="row">${views.map(v => `<img src="../../img/ms/sl01-${v}.svg">`).join('')}${guides}</div>`);
const dec = fs.readFileSync(path.join(MS, 'decals.svg'), 'utf8');
fs.writeFileSync(path.join(OUT, 'ms-detail.html'), `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#060A12;width:1400px;color:#DDE7EE;padding:20px;box-sizing:border-box}
.c{display:inline-block;width:400px;height:440px;overflow:hidden;position:relative;margin:0 20px 20px 0;outline:1px solid #1F4E5F}
.c img{position:absolute;width:1600px;height:2800px;left:-600px;top:-110px}.d{display:flex;gap:40px;align-items:center}
.d svg{outline:1px dashed #1F4E5F}</style>
${views.map(v => `<div class="c"><img src="../../img/ms/sl01-${v}.svg"></div>`).join('')}
<div style="display:none">${dec}</div><div class="d">
<svg width="256" height="256" style="color:#DDE7EE"><use href="#unit-mark"/></svg>
<svg width="704" height="192" style="color:#DDE7EE"><use href="#serial"/></svg></div><div class="d" style="margin-top:30px">
<svg width="256" height="192"><use href="#caution-chevron"/></svg>
<svg width="480" height="160" style="color:#FFB02E"><use href="#no-step"/></svg>
<svg width="64" height="64" style="color:#8CFFC1"><use href="#unit-mark"/></svg>
<svg width="132" height="36" style="color:#DDE7EE"><use href="#serial"/></svg></div>`);
