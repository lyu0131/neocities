"""site5 hand ring: the floating ring controller, after the owner's sketch and pick (concept 2, sleeker): the forearm goes
through a ring, the hand closes on an L-shaped handbar. Models one (right hand) in Blender, bakes its contact shading,
and writes site5/js/ring-data.js for seat.js (the pages open from file://, so the model ships as a script).

Run:  blender -b --factory-startup -P site5/tools/make_ring.py -- [preview_dir]

Modelled at real size in metres in Blender's frame (z up, the pilot at -y looking +y), the origin at the ring's centre.
No stand: it floats. Parts, by what moves them (seat.js nests the turns: yaw, then pitch, then roll):
  track   the outer track ring with its trim line                      yaw + pitch
  ring    the inner ring's fixed lower half and liner, the L handbar   + roll
          (a forward rail from the ring's outer side, bending 90 deg inward
          into the grip; a key per finger; a thumb hat on its free end)
  hatch   the inner ring's upper half, hinged on the outer side         + roll + opening (about HINGE)
"""
import bpy, bmesh, math, sys, os, base64, struct, json
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'js', 'ring-data.js')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = argv[0] if argv else None
R = math.radians

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = scene.collection

# the shapes
RX, RZ = 0.07, 0.058          # the inner ring's centre line (an oval: wider than tall, as a forearm is)
TX, TZ = 0.088, 0.075         # the outer track's centre line
HINGE = (TX, 0.0, 0.0)        # the clamshell's hinge, on the track's outer side: both upper halves swing up and over about it
VIEW = {'track': (0.62, 0.64, 0.68, 1), 'ring': (0.5, 0.52, 0.56, 1), 'liner': (0.16, 0.16, 0.18, 1),
        'grip': (0.13, 0.13, 0.14, 1), 'key': (0.05, 0.05, 0.06, 1), 'glow': (0.4, 0.7, 1.0, 1), 'channel': (0.06, 0.06, 0.07, 1),
        'trim': (1.0, 0.31, 0.55, 1), 'metal': (0.75, 0.76, 0.78, 1),
        'arm': (0.85, 0.62, 0.48, 1)}


def mesh_obj(name, bm, mat, group, subd=0, bevel=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); COL.objects.link(ob)
    ob.data.materials.append(bpy.data.materials.get(mat) or bpy.data.materials.new(mat))
    ob['group'] = group
    ob.color = VIEW[mat]
    for p in me.polygons:
        p.use_smooth = True
    if bevel:
        b = ob.modifiers.new('b', 'BEVEL'); b.width, b.segments, b.limit_method = bevel, 3, 'ANGLE'; b.harden_normals = True
    if subd:
        s = ob.modifiers.new('s', 'SUBSURF'); s.levels = s.render_levels = subd
    return ob


def sweep(name, pts, section, mat, group, closed=False, twist_up=Vector((0, 0, 1)), subd=0):
    """sweep a 2D section [(u, v)...] along a path: u across it, v up it"""
    bm = bmesh.new(); n = len(pts); rings = []
    for i, p in enumerate(pts):
        a, b = (pts[(i - 1) % n], pts[(i + 1) % n]) if closed else (pts[max(0, i - 1)], pts[min(n - 1, i + 1)])
        T = (Vector(b) - Vector(a)).normalized()
        up = twist_up(p) if callable(twist_up) else twist_up
        N = T.cross(up).normalized() if abs(T.dot(up)) < 0.95 else T.cross(Vector((1, 0, 0))).normalized()
        B = N.cross(T)
        rings.append([bm.verts.new(Vector(p) + N * u + B * v) for u, v in section])
    m = len(section)
    for A, Bv in list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else []):
        for k in range(m):
            bm.faces.new((A[k], A[(k + 1) % m], Bv[(k + 1) % m], Bv[k]))
    if not closed:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, None, subd)


def rounded_rect(w, h, r, n=4):
    """a w x h rectangle with rounded corners (radius r), counter-clockwise"""
    out = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(n + 1):
            a = R(a0 + 90 * k / n)
            out.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return out


def circle(r, n=20):
    return [(math.cos(2 * math.pi * k / n) * r, math.sin(2 * math.pi * k / n) * r) for k in range(n)]


def oval_pts(rx, rz, a0, a1, n, y=0.0):
    return [(math.cos(R(a0 + (a1 - a0) * i / n)) * rx, y, math.sin(R(a0 + (a1 - a0) * i / n)) * rz) for i in range(n + 1)]


