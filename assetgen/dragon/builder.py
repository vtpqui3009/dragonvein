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
def bez3(p0,p1,p2,p3,t):
    u=1-t
    return tuple(u*u*u*p0[i]+3*u*u*t*p1[i]+3*u*t*t*p2[i]+t*t*t*p3[i] for i in range(3))

# ------------------------------------------------------------------ body plan (M3f)
# How far each body gene reaches the outline. src/assets/dragon/graph.ts states the same
# numbers. At the middle of every range the dragon is about the M3e one; at the ends the
# outline moves (artifacts/variants/dragon-sweep.json measures it):
#
#   bodyMass   girth: each torso node's radius scales by girth(BM, k). Below the middle of the
#              range all four slim alike (to 0.51 at the low end); above it the chest swells
#              most (to 1.74) and the hip least (1.50; TORSO_GAIN), so a heavy dragon is
#              barrel-chested and front-heavy (docs/ART_BIBLE.md, Proportions). The centre
#              sinks by BELLY_SAG of the added radius, so a heavy belly hangs and a light one
#              tucks up; it never comes nearer the ground than CLEARANCE.
#   headSize   the skull, horns, crest and eyes scale by head_scale(HS): 0.78 at the low end,
#              1.77 at the high, so the range spans more than twice the size.
#   legLength  ride height: the hip and everything it carries rise by ride_lift(LL), from 0.43
#              below the middle to 0.43 above it, and the legs reach from the body to the
#              ground, upright.
#   neckLength / neckArc  a cubic neck. A low arc is a straight neck reaching forward; a high
#              one rises steeply in a swan's S (forward and low, then up), the head held high.
#
# Girth and ride height follow saturating curves, d / (KNEE + |d|) with d the gene's distance
# from its range's middle: steep where wild dragons cluster, flattening toward the ends so
# neither extreme leaves plausibility. Only + - * / and abs, so the TS port is exact.
RIDE_MID=0.90        # hip centre height at the middle of legLength's range (bodyMass at 1)
RIDE_GAIN=0.62
RIDE_KNEE=0.15
GIRTH_KNEE=0.25
GIRTH_LOW=0.95                       # all four torso nodes, below the middle of bodyMass
TORSO_GAIN=(0.70, 0.95, 1.10, 1.00)  # hip, belly, chest, shoulder, above it: the chest swells most
HEAD_GAIN=0.6
BELLY_SAG=0.45       # how much of its added radius a heavier torso's centre sinks by
CLEARANCE=0.12       # the belly's least height above the ground

def ride_lift(LL):
    d=LL-1.05
    return RIDE_GAIN*(d/(RIDE_KNEE+abs(d)))

def girth(BM, k):
    """Torso radius multiplier for a bodyMass at torso node k (0 hip ... 3 shoulder)."""
    d=BM-1.075
    s=d/(GIRTH_KNEE+abs(d))
    return 1.075+GIRTH_LOW*s+(TORSO_GAIN[k]-GIRTH_LOW)*max(s,0.0)

def head_scale(HS):
    """The skull's scale for a headSize: horns, crest and eyes scale with it."""
    return HS+HEAD_GAIN*(HS-0.78)

TORSO_PROFILE=[(0.00,0.86,0.375),(0.33,0.97,0.450),(0.66,1.00,0.470),(1.00,0.96,0.395)]

def torso_nodes(p):
    """The four torso nodes, hip to shoulder: (x, z, radius)."""
    BM,BL,CD,LL = p["bodyMass"],p["bodyLength"],p["chestDepth"],p["legLength"]
    lift=(RIDE_MID-0.86)+ride_lift(LL)
    out=[]
    for k,(fx,fz,fr) in enumerate(TORSO_PROFILE):
        x=lerp(-0.75*BL, 0.95*BL, fx)
        r0=fr*(CD if 0.2<fx<0.8 else 1.0)
        r=r0*girth(BM,k)
        z=max(fz+lift-BELLY_SAG*(r-r0), r+CLEARANCE)
        out.append((x,z,r))
    return out

