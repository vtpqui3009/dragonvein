"""Genome -> mesh. Every number in the body comes from a gene; nothing is hand-placed.

This is the Blender/reference implementation. The runtime TypeScript builder in
src/assets/dragon/ must follow the same construction order so the two agree.
"""
import bpy, math, colorsys
from genome import GENES, ELEMENTS, TAIL_TIPS, CRESTS, PATTERNS, Rng

# ------------------------------------------------------------------ skin graph
class Graph:
    def __init__(self): self.v=[]; self.r=[]; self.e=[]
    def node(self,p,r): self.v.append(tuple(p)); self.r.append(max(0.012,r)); return len(self.v)-1
    def chain(self,start,pts):
        prev=start; out=[]
        for p,r in pts:
            i=self.node(p,r); self.e.append((prev,i)); prev=i; out.append(i)
        return out
    def build(self,name,root,subsurf=2):
        me=bpy.data.meshes.new(name); me.from_pydata(self.v,self.e,[]); me.update()
        ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob)
        sk=ob.modifiers.new("Skin","SKIN"); sk.use_smooth_shade=True
        L=ob.data.skin_vertices[0].data
        for i,r in enumerate(self.r): L[i].radius=(r,r)
        L[root].use_root=True
        ss=ob.modifiers.new("Sub","SUBSURF"); ss.levels=subsurf; ss.render_levels=subsurf
        return ob

def lerp(a,b,t): return a+(b-a)*t
def bez(p0,p1,p2,t):
    u=1-t
    return tuple(u*u*p0[i]+2*u*t*p1[i]+t*t*p2[i] for i in range(3))

# ------------------------------------------------------------------ skeleton
def skeleton(p):
    """Return (graph, index map) built entirely from the phenotype dict."""
    BM,BL,CD = p["bodyMass"],p["bodyLength"],p["chestDepth"]
    TL,TT    = p["tailLength"],p["tailTaper"]
    NL,NA    = p["neckLength"],p["neckArc"]
    HS,SL    = p["headSize"],p["snoutLength"]
    g=Graph(); idx={}

    # --- tail: 5 nodes, tapering toward the tip ---
    tail_root_x = -0.75*BL
    tip_x = -2.95*TL*BL
    tail=[]
    for i in range(5):
        t=i/4.0
        x=lerp(tip_x,tail_root_x,t)
        z=lerp(0.50,0.86,t)+0.06*math.sin(t*math.pi)
        r=lerp(0.040, 0.355*BM, t**(1.0/max(0.4,TT)))
        tail.append(g.node((x,0,z),r))
    idx["tailTip"]=tail[0]

    # --- torso: hips -> chest -> shoulder ---
    torso=[]
    for i,(fx,fz,fr) in enumerate([(0.00,0.86,0.375),(0.33,0.97,0.450),
                                   (0.66,1.00,0.470),(1.00,0.96,0.395)]):
        x=lerp(tail_root_x, 0.95*BL, fx)
        r=fr*BM*(CD if 0.2<fx<0.8 else 1.0)
        n=g.node((x,0,fz),r); torso.append(n)
        if i==0: g.e.append((tail[-1],n))
        else:    g.e.append((torso[i-1],n))
    idx["hip"],idx["chest"],idx["shoulder"] = torso[0],torso[2],torso[3]

    # --- neck: quadratic arc whose rise is driven by neckArc ---
    sx,sz = 0.95*BL, 0.96
    reach = 0.70*NL
    rise  = 1.00*NL*(0.35+0.75*NA)
    p0=(sx,0,sz)
    p1=(sx+reach*0.25, 0, sz+rise*0.85)        # control point: high = S-curve
    p2=(sx+reach, 0, sz+rise)
    neck=[]
    prev=torso[-1]
    for i in range(1,4):
        t=i/3.0
        r=lerp(0.300*BM, 0.235*BM, t)
        n=g.node(bez(p0,p1,p2,t), r); g.e.append((prev,n)); prev=n; neck.append(n)
    idx["neck"]=neck[-1]

    # --- head: back -> mid -> snout -> nose ---
    hx,hy,hz = p2
    head=[]
    fwd = 0.34*HS
    for i,(dx,dz,fr) in enumerate([(0.00,0.30*HS,0.360),(fwd,0.32*HS,0.330),
                                   (fwd+0.33*SL*HS,0.23*HS,0.205),(fwd+0.52*SL*HS,0.16*HS,0.105)]):
        n=g.node((hx+dx,0,hz+dz), fr*HS)
        g.e.append((prev if i==0 else head[i-1], n)); head.append(n)
    idx["headBack"],idx["headMid"],idx["nose"]=head[0],head[1],head[3]
    idx["headPos"]=(hx,hz)
    idx["headMidPos"]=g.v[head[1]]
    idx["headBackPos"]=g.v[head[0]]
    return g, idx, p