def tag(ob, group):
    ob['group'] = group
    return ob


radial = lambda p: Vector((0, 1, 0))   # sections of the rings stand along y (the forearm's line): u radial, v along y

# ---- the outer track: a slim flat band, a trim line round its face ----
GAP = 2.0   # degrees left between the halves at each seam
for half, a0, a1, grp in (('low', 180 + GAP, 360 - GAP, 'track'), ('up', GAP, 180 - GAP, 'trackhatch')):   # split like the ring, to open with it
    tag(sweep('track_' + half, oval_pts(TX, TZ, a0, a1, 48), rounded_rect(0.008, 0.018, 0.0035), 'track', None, False, radial), grp)
    tag(sweep('trim_' + half, oval_pts(TX - 0.0005, TZ - 0.0005, a0 + 1, a1 - 1, 48, -0.0092), rounded_rect(0.0022, 0.0012, 0.0005, 2), 'trim', None, False, radial), grp)
for sx in (-1, 1):   # the two roll bearings where the ring rides in the track, left and right
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.0055, radius2=0.0055, depth=0.02,
                                            matrix=Matrix.Rotation(R(90), 4, 'X'))
    b = mesh_obj('bearing', bm, 'metal', 'track', bevel=0.002); b.location = (sx * (RX + TX) / 2, 0, 0)

# ---- the inner ring: the lower half fixed, the upper half a hatch hinged on the outer side ----
tag(sweep('ring_low', oval_pts(RX, RZ, 180 + GAP, 360 - GAP, 48), rounded_rect(0.009, 0.016, 0.0038), 'ring', None, False, radial), 'ring')
tag(sweep('liner_low', oval_pts(RX - 0.007, RZ - 0.007, 186, 354, 48), rounded_rect(0.005, 0.013, 0.0022), 'liner', None, False, radial), 'ring')
tag(sweep('hatch', oval_pts(RX, RZ, GAP, 180 - GAP, 48), rounded_rect(0.009, 0.016, 0.0038), 'ring', None, False, radial), 'hatch')
tag(sweep('liner_up', oval_pts(RX - 0.007, RZ - 0.007, 6, 174, 48), rounded_rect(0.005, 0.013, 0.0022), 'liner', None, False, radial), 'hatch')
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.005, radius2=0.005, depth=0.02, matrix=Matrix.Rotation(R(90), 4, 'X'))
h = mesh_obj('hinge', bm, 'metal', 'track', bevel=0.0015); h.location = (TX + 0.006, 0, 0.0)   # the clamshell's hinge barrel
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=Vector((0.012, 0.016, 0.01)), verts=bm.verts)
l = mesh_obj('latch', bm, 'metal', 'hatch', bevel=0.002); l.location = (-RX - 0.003, 0, 0.006)

# ---- the L handbar: a rail forward from the ring's outer side, bending 90 deg inward into the grip ----
Y0, Y1, BEND = 0.0, 0.155, 0.02          # the rail's run forward, and the bend's radius
GX0, GX1 = RX - 0.004, -0.035            # the grip runs from the bend inward to its free end
rail = [(RX + 0.003, 0.012, -0.006)]
for i in range(1, 9):                     # the rail, drawing in a little as it runs forward
    t = i / 8
    rail.append((RX + 0.003 - 0.006 * t, Y0 + 0.012 + (Y1 - BEND - 0.012) * t, -0.006 - 0.006 * t))
cx, cy = rail[-1][0] - BEND, rail[-1][1]
for k in range(1, 7):                     # the bend
    a = R(90 * k / 6)
    rail.append((cx + BEND * math.cos(a), cy + BEND * math.sin(a), -0.012))
sx0 = rail[-1][0]
for i in range(1, 9):                     # into the grip leg
    rail.append((sx0 + (GX1 - sx0) * i / 8, cy + BEND, -0.012))