# ------------------------------------------------------------------ skeleton
def skeleton(p):
    """Return (graph, index map) built entirely from the phenotype dict."""
    BM,BL    = p["bodyMass"],p["bodyLength"]
    TL,TT    = p["tailLength"],p["tailTaper"]
    NL,NA    = p["neckLength"],p["neckArc"]
    SL       = p["snoutLength"]
    HS       = head_scale(p["headSize"])
    g=Graph(); idx={}
    G=girth(BM,0)
    tn=torso_nodes(p)
    hip_z=tn[0][1]

    # --- tail: 4 nodes tapering toward the tip, then the hip as its fifth ---
    # The fifth tail node used to sit exactly on the hip. Blender's Skin modifier collapses
    # a chain behind a zero-length edge to nothing, so the reference tail rendered as a
    # floating ornament (STATE.md run 12). The t = 1 point is the hip, so the chain ends there.
    # It falls from the hip to 58 % of the hip's height at the tip, so it rides with the body.
    tail_root_x = -0.75*BL
    tip_x = -2.95*TL*BL
    tail=[]
    for i in range(4):
        t=i/4.0
        x=lerp(tip_x,tail_root_x,t)
        z=lerp(0.58*hip_z,hip_z,t)+0.06*math.sin(t*math.pi)
        r=lerp(0.040, 0.355*G, t**(1.0/max(0.4,TT)))
        tail.append(g.node((x,0,z),r))
        # The tail is a chain. Without these edges the Skin modifier skinned nodes 0-3 as
        # loose beads floating behind the body (docs/concept/01-species-lineup.png), where
        # GENOME.md makes tailTaper "tail radius falloff exponent" -- one tapering tail.
        if i: g.e.append((tail[i-1],tail[i]))
    idx["tailTip"]=tail[0]

    # --- torso: hips -> chest -> shoulder ---
    torso=[]
    for i,(x,z,r) in enumerate(tn):
        n=g.node((x,0,z),r); torso.append(n)
        if i==0: g.e.append((tail[-1],n))
        else:    g.e.append((torso[i-1],n))
    idx["hip"],idx["chest"],idx["shoulder"] = torso[0],torso[2],torso[3]

    # --- neck: a cubic from the shoulder. Its controls sit on the straight line at neckArc 0
    # and move toward a swan's S at 1: the first forward and low, the second back and high.
    sx,sz = tn[3][0],tn[3][1]
    reach = NL*(1.10-0.60*NA)
    rise  = NL*(0.15+1.35*NA)
    p0=(sx,0,sz)
    p1=(sx+reach*lerp(1.0/3.0,0.95,NA), 0, sz+rise*lerp(1.0/3.0,0.0,NA))
    p2=(sx+reach*lerp(2.0/3.0,0.05,NA), 0, sz+rise*lerp(2.0/3.0,0.90,NA))
    p3=(sx+reach, 0, sz+rise)
    NG=(BM+girth(BM,3))*0.5
    neck=[]
    prev=torso[-1]
    for i in range(1,5):
        t=i/4.0
        r=lerp(0.300*NG, 0.235*NG*(1.15-0.15*NL), t)
        n=g.node(bez3(p0,p1,p2,p3,t), r); g.e.append((prev,n)); prev=n; neck.append(n)
    idx["neck"]=neck[-1]

    # --- head: back -> mid -> snout -> nose ---
    hx,hy,hz = p3
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
    LT,TC = p["legThickness"],int(p["toeCount"])
    BL = p["bodyLength"]
    # The legs stand under the body, wider set on a heavier one, and reach the ground from
    # whatever height legLength lifted it to: thigh, knee, ankle at fixed fractions of the drop.
    spread = 0.55+0.45*girth(p["bodyMass"],0)
    for s in (1,-1):
        for (anchor, ax, back) in ((idx["hip"], -0.72*BL, True), (idx["shoulder"], 0.94*BL, False)):
            w = (0.34 if back else 0.31)*spread
            top_r = (0.30 if back else 0.255)*LT
            az = g.v[anchor][2]
            drop = az-0.085
            pts=[((ax,          w*s,        az-0.30*drop), top_r),
                 ((ax-0.12,     (w+0.12)*s, az-0.62*drop), top_r*0.72),
                 ((ax+0.10,     (w+0.16)*s, az-0.90*drop), top_r*0.50),
                 ((ax+0.30,     (w+0.18)*s, 0.085),        top_r*0.40)]
            foot=g.chain(anchor, pts)[-1]
            fx,fy = ax+0.30, (w+0.18)*s
            for k in range(TC):
                a = (k-(TC-1)/2)/max(1,TC-1)
                g.chain(foot, [((fx+0.19, fy+0.17*a, 0.075), top_r*0.30),
                               ((fx+0.34, fy+0.27*a, 0.065), top_r*0.19)])