# ------------------------------------------------------------------ appendages
def add_limbs(g, idx, p):
    LL,LT,TC = p["legLength"],p["legThickness"],int(p["toeCount"])
    BL = p["bodyLength"]
    for s in (1,-1):
        for (anchor, ax, back) in ((idx["hip"], -0.72*BL, True), (idx["shoulder"], 0.94*BL, False)):
            w = 0.34 if back else 0.31
            top_r = (0.30 if back else 0.255)*LT
            pts=[((ax,          w*s,      0.68-0.16*LL), top_r),
                 ((ax-0.12,     (w+0.12)*s, 0.40-0.28*LL), top_r*0.72),
                 ((ax+0.10,     (w+0.16)*s, 0.18-0.14*LL), top_r*0.50),
                 ((ax+0.30,     (w+0.18)*s, 0.085),        top_r*0.40)]
            foot=g.chain(anchor, pts)[-1]
            fx,fy = ax+0.30, (w+0.18)*s
            for k in range(TC):
                a = (k-(TC-1)/2)/max(1,TC-1)
                g.chain(foot, [((fx+0.19, fy+0.17*a, 0.075), top_r*0.30),
                               ((fx+0.34, fy+0.27*a, 0.065), top_r*0.19)])

def wing_nodes(p, s):
    """Bone positions for one wing. Returns (arm, finger_tips)."""
    WS,SH,DR,NF = p["wingSpan"],p["wingShape"],p["wingDroop"],int(p["wingFingers"])
    BL = p["bodyLength"]
    drop = -0.85*DR
    span = WS
    # broad (SH=0) = short + wide ; falcate (SH=1) = long + narrow
    out  = lerp(1.15, 0.80, SH) * span
    up   = lerp(0.80, 1.35, SH) * span
    arm=[((0.92*BL, 0.26*s, 1.22), 0.115*span),
         ((0.30*BL, 1.00*out*s, 2.00*up+drop), 0.080*span),
         ((-0.35*BL, 1.62*out*s, 2.58*up+drop), 0.055*span),
         ((-0.92*BL, 2.10*out*s, 2.88*up+drop), 0.028*span)]
    tips=[]
    for k in range(NF):
        f=(k+1)/(NF+1)
        tips.append(((-0.70-1.10*f)*BL, (2.05-0.55*f)*out*s, (2.20-0.80*f)*up+drop))
    return arm, tips

def add_wings(g, idx, p):
    for s in (1,-1):
        arm,tips = wing_nodes(p,s)
        bones=g.chain(idx["shoulder"], arm)
        wrist=bones[2]
        w2=arm[2][0]                      # wrist position (arm entries are (pos, radius))
        for t in tips:
            mid=((t[0]+w2[0])*0.51, (t[1]+w2[1])*0.5, (t[2]+w2[2])*0.5)
            g.chain(wrist, [(mid,0.042*p["wingSpan"]),(t,0.018*p["wingSpan"])])

def membrane(p, s):
    arm,tips = wing_nodes(p,s)
    W0,W1,W2,W3 = [a[0] for a in arm]
    BL=p["bodyLength"]
    A1,A2 = (-0.95*BL,0.40*s,1.05),(-0.20*BL,0.34*s,1.12)
    V=[W0,W1,W2,W3]+list(tips)+[A1,A2]
    nT=len(tips); iT=4; iA1=4+nT; iA2=iA1+1
    F=[(0,1,2,iA2),(iA2,2,iA1)]
    F.append((2,3,iT))
    for k in range(nT-1): F.append((2,iT+k,iT+k+1))
    F.append((2,iT+nT-1,iA1))
    me=bpy.data.meshes.new(f"Mem{s}")
    me.from_pydata(V,[],[list(f) for f in F]); me.update()
    ob=bpy.data.objects.new(f"Mem{s}",me); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active=ob
    bpy.ops.object.modifier_add(type='SOLIDIFY'); ob.modifiers[-1].thickness=0.034; ob.modifiers[-1].offset=0
    bpy.ops.object.modifier_add(type='SUBSURF')
    sub=ob.modifiers[-1]; sub.subdivision_type='SIMPLE'; sub.levels=3; sub.render_levels=3
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.shade_smooth()
    return ob

