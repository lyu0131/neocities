#!/usr/bin/env python3
"""Generates site4/img/pano.svg (seeded, deterministic).  python site4/tools/gen_pano.py
Seam rule: everything is periodic in x with period W.  Full-width shapes are sampled from
periodic functions (integer-frequency sines, circular gaussians); every placed element is
emitted at each image (x, x-W, x+W) that intersects [0, W).  So x=9600 and x=0 match by construction."""
import math, os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

W, H, HZ = 9600, 2000, 1150
rnd = random.Random(1979)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'img', 'pano.svg')

NIGHT, INDIGO, TEAL, SOD, WHITE = '#060A12', '#0E1830', '#1F4E5F', '#FF9A3D', '#FFFFFF'
def rgb(h): h = h.lstrip('#'); return [int(h[i:i + 2], 16) for i in (0, 2, 4)]
def mix(a, b, t):
    a, b = rgb(a), rgb(b)
    return '#%02X%02X%02X' % tuple(max(0, min(255, round(a[i] + (b[i] - a[i]) * t))) for i in range(3))
def f(v, p=1):
    s = ('%.*f' % (p, v)).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

LAMP = mix(SOD, WHITE, .45)          # hot sodium core
GLINT = mix(TEAL, WHITE, .45)        # teal glint on water
BEAM = mix(TEAL, WHITE, .7)          # searchlight
FOG = mix(INDIGO, TEAL, .55)
NEAR = mix(NIGHT, INDIGO, .35)       # nearest silhouettes

D, S = [], []                        # defs, body
add = S.append

def cdist(a, b): d = abs(a - b) % W; return min(d, W - d)
def gauss(x, c, s): return math.exp(-(cdist(x, c) / s) ** 2)
TARGETS = [8213, 0, 1387]            # PILOT, MISSIONS, HANGAR (UNKNOWN at 4800 is the enemy suit itself)
def calm(x, s=300): return max(gauss(x, t, s) for t in TARGETS)
def images(x0, x1):
    o = [0]
    if x1 > W: o.append(-W)
    if x0 < 0: o.append(W)
    return o
def ps(pts): return ' '.join('%s %s' % (f(x), f(y)) for x, y in pts)

# ---------------------------------------------------------------- gradients
def stops(st): return ''.join('<stop offset="%s" stop-color="%s"%s/>' % (f(o, 3), c, '' if a == 1 else ' stop-opacity="%s"' % f(a, 2)) for o, c, a in st)
def vgrad(id, y1, y2, st):
    D.append('<linearGradient id="%s" x1="0" y1="%s" x2="0" y2="%s" gradientUnits="userSpaceOnUse">%s</linearGradient>' % (id, f(y1), f(y2), stops(st)))
def hgrad(id, st):  # periodic across the strip
    D.append('<linearGradient id="%s" x1="0" y1="0" x2="%d" y2="0" gradientUnits="userSpaceOnUse" spreadMethod="repeat">%s</linearGradient>' % (id, W, stops(st)))
def bgrad(id, st, x2=0, y2=1):  # per-shape
    D.append('<linearGradient id="%s" x1="0" y1="0" x2="%s" y2="%s">%s</linearGradient>' % (id, x2, y2, stops(st)))
def rgrad(id, c, st=((0, 1), (.3, .55), (.65, .16), (1, 0))):
    D.append('<radialGradient id="%s">%s</radialGradient>' % (id, stops([(o, c, a) for o, a in st])))

rgrad('gS', SOD); rgrad('gT', GLINT); rgrad('gW', WHITE)
def glow(x, y, rx, ry, g, op):
    for o in images(x - rx, x + rx):
        add('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#%s)" opacity="%s"/>' % (f(x + o), f(y), f(rx), f(ry), g, f(op, 2)))
D.append('<symbol id="blk" overflow="visible"><circle r="16" fill="url(#gW)" opacity=".45"/><circle r="3" fill="%s"/></symbol>' % WHITE)
D.append('<symbol id="lp" overflow="visible"><circle r="15" fill="url(#gS)" opacity=".6"/><circle r="2.6" fill="%s"/></symbol>' % LAMP)
D.append('<symbol id="lq" overflow="visible"><circle r="9" fill="url(#gS)" opacity=".45"/><circle r="2" fill="%s"/></symbol>' % SOD)

# ---------------------------------------------------------------- sky
vgrad('sky', 0, HZ, [(0, NIGHT, 1), (.38, mix(NIGHT, INDIGO, .85), 1), (.72, mix(INDIGO, TEAL, .14), 1), (1, mix(INDIGO, TEAL, .32), 1)])
add('<rect x="-10" y="-10" width="%d" height="%d" fill="url(#sky)"/>' % (W + 20, HZ + 20))
for x, rx, ry, op in [(0, 2900, 600, .34), (650, 1000, 420, .2), (8900, 1000, 420, .2), (2750, 1100, 360, .17),
                      (6950, 1000, 320, .12), (7700, 800, 360, .15)]:
    glow(x, HZ, rx, ry, 'gS', op)
glow(4800, 1000, 1000, 380, 'gT', .2)    # cold haze the enemy stands against

