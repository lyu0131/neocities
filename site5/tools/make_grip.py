"""site5 grip: models one control grip in Blender, bakes its contact shading, and writes it out as
site5/js/grip-data.js for seat.js (the pages open from file://, so the model ships as a script, not a .glb).

Run:  blender -b --factory-startup -P site5/tools/make_grip.py -- [preview.png]

The grip is modelled at real size in metres, its origin at the gimbal's pivot, y up, z forward (toward the
monitor), for the right hand; seat.js scales it to ball radii, mirrors it for the left hand and tilts the moving
parts about the pivot. Parts, each with a `moves` weight (0 fixed, 0.5 the bellows, which bends half as far, 1 the
stick) and a material name seat.js knows:
  base   gimbal housing, bezel, cap screws                    dark / metal       fixed
  boot   ribbed bellows                                       boot               half
  stick  shaft, collar, sculpted handgrip (finger grooves,     metal / dark /     whole
         palm swell, pinky flange), the head tilted forward,  grip / cap /
         a 4-way hat switch, two thumb buttons, the trigger   button / accent
"""
import bpy, bmesh, math, sys, os, base64, struct, json
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'js', 'grip-data.js')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = argv[0] if argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = scene.collection


def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    return m


def finish(obj, mat, moves, bevel=None, subdiv=0, smooth=True):
    """give it a material and its modifiers; remember how it moves"""
    obj.data.materials.clear()
    obj.data.materials.append(material(mat))
    obj['moves'] = moves
    if bevel:
        b = obj.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel[0], bevel[1], 'ANGLE'
        b.angle_limit = math.radians(40)
        b.harden_normals = True
    if subdiv:
        s = obj.modifiers.new('subd', 'SUBSURF')
        s.levels = s.render_levels = subdiv
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def new_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    return ob