up = lambda p: Vector((0, 0, 1))
# the bar: slim where it's rail, swelling into a rubber grip along the leg
sec_rail = rounded_rect(0.012, 0.016, 0.005)
tag(sweep('rail', rail[:15], sec_rail, 'ring', None, False, up), 'ring')
grip_pts = rail[14:]
tag(sweep('grip', grip_pts, circle(0.0145, 24), 'grip', None, False, up), 'ring')
GY, GZ = cy + BEND, -0.012
# A recessed channel runs along the grip's back-underside, where the fingertips land; in it, four glossy pill keys, a
# key per finger, each with a hairline of soft light along its top edge. The grip's free end carries the thumb control:
# a glossy dome in a thin ring of light, on a flush end cap.
KA = R(-38)                                   # how far round the bar, from straight back, the channel faces (down and back)
def on_bar(x, out, along=0.0):
    """a point on the grip at x, 'out' from its axis, turned KA from straight back toward the pilot"""
    return Vector((x + along, GY - math.cos(KA) * out, GZ + math.sin(KA) * out))
face = lambda p: Vector((0, -math.cos(KA), math.sin(KA)))
tag(sweep('channel', [on_bar(GX1 + 0.006, 0.0128), on_bar(GX0 - 0.03, 0.0128)], rounded_rect(0.0105, 0.0024, 0.001, 2), 'channel', None, False, face), 'ring')
for i in range(4):
    x = GX1 + 0.013 + i * 0.0175
    tag(sweep('key', [on_bar(x - 0.0065, 0.0142), on_bar(x + 0.0065, 0.0142)], rounded_rect(0.0084, 0.0022, 0.001, 3), 'key', None, False, face), 'ring')
    tag(sweep('key_glow', [on_bar(x - 0.0055, 0.0151), on_bar(x + 0.0055, 0.0151)], rounded_rect(0.0009, 0.0007, 0.0003, 1), 'glow', None, False, face), 'ring')
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.0158, radius2=0.015, depth=0.005, matrix=Matrix.Rotation(R(90), 4, 'Y'))
c = mesh_obj('endcap', bm, 'ring', 'ring', bevel=0.0015); c.location = (GX1 - 0.0025, GY, GZ)
tag(sweep('thumb_glow', [(GX1 - 0.0052, GY + math.cos(R(a)) * 0.0085, GZ + math.sin(R(a)) * 0.0085) for a in range(0, 360, 10)],
          rounded_rect(0.0008, 0.0009, 0.0003, 1), 'glow', None, True, lambda p: Vector((-1, 0, 0))), 'ring')
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=14, radius=0.0068)
d = mesh_obj('thumb_dome', bm, 'key', 'ring'); d.location = (GX1 - 0.0045, GY, GZ); d.scale = (0.45, 1, 1)

# ---- turns: track (yaw, pitch) > ring (roll) > hatch (open about the hinge) ----
objs = [o for o in COL.objects if o.type == 'MESH']
yaw_e = bpy.data.objects.new('yaw', None); COL.objects.link(yaw_e)
pitch_e = bpy.data.objects.new('pitch', None); COL.objects.link(pitch_e); pitch_e.parent = yaw_e
roll_e = bpy.data.objects.new('roll', None); COL.objects.link(roll_e); roll_e.parent = pitch_e
hinge_e = bpy.data.objects.new('hingeE', None); COL.objects.link(hinge_e); hinge_e.parent = roll_e; hinge_e.location = HINGE
hinge_t = bpy.data.objects.new('hingeT', None); COL.objects.link(hinge_t); hinge_t.parent = pitch_e; hinge_t.location = HINGE
for o in objs:
    g = o['group']
    if g == 'track':
        o.parent = pitch_e
    elif g == 'ring':
        o.parent = roll_e
    else:
        o.parent = hinge_e if g == 'hatch' else hinge_t; o.location = Vector(o.location) - Vector(HINGE)


def pose(yaw=0, pitch=0, roll=0, open_=0):
    yaw_e.rotation_euler = (0, 0, R(-yaw))
    pitch_e.rotation_euler = (R(pitch), 0, 0)
    roll_e.rotation_euler = (0, R(roll), 0)
    hinge_e.rotation_euler = hinge_t.rotation_euler = (0, R(open_), 0)   # both upper halves swing up and over, outward


# ---- bake contact shading into each vertex, then write site5/js/ring-data.js ----
for o in objs:
    bpy.context.view_layer.objects.active = o
    for mname in [md.name for md in o.modifiers]:
        bpy.ops.object.modifier_apply(modifier=mname)
    o.data.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    o.data.color_attributes.active_color = o.data.color_attributes['ao']
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 96
scene.world = bpy.data.worlds.new('w'); scene.world.light_settings.distance = 0.025
for o in objs:
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')

