"""Shared raster-to-path tracing helpers.

Pulled out of trace_suit.py so gen_dmgmap.py can use them too: importing
trace_suit runs the whole script and rewrites suit_trace.py, so it cannot be
imported as a module.
"""
import numpy as np
from scipy import ndimage

# 8-neighbourhood, clockwise from west
_NB = [(0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1)]


def trace_components(mask, min_area=140):
    """Moore-neighbour boundary walk over every connected component.

    Returns a list of (N, 2) float arrays of (x, y) points. Outer boundaries
    only -- holes are the caller's problem (see trace_with_holes).
    """
    lab, n = ndimage.label(mask)
    if n == 0:
        return []
    slices = ndimage.find_objects(lab)
    out = []
    for i in range(1, n + 1):
        sl = slices[i - 1]
        if sl is None:
            continue
        # crop to the component's own bbox: the walk is O(perimeter) but the
        # bounds checks below are much cheaper on a small array
        sub = lab[sl] == i
        if sub.sum() < min_area:
            continue
        y0, x0 = sl[0].start, sl[1].start
        m = np.pad(sub, 1)
        sy, sx = np.argwhere(m)[0]
        cy, cx = sy, sx
        bdir = 0
        start = (sx, sy)
        contour = [(sx, sy)]
        guard = 0
        limit = 8 * m.size + 1000
        while True:
            guard += 1
            if guard > limit:
                break
            found = False
            for k in range(8):
                d = (bdir + k) % 8
                ny, nx = cy + _NB[d][0], cx + _NB[d][1]
                if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx]:
                    bdir = (d + 5) % 8          # back up to just behind the step
                    cy, cx = ny, nx
                    contour.append((cx, cy))
                    found = True
                    break
            if not found or ((cx, cy) == start and len(contour) > 3):
                break
        c = np.array(contour, float) - 1.0      # undo the pad
        c[:, 0] += x0
        c[:, 1] += y0
        out.append(c)
    return out


def rdp(pts, eps):
    """Douglas-Peucker, iterative so long contours can't blow the stack."""
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        seg = pts[j] - pts[i]
        L = float(np.hypot(seg[0], seg[1]))
        rel = pts[i + 1:j] - pts[i]
        if L == 0:
            d = np.hypot(rel[:, 0], rel[:, 1])
        else:
            d = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / L
        k = int(np.argmax(d))
        if d[k] > eps:
            k += i + 1
            keep[k] = True
            stack.append((i, k))
            stack.append((k, j))
    return pts[keep]


def trace_with_holes(mask, eps, min_area=140, min_hole=60):
    """Outer boundaries plus their holes, as one evenodd path string."""
    parts = []
    for c in trace_components(mask, min_area):
        q = rdp(c, eps)
        if len(q) >= 4:
            parts.append(q)
    holes = ndimage.binary_fill_holes(mask) & ~mask
    for c in trace_components(holes, min_hole):
        q = rdp(c, eps)
        if len(q) >= 4:
            parts.append(q)
    return parts


def to_path(parts, fmt='%.1f'):
    """Closed subpaths -> a single SVG path 'd' string."""
    d = []
    for q in parts:
        pts = ('%s %s' % (fmt, fmt)) % (q[0][0], q[0][1])
        rest = 'L'.join(('%s %s' % (fmt, fmt)) % (x, y) for x, y in q[1:])
        d.append('M' + pts + ('L' + rest if rest else '') + 'Z')
    return ''.join(d)