# ------------------------------------------------------------------ wings
# The wing FORM is derived from two existing genes, wingFingers and wingShape. It is not a
# gene of its own (owner decision, 2026-10-13, STATE.md run 24), so the genome layout and
# every gid are unchanged and breeding inherits the form through those two genes.
#
#   wingFingers <= 2           -> "sail":      two fingers stretch one flat panel with a
#                                              straight trailing edge.
#   else wingShape <  0.5      -> "spread":    broad, soaring: a bat wing, the membrane
#                                              fanned between every finger, its trailing
#                                              edge scalloped between the finger tips.
#   else (wingShape >= 0.5)    -> "segmented": falcate, sprinting: a solid inner membrane on
#                                              the arm, then one separate vane along each
#                                              finger, with open gaps between the vanes.
#
# src/assets/dragon/graph.ts `wingForm` mirrors this rule; docs/fixtures/dragon-graphs.json
# records the form per fixed genome, and tests/dragon-graph.test.ts holds the two equal.
WING_FORMS=("sail","spread","segmented")

def wing_form(p):
    if int(p["wingFingers"])<=2: return "sail"
    return "spread" if p["wingShape"]<0.5 else "segmented"

# The wing root sits on the shoulder, WING_ROOT_UP of the shoulder's radius above its centre,
# so the wings ride with the body that legLength lifts and bodyMass swells (1.22 at the
# middle of both, the M3e constant).
WING_ROOT_UP=0.62
def wing_root_z(p):
    _,z,r = torso_nodes(p)[3]
    return z+WING_ROOT_UP*r
FAN_DROP=0.35        # how far the last finger's tip falls back toward root height, as a fraction of its rise

def wing_nodes(p, s):
    """Bone positions for one wing. Returns (arm, finger_tips).

    Every wing rests SPREAD and low, as a gull-winged pair: the arm reaches out to the side
    rising arm_lift per unit outward (8-22 degrees), the hand beyond the wrist flattens or
    tips down (hand_lift, +2 to -10 degrees), and the fingers further back in the fan fall
    toward the root's height (FAN_DROP), so the trailing edge sits below the leading one.
    Low and out, the far wing does not tower over the back and the near wing shows its
    surface, not its edge, to a three-quarter camera (M3e cycle 1, art D1). No bone is ever
    below the root. wingDroop is the rest height (it sets both lifts), wingSpan the bone
    extent, wingShape broad (short reach, deep chord, little sweep) to falcate (long reach,
    narrow chord, swept-back tip). d is distance out from the midline. No trig and no pow,
    so the TS port is exact."""
    WS,SH,DR,NF = p["wingSpan"],p["wingShape"],p["wingDroop"],int(p["wingFingers"])
    BL = p["bodyLength"]
    WZ = wing_root_z(p)
    span  = WS
    out   = lerp(1.00, 1.25, SH) * span      # lateral reach
    chord = lerp(1.20, 0.75, SH) * span      # how far back the hand reaches
    sweep = lerp(0.15, 0.70, SH)             # leading tip swept back, per unit of reach
    arm_lift  = lerp(0.40, 0.14, DR)         # the arm's rise per unit outward
    hand_lift = lerp(0.04, -0.18, DR)        # the hand's, beyond the wrist: high droop tips it down
    wd = 0.26+1.60*out                       # the wrist's reach
    zw = WZ + arm_lift*(wd-0.26)             # the wrist's height
    def arm_at(x, d):  return (x, d*s, WZ + arm_lift*(d-0.26))
    def hand_at(x, d): return (x, d*s, zw + hand_lift*(d-wd))
    arm=[(arm_at(0.92*BL, 0.26), 0.115*span),
         (arm_at(0.78*BL, 0.26+0.82*out), 0.080*span),
         (arm_at(0.62*BL, wd), 0.055*span),
         (hand_at(0.62*BL-1.30*sweep*out, wd+1.10*out), 0.028*span)]
    # The fingers fan from the wrist, between the leading tip's direction (f = 0) and one
    # pointing back toward the hip (f = 1). A sail's tips sit on the straight chord between
    # the two; the other forms bulge them outward so the hand is rounded.
    lx,ld = -1.30*sweep*out, 1.10*out
    rx,rd = -(1.05*BL+0.40*chord), -0.55*out
    bulge = 0.0 if wing_form(p)=="sail" else 0.55
    tips=[]
    for k in range(NF):
        f=(k+1)/(NF+1)
        g=1.0+bulge*f*(1.0-f)
        t=hand_at(0.62*BL+lerp(lx,rx,f)*g, wd+lerp(ld,rd,f)*g)
        # fingers further back in the fan fall toward the root's height, never under it
        tips.append((t[0], t[1], WZ+(t[2]-WZ)*(1.0-FAN_DROP*f)))
    return arm, tips

