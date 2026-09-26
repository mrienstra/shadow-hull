**The term.** Hofstadter's own name for the GEB cover objects is **"trip-let"** (a three-way pun on triplet and the letters). The general geometric concept is a **visual hull**: the largest solid consistent with a set of silhouettes, built by intersecting the extrusions of those silhouettes. Computer vision calls the same technique "shape from silhouette." In CAD it's usually just called an **extrusion intersection**. People making the letter-based versions tend to call them **3D ambigrams** or **shadow sculptures**. The Steinmetz solid (two or three intersecting cylinders) is the classic mathematical case.

**Why it gets fiddly.** Mesh booleans break on coplanar faces, coincident edges, non-manifold input, and floating-point slivers. Trip-lets hit all of these, because the extrusions share axes and letter outlines often line up. There are three ways around it: an exact B-rep kernel, a boolean library that guarantees manifold output, or skipping booleans entirely with implicit (SDF) modeling.

### Non-web

- **Manifold** (C++, with Python bindings via `pip install manifold3d`) is what I'd reach for first. It guarantees manifold output, is very fast, and has a 2D `CrossSection` type (built on Clipper2) that extrudes directly. Many other tools now use it as their boolean backend.
- **build123d** or **CadQuery** (Python, on OpenCASCADE) give you exact B-rep. Extrusions of planar profiles intersect cleanly, and you can export STEP as well as STL. This is the best choice if you want crisp, exact geometry or a CAD-grade output.
- **OpenSCAD**, in recent development snapshots, can use Manifold as its backend, which makes it dramatically faster and more robust than the old CGAL path. `linear_extrude` plus `intersection()` is essentially a trip-let in five lines.
- **Blender 4.5+** has a Manifold boolean solver option, which is worth switching to if you like working interactively.
- **libfive** (F-rep/SDF) avoids boolean breakage entirely. An infinite extrusion of a 2D SDF is just that 2D SDF, and intersection is `max()`. The trade-off is that you mesh at the end, so sharp corners depend on the mesher. Its dual contouring does better than marching cubes here.

### Web

- **manifold-3d** (npm, WASM) is the same library as above and pairs well with Three.js. ManifoldCAD.org is a live playground built on it.
- **replicad** is a nice JS API over OpenCascade.js, for exact B-rep in the browser.
- **OpenSCAD Playground** is the WASM build of OpenSCAD, with the Manifold backend.
- **three-bvh-csg** is very fast and fine for interactive previews, but it doesn't guarantee watertight output, so don't use it for export.
- **JSCAD** works, but its BSP-based booleans are the most likely of these to give you the fiddly behavior you're trying to escape.

### Practical tips

- Make each extrusion overshoot the bounding cube so no faces end up coplanar.
- Clean the 2D profiles before extruding: union the overlapping contours, fix winding, and drop tiny edges. Clipper2 (inside Manifold's `CrossSection`) does this for you.
- Intersect all the extrusions directly rather than building the shape up with unions.

A minimal Manifold example in Python:

```python
from manifold3d import CrossSection, Manifold

def trip_let(a, b, c, size=100):   # a, b, c: lists of 2D polygons
    ext = lambda p: CrossSection(p).extrude(size).translate([0, 0, -size/2])
    X = ext(a).rotate([0, 90, 0])  # silhouette seen along X
    Y = ext(b).rotate([90, 0, 0])  # silhouette seen along Y
    Z = ext(c)                     # silhouette seen along Z
    return X ^ Y ^ Z               # ^ = intersection
```

You'll need to check the rotation and orientation of each glyph so every letter reads correctly from its own side. That orientation step is usually the real puzzle, not the booleans.