# ---------------------------------------------------------------- searchlights (drawn before the deck so the tips vanish into it)
bgrad('beam', [(0, BEAM, 0), (.55, BEAM, .10), (1, BEAM, .30)])
BEAMS = [(2330, 1100, -260, 430), (3880, 1110, 420, 480), (6880, 1105, -380, 430)]
for bx, by, dx, ty in BEAMS:
    for o in images(min(bx, bx + dx) - 80, max(bx, bx + dx) + 80):
        x = bx + o
        add('<path d="M%s %sL%s %s %s %s %s %sZ" fill="url(#beam)"/>' % (f(x - 5), f(by), f(x + dx - 70), f(ty), f(x + dx + 70), f(ty), f(x + 5), f(by)))
        add('<path d="M%s %sL%s %s %s %s %s %sZ" fill="url(#beam)" opacity=".7"/>' % (f(x - 2), f(by), f(x + dx - 16), f(ty), f(x + dx + 16), f(ty), f(x + 2), f(by)))

# rain curtains hanging from the deck: soft-edged, fading toward the sea
bgrad('shaft', [(0, GLINT, 0), (.5, GLINT, .09), (1, GLINT, 0)], x2=1, y2=0)
for x, y, w, sl in [(1900, 560, 260, 60), (3450, 600, 340, 80), (5450, 560, 420, 70), (6250, 540, 260, 60), (4050, 600, 200, 50)]:
    k = sl / (HZ - y)
    for o in images(x, x + w + sl):
        add('<rect width="%d" height="%d" fill="url(#shaft)" transform="translate(%s %d) skewX(%s)"/>' % (w, HZ - y, f(x + o), y, f(math.degrees(math.atan(k)), 2)))

# ---------------------------------------------------------------- storm deck: four billowed layers, far (lowest) first, near (highest) last
def terms(ks):
    return [(k, k ** -.75 * rnd.uniform(.7, 1.3), rnd.uniform(0, math.pi)) for k in ks]
def billow(T):
    tot = sum(w for _, w, _ in T)
    return lambda x: sum(w * abs(math.sin(math.pi * k * x / W + p)) for k, w, p in T) / tot
def wave(ks):  # smooth periodic signal, roughly in [-1, 1]
    T = [(k, rnd.uniform(.6, 1.2), rnd.uniform(0, 2 * math.pi)) for k in ks]
    tot = sum(w for _, w, _ in T)
    return lambda x: sum(w * math.sin(2 * math.pi * k * x / W + p) for k, w, p in T) / tot
def smooth(t): t = max(0., min(1., t)); return t * t * (3 - 2 * t)
def edge_d(fn, top=-30, step=12):  # step divides W, so both ends sample the same x (mod W)
    xs = list(range(-24, W + 25, step)); ys = [round(fn(x)) for x in xs]
    rel = ' '.join('%d %d' % (step, ys[i] - ys[i - 1]) for i in range(1, len(xs)))
    return 'M-24 %dV%dl%sV%dZ' % (top, ys[0], rel, top)
def warm(x):  # orange under-light only over the city (x 8000..1600, wrapping) and the dock; teal elsewhere
    return cdist(x, 0) < 1650 or 1850 < x < 3750
rgrad('gC', mix(TEAL, WHITE, .22))
def calmw(x): return calm(x, 560)

def lit_cloud(cid, d, lit, body, step, glows):
    """A cloud whose underside glows softly: a lit base with glows clipped into it, then the body
    stacked upward in eight partial-opacity steps, so the light fades up into the cloud (no rim line)."""
    D.append('<path id="%s" d="%s"/>' % (cid, d))
    D.append('<clipPath id="k%s"><use href="#%s"/></clipPath>' % (cid, cid))
    add('<use href="#%s" fill="%s"/>' % (cid, lit))
    add('<g clip-path="url(#k%s)">' % cid)
    for g in glows: glow(*g)
    add('</g>')
    for k in range(1, 9):
        add('<use href="#%s" fill="%s" transform="translate(0 %d)"%s/>' % (cid, body, -k * step, '' if k == 8 else ' opacity=".3"'))

def under_glows(edge, pres, strength, avoid=()):
    out, x = [], rnd.uniform(0, 300)
    while x < W:
        if pres(x) > .6 and all(cdist(x, a) > r for a, r in avoid):
            w_ = warm(x); ry = rnd.uniform(40, 95)
            out.append((x, edge(x) + ry * .3, rnd.uniform(160, 520), ry, 'gS' if w_ else 'gC',
                        strength * rnd.uniform(.3, 1) * (1 if w_ else .7)))
        x += rnd.uniform(200, 560)
    return out

MASSES = [(2150, 650, 772, 88), (3650, 850, 800, 104), (5750, 700, 782, 92), (6380, 480, 728, 70), (7330, 450, 752, 66)]
def c4_pres(x):  # the lowest layer only survives over the city and as a few islands; elsewhere it opens into sky
    return smooth((max(gauss(x, 0, 2300), gauss(x, 3050, 330), gauss(x, 5250, 330), gauss(x, 6950, 300)) - .35) / .3)