def add_crown(g, idx, p):
    HC,HL,HK,CT = int(p["hornCount"]),p["hornLength"],p["hornCurve"],int(p["crestType"])
    HS=p["headSize"]; hx,hz=idx["headPos"]
    back=idx["headBack"]
    pairs=max(0,HC)//2; odd=HC%2
    for i in range(pairs):
        f=(i+1)/(pairs+1)
        for s in (1,-1):
            yaw=0.16+0.26*f
            g.chain(back, [((hx-0.16*HL, yaw*s*HS, hz+(0.56+0.30*f)*HL*HS), 0.095*HS),
                           ((hx-0.16*HL-0.26*HL*(1-HK*0.5), (yaw+0.09)*s*HS, hz+(0.86+0.34*f)*HL*HS), 0.056*HS),
                           ((hx-0.16*HL-0.48*HL*(1-HK*0.8), (yaw+0.14)*s*HS, hz+(1.02+0.26*f)*HL*HS-0.22*HK*HL), 0.020*HS)])
    if odd:
        g.chain(back, [((hx-0.10*HL,0,hz+0.64*HL*HS),0.085*HS),
                       ((hx-0.28*HL,0,hz+1.00*HL*HS),0.048*HS),
                       ((hx-0.46*HL,0,hz+1.18*HL*HS-0.20*HK*HL),0.018*HS)])
    if CT==1:    # frill
        for s in (1,-1):
            for k in range(3):
                a=0.30+0.22*k
                g.chain(back, [((hx-0.22,(0.34+0.10*k)*s*HS,hz+0.18-0.10*k),0.085*HS),
                               ((hx-0.52-0.10*k,(0.64+0.16*k)*s*HS,hz+0.10-0.22*k),0.028*HS)])
    elif CT==2:  # dorsal fin on the skull
        for k in range(3):
            g.chain(back, [((hx-0.10-0.18*k,0,hz+0.46+0.14*k),0.070*HS),
                           ((hx-0.26-0.20*k,0,hz+0.80+0.10*k),0.024*HS)])
    elif CT==3:  # antler
        for s in (1,-1):
            br=g.chain(back, [((hx-0.18,0.22*s*HS,hz+0.60*HS),0.075*HS),
                              ((hx-0.44,0.40*s*HS,hz+0.96*HS),0.044*HS)])[-1]
            for d in (-1,1):
                g.chain(br, [((hx-0.70,(0.40+0.26*d)*s*HS,hz+1.22*HS),0.024*HS),
                             ((hx-0.92,(0.40+0.42*d)*s*HS,hz+1.40*HS),0.012*HS)])

TORSO_PROFILE=[(0.00,0.86,0.375),(0.33,0.97,0.450),(0.66,1.00,0.470),(1.00,0.96,0.395)]

def torso_at(t, BM, CD):
    """Height and radius of the torso at normalised position t — the same control points
    the skeleton uses, so dorsal spikes sit ON the back instead of hovering above it."""
    for i in range(len(TORSO_PROFILE)-1):
        a,b = TORSO_PROFILE[i], TORSO_PROFILE[i+1]
        if a[0] <= t <= b[0]:
            u=(t-a[0])/(b[0]-a[0])
            z=lerp(a[1],b[1],u); fr=lerp(a[2],b[2],u)
            return z, fr*BM*(CD if 0.2<t<0.8 else 1.0)
    z,fr = TORSO_PROFILE[-1][1], TORSO_PROFILE[-1][2]
    return z, fr*BM

def dorsal_spikes(p, offset=(0,0,0), rotz=0.0):
    SC,SH2 = int(p["spineCount"]),p["spineHeight"]
    BM,BL,CD = p["bodyMass"],p["bodyLength"],p["chestDepth"]
    out=[]
    for i in range(SC):
        t=i/max(1,SC-1)
        x=lerp(-0.75*BL, 0.95*BL, t)
        z,r = torso_at(t, BM, CD)
        h=(0.10+r*0.60)*SH2
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=r*0.26, radius2=0, depth=h,
                                        location=(x, 0, z+r*0.86+h*0.40))
        c=bpy.context.object; c.rotation_euler=(0,math.radians(-14),0)
        bpy.ops.object.shade_flat(); out.append(c)
    return out

def tail_ornament(p):
    TT=int(p["tailTip"]); TL,BL=p["tailLength"],p["bodyLength"]
    x=-2.95*TL*BL; out=[]
    if TT==0: return out
    if TT==1:   # fin
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.26, radius2=0, depth=0.70, location=(x-0.1,0,0.80))
        o=bpy.context.object; o.rotation_euler=(0,math.radians(-60),0); o.scale=(1,0.22,1)
    elif TT==2: # spade
        bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.30, radius2=0, depth=0.56, location=(x-0.14,0,0.60))
        o=bpy.context.object; o.rotation_euler=(0,math.radians(-96),0); o.scale=(1,0.30,1)
    else:       # club
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.26, location=(x-0.12,0,0.56))
        o=bpy.context.object
    bpy.ops.object.shade_flat(); out.append(o); return out