def add_wings(g, idx, p):
    # A sail's fingers are skinned at the graph's minimum radius, inside the membrane's
    # thickness: one unbroken panel with no visible finger bones (M3e cycle 1, art).
    finger_r = 0.0 if wing_form(p)=="sail" else 1.0
    for s in (1,-1):
        arm,tips = wing_nodes(p,s)
        bones=g.chain(idx["shoulder"], arm)
        wrist=bones[2]
        w2=arm[2][0]                      # wrist position (arm entries are (pos, radius))
        for t in tips:
            mid=((t[0]+w2[0])*0.51, (t[1]+w2[1])*0.5, (t[2]+w2[2])*0.5)
            g.chain(wrist, [(mid,finger_r*0.032*p["wingSpan"]),(t,finger_r*0.016*p["wingSpan"])])

def _mix(a, b, t):
    return (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t)

SCALLOP=((0.25,0.24,0.75),(0.50,0.32,1.00),(0.75,0.24,0.75))  # (along the edge, pulled toward the wrist, sag)
VANE=((0.04,0.00,0.00),(0.80,0.55,1.00),(0.40,0.65,0.60))     # (along the bone, across toward the next rib, sag)
MEMBRANE_SAG=0.20    # how far the membrane sags below its bones between them, per unit of wingSpan

def _sag(pt, k, span):
    """pt moved down by k * MEMBRANE_SAG * span: the membrane's camber between its bones."""
    return (pt[0], pt[1], pt[2]-k*MEMBRANE_SAG*span)

def membrane_polys(p, s):
    """The membrane before its modifiers: corner positions and faces. Pure math.

    Corners 0-3 are the arm (root, elbow, wrist, leading tip), then the finger tips, then
    the two body anchors A1 (ahead of the hip, so the near wing stays off the tail root) and
    A2 (mid-flank); every form adds its own points after those. The inner membrane (arm to
    flank) is the same in all three forms. Beyond the wrist the hand is cut into "ribs" --
    the leading tip, each finger tip, A1 -- and:
      sail:      one wedge per rib pair, all meeting at the wrist: one straight-edged panel;
      spread:    the same wedges, each trailing edge pulled in toward the wrist and sagging
                 at three points (SCALLOP), so the edge between two finger tips is a scallop;
      segmented: no wedges. Each rib but A1 carries its own vane: a quad from 4 % along the
                 bone to the tip, reaching VANE's fraction of the way toward the next rib.
                 The vanes share no corner with each other or the inner membrane."""
    arm,tips = wing_nodes(p,s)
    W0,W1,W2,W3 = [a[0] for a in arm]
    BL=p["bodyLength"]
    # The flank anchors sit as far over the chest's centre as they did in M3e (1.04 and 1.12
    # over 1.0), so the membrane never dips under the torso's midline, whatever the girth.
    zc=torso_nodes(p)[2][1]
    A1,A2 = (-0.35*BL,0.20*s,zc+0.04),(-0.15*BL,0.22*s,zc+0.12)
    V=[W0,W1,W2,W3]+list(tips)+[A1,A2]
    nT=len(tips); iT=4; iA1=4+nT; iA2=iA1+1
    F=[(0,1,2,iA2),(iA2,2,iA1)]
    ribs=[3]+[iT+k for k in range(nT)]+[iA1]
    form=wing_form(p)
    span=p["wingSpan"]
    for a,b in zip(ribs[:-1],ribs[1:]):
        if form=="sail":
            F.append((2,a,b))
        elif form=="spread":
            prev=a
            for t,pull,k in SCALLOP:
                V.append(_sag(_mix(_mix(V[a],V[b],t),W2,pull),k,span))
                F.append((2,prev,len(V)-1)); prev=len(V)-1
            F.append((2,prev,b))
        else:
            q=[]
            for u,w,k in VANE:
                V.append(_sag(_mix(_mix(W2,V[a],u),_mix(W2,V[b],u),w),k,span)); q.append(len(V)-1)
            F.append((q[0],a,q[1],q[2]))
    return V, F