BANDS = [  # id, base(x), amplitude, glow step, body top/bottom colour, glow strength, presence
    ('c4', lambda x: 610 + 70 * gauss(x, 3050, 500) + 60 * gauss(x, 6950, 500) - 110 * calmw(x), 150, 6,
     (mix(INDIGO, TEAL, .05), mix(INDIGO, TEAL, .2)), .62, c4_pres),
    ('c3', lambda x: 480 + 60 * gauss(x, 2700, 900) + 70 * gauss(x, 6600, 800) - 60 * calmw(x), 160, 5,
     (mix(NIGHT, INDIGO, .8), mix(INDIGO, TEAL, .12)), .46, None),
    ('c2', lambda x: 360 + 60 * gauss(x, 4800, 1600) - 40 * calmw(x), 150, 5,
     (mix(NIGHT, INDIGO, .55), mix(INDIGO, TEAL, .05)), .3, None),
    ('c1', lambda x: 215 + 50 * gauss(x, 4800, 1600), 130, 4,
     (NIGHT, mix(NIGHT, INDIGO, .7)), .18, 'full'),
]
for bid, base, amp, step, (ct, cb), gs, pres in BANDS:
    big = billow(terms([rnd.choice(r) for r in ([3, 4, 5], [7, 9, 11], [15, 17, 19], [27, 31], [47, 53], [83, 89])]))
    ampf = wave([2, 3, 5])
    if pres is None:                        # random gaps: the layer tucks up behind the nearer one
        pres = (lambda x, w=wave([2, 3, 4]): smooth((w(x) + .42) / .28))
    elif pres == 'full':
        pres = lambda x: 1.
    edge = lambda x, b=base, g=big, a=ampf, p=pres, am=amp: (b(x) - 280) + (280 + am * (.7 + .5 * a(x)) * g(x)) * p(x)
    lo = base(4800) + amp
    vgrad('b' + bid, lo - 460, lo, [(0, ct, 1), (1, cb, 1)])
    glows = under_glows(edge, pres, gs, [(4800, 260)] if bid == 'c4' else ())
    for x, rx in [(0, 1800), (700, 900), (8900, 900), (2800, 900)]:       # broad city glow on the deck
        if pres(x) > .5: glows.append((x, base(x) + amp * .8, rx, 170, 'gS', gs * .55))
    lit_cloud(bid, edge_d(edge), mix(cb, TEAL, .22), 'url(#b%s)' % bid, step, glows)
    if bid == 'c4':                         # isolated masses floating in the openings of the lowest layer
        for i, (x0, w, yb, h) in enumerate(MASSES):
            kb, kt = rnd.uniform(0, math.pi), rnd.uniform(0, math.pi)
            n = int(w / 12); bot, top = [], []
            for j in range(n + 1):
                t = j / n; s_ = math.sin(math.pi * t)
                bot.append((x0 + w * t, yb - h * .55 * (1 - s_ ** .4) + 12 * abs(math.sin(math.pi * 5 * t + kb))))
                top.append((x0 + w * t, yb - h * s_ ** .6 - 16 * abs(math.sin(math.pi * 4 * t + kt)) - 10))
            d = 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in bot + top[::-1]) + 'Z'
            xc = x0 + w / 2; w_ = warm(xc)
            gl = [(xc + rnd.uniform(-.25, .25) * w, yb + 10, w * rnd.uniform(.35, .55), 50, 'gS' if w_ else 'gC', .55 if w_ else .4)]
            lit_cloud('m%d' % i, d, mix(cb, TEAL, .22), 'url(#bc4)', 4, gl)

# low scud wisps, kept clear of the target windows and the enemy's head
bgrad('scud', [(0, mix(INDIGO, TEAL, .2), 0), (.6, mix(INDIGO, TEAL, .34), .7), (1, mix(TEAL, SOD, .18), .8)])
for x, y, w, h in [(2050, 720, 900, 30), (3300, 790, 1000, 40), (5300, 760, 1100, 36), (6250, 720, 800, 26), (7200, 745, 560, 22)]:
    for o in images(x, x + w):
        a = x + o
        add('<path d="M%s %sC%s %s %s %s %s %sC%s %s %s %s %s %sZ" fill="url(#scud)"/>' % (
            f(a), f(y), f(a + w * .3), f(y - h), f(a + w * .7), f(y - h * .7), f(a + w), f(y - 4),
            f(a + w * .7), f(y + h * .5), f(a + w * .3), f(y + h * .35), f(a), f(y)))
for bx, by, dx, ty in BEAMS:
    glow(bx + dx, ty + 16, 150, 50, 'gT', .3)
for x, y in [(2180, 640), (5720, 600), (7330, 560)]:
    add('<use href="#blk" x="%d" y="%d"/>' % (x, y))

# ---------------------------------------------------------------- hills and the low headland behind
def ridge(hfun, step=40):
    return 'M-40 %dL%s %d %dZ' % (HZ + 10, ps([(x, HZ - hfun(x)) for x in range(-40, W + 41, step)]), W + 40, HZ + 10)
def hills_far(x):
    w = .9 * gauss(x, 6700, 1100) + .5 * gauss(x, 300, 1500) + .6 * gauss(x, 2500, 650) + .5 * gauss(x, 8500, 900)
    n = 125 + 60 * math.sin(2 * math.pi * 3 * x / W + 1) + 35 * math.sin(2 * math.pi * 7 * x / W + 2) + 16 * math.sin(2 * math.pi * 19 * x / W)
    return max(0, w * n)
def headland(x):
    return max(0, 30 * gauss(x, 4650, 800) + 16 * gauss(x, 5350, 260) + 5 * math.sin(2 * math.pi * 23 * x / W))
bgrad('hill', [(0, mix(INDIGO, TEAL, .22), 1), (1, mix(INDIGO, TEAL, .42), 1)])
add('<path d="%s" fill="url(#hill)"/>' % ridge(hills_far))
add('<path d="%s" fill="%s"/>' % (ridge(headland), mix(NIGHT, INDIGO, .8)))

