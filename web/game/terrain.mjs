export const TERRAIN_HALF = 46;
export const TERRAIN_GRID = 97;
export const TERRAIN_HEIGHT_SCALE = 0.084;
export const SPAWN = { x: 0, z: 6 };
export const SUN_DIRECTION = [0.69, 0.64, 0.35];

const routes = [
  [[0, 20], [0, 8], [-1.4, 1], [-1.8, -5], [1, -10], [6.7, -15], [8.5, -21],
    [4.2, -28], [-3, -30], [-13, -26], [-19, -20], [-21, -10], [-17, -4],
    [-15, 4], [-10, 11], [-5, 15], [0, 20]],
  [[1, -10], [10, -8], [17, -4], [22, 3], [20, 9], [13, 14], [7, 17], [0, 20]],
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function trailSegments(points) {
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[i];
    const c = points[i + 1];
    const d = points[Math.min(points.length - 1, i + 2)];
    for (let step = 0; step < 5; step++) {
      const t = step / 5;
      samples.push(b.map((start, axis) => {
        const previous = a[axis];
        const end = c[axis];
        const next = d[axis];
        const linear = end - previous;
        const quadratic = 2 * previous - 5 * start + 4 * end - next;
        const cubic = 3 * start - previous - 3 * end + next;
        return start + 0.5 * t * (linear + t * (quadratic + t * cubic));
      }));
    }
  }
  samples.push(points.at(-1));
  return samples.slice(0, -1).map(([x, z], index) => {
    const dx = samples[index + 1][0] - x;
    const dz = samples[index + 1][1] - z;
    return { x, z, dx, dz, inverseLengthSquared: 1 / (dx * dx + dz * dz) };
  });
}

const trails = routes.flatMap(trailSegments);

export function trailDistance(x, z) {
  let best = Infinity;
  for (const segment of trails) {
    const px = x - segment.x;
    const pz = z - segment.z;
    const t = clamp((px * segment.dx + pz * segment.dz) * segment.inverseLengthSquared, 0, 1);
    const dx = px - segment.dx * t;
    const dz = pz - segment.dz * t;
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

export function terrainSampler(samples) {
  if (samples.length !== TERRAIN_GRID ** 2) throw new Error('Invalid elevation grid');
  const max = TERRAIN_GRID - 1;
  const worldToGrid = max / (TERRAIN_HALF * 2);
  const heightAt = (x, z) => {
    const gx = clamp((x + TERRAIN_HALF) * worldToGrid, 0, max);
    const gz = clamp((z + TERRAIN_HALF) * worldToGrid, 0, max);
    const ix = Math.min(max - 1, Math.floor(gx));
    const iz = Math.min(max - 1, Math.floor(gz));
    const u = gx - ix;
    const v = gz - iz;
    const i = iz * TERRAIN_GRID + ix;
    const a = samples[i];
    const b = samples[i + 1];
    const c = samples[i + TERRAIN_GRID];
    const d = samples[i + TERRAIN_GRID + 1];
    // The two triangles share the diagonal between b and c.
    return (u + v <= 1 ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v)) * TERRAIN_HEIGHT_SCALE;
  };
  const datum = heightAt(SPAWN.x, SPAWN.z);
  return (x, z) => heightAt(x, z) - datum;
}
