#!/usr/bin/env python3
"""Generates the cockpit damage map from the suit mesh.

    python site4/tools/gen_dmgmap.py [--preview]

Segments the mesh into 8 damage zones ONCE in 3D, then bakes a turntable by
projecting that already-labelled geometry at each angle. Doing it that way is
what guarantees a zone cannot change identity between frames -- per-frame 2D
segmentation would have to re-derive the split every time and could disagree
with itself.

Writes js/dmgmap.js (the HUD reads window.BUNNYS_DMG; the page runs from
file:// under test, so fetch() is not available) and img/dmgmap.svg (the front
frame alone, for the asset test and for viewing on its own).
"""
import io, os, struct, sys
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tracelib import trace_with_holes, to_path   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('MESH', os.path.join(HERE, '..', 'img', 'ref', 'woundwort.stl'))
OUT_JS = os.path.join(HERE, '..', 'js', 'dmgmap.js')
OUT_SVG = os.path.join(HERE, '..', 'img', 'dmgmap.svg')

FRAMES = 24          # one every 15 degrees
RES = 320            # raster/viewBox resolution
EPS = 2.8            # Douglas-Peucker tolerance. The map displays around 190px wide, so
                     # anything finer than this is sub-pixel and just adds bytes and noise.
PER_AREA = 42.0      # barycentric samples per unit of triangle area

ZONES = [
    ('head',   'HD-01', 'HEAD'),
    ('chest',  'CH-02', 'CHEST'),
    ('body',   'BD-03', 'BODY'),
    ('arm-r',  'AR-04', 'ARM R'),
    ('arm-l',  'AL-05', 'ARM L'),
    ('leg-r',  'LR-06', 'LEG R'),
    ('leg-l',  'LL-07', 'LEG L'),
    ('weapon', 'WP-08', 'WEAPON'),
]
IDX = dict((z[0], i) for i, z in enumerate(ZONES))


# ---------------------------------------------------------------- mesh
def load_stl(path):
    with open(path, 'rb') as f:
        f.read(80)
        n = struct.unpack('<I', f.read(4))[0]
        data = f.read(n * 50)
    rec = np.dtype([('n', '<f4', 3), ('v1', '<f4', 3), ('v2', '<f4', 3),
                    ('v3', '<f4', 3), ('a', '<u2')])
    a = np.frombuffer(data, dtype=rec)
    return np.stack([a['v1'], a['v2'], a['v3']], 1).astype(float)


tris = load_stl(SRC)
cent = tris.mean(1)
V = tris.reshape(-1, 3)
mn, mx = V.min(0), V.max(0)
H = mx[2] - mn[2]
zf = (cent[:, 2] - mn[2]) / H
print('mesh: %d triangles, extent X=%.2f Y=%.2f Z=%.2f' % (len(tris), mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]))

# ---------------------------------------------------------------- weapon first
# The rifle is a long appendage swung well clear of the vertical axis. It has to
# come out BEFORE the body axis is computed: taking the axis from the full
# bounding box lets the rifle drag it sideways, which in a trial run put the
# chest into arm-r and left arm-l with zero triangles.
med = np.median(cent, 0)                       # median, not bbox centre: robust to the rifle
r_med = np.hypot(cent[:, 0] - med[0], cent[:, 1] - med[1])
weapon = (r_med > 17.0) & (zf < 0.66)
for _ in range(8):                             # grow along the shaft by proximity
    if not weapon.any():
        break
    key = set(map(tuple, np.round(cent[weapon] / 1.5).astype(int)))
    cand = np.round(cent / 1.5).astype(int)
    near = np.fromiter((tuple(k) in key for k in cand), bool, len(cent))
    grown = weapon | (near & (r_med > 11.0) & (zf < 0.72))
    if grown.sum() == weapon.sum():
        break
    weapon = grown

body_v = tris[~weapon].reshape(-1, 3)
AX = (body_v[:, 0].min() + body_v[:, 0].max()) / 2.0
AY = (body_v[:, 1].min() + body_v[:, 1].max()) / 2.0
print('weapon: %d tris | body axis X=%.2f Y=%.2f (bbox centre was X=%.2f)'
      % (weapon.sum(), AX, AY, (mn[0] + mx[0]) / 2))