def box(name, size, loc, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = new_obj(name, bm)
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    return ob


def cyl(name, r, depth, loc, rot=(0, 0, 0), seg=32):
    """a cylinder along y"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=depth,
                          matrix=Matrix.Rotation(math.radians(90), 4, 'X'))
    ob = new_obj(name, bm)
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    return ob


def lathe(name, profile, seg=40):
    """a surface of revolution about y from (radius, y) pairs, capped"""
    bm = bmesh.new()
    rings = []
    for r, y in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * k / seg), y, r * math.sin(2 * math.pi * k / seg))) for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)


def loft(name, y0, y1, n, seg, section):
    """a closed loft: section(t, a) -> (x, y, z) for t in 0..1 up the part and a round it; capped"""
    bm = bmesh.new()
    rings = [[bm.verts.new(section(i / (n - 1), 2 * math.pi * k / seg)) for k in range(seg)] for i in range(n)]
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm)


# ---- the base (fixed): a gimbal housing with a bezel and four cap screws ----
finish(box('housing', (0.072, 0.03, 0.074), (0, -0.017, 0)), 'dark', 0, bevel=(0.006, 3))
finish(cyl('bezel', 0.031, 0.006, (0, 0.0, 0)), 'dark', 0, bevel=(0.0015, 2))
finish(cyl('bezel_lip', 0.026, 0.004, (0, 0.003, 0)), 'metal', 0, bevel=(0.0008, 2))
for sx in (-1, 1):
    for sz in (-1, 1):
        finish(cyl('screw', 0.0034, 0.0025, (sx * 0.028, 0.0004, sz * 0.029), seg=16), 'metal', 0, bevel=(0.0006, 2))
        finish(cyl('socket', 0.0016, 0.0008, (sx * 0.028, 0.0018, sz * 0.029), seg=6), 'dark', 0)

# ---- the bellows boot (bends half as far): ribbed, narrowing to the collar ----
prof = []
for i in range(25):
    t = i / 24
    y = 0.004 + t * 0.044
    r = 0.025 + (0.0135 - 0.025) * t + 0.0026 * math.cos(t * 7 * 2 * math.pi)
    prof.append((r, y))
finish(lathe('boot', prof, 40), 'boot', 0.5)

# ---- the stick (moves whole) ----
finish(cyl('shaft', 0.008, 0.024, (0, 0.05, 0)), 'metal', 1)
finish(cyl('collar', 0.0165, 0.009, (0, 0.062, 0)), 'dark', 1, bevel=(0.002, 2))
finish(cyl('collar_ring', 0.0172, 0.0018, (0, 0.0585, 0)), 'metal', 1, bevel=(0.0006, 1))

LEAN = math.radians(9)   # the handgrip leans forward a little


def grip_section(t, a):
    """the handgrip's cross-section at height t (0 bottom .. 1 top), angle a round it (0 = +x side)"""
    y = 0.068 + t * 0.105
    c, s = math.cos(a), math.sin(a)
    rx = 0.0175 + 0.0035 * math.sin(t * math.pi)                           # a little fuller at the middle
    front = 0.017 - 0.0028 * max(0.0, math.cos((t - 0.12) * 3 * 2 * math.pi)) * (0.25 < t + 0.13 < 0.95)  # three finger grooves
    back = 0.021 + 0.006 * math.exp(-((t - 0.55) / 0.22) ** 2)             # the palm swell
    rz = front if s > 0 else back
    flare = 1 + 0.32 * math.exp(-(t / 0.07) ** 2)                          # the pinky flange at the bottom
    x, z = rx * c * flare, rz * s * flare - 0.002
    return (x, y, z + y * math.tan(LEAN) - 0.068 * math.tan(LEAN))


finish(loft('handgrip', 0.068, 0.173, 28, 40, grip_section), 'grip', 1, subdiv=1)

# the head: tilted forward over the fingers, a thumb deck on top
hy, hz = 0.186, 0.023
head = finish(box('head', (0.046, 0.03, 0.058), (0, hy, hz), (-18, 0, 0)), 'cap', 1, bevel=(0.009, 4))
hm = Matrix.Translation((0, hy, hz)) @ Matrix.Rotation(math.radians(-18), 4, 'X')   # the head's frame


def on_head(name, r, h, x, z, mat, seg=24):
    """a cylinder standing on the head's top deck at (x, z) in the head's frame"""
    p = hm @ Vector((x, 0.015 + h / 2, z))
    ob = cyl(name, r, h, p, (-18, 0, 0), seg)
    return ob


finish(on_head('hat_base', 0.0072, 0.002, 0, -0.012, 'button'), 'button', 1, bevel=(0.0006, 2))
finish(on_head('hat', 0.0045, 0.0065, 0, -0.012, 'button'), 'button', 1, bevel=(0.0012, 3))
for k in range(4):   # the hat's four direction nubs
    a = k * math.pi / 2
    p = hm @ Vector((0.0052 * math.cos(a), 0.0175, -0.012 + 0.0052 * math.sin(a)))
    finish(box('hat_nub', (0.002, 0.002, 0.002), p, (-18, 0, 0)), 'button', 1, bevel=(0.0005, 1))
finish(on_head('btn_a', 0.0042, 0.0028, -0.011, 0.011, 'button'), 'accent', 1, bevel=(0.0008, 2))
finish(on_head('btn_b', 0.0042, 0.0028, 0.011, 0.011, 'button'), 'button', 1, bevel=(0.0008, 2))
finish(on_head('btn_ring', 0.0055, 0.0009, -0.011, 0.011, 'metal'), 'metal', 1)

# the trigger: a curved blade under the head's front, in a guard slot
bm = bmesh.new()
pts = []
for i in range(9):
    t = i / 8
    ang = math.radians(-10 - 55 * t)
    pts.append(Vector((0, 0.166 - 0.028 * t, 0.027 + 0.011 * math.cos(ang) - 0.003 * t)))   # tucked into the grip's front
rings = []
for p in pts:
    rings.append([bm.verts.new(p + Vector((dx, 0, dz))) for dx, dz in ((-0.006, -0.003), (0.006, -0.003), (0.006, 0.003), (-0.006, 0.003))])
for a, b in zip(rings, rings[1:]):
    for k in range(4):
        bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
bm.faces.new(list(reversed(rings[0])))
bm.faces.new(rings[-1])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
finish(new_obj('trigger', bm), 'button', 1, bevel=(0.0018, 3))
finish(box('side_btn', (0.004, 0.012, 0.008), (0.0195, 0.15, 0.012)), 'button', 1, bevel=(0.0014, 2))

# ---- apply the modifiers, bake contact shading into a per-vertex attribute ----
objs = [o for o in COL.objects if o.type == 'MESH']
for o in objs:
    bpy.context.view_layer.objects.active = o
    for mname in [md.name for md in o.modifiers]:
        bpy.ops.object.modifier_apply(modifier=mname)
    o.data.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    o.data.color_attributes.active_color = o.data.color_attributes['ao']

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 96
world = bpy.data.worlds.new('w')
scene.world = world
world.light_settings.distance = 0.03     # how far a crevice looks for cover, in metres
for o in objs:
    for p in o.data.polygons:
        p.use_smooth = p.use_smooth
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')

# ---- write site5/js/grip-data.js ----
SCALE = 1 / 1.4   # metres to ball radii


def b64(fmt, vals):
    return base64.b64encode(struct.pack('<%d%s' % (len(vals), fmt), *vals)).decode()


parts = []
for o in objs:
    me = o.data
    me.calc_loop_triangles()
    ao = me.color_attributes['ao'].data
    norms = me.corner_normals
    P, N, A = [], [], []
    for tri in me.loop_triangles:
        for li, vi in zip(tri.loops, tri.vertices):
            co = o.matrix_world @ me.vertices[vi].co
            n = (o.matrix_world.to_3x3() @ norms[li].vector).normalized()
            P += [co.x * SCALE, co.y * SCALE, co.z * SCALE]
            N += [round(n.x * 127), round(n.y * 127), round(n.z * 127)]
            A.append(round(max(0.0, min(1.0, ao[vi].color[0])) * 255))
    parts.append({'name': o.name, 'mat': o.data.materials[0].name, 'moves': o['moves'],
                  'pos': b64('f', P), 'nrm': b64('b', N), 'ao': b64('B', A), 'count': len(A)})

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('/* generated by site5/tools/make_grip.py (Blender): the control grip, in ball radii, its origin at the gimbal\n'
            '   pivot, y up, z forward, for the right hand. Each part: material, how far it moves with the stick (0, .5\n'
            '   the bellows, 1), and its triangles as base64 (positions float32, normals int8, baked contact shading u8). */\n')
    f.write('window.SITE5_GRIP = ' + json.dumps({'parts': parts}, separators=(',', ':')) + ';\n')
print('grip: %d parts, %d triangles -> %s' % (len(parts), sum(p['count'] for p in parts) // 3, os.path.normpath(OUT)))

# ---- a preview render, for checking by eye ----
if PREVIEW:
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = 900, 1100
    # Blender's up is z, the model's is y: stand it up under a parent for the camera (the export is done)
    stand = bpy.data.objects.new('stand', None)
    COL.objects.link(stand)
    stand.rotation_euler = (math.radians(90), 0, 0)
    for ob in objs:
        ob.parent = stand
    aim = bpy.data.objects.new('aim', None)
    COL.objects.link(aim)
    aim.location = (0, -0.012, 0.1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    COL.objects.link(cam)
    track = cam.constraints.new('TRACK_TO')
    track.target, track.track_axis, track.up_axis = aim, 'TRACK_NEGATIVE_Z', 'UP_Y'
    cam.data.lens = 50
    scene.camera = cam
    base, ext = os.path.splitext(PREVIEW)
    for tag, loc in (('_front', (0.2, -0.36, 0.22)), ('_back', (-0.26, 0.26, 0.26))):   # the pilot's side and the far side
        cam.location = loc
        scene.render.filepath = base + tag + ext
        bpy.ops.render.render(write_still=True)
        print('preview ->', scene.render.filepath)
