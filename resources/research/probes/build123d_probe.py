import time
from build123d import *
t0=time.time()
def ext(ch):
    t=Text(ch, font_size=100, font_path="/System/Library/Fonts/Supplemental/Arial Bold.ttf", align=(Align.CENTER,Align.CENTER))
    return extrude(t, amount=150, both=True)
Z=ext("B")
Y=ext("E").rotate(Axis.X,90)
X=ext("G").rotate(Axis.X,90).rotate(Axis.Z,90)
r=X&Y&Z
print("valid",r.is_valid,"solids",len(r.solids()),"vol",round(r.volume),"%.2fs"%(time.time()-t0))
export_step(r,"geb.step")