# ---------------------------------------------------------------- zones
dx = cent[:, 0] - AX
dy = cent[:, 1] - AY
zone = np.full(len(tris), IDX['body'], np.int8)      # body is the fallback
rest = ~weapon

rad = np.hypot(dx, dy)
behind = dy < -3.5                                   # the backpack wing rides behind the torso

zone[rest & (zf > 0.80)] = IDX['head']
# chest is the near-axis block under the head only; everything wider or lower falls
# through to body, which carries the waist, the skirts and the wing
zone[rest & (zf > 0.62) & (zf <= 0.80) & (rad <= 7.0) & ~behind] = IDX['chest']

# limbs by radial distance, not |dx|: that stays true at every rotation, where a plain
# x-threshold only holds at the front view
arms = rest & (zf > 0.44) & (zf <= 0.80) & (rad > 7.0) & ~behind
zone[arms & (dx < 0)] = IDX['arm-r']                 # suit's own right = viewer's left
zone[arms & (dx >= 0)] = IDX['arm-l']

legs = rest & (zf <= 0.46)
zone[legs & (dx < 0)] = IDX['leg-r']
zone[legs & (dx >= 0)] = IDX['leg-l']
zone[weapon] = IDX['weapon']

counts = dict((ZONES[i][0], int((zone == i).sum())) for i in range(8))
print('zones:', counts)


# ---------------------------------------------------------------- sampling
def barycentric(tri, per_area):
    a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    k = np.clip((area * per_area).astype(int) + 8, 8, 1200)
    rs = np.random.RandomState(1979)
    pts, ids = [], []
    for cnt in np.unique(k):
        m = k == cnt
        u = rs.rand(int(m.sum()), cnt, 1)
        v = rs.rand(int(m.sum()), cnt, 1)
        f = (u + v) > 1
        u = np.where(f, 1 - u, u)
        v = np.where(f, 1 - v, v)
        p = a[m][:, None, :] + (b[m] - a[m])[:, None, :] * u + (c[m] - a[m])[:, None, :] * v
        pts.append(p.reshape(-1, 3))
        ids.append(np.repeat(np.where(m)[0], cnt))
    return np.concatenate(pts, 0), np.concatenate(ids, 0)


P, tid = barycentric(tris, PER_AREA)
PZ = zone[tid]
print('samples: %d' % len(P))

# one shared span across every frame, so the suit does not jump between them
rel = np.stack([P[:, 0] - AX, P[:, 1] - AY], 1)
body_pts = PZ != IDX['weapon']
span = 0.0
for i in range(FRAMES):
    th = 2 * np.pi * i / FRAMES
    xr = rel[body_pts, 0] * np.cos(th) - rel[body_pts, 1] * np.sin(th)
    span = max(span, 2 * max(abs(xr.min()), abs(xr.max())))   # symmetric about the axis
span *= 1.14                                  # a little headroom; the rifle tip may run off
SCALE = (RES - 8) / H                         # height fills the panel
VB_W = int(round(span * SCALE)) + 8
VB_H = int(round(H * SCALE)) + 8
print('viewBox %dx%d (scale %.2f px/unit)' % (VB_W, VB_H, SCALE))


# ---------------------------------------------------------------- bake frames
def zone_path(px, py):
    img = np.zeros((VB_H, VB_W), bool)
    img[py, px] = True
    img = ndimage.binary_closing(ndimage.binary_dilation(img, iterations=1), np.ones((3, 3)))
    img = ndimage.binary_fill_holes(img)
    parts = trace_with_holes(img, EPS, min_area=150, min_hole=150)
    return to_path(parts, '%.0f')


frames = []
for i in range(FRAMES):
    th = 2 * np.pi * i / FRAMES
    ct, st = np.cos(th), np.sin(th)
    xr = rel[:, 0] * ct - rel[:, 1] * st
    depth = rel[:, 0] * st + rel[:, 1] * ct
    xi = ((xr + span / 2) * SCALE + 4).astype(int)
    yi = (VB_H - 4 - (P[:, 2] - mn[2]) * SCALE).astype(int)
    inside = (xi >= 0) & (xi < VB_W) & (yi >= 0) & (yi < VB_H)
    ds, order = [], []
    for z in range(8):
        m = (PZ == z) & inside
        ds.append(zone_path(xi[m], yi[m]) if m.any() else '')
        order.append((float(depth[m].mean()) if m.any() else 0.0, z))
    # painter's order: furthest first, so a near arm covers the torso and not the reverse
    order.sort(reverse=True)
    frames.append({'d': ds, 'order': [z for _, z in order]})
    if i % 6 == 0:
        print('  frame %2d/%d  %d bytes' % (i, FRAMES, sum(len(x) for x in ds)))