def dots(pts, col, op, s=3):
    if pts:
        pts = pts + [(x - W, y) for x, y in pts if x > W - s]
        add('<path fill="%s" opacity="%s" d="%s"/>' % (col, f(op, 2), ''.join('M%s %sh%sv%sh-%sz' % (f(x), f(y), s, s, s) for x, y in pts)))
hl = {.3: [], .55: [], .85: []}
for _ in range(1100):
    x = rnd.uniform(0, W); h = hills_far(x)
    if h < 35: continue
    hl[rnd.choice([.3, .3, .55, .85])].append((x, HZ - rnd.uniform(4, h - 6)))
for x0, y0, legs in [(6350, 1128, 5), (7050, 1130, 4), (2420, 1130, 3), (8300, 1128, 3)]:   # switchback roads
    x, y = x0, y0
    for leg in range(legs):
        dx = (1 if leg % 2 == 0 else -1) * rnd.uniform(90, 160)
        for i in range(14):
            px, py = x + dx * i / 14, y - 24 * i / 14
            if HZ - py < hills_far(px) - 4: hl[.85].append((px % W, py))
        x, y = x + dx, y - 24
for op, pts in hl.items(): dots(pts, SOD, op)
add('<use href="#blk" x="6620" y="%s" transform="scale(1)"/>' % f(HZ - hills_far(6620) - 60))
add('<rect x="6618" y="%s" width="4" height="60" fill="%s"/>' % (f(HZ - hills_far(6620) - 60), mix(INDIGO, TEAL, .22)))

# ---------------------------------------------------------------- skyline (windows are patterns; each building translates so its grid aligns)
def win_pattern(pid, cw, ch, ww, wh, cols, rows, plit, strip=False):
    groups = {}
    for r in range(rows):
        pr = plit * rnd.uniform(.15, 1.9)
        c = 0
        while c < cols:
            run = rnd.randint(2, 6) if strip else 1
            if rnd.random() < pr:
                col = SOD if rnd.random() > .1 else mix(TEAL, WHITE, .55)
                op = rnd.choice([.3, .5, .5, .75, 1])
                x = c * cw + (cw - ww) / 2; y = r * ch + (ch - wh) / 2
                wr = min(run, cols - c) * cw - (cw - ww)
                groups.setdefault((col, op), []).append('M%s %sh%sv%sh-%sz' % (f(x), f(y), f(wr), f(wh), f(wr)))
            c += run
    body = ''.join('<path fill="%s" opacity="%s" d="%s"/>' % (c, f(o, 2), ''.join(v)) for (c, o), v in sorted(groups.items()))
    D.append('<pattern id="%s" width="%s" height="%s" patternUnits="userSpaceOnUse">%s</pattern>' % (pid, f(cols * cw), f(rows * ch), body))

def env_tower(x):
    return max(400 * gauss(x, 640, 400), 360 * gauss(x, 8900, 360), 200 * gauss(x, 0, 1100), 280 * gauss(x, 7700, 320),
               240 * gauss(x, 1960, 280), 150 * gauss(x, 2650, 300))
def env_low(x):
    return max(150 * gauss(x, 0, 2100), 100 * gauss(x, 2750, 650), 80 * gauss(x, 6950, 650), 110 * gauss(x, 7800, 550))
def density(x):
    return max(gauss(x, 0, 2000), .85 * gauss(x, 2750, 650), .55 * gauss(x, 6950, 700), .8 * gauss(x, 7800, 520))
def cap(x):  # keep the sky behind PILOT / MISSIONS / HANGAR clear: roofs stay below y~1050 there
    c = calm(x, 330)
    return 100 + (1 - c) ** 2 * 2000

REFL, SMEAR = [], []
LAYERS = [  # name, cell w/h, window w/h, cols, tower k, low k, grads, window op, roof, reflection
    ('f', 8, 10, 4, 5, (4, 10), 1.0, 1.0, [(mix(INDIGO, TEAL, .26), mix(INDIGO, TEAL, .46)), (mix(INDIGO, TEAL, .34), mix(INDIGO, TEAL, .5))], .55, 8, 0),
    ('m', 12, 15, 6, 8, (3, 8), .75, .8, [(mix(NIGHT, INDIGO, .8), mix(INDIGO, TEAL, .24)), (mix(NIGHT, INDIGO, .95), mix(INDIGO, TEAL, .3))], .85, 10, .5),
    ('n', 16, 20, 8, 10, (3, 9), 0, .6, [(NEAR, mix(NIGHT, INDIGO, .75)), (mix(NIGHT, INDIGO, .5), mix(INDIGO, TEAL, .12))], 1, 12, .8),
]
def building(name, x, w, h, rows, roof, cw, ch, grad, gt, pat, wop, feat):
    kx, ky = rnd.randint(0, 11), rnd.randint(0, 13)
    op = wop * rnd.uniform(.65, 1)
    for o in images(x - 12, x + w + 12):
        g = '<g transform="translate(%s %s)">%s<rect width="%s" height="%s" fill="url(#%s)"/>' % (f(x + o), f(HZ - h), feat, f(w), f(h + 2), grad)
        if pat:
            g += '<rect x="%d" y="%d" width="%s" height="%s" fill="url(#%s)" opacity="%s" transform="translate(%d %d)"/>' % (
                kx * cw, ky * ch, f(w), f(rows * ch), pat, f(op, 2), -kx * cw, roof - ky * ch)
        g += '<rect width="%s" height="2" fill="%s" opacity=".45"/></g>' % (f(w), mix(gt, TEAL, .7))
        add(g)

