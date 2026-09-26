"""Binary STL export (port of stl.js)."""
from __future__ import annotations

import math
import struct

import numpy as np
from manifold3d import Manifold


def to_binary_stl(solid: Manifold) -> bytes:
    """Binary STL (little-endian) from a Manifold's mesh."""
    mesh = solid.to_mesh()
    # vert_properties is an (N, numProp) float array; tri_verts is (T, 3).
    # Unlike the JS core's flat typed arrays (which need a manual numProp
    # stride), both are already proper 2D arrays here.
    vp = np.asarray(mesh.vert_properties).tolist()
    tv = np.asarray(mesh.tri_verts).tolist()
    n_tri = len(tv)

    out = bytearray(84 + 50 * n_tri)
    out[0:80] = b"shadow-hull".ljust(80, b"\0")
    struct.pack_into("<I", out, 80, n_tri)

    o = 84
    for i, j, k in tv:
        a, b, c = vp[i][:3], vp[j][:3], vp[k][:3]
        u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        w = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        n = (
            u[1] * w[2] - u[2] * w[1],
            u[2] * w[0] - u[0] * w[2],
            u[0] * w[1] - u[1] * w[0],
        )
        length = math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) or 1.0
        n = (n[0] / length, n[1] / length, n[2] / length)
        struct.pack_into("<12fH", out, o, *n, *a, *b, *c, 0)
        o += 50
    return bytes(out)