MEMBRANE_THICKNESS=0.034
MEMBRANE_SUBDIV=3

def membrane(p, s):
    V, F = membrane_polys(p, s)
    me=bpy.data.meshes.new(f"Mem{s}")
    me.from_pydata(V,[],[list(f) for f in F]); me.update()
    ob=bpy.data.objects.new(f"Mem{s}",me); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active=ob
    bpy.ops.object.modifier_add(type='SOLIDIFY'); ob.modifiers[-1].thickness=MEMBRANE_THICKNESS; ob.modifiers[-1].offset=0
    bpy.ops.object.modifier_add(type='SUBSURF')
    sub=ob.modifiers[-1]; sub.subdivision_type='SIMPLE'; sub.levels=MEMBRANE_SUBDIV; sub.render_levels=MEMBRANE_SUBDIV
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.shade_smooth()
    return ob

def add_crown(g, idx, p):
    """Horn pairs and an odd centre horn, then the crest (frill, skull fin or antler). Since
    M3f the horns are thick at the root and every crest is built to change the head's
    outline: a frill fans wide and back from the jaw, a fin stands tall on the skull, an
    antler branches high above it. hornCount and crestType are judged on the head's outline
    (artifacts/variants/dragon-sweep.json)."""
    HC,HL,HK,CT = int(p["hornCount"]),p["hornLength"],p["hornCurve"],int(p["crestType"])
    # Horns are as thick as the skull is big (head_scale), but reach as far as headSize itself
    # says: on the amplified scale the longest horns stood three units tall.
    HS=head_scale(p["headSize"]); HR=p["headSize"]; hx,hz=idx["headPos"]
    back=idx["headBack"]
    pairs=max(0,HC)//2; odd=HC%2
    for i in range(pairs):
        f=(i+1)/(pairs+1)
        for s in (1,-1):
            yaw=0.16+0.26*f
            g.chain(back, [((hx-0.16*HL, yaw*s*HS, hz+(0.56+0.30*f)*HL*HR), 0.135*HS),
                           ((hx-0.16*HL-0.26*HL*(1-HK*0.5), (yaw+0.09)*s*HS, hz+(0.86+0.34*f)*HL*HR), 0.085*HS),
                           ((hx-0.16*HL-0.48*HL*(1-HK*0.8), (yaw+0.14)*s*HS, hz+(1.02+0.26*f)*HL*HR-0.22*HK*HL), 0.030*HS)])
    if odd:
        g.chain(back, [((hx-0.10*HL,0,hz+0.64*HL*HR),0.125*HS),
                       ((hx-0.28*HL,0,hz+1.00*HL*HR),0.075*HS),
                       ((hx-0.46*HL,0,hz+1.18*HL*HR-0.20*HK*HL),0.028*HS)])
    if CT==1:    # frill: three thick spines a side, fanned out and back from behind the jaw
        for s in (1,-1):
            for k in range(3):
                g.chain(back, [((hx-0.20-0.06*k,(0.36+0.10*k)*s*HS,hz+(0.30-0.16*k)*HS),0.130*HS),
                               ((hx-0.50-0.16*k,(0.80+0.22*k)*s*HS,hz+(0.52-0.34*k)*HS),0.075*HS),
                               ((hx-0.70-0.24*k,(1.02+0.30*k)*s*HS,hz+(0.62-0.46*k)*HS),0.030*HS)])
    elif CT==2:  # a fin of three tall spines standing on the skull, raked back
        for k in range(3):
            g.chain(back, [((hx-0.08-0.22*k,0,hz+(0.50+0.04*k)*HS),0.120*HS),
                           ((hx-0.20-0.30*k,0,hz+(0.98-0.08*k)*HS),0.075*HS),
                           ((hx-0.34-0.38*k,0,hz+(1.40-0.22*k)*HS),0.028*HS)])
    elif CT==3:  # antler: a beam each side, forking twice
        for s in (1,-1):
            br=g.chain(back, [((hx-0.18,0.22*s*HS,hz+0.60*HS),0.130*HS),
                              ((hx-0.40,0.50*s*HS,hz+1.10*HS),0.095*HS)])[-1]
            for d in (-1,1):
                g.chain(br, [((hx-0.62+0.22*d,(0.62+0.36*d)*s*HS,hz+1.50*HS),0.070*HS),
                             ((hx-0.86+0.36*d,(0.70+0.62*d)*s*HS,hz+1.95*HS),0.034*HS)])