for name, cw, ch, ww, wh, cr, tk, lk, grads, wop, roof, refl in LAYERS:
    for v in range(3): win_pattern('w%s%d' % (name, v), cw, ch, ww, wh, 12, 14, .42 if name != 'n' else .3)
    win_pattern('w%s3' % name, cw, ch, ww, wh, 12, 14, .45, strip=True)
    for i, (gt, gb) in enumerate(grads): bgrad('B%s%d' % (name, i), [(0, gt, 1), (1, gb, 1)])
    add('<g id="sky-%s">' % name)
    x = rnd.uniform(-70, -20)   # start left of the wrap so no roof edge lands exactly on x=0
    while x < W:
        n = rnd.randint(*cr); w = n * cw; xc = x + w / 2
        d = density(xc)
        if d < .05 and rnd.random() > d * 12:
            x += rnd.uniform(80, 260); continue
        tall = env_tower(xc) * tk * rnd.uniform(.3, 1) * (rnd.random() < .75)
        low = env_low(xc) * lk * rnd.uniform(.3, 1)
        h = min(max(tall, low), cap(xc) * (1.25 if name == 'f' else 1))
        if h < ch * 2:
            x += w * .7; continue
        rows = int((h - roof) / ch); h = roof + rows * ch
        gi = rnd.randint(0, 1); gt = grads[gi][0]
        feat = ''
        if h > 150 and rnd.random() < .75:
            k = rnd.random()
            if k < .45:
                L = rnd.uniform(30, 80)
                feat = '<rect x="%s" y="%s" width="4" height="%s" fill="%s"/>' % (f(w / 2 - 2), f(-L), f(L), gt)
                if h > 250: feat += '<use href="#blk" x="%s" y="%s" transform="scale(.6)"/>' % (f(w / 2 / .6), f(-L / .6))
            elif k < .75:
                cwid = w * rnd.uniform(.4, .7)
                feat = '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"/>' % (f((w - cwid) / 2), -ch * 2, f(cwid), ch * 2, gt)
            else:
                s = w * rnd.uniform(.25, .5)
                feat = '<path d="M0 0L%s %s %s 0Z" fill="%s"/>' % (f(w if rnd.random() < .5 else 0), f(-s), f(w), gt)
        pat = None if rnd.random() < .07 else 'w%s%d' % (name, rnd.choice([0, 1, 2, 3] if h > 120 else [0, 1, 2]))
        building(name, x, w, h, rows, roof, cw, ch, 'B%s%d' % (name, gi), gt, pat, wop, feat)
        if refl and pat and rnd.random() < d * .8: SMEAR.append((xc, w * .55, refl * min(1, h / 250 + .35)))
        x += w + (rnd.uniform(0, 5) if d > .5 else rnd.uniform(0, 50 * (1 - d)))
    add('</g>')
    if name == 'f':
        # landmark towers framing the targets: tapered crowns, lit crown bands, spires
        for lx, lw, lh in [(600, 64, 470), (8860, 56, 420), (1930, 48, 330), (7680, 52, 350)]:
            top = HZ - lh
            for o in images(lx - 10, lx + lw + 10):
                a = lx + o
                add('<path d="M%s %sL%s %s %s %s %s %s %s %sZ" fill="url(#Bm0)"/>' % (f(a), HZ, f(a), f(top + 40), f(a + lw / 2), f(top), f(a + lw), f(top + 40), f(a + lw), HZ))
                add('<rect x="%s" y="%s" width="%s" height="%s" fill="url(#wm3)" opacity=".8"/>' % (f(a + 6), f(top + 60), f(lw - 12), f(lh - 60)))
                add('<path d="M%s %sh%sv5h-%sz M%s %sh%sv4h-%sz" fill="%s" opacity=".85"/>' % (f(a + 4), f(top + 44), f(lw - 8), f(lw - 8), f(a + 6), f(top + 52), f(lw - 12), f(lw - 12), SOD))
                add('<rect x="%s" y="%s" width="3" height="%s" fill="%s" opacity=".35"/>' % (f(a + 2), f(top + 40), f(lh - 40), GLINT))
                add('<rect x="%s" y="%s" width="4" height="90" fill="%s"/>' % (f(a + lw / 2 - 2), f(top - 90), mix(NIGHT, INDIGO, .95)))
                add('<use href="#blk" x="%s" y="%s"/>' % (f(a + lw / 2), f(top - 90)))
            glow(lx + lw / 2, top + 48, 90, 30, 'gS', .35)
            SMEAR.append((lx + lw / 2, lw * .7, .8))
        vgrad('fog1', 960, HZ, [(0, FOG, 0), (.7, FOG, .3), (1, FOG, .5)])
        add('<rect x="-10" y="960" width="%d" height="200" fill="url(#fog1)"/>' % (W + 20))
    elif name == 'm':
        vgrad('fog2', 1050, HZ, [(0, FOG, 0), (1, FOG, .4)])
        add('<rect x="-10" y="1050" width="%d" height="110" fill="url(#fog2)"/>' % (W + 20))
        # second row of street lights, glimpsed between the waterfront blocks
        dots([(x, HZ - rnd.uniform(18, 40)) for x in range(0, W, 9) if rnd.random() < density(x) * .5], SOD, .8, 3)
        for x, rx, op in [(0, 1800, .22), (700, 700, .14), (8900, 700, .14), (2750, 800, .12), (7700, 700, .12), (6950, 600, .08)]:
            glow(x, HZ - 10, rx, 80, 'gS', op)