SCALE = 1 / 1.4   # metres to ball radii; and Blender's (x, y fwd, z up) to the site's (x, y up, z fwd)
site = lambda v: [v.x * SCALE, v.z * SCALE, v.y * SCALE]


def b64(fmt, vals):
    return base64.b64encode(struct.pack('<%d%s' % (len(vals), fmt), *vals)).decode()


parts = []
bpy.context.view_layer.update()
for o in objs:
    me = o.data; me.calc_loop_triangles()
    ao, norms, M = me.color_attributes['ao'].data, me.corner_normals, o.matrix_world
    # positions relative to the frame each part turns in: the hatch halves about the hinge, the rest about the centre
    off = Vector(HINGE) if o['group'] in ('hatch', 'trackhatch') else Vector((0, 0, 0))
    P, N, A = [], [], []
    for tri in me.loop_triangles:
        for li, vi in zip(tri.loops, tri.vertices):
            P += site(M @ me.vertices[vi].co - off)
            n = (M.to_3x3() @ norms[li].vector).normalized()
            N += [round(n.x * 127), round(n.z * 127), round(n.y * 127)]
            A.append(round(max(0.0, min(1.0, ao[vi].color[0])) * 255))
    parts.append({'group': o['group'], 'mat': o.data.materials[0].name, 'pos': b64('f', P), 'nrm': b64('b', N), 'ao': b64('B', A), 'count': len(A)})
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('/* generated by site5/tools/make_ring.py (Blender): the floating ring controller for the right hand, in ball\n'
            '   radii, y up, z forward, about the ring\'s centre. Groups: track (yaw, pitch), trackhatch (+ opens about the\n'
            '   hinge), ring (+ roll), hatch (+ roll, + opens); hatch parts are relative to the hinge. Triangles as base64:\n'
            '   positions float32, normals int8, baked contact shading u8. */\n')
    f.write('window.SITE5_RING = ' + json.dumps({'hinge': site(Vector(HINGE)), 'parts': parts}, separators=(',', ':')) + ';\n')
print('ring: %d parts, %d triangles -> %s' % (len(parts), sum(p['count'] for p in parts) // 3, os.path.normpath(OUT)))

# ---- previews ----
if PREVIEW:
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light, sh.show_cavity, sh.show_shadows, sh.color_type = 'STUDIO', True, False, 'OBJECT'
    scene.render.resolution_x, scene.render.resolution_y = 760, 620
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); COL.objects.link(cam)
    aim = bpy.data.objects.new('aim', None); COL.objects.link(aim); aim.location = (0, 0.06, 0)
    tr = cam.constraints.new('TRACK_TO'); tr.target, tr.track_axis, tr.up_axis = aim, 'TRACK_NEGATIVE_Z', 'UP_Y'
    cam.data.lens = 40; cam.location = (-0.3, -0.3, 0.26); scene.camera = cam
    # a stand-in arm for the first view only (concept, never shipped)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.032, radius2=0.03, depth=0.3, matrix=Matrix.Rotation(R(90), 4, 'X'))
    armo = bpy.data.objects.new('arm', bpy.data.meshes.new('arm')); bm.to_mesh(armo.data); bm.free(); COL.objects.link(armo)
    armo.location = (0.005, -0.08, -0.004); armo.color = VIEW['arm']
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=Vector((0.085, 0.075, 0.05)), verts=bm.verts)
    fist = bpy.data.objects.new('fist', bpy.data.meshes.new('fist')); bm.to_mesh(fist.data); bm.free(); COL.objects.link(fist)
    fist.location = (0.005, 0.11, -0.006); fist.color = VIEW['arm']; s = fist.modifiers.new('s', 'SUBSURF'); s.levels = s.render_levels = 2
    for name, args, show_arm in (('closed', {}, True), ('open', {'open_': 115}, False), ('turned', {'yaw': 18, 'pitch': -16, 'roll': 30}, False), ('buttons', {}, False)):
        pose(**args)
        if name == 'buttons':   # a close look at the grip from below and behind, where the keys face
            aim.location, cam.location, cam.data.lens = (0.0, 0.17, -0.02), (-0.06, 0.03, -0.12), 50
        armo.hide_render = fist.hide_render = not show_arm
        scene.render.filepath = os.path.join(PREVIEW, 'ring_%s.png' % name)
        bpy.ops.render.render(write_still=True)
    pose()
    for o in (armo, fist):
        bpy.data.objects.remove(o)
print('ring model built')
