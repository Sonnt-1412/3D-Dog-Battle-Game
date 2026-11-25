export const TERRAIN_GRID = 97;
export const TERRAIN_HALF = 46;
export const TERRAIN_HEIGHT_SCALE = 0.084;
export const CHUNK_SIZE = 48;
export const CHUNK_SEGMENTS = 32;
export const TERRAIN_STEP = CHUNK_SIZE / CHUNK_SEGMENTS;
export const SPAWN = { x: 0, z: 5.6 };
export const SUN_DIRECTION = [0.64, 0.69, 0.32];

const STREAM_SPACING = 240;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function smooth(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function hash2(x, z) {
  let value = Math.imul(x, 0x1e35a7bd) ^ Math.imul(z, 0x52dce729);
  value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}

function noise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const u = smooth(0, 1, x - ix);
  const v = smooth(0, 1, z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export function riverZ(x) {
  return -7.6 + Math.sin(x / 22) * 4.2 + Math.sin(x / 72) * 8.6 + Math.sin(x / 12) * 0.8;
}

export function riverLevel(x) {
  return -1.26 + Math.sin(x / 138) * 0.36;
}

export function riverWidth(x) {
  const bayOffset = (x - 13) / 17;
  const bay = 1.65 * Math.exp(-bayOffset * bayOffset);
  return 4.0 + Math.sin(x / 31) * 0.62 + Math.sin(x / 93) * 0.63 + bay;
}

export function streamX(z, anchor) {
  const mouth = riverZ(anchor);
  const run = z - mouth;
  return anchor + Math.sin(run / 23) * 4.0 + Math.sin(run / 9.4) * 2.15;
}

export function streamAnchor(x) {
  return 27 + Math.round((x - 27) / STREAM_SPACING) * STREAM_SPACING;
}

export function streamWidth(z) {
  return 1.08 + 0.25 * Math.sin(z / 17);
}

export function streamLevel(z, anchor) {
  const upstream = Math.max(0, riverZ(anchor) - z);
  return riverLevel(anchor) + 0.035 * Math.min(upstream, 120) + 0.45 * smooth(10, 36, upstream);
}

export function channelAt(x, z) {
  const riverEdge = Math.abs(z - riverZ(x)) - riverWidth(x);
  const anchor = streamAnchor(x);
  const streamEdge = z < riverZ(anchor) + 1.7 ? Math.abs(x - streamX(z, anchor)) - streamWidth(z) : Infinity;
  return { riverEdge, streamEdge, anchor };
}

export function waterAt(x, z) {
  const { riverEdge, streamEdge, anchor } = channelAt(x, z);
  const river = riverEdge < 2.6 ? riverLevel(x) : -Infinity;
  const creek = streamEdge < 1.12 ? streamLevel(z, anchor) : -Infinity;
  return Math.max(river, creek);
}

export function trailDistance(x, z) {
  const bank = Math.abs(Math.abs(z - riverZ(x)) - (riverWidth(x) + 6.4 + 0.9 * Math.sin(x / 12)));
  const run = z - riverZ(x);
  const bend = Math.sin(run / 13) * 1.35 + Math.sign(run) * smooth(12, 43, Math.abs(run))
    * (6.7 + 3.7 * Math.sin(run / 18));
  const crossing = Math.abs(x - Math.round(x / 192) * 192 + bend) + smooth(29, 67, Math.abs(run)) * 2.3;
  const upland = Math.abs(z - 40 - 13 * Math.sin(x / 43));
  return Math.min(bank, crossing, upland);
}

function triangle(a, b, c, d, u, v) {
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function terrainSampler(samples) {
  if (samples.length !== TERRAIN_GRID ** 2) throw new Error('Invalid elevation grid');
  const max = TERRAIN_GRID - 1;
  const scale = max / (TERRAIN_HALF * 2);
  const heightAt = (x, z) => {
    const gx = clamp((x + TERRAIN_HALF) * scale, 0, max);
    const gz = clamp((z + TERRAIN_HALF) * scale, 0, max);
    const ix = Math.min(max - 1, Math.floor(gx));
    const iz = Math.min(max - 1, Math.floor(gz));
    const i = iz * TERRAIN_GRID + ix;
    return triangle(samples[i], samples[i + 1], samples[i + TERRAIN_GRID],
      samples[i + TERRAIN_GRID + 1], gx - ix, gz - iz) * TERRAIN_HEIGHT_SCALE;
  };
  const datum = heightAt(SPAWN.x, SPAWN.z);
  return (x, z) => heightAt(x, z) - datum;
}

export function makeLandscape(samples) {
  const original = terrainSampler(samples);
  function rawHeight(x, z) {
    const distance = Math.abs(z - riverZ(x));
    const { riverEdge, streamEdge, anchor } = channelAt(x, z);
    const river = riverLevel(x);
    const plateau = noise(x / 92 + 7, z / 92 + 19);
    const ridges = noise(x / 33 + 4, z / 33 + 17);
    const folds = noise(x / 13, z / 13);
    const rise = smooth(14, 75, distance);
    const village = (1 - smooth(20, 38, Math.abs(x - Math.round(x / 192) * 192))) * (1 - smooth(18, 33, distance));
    const nearBanks = 0.86 + (folds - 0.5) * 0.59 + plateau * 1.15;
    const hills = rise * (4.5 + plateau ** 2 * 13.5 + ridges * 5 + folds * 2.4);
    const sampleBlend = 1 - smooth(24, 44, Math.max(Math.abs(x), Math.abs(z)));
    const source = sampleBlend > 0 ? original(x, z) * sampleBlend : 0;
    const wild = nearBanks + hills + source * (0.17 + rise * 0.36);
    const clearing = 1.02 + 0.20 * folds + 0.025 * Math.max(0, distance - 8.7);
    const bank = river + wild + (clearing - wild) * village * 0.94;
    const bed = river - 1.06 - 0.24 * Math.sin(x / 12) - 0.12 * folds;
    const riverMix = smooth(-1.18, 2.7, riverEdge);
    const ground = bed + (bank - bed) * riverMix;
    if (streamEdge > 3.7) return ground;
    const creek = streamLevel(z, anchor) - 0.78 - folds * 0.10;
    const streamMix = smooth(-0.38, 3.7, streamEdge);
    return Math.min(ground, creek + (Math.max(ground, creek) - creek) * streamMix);
  }

  function heightAt(x, z) {
    const gx = Math.floor(x / TERRAIN_STEP) * TERRAIN_STEP;
    const gz = Math.floor(z / TERRAIN_STEP) * TERRAIN_STEP;
    return triangle(rawHeight(gx, gz), rawHeight(gx + TERRAIN_STEP, gz),
      rawHeight(gx, gz + TERRAIN_STEP), rawHeight(gx + TERRAIN_STEP, gz + TERRAIN_STEP),
      (x - gx) / TERRAIN_STEP, (z - gz) / TERRAIN_STEP);
  }
  return { rawHeight, heightAt };
}

export function chunkWindow(x, z, radius = 2) {
  const ix = Math.floor(x / CHUNK_SIZE);
  const iz = Math.floor(z / CHUNK_SIZE);
  const tiles = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      tiles.push({ x: ix + dx, z: iz + dz, range: Math.max(Math.abs(dx), Math.abs(dz)), rank: dx * dx + dz * dz });
    }
  }
  return tiles.sort((a, b) => a.rank - b.rank);
}