def torso_at(t, p):
    """Height and radius of the torso at normalised position t, between the skeleton's own
    torso nodes, so dorsal spikes sit ON the back instead of hovering above it."""
    tn=torso_nodes(p)
    for i in range(len(TORSO_PROFILE)-1):
        a,b = TORSO_PROFILE[i][0], TORSO_PROFILE[i+1][0]
        if a <= t <= b:
            u=(t-a)/(b-a)
            return lerp(tn[i][1],tn[i+1][1],u), lerp(tn[i][2],tn[i+1][2],u)
    return tn[-1][1], tn[-1][2]

def spike_params(p):
    """One dict per dorsal spike: a 6-sided cone's radius, depth, centre and Y rotation. Pure math."""
    SC,SH2 = int(p["spineCount"]),p["spineHeight"]
    BL = p["bodyLength"]
    out=[]
    for i in range(SC):
        t=i/max(1,SC-1)
        x=lerp(-0.75*BL, 0.95*BL, t)
        z,r = torso_at(t, p)
        h=(0.10+r*0.60)*SH2
        out.append({"kind":"cone","vertices":6,"radius":r*0.26,"depth":h,
                    "location":(x, 0, z+r*0.86+h*0.40),"rotY":math.radians(-14),"scale":(1,1,1)})
    return out

def dorsal_spikes(p, offset=(0,0,0), rotz=0.0):
    out=[]
    for c in spike_params(p):
        bpy.ops.mesh.primitive_cone_add(vertices=c["vertices"], radius1=c["radius"], radius2=0, depth=c["depth"],
                                        location=c["location"])
        o=bpy.context.object; o.rotation_euler=(0,c["rotY"],0)
        bpy.ops.object.shade_flat(); out.append(o)
    return out

def ornament_params(p):
    """The tail ornament as primitive parameters, or None for tailTip "none". Pure math."""
    TT=int(p["tailTip"]); TL,BL=p["tailLength"],p["bodyLength"]
    x=-2.95*TL*BL
    # The tail tip's height (skeleton: 58 % of the hip's); each ornament sits where it did over
    # M3e's tip at 0.50.
    tz=0.58*torso_nodes(p)[0][1]
    if TT==0: return None
    if TT==1:   # fin
        return {"kind":"cone","vertices":4,"radius":0.26,"depth":0.70,"location":(x-0.1,0,tz+0.30),
                "rotY":math.radians(-60),"scale":(1,0.22,1)}
    if TT==2:   # spade
        return {"kind":"cone","vertices":3,"radius":0.30,"depth":0.56,"location":(x-0.14,0,tz+0.10),
                "rotY":math.radians(-96),"scale":(1,0.30,1)}
    return {"kind":"ico","subdivisions":1,"radius":0.26,"location":(x-0.12,0,tz+0.06),"rotY":0.0,"scale":(1,1,1)}

def tail_ornament(p):
    c=ornament_params(p); out=[]
    if c is None: return out
    if c["kind"]=="cone":
        bpy.ops.mesh.primitive_cone_add(vertices=c["vertices"], radius1=c["radius"], radius2=0, depth=c["depth"],
                                        location=c["location"])
        o=bpy.context.object; o.rotation_euler=(0,c["rotY"],0); o.scale=c["scale"]
    else:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=c["subdivisions"], radius=c["radius"], location=c["location"])
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
    # The membrane's hue sits half the belly's shift from the body's: an analogous neighbour
    # (at most 0.11 away). At 1.6 times the shift red bodies wore yellow or lime wings and
    # brown ones pink (M3e cycle 2, art m3). arrays.ts partColours says the same.
    memb   = hsv(H+HSh*0.5, S*0.85, min(0.92, V+0.22))
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
    ex,ey,ez = idx["headMidPos"]; HS=head_scale(p["headSize"])
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
