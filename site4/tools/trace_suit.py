"""Trace the enemy suit from the supplied reference PNG into SVG paths.

Real edge tracing, not a redraw: segment the image into tone bands, walk the
boundary of each region (Moore-neighbour), simplify with Douglas-Peucker, then
map into panorama units. Output is written as a Python literal that gen_pano.py
imports, so the panorama build stays a single deterministic step.
"""
import io, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

REF = os.environ.get('REF', r'C:\Users\thirt\AppData\Local\Temp\claude\c--Users-thirt-Desktop-testing-neocities\9e76d4e0-fd71-4f49-a6af-827c6977e850\images\4.png')
OUT = os.path.join(os.path.dirname(__file__), 'suit_trace.py')

im = Image.open(REF).convert('RGB')
a = np.asarray(im).astype(float)
lum = a.mean(2)
H, W = lum.shape

# The suit is the dark mass in the middle; the fog behind it is lighter and bluer.
# Blue-dominance separates them better than luminance alone, because the suit's
# rim-lit edges are bright but stay neutral while the fog stays blue.
blue = a[:, :, 2] - a[:, :, 0]
fog = (blue > 13) & (lum > 12)
body = ~fog

body = ndimage.binary_closing(body, np.ones((5, 5)))
body = ndimage.binary_fill_holes(body)
# thicken thin features (the head spike is only a few px wide) so the smoothing
# pass below cannot erase them, then smooth the staircase off the contour
body = ndimage.binary_dilation(body, np.ones((3, 3)))
body = ndimage.median_filter(body, size=7)
body = ndimage.binary_fill_holes(body)
lab, n = ndimage.label(body)
if n:
    sizes = ndimage.sum(body, lab, range(1, n + 1))
    body = lab == (int(np.argmax(sizes)) + 1)
body = ndimage.binary_fill_holes(body)

ys, xs = np.where(body)
print('mask bbox x %d..%d  y %d..%d  fill %.1f%%' % (xs.min(), xs.max(), ys.min(), ys.max(), 100.0 * body.mean()))

if '--preview' in sys.argv:
    prev = np.zeros((H, W, 3), np.uint8)
    prev[..., 1] = (body * 200).astype(np.uint8)
    prev[..., 0] = np.clip(lum, 0, 255).astype(np.uint8)
    Image.fromarray(prev).resize((W // 2, H // 2)).save(os.path.join(os.path.dirname(__file__), '..', 'tests', 'out', 'trace-mask.png'))
    print('wrote tests/out/trace-mask.png')

# ---------------------------------------------------------------- contour tracing
def trace_components(mask, min_area=140):
    """Moore-neighbour boundary walk over every connected component."""
    lab, n = ndimage.label(mask)
    out = []
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < min_area:
            continue
        m = np.pad(comp, 1)
        pts = np.argwhere(m)
        sy, sx = pts[0]
        # 8-neighbourhood, clockwise from west
        nb = [(0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1)]
        contour = [(sx, sy)]
        cy, cx = sy, sx
        bdir = 0
        start = (sx, sy)
        guard = 0
        while True:
            guard += 1
            if guard > 400000:
                break
            found = False
            for k in range(8):
                d = (bdir + k) % 8
                ny, nx = cy + nb[d][0], cx + nb[d][1]
                if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx]:
                    bdir = (d + 5) % 8          # back up to just behind the step
                    cy, cx = ny, nx
                    contour.append((cx, cy))
                    found = True
                    break
            if not found or (cx, cy) == start and len(contour) > 3:
                break
        out.append(np.array(contour, float) - 1.0)   # undo the pad
    return out


def rdp(pts, eps):
    """Douglas-Peucker, iterative so long contours can't blow the stack."""
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        seg = pts[j] - pts[i]
        L = np.hypot(*seg)
        if L == 0:
            d = np.hypot(*(pts[i + 1:j] - pts[i]).T)
        else:
            d = np.abs(np.cross(seg, pts[i + 1:j] - pts[i])) / L
        k = int(np.argmax(d))
        if d[k] > eps:
            k += i + 1
            keep[k] = True
            stack.append((i, k)); stack.append((k, j))
    return pts[keep]

# ---------------------------------------------------------------- tone bands -> paths
# Three layers read as a lit mechanical shape at small size: the silhouette, the
# mid-tone armour that catches the sky, and the bright rim highlights.
inside = body
mid = inside & (lum > 26) & (lum <= 62)
lit = inside & (lum > 62)
mid = ndimage.binary_opening(mid, np.ones((3, 3)))
lit = ndimage.binary_opening(lit, np.ones((2, 2)))

# the mono-eye: the strongly orange pixels
eye = (a[:, :, 0] > 110) & (a[:, :, 0] - a[:, :, 2] > 40)

# map image pixels into panorama units: keep the aspect, put the feet on y=0,
# centre on x=0, and scale so the whole suit stands TALL units high.
TALL = 690.0
x0, x1 = xs.min(), xs.max()
y0, y1 = ys.min(), ys.max()
s = TALL / (y1 - y0)
cxp = (x0 + x1) / 2.0


def to_units(p):
    return np.stack([(p[:, 0] - cxp) * s, (p[:, 1] - y1) * s], 1)


def paths(mask, eps, min_area=140):
    d = []
    for c in trace_components(mask, min_area):
        c = rdp(c, eps)
        if len(c) < 4:
            continue
        q = to_units(c)
        d.append('M' + 'L'.join('%.1f %.1f' % (x, y) for x, y in q) + 'Z')
    return ''.join(d)


LAYERS = {
    'body': paths(inside, 2.2, 400),
    'mid': paths(mid, 2.0, 260),
    'lit': paths(lit, 1.8, 90),
    'eye': paths(eye, 1.2, 20),
}
eyec = np.argwhere(eye)
EYE_XY = (float((eyec[:, 1].mean() - cxp) * s), float((eyec[:, 0].mean() - y1) * s)) if len(eyec) else (0.0, -560.0)

with io.open(OUT, 'w', encoding='utf-8') as fh:
    fh.write('# Generated by trace_suit.py from the supplied reference. Do not hand-edit.\n')
    fh.write('# Panorama units: feet on y=0, centred on x=0, %.0f units tall.\n' % TALL)
    fh.write('EYE_POS = %r\n' % (EYE_XY,))   # distinct from the EYE path written below
    for k, v in LAYERS.items():
        fh.write('%s = %r\n' % (k.upper(), v))
print('layers:', {k: (len(v), v.count('M')) for k, v in LAYERS.items()}, 'eye at', EYE_XY)
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