# ---------------------------------------------------------------- bridge on the right quarter (far layer)
BR0, BR1, DECK = 2980, 4080, 1086
p = ['M%d %dH%dv6H%dZ' % (BR0, DECK, BR1, BR0)]
for px in (3330, 3780): p.append('M%d %dh10v%dh-10Z' % (px - 5, 935, HZ - 935))
for x in range(BR0 + 120, BR1 - 60, 240): p.append('M%d %dh6v%dh-6Z' % (x, DECK + 6, HZ - DECK - 6))
add('<path fill="%s" d="%s"/>' % (mix(INDIGO, TEAL, .22), ''.join(p)))
c = ''.join('M%d %dL%d %d' % (px, 945 + i * 3, px + s * i * 34, DECK) for px in (3330, 3780) for i in range(1, 8) for s in (-1, 1))
add('<path d="%s" stroke="%s" stroke-width="2" opacity=".28" fill="none"/>' % (c, GLINT))
dots([(x, DECK - 4) for x in range(BR0 + 10, BR1, 22)], LAMP, .9, 4)
for x in range(BR0 + 10, BR1, 66): glow(x + 2, DECK - 2, 16, 10, 'gS', .5)
for px in (3330, 3780): add('<use href="#blk" x="%d" y="933"/>' % px)
REFL += [(x, .3) for x in range(BR0 + 30, BR1, 110)]

# ---------------------------------------------------------------- waterfront: quay line and sodium lamps at uneven spacing
add('<rect x="-10" y="%d" width="%d" height="6" fill="%s"/>' % (HZ - 4, W + 20, mix(NIGHT, INDIGO, .6)))
x = rnd.uniform(0, 30)
while x < W:
    d = density(x)
    if d > .12 and rnd.random() < d + .1:
        big = rnd.random() < .45
        for o in images(x - 15, x + 15): add('<use href="#%s" x="%s" y="%d"/>' % ('lp' if big else 'lq', f(x + o), HZ - 6))
        if big and rnd.random() < .5: REFL.append((x, rnd.uniform(.5, .95)))
    x += rnd.uniform(14, 60)

# ---------------------------------------------------------------- sea
# the strip's bottom edge is where the floor cap joins, so it must not fall to pure
# night or looking down reads as a void instead of water
vgrad('sea', HZ, H, [(0, mix(INDIGO, TEAL, .34), 1), (.05, mix(NIGHT, INDIGO, .85), 1), (.45, mix(NIGHT, INDIGO, .55), 1), (1, mix(NIGHT, INDIGO, .42), 1)])
add('<rect x="-10" y="%d" width="%d" height="%d" fill="url(#sea)"/>' % (HZ + 2, W + 20, H - HZ + 8))
D.append('<clipPath id="kw"><rect x="-10" y="%d" width="%d" height="%d"/></clipPath>' % (HZ + 1, W + 20, H - HZ))
add('<g clip-path="url(#kw)">')
for x, rx, ry, op in [(0, 2600, 230, .28), (650, 800, 150, .16), (8900, 800, 150, .16), (2750, 1000, 130, .14), (7200, 1000, 110, .1)]:
    glow(x, HZ + 12, rx, ry, 'gS', op)
glow(4800, HZ + 10, 900, 90, 'gT', .14)
add('<rect x="-10" y="%d" width="%d" height="3" fill="%s" opacity=".22"/>' % (HZ + 2, W + 20, GLINT))

# soft vertical smears under the lit city
for x, w, s in SMEAR:
    glow(x, HZ, w * .6, 90 + 280 * s * rnd.uniform(.6, 1), 'gS', min(.5, s * .5))

# reflection columns: broken sodium dashes that widen and fade with depth
def refl_symbol(sid, L):
    groups = {.8: [], .45: [], .2: []}
    y = 3
    while y < L:
        t = y / L
        w = rnd.uniform(4, 13) * (1 + t * 1.3); x = rnd.gauss(0, 1.5 + t * 6) - w / 2
        groups[.8 if t < .25 else .45 if t < .6 else .2].append('M%s %sh%sv3h-%sz' % (f(x), f(y), f(w), f(w)))
        y += rnd.uniform(5, 11) * (1 + t * 1.6)
    D.append('<symbol id="%s" overflow="visible">%s</symbol>' % (sid, ''.join('<path fill="%s" opacity="%s" d="%s"/>' % (SOD, f(o, 2), ''.join(v)) for o, v in groups.items())))
for i, L in enumerate([120, 180, 250, 320, 400]): refl_symbol('r%d' % i, L)
for x, s in REFL:
    k, op = min(4, int(s * 4.5 * rnd.uniform(.6, 1.1))), min(1, s * rnd.uniform(.6, 1))
    for o in images(x - 60, x + 60):
        add('<use href="#r%d" x="%s" y="%d" opacity="%s"/>' % (k, f(x + o), HZ + 1, f(op, 2)))

# glints: clusters of short dashes, smaller and denser toward the horizon
for k in range(6):
    p = ''.join('M%s %sh%sv%sh-%sz' % (f(rnd.uniform(0, 380)), f(rnd.uniform(0, 70)), f(w), rnd.choice([3, 3, 4]), f(w))
                for w in [rnd.uniform(8, 44) for _ in range(18)])
    D.append('<symbol id="g%d" overflow="visible"><path d="%s"/></symbol>' % (k, p))
