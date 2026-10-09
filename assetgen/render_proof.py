import bpy, math, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from genome import wild, breed, ELEMENTS, CRESTS, TAIL_TIPS, PATTERNS
import dragon as D
OUT = os.path.dirname(os.path.abspath(__file__))

def sky(top,bot,horizon,strength):
    w=bpy.data.worlds.new("W"); bpy.context.scene.world=w; w.use_nodes=True
    nt=w.node_tree; nt.nodes.clear()
    out=nt.nodes.new("ShaderNodeOutputWorld"); bg=nt.nodes.new("ShaderNodeBackground")
    bg.inputs[1].default_value=strength
    tc=nt.nodes.new("ShaderNodeTexCoord"); sep=nt.nodes.new("ShaderNodeSeparateXYZ")
    mr=nt.nodes.new("ShaderNodeMapRange")
    mr.inputs['From Min'].default_value=-0.35; mr.inputs['From Max'].default_value=0.55
    ramp=nt.nodes.new("ShaderNodeValToRGB"); cr=ramp.color_ramp
    cr.elements[0].position=0.0; cr.elements[0].color=(*bot,1)
    cr.elements[1].position=1.0; cr.elements[1].color=(*top,1)
    m=cr.elements.new(0.32); m.color=(*horizon,1)
    nt.links.new(tc.outputs['Generated'],sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'],mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'],ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'],bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'],out.inputs['Surface'])

def studio():
    bpy.ops.object.light_add(type='SUN',location=(10,-8,16))
    s=bpy.context.object; s.data.energy=6.2; s.data.angle=math.radians(5)
    s.data.color=(1.0,0.90,0.74); s.rotation_euler=(math.radians(54),0,math.radians(36))
    bpy.ops.object.light_add(type='AREA',location=(-14,-10,8))
    f=bpy.context.object; f.data.energy=1100; f.data.size=26; f.data.color=(0.42,0.60,1.0)
    f.rotation_euler=(math.radians(68),0,math.radians(-56))
    bpy.ops.object.light_add(type='AREA',location=(-6,16,7))
    r=bpy.context.object; r.data.energy=2600; r.data.size=20; r.data.color=(1.0,0.60,0.34)
    r.rotation_euler=(math.radians(74),0,math.radians(196))

def aim_ortho(target, rx_deg, rz_deg, dist, scale):
    """Place an ortho camera so `target` is dead centre. Guessing a position and hoping
    it framed the group is what cropped the first breeding sheet."""
    rx,rz = math.radians(rx_deg), math.radians(rz_deg)
    # Blender cameras look down -Z; euler XYZ -> direction = Rz * Rx * (0,0,-1)
    dx,dy,dz = 0.0, math.sin(rx), -math.cos(rx)
    wx = math.cos(rz)*dx - math.sin(rz)*dy
    wy = math.sin(rz)*dx + math.cos(rz)*dy
    loc = (target[0]-wx*dist, target[1]-wy*dist, target[2]-dz*dist)
    bpy.ops.object.camera_add(location=loc, rotation=(rx,0,rz))
    c=bpy.context.object; c.data.type='ORTHO'; c.data.ortho_scale=scale
    bpy.context.scene.camera=c; return c

def ground(rgb=(0.10,0.13,0.12)):
    bpy.ops.mesh.primitive_plane_add(size=300)
    g=bpy.context.object
    m=bpy.data.materials.new("G"); m.use_nodes=True
    b=m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value=(*rgb,1); b.inputs["Roughness"].default_value=0.95
    g.data.materials.append(m)

def shoot(path,w,h,samples):
    sc=bpy.context.scene
    sc.render.engine='CYCLES'; sc.cycles.samples=samples; sc.cycles.device='CPU'
    sc.cycles.use_denoising=True
    sc.render.resolution_x=w; sc.render.resolution_y=h
    sc.view_settings.view_transform='AgX'; sc.view_settings.look='AgX - Medium High Contrast'
    sc.render.filepath=path
    t=time.time(); bpy.ops.render.render(write_still=True)
    print(f"  -> {os.path.basename(path)} {time.time()-t:.0f}s", flush=True)

# ---------------- 1. species lineup: one wild dragon per element ----------------
def lineup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    seeds=[101,203,307,411,523,631]
    for i,(el,sd) in enumerate(zip(ELEMENTS,seeds)):
        gm=wild(sd, el)
        cx=(i%3-1)*9.5; cy=(0.5-(i//3))*9.0
        D.place(gm, location=(cx,cy,0.0), rotz=math.radians(-28), name=f"d{i}")
        p=gm.phenotype
        print(f"  {el:6} mass={p['bodyMass']:.2f} wing={p['wingSpan']:.2f} horns={int(p['hornCount'])} "
              f"crest={CRESTS[int(p['crestType'])]:6} spines={int(p['spineCount'])} "
              f"tail={TAIL_TIPS[int(p['tailTip'])]:5} rarity={gm.rarity():.2f}", flush=True)
    ground(); sky((0.04,0.10,0.28),(0.22,0.20,0.26),(0.95,0.56,0.30),1.7); studio()
    aim_ortho((0,0,1.4), 62, 43, 40, 34)
    shoot(os.path.join(OUT,"proof_species.png"),1700,980,26)

# ---------------- 2. breeding: parent A + parent B -> child ----------------
def breeding():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pa=wild(101,"ember"); pb=wild(203,"tide")
    kid=breed(pa,pb,2026)
    for nm,gm,loc in (("A",pa,(-9.5,3.5,0)),("B",pb,(9.5,3.5,0)),("child",kid,(0,-6.5,0))):
        D.place(gm, location=loc, rotz=math.radians(-28), name=f"p{nm}")
        p=gm.phenotype
        print(f"  {nm:6} {gm.gid()} el={gm.element} mass={p['bodyMass']:.2f} wing={p['wingSpan']:.2f} "
              f"horns={int(p['hornCount'])} fingers={int(p['wingFingers'])} "
              f"crest={CRESTS[int(p['crestType'])]:6} rarity={gm.rarity():.2f}", flush=True)
    ground(); sky((0.05,0.09,0.26),(0.26,0.18,0.24),(1.0,0.50,0.26),1.7); studio()
    aim_ortho((0,-1.0,1.4), 61, 42, 40, 32)
    shoot(os.path.join(OUT,"proof_breeding.png"),1700,980,26)

if __name__=="__main__":
    print("== species lineup =="); lineup()
    print("== breeding =="); breeding()
    print("DONE")
