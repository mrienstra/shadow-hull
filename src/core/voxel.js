/**
 * Voxel tools for printability checks that Manifold's exact Minkowski
 * operations make too slow (tens of seconds per trip-let).
 *
 * thinFeatures finds material thinner than a minimum wall thickness t,
 * including thin *appendages* (fins, spikes) that erosion-split tests miss:
 * morphological opening with a ball of radius r = t/2 (erode, then dilate)
 * removes everything thinner than t, so the residue S \ open(S) is the thin
 * material. Opening also shaves every sharp convex edge a little (at a 90°
 * edge the shaving reaches ~0.41 r deep), so only residue reaching deeper than
 * `depthFactor * r` into the solid past the opened surface is reported.
 */
import { scanIntervals } from './scan.js';

/** Occupancy grid of a Manifold at spacing h (voxel centres), via slices + scanlines. */
export function voxelize(solid, h, pad = 2) {
  const { min, max } = solid.boundingBox();
  const origin = min.map((v) => v - pad * h);
  const [nx, ny, nz] = max.map((v, i) => Math.ceil((v - origin[i]) / h) + pad);
  const grid = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const z = origin[2] + (k + 0.5) * h;
    const cs = solid.slice(z);
    const polys = cs.toPolygons();
    cs.delete();
    if (!polys.length) continue;
    for (let j = 0; j < ny; j++) {
      const y = origin[1] + (j + 0.5) * h;
      for (const [x0, x1] of scanIntervals(polys, y)) {
        const i0 = Math.max(0, Math.ceil((x0 - origin[0]) / h - 0.5));
        const i1 = Math.min(nx - 1, Math.floor((x1 - origin[0]) / h - 0.5));
        for (let i = i0; i <= i1; i++) grid[(k * ny + j) * nx + i] = 1;
      }
    }
  }
  return { grid, nx, ny, nz, origin, h };
}

const INF = 1e20;

/** 1D squared distance transform (Felzenszwalb & Huttenlocher) in place over a strided line. */
function dt1d(f, n, get, set, v, z, d) {
  for (let q = 0; q < n; q++) f[q] = get(q);
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  for (let q = 0; q < n; q++) set(q, d[q]);
}

/**
 * Squared Euclidean distance (in voxels) from every voxel to the nearest voxel
 * where `isTarget(index)` is true.
 */
export function edt(nx, ny, nz, isTarget) {
  const N = nx * ny * nz, D = new Float64Array(N);
  for (let i = 0; i < N; i++) D[i] = isTarget(i) ? 0 : INF;
  const m = Math.max(nx, ny, nz);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const base = (k * ny + j) * nx;
    dt1d(f, nx, (q) => D[base + q], (q, x) => { D[base + q] = x; }, v, z, d);
  }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const base = k * ny * nx + i;
    dt1d(f, ny, (q) => D[base + q * nx], (q, x) => { D[base + q * nx] = x; }, v, z, d);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const base = j * nx + i, step = nx * ny;
    dt1d(f, nz, (q) => D[base + q * step], (q, x) => { D[base + q * step] = x; }, v, z, d);
  }
  return D;
}

/**
 * Thin material in a solid (thinner than minThickness), by voxel opening.
 * With `gaps`, the same for the air instead: thin slots and shallow cuts
 * (the solid's outside, padded well beyond the bounding box, is opened).
 * @returns { thinVolume, regions: [{ volume, depth, center }] } in mm / mm³,
 *   regions sorted by volume, largest first. Empty regions = passes.
 */
export function thinFeatures(solid, { minThickness = 1, voxel, depthFactor = 1, gaps = false } = {}) {
  const r = minThickness / 2;
  const h = voxel ?? Math.min(r / 2.5, 0.25);
  const rv = r / h, rv2 = rv * rv;
  const { grid, nx, ny, nz, origin } = voxelize(solid, h, gaps ? Math.ceil(2 * rv) + 3 : 2);
  if (gaps) for (let i = 0; i < grid.length; i++) grid[i] ^= 1;
  // Erode: keep voxels farther than r from the outside.
  const dOut = edt(nx, ny, nz, (i) => grid[i] === 0);
  // Dilate the eroded set by r: opened = within r of an eroded voxel.
  const dEroded = edt(nx, ny, nz, (i) => grid[i] === 1 && dOut[i] > rv2);
  // Residue: solid but not opened. Depth = distance to the opened set.
  const dOpened = edt(nx, ny, nz, (i) => grid[i] === 1 && dEroded[i] <= rv2);
  const minDepth2 = (depthFactor * rv) ** 2;
  const seen = new Uint8Array(grid.length);
  const regions = [];
  let thinVoxels = 0;
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || dEroded[s] <= rv2 || seen[s]) continue;
    // Flood-fill one residue region (6-connected).
    const stack = [s];
    seen[s] = 1;
    let count = 0, maxD = 0, cx = 0, cy = 0, cz = 0;
    while (stack.length) {
      const p = stack.pop();
      count++;
      maxD = Math.max(maxD, dOpened[p]);
      const i = p % nx, j = Math.floor(p / nx) % ny, k = Math.floor(p / (nx * ny));
      cx += i; cy += j; cz += k;
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const a = i + di, b = j + dj, c = k + dk;
        if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
        const q = (c * ny + b) * nx + a;
        if (grid[q] && dEroded[q] > rv2 && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (maxD >= minDepth2) {
      thinVoxels += count;
      regions.push({
        volume: count * h ** 3,
        depth: Math.sqrt(maxD) * h,
        center: [cx / count, cy / count, cz / count].map((x, a) => origin[a] + (x + 0.5) * h),
      });
    }
  }
  regions.sort((a, b) => b.volume - a.volume);
  return { thinVolume: thinVoxels * h ** 3, regions, voxel: h };
}
