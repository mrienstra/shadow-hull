Yes — there are actually several terms, and the best one depends on which community you're talking to. The shape you're describing (the carved block on the GEB cover casting "G", "E", "B" shadows on three perpendicular walls) has a name from Hofstadter himself, a math name, and a graphics-research name.

## The terms

- **Trip-let** — Hofstadter's own coinage. In his July 1979 *Scientific American* column introducing the book, he explains that the redwood blocks on the jacket each cast G, E, and B in three orthogonal directions, and he calls such a block a "trip-let," short for "three letters". This is the most precise term for exactly the GEB cover object. [wkbpic](https://www.wkbpic.com/wkbx/SA/1979/1979-07-01.pdf)
- **Steinmetz solid** — the mathematical name for the intersection of two or three orthogonal cylinders (bicylinder / tricylinder), and by extension the intersection of any perpendicular extruded prisms. Your construction is the Steinmetz construction generalized to arbitrary extrusion profiles. [en.wikipedia](https://en.wikipedia.org/wiki/Steinmetz_solid)
- **Shadow art / shadow sculpture** — the computer graphics term, from Mitra & Pauly's SIGGRAPH Asia 2009 paper, which computes a 3D "shadow hull" from a set of binary images so that the sculpture's projections match them as closely as possible (they handle the case where your desired shadows are mutually contradictory — the same fiddliness you've hit manually). There's even a recent neural/implicit-function revival of the technique. [graphics.stanford](https://graphics.stanford.edu/~niloy/research/shadowArt/shadowArt_sigA_09.html)
- **Visual hull** (shape-from-silhouette) — the computer vision framing: intersecting back-projected silhouettes is literally how visual hulls are constructed, and intersecting orthogonal extrusions is the manual version of that.

In CAD-speak it's just a **Boolean intersection of three linear extrusions**, rotated 90° apart.

## Non-web stack (open source)

- **OpenSCAD (2025.x, Manifold backend)** — this is the tool most purpose-built for exactly this workflow: import SVG/DXF, `linear_extrude`, rotate, `intersection()`. Current versions default to the Manifold engine, which is the fix for the invalid-geometry problem you've experienced. Example of the whole trip-let in five lines: [openscad](https://openscad.org/libraries.html)
  ```scad
  module letter(f) { linear_extrude(100) import(file=f, center=true); }
  intersection() {
    letter("G.svg");
    rotate([90,0,0]) letter("E.svg");
    rotate([0,90,0]) letter("B.svg");
  }
  ```
- **build123d / CadQuery** — Python B-Rep modeling on the OpenCascade kernel; gives exact curved surfaces, real fillets, and STEP export rather than tessellated meshes. Better than OpenSCAD if you want machinable, precise output; OpenSCAD's CSG meshes "rarely broken" and are simpler to get working fast. [github](https://github.com/gumyr/build123d)
- **FreeCAD** — the GUI option, also OpenCascade-based; notably its OpenSCAD workbench provides a Mesh Boolean function that runs the OpenSCAD binary and is reported to be robust where FreeCAD's native mesh booleans fail. [wiki.freecad](https://wiki.freecad.org/OpenSCAD_Workbench)
- **Blender** — fine for artistic renderings of these; mesh booleans have improved, but it's still mesh-space rather than a solid kernel.

## Web stack (open source)

- **OpenSCAD Playground** — a full headless OpenSCAD compiled to WebAssembly, with Monaco editor and STL viewer, and it defaults to the Manifold backend so it's fast. Same `.scad` code as desktop, zero install — ideal for sharing models. [github](https://github.com/openscad/openscad-playground)
- **Manifold / manifold-3d (npm)** — the robustness layer itself, usable directly from three.js; it's the same Boolean engine, and Babylon.js uses Manifold under the hood for CSG too. Its core design goal is "guaranteed manifold output without caveats or edge cases," including tolerance of degenerate input like coincident faces and zero-length edges — the exact failure mode of older BSP/CGAL booleans. [manifoldcad](https://manifoldcad.org/docs/html/index.html)
- **three-bvh-csg** — a fast, dynamic CSG library for three.js built on three-mesh-bvh (claims 100x faster than BSP-based alternatives in complex cases), though it requires water-tight two-manifold input brushes, and its own author points to Manifold for more robust CAD operations. [app.unpkg](https://app.unpkg.com/three-bvh-csg@0.0.5/files/README.md)
- **Replicad or brepjs** — OpenCascade compiled to WASM, giving exact B-Rep solids and STEP export in the browser; Replicad is mature with an in-browser workbench, brepjs is a newer TypeScript-first sibling with `Result`-based error handling on fallible operations. [brepjs](https://brepjs.dev/compare/brepjs-vs-replicad)
- **JSCAD** — pure-JavaScript CSG in the browser, but mesh/polygon-based, so no exact solids or true STEP output. [brepjs](https://brepjs.dev/compare/brepjs-vs-replicad)

## Keeping booleans sane

Your "fiddly invalid geometry" pain is a known, largely solved problem. The historical culprits were BSP-tree and older floating-point CSG booleans that choke on coplanar faces and near-degenerate edges. Manifold's approach keeps the result within the closed class of manifold meshes, so the intersection of valid inputs is always a valid solid — which is why OpenSCAD adopted it and why the 2025 WASM builds are dramatically faster than the CGAL era. Practical tips regardless of tool: [github](https://github.com/elalish/manifold/wiki/Manifold-Library)

- Prefer the **Manifold** path (OpenSCAD 2025, three.js via manifold-3d) over BSP-style CSG libraries for this class of shape.
- Avoid exactly coincident/tangent faces between the three extrusions — overlap them fully and let the intersection do the trimming, rather than butting faces edge-to-edge.
- If you want to sidestep booleans entirely, use an **SDF approach** (e.g., libfive): the intersection of three extruded silhouettes is just three `max()` operations on signed distance functions, and by construction it can never produce non-manifold geometry — at the cost of a mesh-extraction step (marching cubes) at the end.

For your specific use case, the shortest path is OpenSCAD + Manifold (desktop or Playground), with build123d as the step up when you want exact B-Rep/STEP output for fabrication.