"""Conceptual payment-stage maquette. Run inside live Blender via MCP.

This is an educational assembly, not a real project or a construction programme.
Each render is a statutory payment milestone; elapsed time is never encoded.
Existing scenes remain intact. Source geometry has no financial authority.
"""
import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path('/Users/shervinpoh/Desktop/truestorey/design/assets')
NAME = 'Truestorey • Construction study'

def material(name, color, roughness=.65, metallic=0):
    m = bpy.data.materials.new('TS • ' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return m

def build():
    scene = bpy.data.scenes.new(NAME)
    if bpy.context.window:
        bpy.context.window.scene = scene
    mats = {
        'chalk': material('completed chalk', (.69, .70, .66)),
        'selected': material('selected milestone', (.085, .38, .40), .38),
        'stone': material('plinth', (.49, .46, .40)),
        'paper': material('studio', (.86, .84, .78)),
        'glass': material('glazing', (.20, .29, .28), .21, .25),
        'metal': material('metal', (.20, .23, .22), .3, .5),
    }
    def box(name, loc, size, stage=-1, mat='chalk', bevel=.035):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        o = bpy.context.object
        o.name = 'TS • ' + name
        o.dimensions = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.data.materials.append(mats[mat])
        o['milestone'] = stage
        o['base_material'] = mat
        if bevel:
            mod = o.modifiers.new('Light-catching edges', 'BEVEL')
            mod.width = bevel
            mod.segments = 3
            o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        return o
    def cylinder(name, loc, radius, depth, stage, mat='chalk'):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=loc)
        o=bpy.context.object
        o.name='TS • '+name
        o.data.materials.append(mats[mat])
        o['milestone']=stage
        o['base_material']=mat
        mod=o.modifiers.new('Soft edge','BEVEL'); mod.width=.025; mod.segments=2
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
        return o

    box('presentation ground', (0,0,-2.85), (200,200,.2), mat='paper')
    box('sectioned earth plinth', (0,0,-2.3), (16,12,1), mat='stone', bevel=.12)
    box('site surface', (0,0,-.12), (11,7,.18), 2, mat='paper')['no_highlight']=True
    # Opening the front of the display exposes pile depth without claiming
    # that a real foundation would be exposed like this.
    for x in [-4.5,-1.5,1.5,4.5]:
        for y in [-2.6,2.6]:
            cylinder('foundation pile', (x,y,-1.15), .18,1.8,1)
            box('pile cap', (x,y,-.28), (.9,.9,.42),1)
    for y in [-2.6,2.6]:
        box('ground beam', (0,y,-.28),(9.9,.3,.32),1)
    for x in [-4.5,-1.5,1.5,4.5]:
        box('ground cross beam',(x,0,-.28),(.3,4.9,.32),1)

    for floor in range(4):
        z=floor*2.65
        box('floor slab', (0,0,z+.12),(10,6,.24),2)
        for x in [-4.5,-1.5,1.5,4.5]:
            for y in [-2.6,2.6]:
                box('structural column',(x,y,z+1.325),(.32,.32,2.17),2)
        for y in [-2.6,2.6]:
            box('structural beam',(0,y,z+2.56),(9.4,.32,.3),2)
        for x in [-4.5,-1.5,1.5,4.5]:
            box('cross beam',(x,0,z+2.56),(.32,4.88,.3),2)
        # Front facade intentionally omitted: this is a legible cutaway.
        for x in [-1.5,1.5]:
            box('interior partition',(x,.85,z+1.39),(.12,3.7,2.3),3)
        box('rear wall below windows',(0,2.6,z+.67),(9,.14,.85),3)
        box('rear wall over windows',(0,2.6,z+2.37),(9,.14,.34),3)
        for x in [-4.5,-1.5,1.5,4.5]:
            box('rear wall pier',(x,2.6,z+1.5),(.55,.14,1),3)
        for x in [-3,0,3]:
            for edge in [-1.15,1.15]:
                box('window jamb',(x+edge,2.54,z+1.65),(.07,.12,1.18),5)
            for h in [1.09,2.21]:
                box('window rail',(x,2.54,z+h),(2.36,.12,.07),5)
            box('window mullion',(x,2.54,z+1.65),(.055,.13,1.18),5)
            box('glass',(x,2.58,z+1.65),(2.2,.04,1.06),7,'glass',.005)
        # Services appear at their own milestone, legible through open front.
        for x in [-4.25,4.25]:
            cylinder('plumbing riser',(x,2.32,z+1.45),.06,2.55,5)
        box('electrical containment',(0,2.29,z+2.27),(8.4,.055,.065),5)
        for x in [-3,0,3]:
            box('finished floor',(x,-.1,z+.258),(2.83,5.45,.026),7,'paper',.01)
            box('balcony parapet',(x,-2.79,z+.64),(2.65,.1,.8),7)
    box('roofing',(0,0,10.72),(10.3,6.3,.25),4)
    for y in [-3.05,3.05]:
        box('roof parapet',(0,y,11.02),(10.25,.12,.38),4)
    for x in [-5.05,5.05]:
        box('roof parapet',(x,0,11.02),(.12,6.1,.38),4)

    box('estate driveway',(0,-4.55,.015),(14,1.9,.12),6,'stone')
    box('parking apron',(6.15,.15,.015),(1.55,7.4,.12),6,'stone')
    for y in [-3,-1.5,0,1.5,3]:
        box('parking bay marking',(6.15,y,.09),(1.4,.045,.02),6,'paper',0)
    for x in [-6,0,6]:
        box('drain cover',(x,-3.44,.07),(.65,.25,.035),6,'metal')
        for dx in [-.2,-.1,0,.1,.2]:
            box('drain slots',(x+dx,-3.44,.092),(.025,.19,.01),6,'paper',0)
    for x in [-5.9,5.9]:
        box('entrance bollard',(x,-3.8,.33),(.1,.1,.65),7,'metal')
    box('entrance step',(0,-3.22,.16),(2,.55,.26),7)

    world=bpy.data.worlds.new('TS • soft studio')
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.83,.86,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.5
    scene.world=world
    for name,loc,energy,size in [('key',(2,-10,21),2400,9),('fill',(-12,-1,12),1500,10),('rim',(4,9,18),2100,7)]:
        data=bpy.data.lights.new('TS • '+name,'AREA'); data.energy=energy*3; data.shape='DISK'; data.size=size
        o=bpy.data.objects.new(data.name,data); scene.collection.objects.link(o); o.location=loc
        o.rotation_euler=(Vector((0,0,4))-o.location).to_track_quat('-Z','Y').to_euler()
    cam=bpy.data.cameras.new('TS • study camera'); o=bpy.data.objects.new(cam.name,cam); scene.collection.objects.link(o)
    o.location=(23,-32,23)
    o.rotation_euler=(Vector((0,0,4))-o.location).to_track_quat('-Z','Y').to_euler()
    cam.type='ORTHO'; cam.ortho_scale=23.5; scene.camera=o
    scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
    scene.render.resolution_x=1200; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX'
    scene.view_settings.exposure=.75
    scene['construction_study']=True
    set_stage(scene,2)
    if bpy.context.screen:
        for area in bpy.context.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.shading.type='MATERIAL'
    return scene