for _ in range(150):
    t = rnd.random() ** 1.6
    y = HZ + 16 + t * 800; s = .7 + t * 1.8
    x = rnd.uniform(0, W)
    warm = density(x) > .45 and t < .3 and rnd.random() < .4
    gid, op = rnd.randint(0, 5), rnd.uniform(.1, .26) * (1.2 - t * .5)   # pick once: every image must be identical
    # Thin the glints out before the bottom edge. The floor cap past it is a smooth ramp,
    # so glints running to the last row left a visible arc where the texture just stopped.
    op *= max(0., min(1., (H - (y + 70 * s)) / 300.))
    if op < .02:
        continue
    for o in images(x, x + 430 * s):
        add('<use href="#g%d" transform="translate(%s %s) scale(%s)" fill="%s" opacity="%s"/>' % (
            gid, f(x + o), f(y), f(s, 2), SOD if warm else GLINT, f(op, 2)))

add('</g>')

# ---------------------------------------------------------------- aerial perspective
# Everything above this point is distance: sky, hills, skyline, bridge, sea. Wash it
# toward the sky colour so the foreground drawn after it (the suit, the dock cranes)
# reads as nearer. Rotating a view from a fixed point cannot give parallax, so depth
# here comes from scale, contrast and haze.
vgrad('haze', HZ - 430, HZ + 120, [(0, mix(INDIGO, TEAL, .30), .00), (.62, mix(INDIGO, TEAL, .34), .30), (.86, mix(INDIGO, TEAL, .30), .46), (1, mix(INDIGO, TEAL, .22), .30)])
add('<rect x="-10" y="' + str(HZ - 430) + '" width="' + str(W + 20) + '" height="550" fill="url(#haze)"/>')

# ---------------------------------------------------------------- the enemy: an original visor-slit suit behind the viewer (yaw 180)
def poly(*pts):
    # one winding for every subpath: the suit is a single nonzero-filled path, so two
    # overlapping parts wound the opposite way would cancel and punch a hole.
    if sum(pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1] for i in range(len(pts))) < 0: pts = pts[::-1]
    return 'M' + 'L'.join('%s %s' % (f(x), f(y)) for x, y in pts) + 'Z'
def seg(p0, p1, w0, w1):  # tapered limb between two joints
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0); nx, ny = -(y1 - y0) / L, (x1 - x0) / L
    return poly((x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2),
                (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2))
def both(*pts): return poly(*pts) + poly(*[(-x, y) for x, y in pts])
def segb(p0, p1, w0, w1):  # the same tapered limb on both sides
    return seg(p0, p1, w0, w1) + seg((-p0[0], p0[1]), (-p1[0], p1[1]), w0, w1)
# The suit is TRACED from the supplied reference by tools/trace_suit.py, which
# segments the photo into tone bands, walks each region's boundary and simplifies
# it. suit_trace.py is generated; regenerate it rather than editing it by hand.
import suit_trace as TR
D.append('<symbol id="suit" overflow="visible"><path fill-rule="evenodd" d="%s"/></symbol>' % TR.BODY)
bgrad('suitrim', [(0, mix(TEAL, WHITE, .6), .62), (.45, mix(TEAL, WHITE, .22), .3), (1, TEAL, .07)], x2=.85, y2=1)
SX, SY, SS = 4800, 1196, 1.62   # foreground scale; feet stand below the waterline
add('<g transform="translate(%d %d) scale(%s)">' % (SX, SY, f(SS, 2)))
# reflection first, clipped to the water and fading with depth
add('<g clip-path="url(#kw)" opacity=".26">')
add('<g transform="translate(0 %s) scale(1 -1)">' % f(2 * (HZ - SY) / SS))
add('<use href="#suit" fill="%s"/>' % mix(NIGHT, INDIGO, .5))
add('</g></g>')
add('<use href="#suit" x="-5" y="-4" fill="url(#suitrim)"/>')           # hard rim light from the searchlight side
add('<use href="#suit" fill="%s"/>' % mix(NIGHT, INDIGO, .18))          # near-black body
add('<path fill-rule="evenodd" fill="%s" opacity=".85" d="%s"/>' % (mix(NIGHT, TEAL, .30), TR.MID))   # armour catching the sky
add('<path fill-rule="evenodd" fill="%s" opacity=".7" d="%s"/>' % (mix(TEAL, WHITE, .45), TR.LIT))    # rim highlights
add('<path fill-rule="evenodd" fill="%s" d="%s"/>' % (mix(SOD, WHITE, .55), TR.EYE))                  # mono-eye
add('</g>')
rgrad('gF', FOG, ((0, 1), (.45, .88), (.8, .35), (1, 0)))
# offsets are measured up from the feet so the bank tracks the suit's scale
for x, dy, rx, ry, op in [(4800, -30, 620, 52, .55), (4690, -18, 840, 40, .5), (4930, -44, 360, 34, .4), (4640, -52, 300, 26, .3)]:
    y = SY + dy * SS
    glow(x, y, rx * SS, ry, 'gF', op)                                       # fog bank swallowing the legs at the knee