# ------------------------------------------------------------------ materials
def hsv(h,s,v): 
    r,g,b=colorsys.hsv_to_rgb(h%1.0, min(1,max(0,s)), min(1,max(0,v))); return (r,g,b)

ELEMENT_TINT = {"ember":(0.03,0.95,1.0),"tide":(0.53,0.80,1.0),"stone":(0.09,0.35,0.7),
                "gale":(0.46,0.45,1.0),"jade":(0.38,0.85,0.95),"umbra":(0.76,0.70,0.85)}

def mats(p, element):
    H,HSh,S,V,GL = p["hue"],p["hueShift"],p["saturation"],p["value"],p["glow"]
    scale  = hsv(H, S, V)
    belly  = hsv(H+HSh, S*0.60, min(0.95, V+0.34))
    memb   = hsv(H+HSh*1.6, S*0.85, min(0.92, V+0.22))
    horn   = hsv(H+0.5*HSh, S*0.30, min(0.96, V+0.46))
    et     = ELEMENT_TINT.get(element,(0.1,0.8,1.0))
    glowc  = hsv(et[0], et[1], et[2])
    def M(name,rgb,rough,sss=0.0,emis=None,es=0.0):
        m=bpy.data.materials.new(name); m.use_nodes=True
        b=m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value=(*rgb,1)
        b.inputs["Roughness"].default_value=rough
        if "Subsurface Weight" in b.inputs: b.inputs["Subsurface Weight"].default_value=sss
        if emis:
            b.inputs["Emission Color"].default_value=(*emis,1)
            b.inputs["Emission Strength"].default_value=es
        return m
    return {"scale":M("scale",scale,0.38,0.20),
            "belly":M("belly",belly,0.48,0.32),
            "memb" :M("memb", memb, 0.50,0.70),
            "horn" :M("horn", horn, 0.30, emis=glowc, es=GL*2.4),
            "eye"  :M("eye",(0.03,0.04,0.07),0.06),
            "hi"   :M("hi",(1,1,1),0.05,emis=(1,1,1),es=2.0),
            "glow" :M("glow",glowc,0.15,emis=glowc,es=1.2+GL*4.0)}

def paint_belly(ob, belly_mat, thresh=-0.30):
    ob.data.materials.append(belly_mat)
    i=len(ob.data.materials)-1
    for poly in ob.data.polygons:
        if poly.normal.z < thresh: poly.material_index=i

# ------------------------------------------------------------------ assembly
def place(genome, location=(0,0,0), rotz=0.0, name="dragon"):
    p = genome.phenotype
    el = genome.primary_element
    M = mats(p, el)
    g, idx, _ = skeleton(p)
    add_limbs(g, idx, p); add_wings(g, idx, p); add_crown(g, idx, p)
    body = g.build(name, root=idx["chest"])
    bpy.context.view_layer.objects.active = body
    for m in list(body.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.shade_smooth()
    body.data.materials.append(M["scale"]); paint_belly(body, M["belly"])
    parts=[body]
    for s in (1,-1):
        mm=membrane(p,s); mm.data.materials.append(M["memb"]); parts.append(mm)
    for c in dorsal_spikes(p): c.data.materials.append(M["horn"]); parts.append(c)
    for o in tail_ornament(p): o.data.materials.append(M["horn"]); parts.append(o)
    # eyes sit on the actual skull node, not on an estimate
    ex,ey,ez = idx["headMidPos"]; HS=p["headSize"]
    for s in (1,-1):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.112*HS, location=(ex+0.10*HS, 0.215*HS*s, ez+0.13*HS))
        e=bpy.context.object; bpy.ops.object.shade_smooth(); e.data.materials.append(M["eye"]); parts.append(e)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.038*HS, location=(ex+0.17*HS, 0.258*HS*s, ez+0.17*HS))
        h=bpy.context.object; bpy.ops.object.shade_smooth(); h.data.materials.append(M["hi"]); parts.append(h)

    # One empty owns the whole creature, so a yaw rotates the body instead of spinning
    # each part about its own origin -- that is what flung the eyes and spikes loose.
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0,0,0))
    root=bpy.context.object; root.name=name+"_root"
    for o in parts:
        o.parent=root
        o.matrix_parent_inverse=root.matrix_world.inverted()
    root.rotation_euler=(0,0,rotz)
    root.location=location
    return [root]+parts