# ---------------------------------------------------------------- checks
total_tris = len(tris)
for i in range(8):
    zid = ZONES[i][0]
    c = counts[zid]
    assert c > 0, 'zone %s is empty -- check the body axis and the zone bands' % zid
    cap = 0.60 if zid == 'body' else 0.35        # body is the fallback and carries waist,
    assert c < total_tris * cap, (                  # skirts and the backpack wing
        'zone %s has %d of %d triangles, far too dominant' % (zid, c, total_tris))
for fi, fr in enumerate(frames):
    for zi in range(8):
        assert fr['d'][zi], 'frame %d: zone %s traced empty' % (fi, ZONES[zi][0])
        assert fr['d'][zi].endswith('Z'), 'frame %d: zone %s path not closed' % (fi, ZONES[zi][0])
    assert sorted(fr['order']) == list(range(8)), 'frame %d: bad draw order' % fi

# ---------------------------------------------------------------- emit
parts = ['/* Generated by tools/gen_dmgmap.py from the suit mesh. Do not hand-edit. */\n']
parts.append('window.BUNNYS_DMG = {\n')
parts.append('  w: %d, h: %d,\n' % (VB_W, VB_H))
parts.append('  zones: [\n')
for zid, code, label in ZONES:
    parts.append('    { id: "%s", code: "%s", label: "%s" },\n' % (zid, code, label))
parts.append('  ],\n  frames: [\n')
for fr in frames:
    ds = ','.join('"' + x + '"' for x in fr['d'])
    od = ','.join(str(z) for z in fr['order'])
    parts.append('    { d: [%s], order: [%s] },\n' % (ds, od))
parts.append('  ]\n};\n')
io.open(OUT_JS, 'w', encoding='utf-8', newline='').write(''.join(parts))

f0 = frames[0]
svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" fill="none" '
       'stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">' % (VB_W, VB_H)]
for zi in f0['order']:
    svg.append('<path id="dz-%s" d="%s"/>' % (ZONES[zi][0], f0['d'][zi]))
svg.append('</svg>')
io.open(OUT_SVG, 'w', encoding='utf-8', newline='').write(''.join(svg))

print('wrote %s (%.0f KB)' % (OUT_JS, os.path.getsize(OUT_JS) / 1024))
print('wrote %s (%.0f KB)' % (OUT_SVG, os.path.getsize(OUT_SVG) / 1024))

# ---------------------------------------------------------------- preview
if '--preview' in sys.argv:
    from PIL import Image
    COL = np.array([(222, 60, 60), (232, 140, 44), (226, 202, 62), (74, 200, 96),
                    (56, 184, 200), (74, 124, 232), (152, 84, 222), (130, 130, 130)], np.uint8)
    cols = 6
    rows = (FRAMES + cols - 1) // cols
    sheet = np.full((rows * VB_H, cols * VB_W, 3), 255, np.uint8)
    for i in range(FRAMES):
        th = 2 * np.pi * i / FRAMES
        ct, st = np.cos(th), np.sin(th)
        xr = rel[:, 0] * ct - rel[:, 1] * st
        depth = rel[:, 0] * st + rel[:, 1] * ct
        xi = ((xr + span / 2) * SCALE + 4).astype(int)
        yi = (VB_H - 4 - (P[:, 2] - mn[2]) * SCALE).astype(int)
        keep = (xi >= 0) & (xi < VB_W) & (yi >= 0) & (yi < VB_H)
        o = np.argsort(depth)[::-1]
        o = o[keep[o]]
        r0, c0 = (i // cols) * VB_H, (i % cols) * VB_W
        sheet[r0 + yi[o], c0 + xi[o]] = COL[PZ[o]]
    out = os.path.join(HERE, '..', 'tests', 'out', 'dmgmap-preview.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    Image.fromarray(sheet).save(out)
    print('preview: tests/out/dmgmap-preview.png')