EX, EY = SX + SS * TR.EYE_POS[0], SY + SS * TR.EYE_POS[1]
glow(EX, EY, 110, 42, 'gS', .28)
glow(EX, EY, 50, 16, 'gS', .85)
glow(EX, EY, 190, 4, 'gS', .8)                                             # horizontal flare off the visor
glow(EX, HZ, 18, 260, 'gS', .35)                                           # its glow column down the water
for i in range(2): add('<use href="#r4" x="%s" y="%d" opacity=".8"/>' % (f(EX + i * 3 - 1), HZ + 1))   # the eye's reflection in the water
# a lone ship far off the left quarter, and the lighthouse on the headland
add('<path fill="%s" d="M5880 1150L5872 1136H5990L5996 1128H6020L6030 1150Z M5930 1136V1112H5962V1136Z M5940 1112V1096H5946V1112Z"/>' % mix(NIGHT, INDIGO, .75))
dots([(5890, 1140), (5905, 1140), (5920, 1140), (5975, 1140), (6000, 1133)], LAMP, .8, 3)
add('<use href="#blk" x="5943" y="1094" transform="translate(0 0)"/>')
add('<path fill="%s" d="M5536 1150L5541 1096H5551L5556 1150Z"/>' % mix(NIGHT, INDIGO, .7))
glow(5546, 1094, 34, 22, 'gW', .5); dots([(5544, 1092)], WHITE, 1, 4)

# ---------------------------------------------------------------- near container dock with gantry cranes (right quarter, strong foreground silhouette)
DK0, DK1, DKY = 1900, 3720, 1446
glow(2800, DKY + 30, 1100, 90, 'gS', .16)
add('<path fill="%s" d="M%d %dH%dL%d %dH%dZ"/>' % (NEAR, DK0, DKY, DK1, DK1 + 10, DKY + 34, DK0 - 10))
add('<rect x="%d" y="%d" width="%d" height="3" fill="%s" opacity=".6"/>' % (DK0, DKY, DK1 - DK0, mix(TEAL, SOD, .35)))
add('<path fill="%s" d="%s"/>' % (NEAR, ''.join('M%d %dh8v14h-8Z' % (x, DKY + 34) for x in range(DK0 + 20, DK1, 70))))
ccols = [mix(NIGHT, TEAL, .35), mix(NIGHT, INDIGO, .9), mix(NIGHT, SOD, .14), mix(NIGHT, TEAL, .22)]
for x0, x1, tiers in [(2620, 2980, 3), (3200, 3560, 2), (2080, 2280, 2)]:
    for x in range(x0, x1, 62):
        for t in range(rnd.randint(1, tiers)):
            add('<rect x="%d" y="%d" width="58" height="22" fill="%s"/>' % (x, DKY - 22 * (t + 1), rnd.choice(ccols)))
CRANE = ('M0 0h12v-430h-12Z M150 0h12v-430h-12Z M-8 -448h178v20h-178Z M-8 -262h178v12h-178Z '
         'M4 -256L150 -424L158 -416L12 -248Z M4 -424L150 -256L158 -264L12 -432Z '
         'M0 -444L70 -664L82 -664L12 -444Z M150 -444L80 -664L92 -664L162 -444Z '
         'M-430 -478H340V-456H-430Z M-430 -478L-400 -490H-340L-360 -478Z '
         'M76 -664L-428 -482L-424 -476L80 -656Z M86 -664L338 -482L334 -476L82 -656Z '
         'M150 -506h110v28h-110Z M-214 -456h40v14h-40Z M-196 -442h4v88h-4Z M-222 -354h56v10h-56Z')
D.append('<symbol id="crane" overflow="visible"><path d="%s"/></symbol>' % CRANE)
bgrad('cone', [(0, SOD, .16), (1, SOD, 0)])
for cx, sc in [(2440, 1.55), (3260, 1.2)]:
    for fx in (-300, -120, 240):   # floodlight cones under the boom
        lx, ly = cx + fx * sc, DKY - 454 * sc
        add('<path d="M%s %sL%s %s %s %s %s %sZ" fill="url(#cone)"/>' % (f(lx - 4), f(ly), f(lx - 50), DKY, f(lx + 50), DKY, f(lx + 4), f(ly)))
    add('<g transform="translate(%d %d) scale(%s)">' % (cx, DKY, f(sc, 2)))
    add('<use href="#crane" x="-3" y="-2" fill="%s" opacity=".5"/>' % mix(TEAL, SOD, .3))
    add('<use href="#crane" fill="%s"/>' % NEAR)
    add('</g>')
    for fx in (-300, -120, 240): add('<use href="#lp" x="%s" y="%s"/>' % (f(cx + fx * sc), f(DKY - 451 * sc)))
    add('<use href="#blk" x="%s" y="%s"/>' % (f(cx - 428 * sc), f(DKY - 486 * sc)))
    glow(cx + 81 * sc, DKY - 664 * sc, 20, 20, 'gW', .4)
dklamps = list(range(DK0 + 40, DK1, 150))
for x in dklamps:
    add('<rect x="%d" y="%d" width="4" height="70" fill="%s"/><use href="#lp" x="%d" y="%d"/>' % (x - 2, DKY - 70, NEAR, x, DKY - 72))
    add('<use href="#r4" x="%d" y="%d" opacity=".5"/>' % (x, DKY + 50))

svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" preserveAspectRatio="none">'
       '<defs>%s</defs>%s</svg>\n') % (W, H, W, H, ''.join(D), '\n'.join(S))
open(OUT, 'w', newline='\n').write(svg)
print('wrote', os.path.normpath(OUT), '%.1f KB' % (len(svg.encode()) / 1024))