def set_stage(scene,stage):
    for o in scene.objects:
        if 'milestone' not in o: continue
        milestone=o['milestone']
        o.hide_render=milestone>stage
        o.hide_set(milestone>stage)
        if o.type=='MESH' and o.data.materials:
            selected=milestone==stage and stage not in (0,8) and not o.get('no_highlight',False)
            o.data.materials[0]=bpy.data.materials['TS • '+('selected milestone' if selected else {
                'chalk':'completed chalk','paper':'studio','stone':'plinth','glass':'glazing','metal':'metal'
            }[o['base_material']])]
    scene['selected_milestone']=stage

def render_all(scene):
    out=ROOT/'construction-masters'; out.mkdir(exist_ok=True)
    # Render the first website view first. CPU avoids the very long initial
    # Metal shader compilation seen on this workstation. Denoised renders
    # retain the soft studio shadows without loading a GPU in the browser.
    scene.cycles.device='CPU'
    scene.cycles.samples=16
    scene.cycles.max_bounces=4
    scene.cycles.diffuse_bounces=2
    scene.cycles.glossy_bounces=2
    scene.render.threads_mode='FIXED'
    scene.render.threads=4
    scene.render.use_persistent_data=True
    for stage in [2,1,3,4,5,6,7,8,0]:
        set_stage(scene,stage)
        scene.render.filepath=str(out/f'stage-{stage}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)
    set_stage(scene,2)

if __name__=='__main__':
    scene=build()
    (ROOT/'scenes').mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'scenes'/'construction.blend'),copy=True)
    print('Created separate construction scene:',scene.name,'objects:',len(scene.objects))
