import sys, numpy as np
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from manifold3d import CrossSection, Manifold, FillRule

import os
MODE=os.environ.get("MODE","stretch")
FONT=os.environ.get("FONT") or "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
f=TTFont(FONT); gs=f.getGlyphSet(); cmap=f.getBestCmap()

def glyph_polys(ch, steps=12):
    pen=DecomposingRecordingPen(gs); gs[cmap[ord(ch)]].draw(pen)
    polys=[]; cur=[]; p0=None
    def quad(a,b,c):
        for t in np.linspace(0,1,steps)[1:]:
            cur.append(tuple((1-t)**2*np.array(a)+2*(1-t)*t*np.array(b)+t*t*np.array(c)))
    for op,args in pen.value:
        if op=="moveTo": cur=[args[0]]
        elif op=="lineTo": cur.append(args[0])
        elif op=="qCurveTo":
            pts=list(args); start=cur[-1]
            # implied on-curve points between consecutive off-curve points
            for i in range(len(pts)-1):
                end = pts[i+1] if i==len(pts)-2 else tuple((np.array(pts[i])+np.array(pts[i+1]))/2)
                quad(start,pts[i],end); start=end
        elif op=="curveTo":
            a=cur[-1]; b,c,d=args
            for t in np.linspace(0,1,steps)[1:]:
                cur.append(tuple((1-t)**3*np.array(a)+3*(1-t)**2*t*np.array(b)+3*(1-t)*t*t*np.array(c)+t**3*np.array(d)))
        elif op in("closePath","endPath"): polys.append(cur); cur=[]
    return polys

def shape(ch, size=100):
    cs=CrossSection(glyph_polys(ch), FillRule.NonZero)
    (x0,y0,x1,y1)=cs.bounds()
    # normalize: fit into a size x size square, centered
    sx=size/(x1-x0); sy=size/(y1-y0)
    if MODE=='uniform': sx=sy=min(sx,sy)
    return cs.translate((-(x0+x1)/2,-(y0+y1)/2)).scale((sx,sy))


# Each view: (U, V, D) world axes. Glyph x->U, glyph y->V, extrusion->D.
# Right-handed (U x V = D) so a viewer at +D looking toward -D reads the glyph unmirrored.
VIEWS={"X":((0,1,0),(0,0,1),(1,0,0)),   # front wall at +X: glyph x along +Y, up = +Z
       "Y":((-1,0,0),(0,0,1),(0,1,0)),  # at +Y: glyph x along -X, up = +Z
       "Z":((1,0,0),(0,1,0),(0,0,1))}   # top, seen from above
def M34(U,V,D):  # local->world, columns U,V,D
    return [[U[i],V[i],D[i],0] for i in range(3)]
def M34inv(U,V,D):
    return [list(U)+[0],list(V)+[0],list(D)+[0]]
def triplet(a,b,c,size=100):
    L=size*1.5
    parts=[]
    for ch,k in zip((a,b,c),"XYZ"):
        e=shape(ch,size).extrude(L).translate((0,0,-L/2))
        parts.append(e.transform(M34(*VIEWS[k])))
    return Manifold.batch_boolean(parts, __import__("manifold3d").OpType.Intersect)

word=sys.argv[1] if len(sys.argv)>1 else "GEB"
import time; t0=time.time()
M=triplet(*word)
print("status",M.status(),"tris",M.num_tri(),"vol",round(M.volume()),"genus",M.genus(),"%.3fs"%(time.time()-t0))
for ch,k in zip(word,"XYZ"):
    p=M.transform(M34inv(*VIEWS[k])).project(); t=shape(ch)
    print(k, ch, "coverage %.3f"%(p.area()/t.area()), "outside-target %.1f"%(p-t).area(), "missing %.0f"%(t-p).area())
if len(sys.argv)>2:
    m=M.to_mesh(); import numpy as np
    import trimesh; trimesh.Trimesh(np.array(m.vert_properties)[:,:3], np.array(m.tri_verts)).export(sys.argv[2]); print("wrote",sys.argv[2])
