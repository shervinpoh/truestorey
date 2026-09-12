"""Owned editorial still lifes, never a depiction of a real property.

blender -b -P design/assets/render.py -- --subject lease --variant a
Blender 5.2 / Cycles CPU, fixed samples and seed. No external assets or fonts.
Use --preview for a quicker composition check, --subject all for both proofs.
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / 'palette.json').read_text())
ARGS = argparse.ArgumentParser()
ARGS.add_argument('--subject', choices=['lease', 'land', 'all'], default='lease')
ARGS.add_argument('--variant', choices=['a', 'b'], default='a')
ARGS.add_argument('--out', default=str(ROOT / 'masters'))
ARGS.add_argument('--preview', action='store_true')
args = ARGS.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])

def linear(hex_value):
    rgb = [int(hex_value.lstrip('#')[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb) + (1,)

def material(name, colour, roughness=.6, metallic=0, grain=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = linear(CFG['colours'][colour])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if grain:
        tex = nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 95
        coord = nodes.new('ShaderNodeTexCoord')
        links.new(coord.outputs['Object'], tex.inputs['Vector'])
        tex.inputs['Detail'].default_value = 4
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .6
        bump.inputs['Distance'].default_value = grain
        links.new(tex.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        ramp = nodes.new('ShaderNodeValToRGB')
        base = linear(CFG['colours'][colour])
        ramp.color_ramp.elements[0].color = tuple(v * .65 for v in base[:3]) + (1,)
        ramp.color_ramp.elements[1].color = base
        links.new(tex.outputs['Fac'], ramp.inputs[0])
        links.new(ramp.outputs[0], bsdf.inputs['Base Color'])
    return m

def cube(name, location, scale, mat, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Light catches a worked edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return o

def rod(name, a, b, radius, mat):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=(b-a).length, location=(a+b)/2)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o

def torus(name, loc, major, minor, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=96,
                                  minor_segments=20, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o

def camera(loc, at, lens=52):
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.object
    c.name = 'Editorial camera — fixed composition'
    c.rotation_euler = (Vector(at)-c.location).to_track_quat('-Z', 'Y').to_euler()
    c.data.lens = lens
    bpy.context.scene.camera = c
    c.data.dof.use_dof = True
    c.data.dof.focus_distance = (Vector(at)-c.location).length
    c.data.dof.aperture_fstop = 8

def light(name, loc, power, size, at=(0,0,0)):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object
    l.name = name
    l.data.energy = power
    l.data.shape = 'DISK'
    l.data.size = size
    l.rotation_euler = (Vector(at)-l.location).to_track_quat('-Z', 'Y').to_euler()

def key(name, location, angle, mat):
    # A conventional unbranded key, not a specific lock's security pattern.
    start = set(bpy.context.scene.objects)
    bow = torus(name+' bow', (0,0,.1), .29, .07, mat)
    bow.scale.z = .48
    cube(name+' shaft', (.74,0,.13), (1.05,.16,.12), mat, .025)
    for x, w in [(.7,.16), (.97,.2), (1.21,.13)]:
        cube(name+' bit', (x,-.15,.13), (w,.25,.12), mat, .018)
    objects = set(bpy.context.scene.objects) - start
    bpy.ops.object.empty_add()
    parent = bpy.context.object
    parent.name = name
    for obj in objects:
        obj.parent = parent
    parent.location = location
    parent.rotation_euler.z = angle

def lease():
    stone = material('Honed stone, visible mineral grain', 'stone', .82, grain=.014)
    silver = material('Aged nickel, satin finish', 'metal', .3, .88, .002)
    graphite = material('Darkened nickel', 'darkMetal', .36, .85, .003)
    cube('Continuous stone surface', (0,0,-.16), (200,200,.3), stone, 0)
    cube('Stone reveal behind keys', (0,2,-.10), (200,1.1,.48), stone, .025)
    key('Old key', (-.7,-.18,0), -.37, graphite)
    key('Companion key', (-.68,.12,.05), .52, silver)
    torus('Split ring', (-.9,-.01,.24), .34,.027,silver)
    camera((3.3,-5,4.9), (.15,.1,0), 58)
    light('Long soft window', (-3,-1,6), 1100, 4)
    light('Quiet edge reflection', (3,3,4), 600, 3)

def land():
    soil = material('Dry earth, fine aggregate', 'soil', .95, grain=.07)
    dark = material('Earth shadow', 'soilDark', .9, grain=.1)
    metal = material('Worked steel, no brand', 'darkMetal', .46, .7, .006)
    shaft = material('Grey ash handle', 'chalk', .7, grain=.004)
    cube('Ground extending beyond the frame', (0,0,-.24), (200,200,.4), soil, 0)
    # Aggregate is randomly scattered with a fixed seed, never a site survey.
    for i in range(650):
        x, y = random.uniform(-4,4), random.uniform(-3,5)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=random.uniform(.009,.085),
                                            location=(x,y,random.uniform(-.035,.012)))
        o = bpy.context.object
        o.name = 'Unlocated aggregate'
        o.scale = (1,random.uniform(.7,1.3),random.uniform(.3,.6))
        o.rotation_euler = (random.random(),random.random(),random.random())
        o.data.materials.append(dark if i%3 else soil)
        for p in o.data.polygons: p.use_smooth = True
    # A spade is an honest land-work object. No parcel outline, boundary or buildings.
    verts = [(-.43,.35,.02),(.43,.35,.02),(.52,-.3,.04),(.3,-.65,.02),
             (0,-.8,0),(-.3,-.65,.02),(-.52,-.3,.04)]
    mesh = bpy.data.meshes.new('Pressed spade blade')
    mesh.from_pydata(verts, [], [tuple(range(7))])
    mesh.update()
    o = bpy.data.objects.new('Spade blade',mesh)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(metal)
    sol = o.modifiers.new('Steel thickness','SOLIDIFY'); sol.thickness=.035
    b = o.modifiers.new('Rolled blade edge','BEVEL'); b.width=.04; b.segments=3
    o.modifiers.new('Blade normals','WEIGHTED_NORMAL')
    rod('Steel socket',(0,.05,.08),(0,.7,.22),.08,metal)
    rod('Ash handle extending out of frame',(0,.5,.17),(0,5,1.6),.075,shaft)
    camera((4,-5.2,5.2),(0,.45,0),53)
    light('Overcast side light',(-3,-1,6),1100,3)
    light('Open sky fill',(2,4,5),700,5)

def render(subject):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    random.seed(CFG['seed'])
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16 if args.preview else CFG['samples']
    scene.cycles.seed = CFG['seed']
    scene.cycles.use_animated_seed = False
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = True
    scene.render.resolution_x = CFG['width']
    scene.render.resolution_y = CFG['height']
    scene.render.resolution_percentage = 40 if args.preview else 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('Neutral ambient')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.55,.58,.6,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .4
    {'lease': lease, 'land': land}[subject]()
    if args.variant == 'b':
        scene.camera.location.x *= -.8
        scene.camera.rotation_euler = (Vector((0,.2,0))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    (ROOT/'scenes').mkdir(exist_ok=True)
    scene.render.filepath = str(out / f'subject-{subject}-{args.variant}.png')
    scene['illustration'] = 'Generic editorial still life. Does not depict a property or site.'
    scene['palette_config'] = 'design/assets/palette.json'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'scenes'/f'{subject}-{args.variant}.blend'))
    bpy.ops.render.render(write_still=True)

for subject in (['lease','land'] if args.subject == 'all' else [args.subject]):
    render(subject)
