import { CHUNK_SIZE, VILLAGE_SPACING, clamp, riverLevel, riverWidth, riverZ, smooth, streamLevel, streamX } from './terrain.mjs';

export const HOUSE = {
  width: 9.5, depth: 5.5, porch: 3.75, floor: 1.54, stairWidth: 1.55, stairRun: 2.42,
};
const HOME_HOUSES = [
  [-8.6, -10.7, 1.12, 0.14], [8.3, -10.5, 0.94, -0.17],
  [17.9, -12.1, 0.84, -0.24], [-18.5, 10.6, 0.94, 2.64], [12.2, 10.8, 0.87, 0.35],
];
const OUTPOST_HOUSES = [[-8.7, -10.9, 0.88, 0.16], [8.9, -11.0, 0.83, -0.22], [14.2, 10.7, 0.87, 2.82]];

const chunkOf = n => Math.floor(n / CHUNK_SIZE);

export function villageForChunk(chunkX, chunkZ, groundAt) {
  const houses = [];
  const crossings = [];
  const left = chunkX * CHUNK_SIZE;
  const first = Math.ceil((left - 22) / VILLAGE_SPACING);
  const last = Math.floor((left + CHUNK_SIZE + 22) / VILLAGE_SPACING);
  const belongs = (x, z) => chunkOf(x) === chunkX && chunkOf(z) === chunkZ;

  for (let index = first; index <= last; index++) {
    const center = index * VILLAGE_SPACING;
    const village = index === 0 ? HOME_HOUSES : OUTPOST_HOUSES;
    for (const [dx, bank, scale, yaw] of village) {
      const x = center + dx;
      const cos = Math.cos(yaw);
      const facesWater = Math.sign(bank) !== Math.sign(cos);
      const dryApproach = riverWidth(x) + (HOUSE.porch + HOUSE.stairRun) * scale + 2.9;
      const offset = facesWater ? Math.sign(bank) * Math.max(Math.abs(bank), dryApproach) : bank;
      const z = riverZ(x) + offset;
      if (!belongs(x, z)) continue;
      houses.push({ x, z, y: groundAt(x, z), scale, yaw, cos, sin: Math.sin(yaw) });
    }

    const z = riverZ(center);
    if (belongs(center, z)) {
      const halfLength = riverWidth(center) + 4.4;
      const north = groundAt(center, z - halfLength);
      const south = groundAt(center, z + halfLength);
      crossings.push({
        x: center, z, north, south, halfLength,
        halfWidth: 1.15, deck: Math.max(north, south, riverLevel(center) + 1.61), ramp: 2.1,
      });
    }
  }
  const creekZ = riverZ(27) - 24;
  const creekX = streamX(creekZ, 27);
  if (belongs(creekX, creekZ)) {
    const halfLength = 3.1;
    const west = groundAt(creekX - halfLength, creekZ);
    const east = groundAt(creekX + halfLength, creekZ);
    crossings.push({
      x: creekX, z: creekZ, north: west, south: east, halfLength, halfWidth: 0.72,
      deck: Math.max(west, east, streamLevel(creekZ, 27) + 0.80), ramp: 0.75, transverse: true,
    });
  }
  return { houses, crossings };
}

export function crossingHeight(bridge, along) {
  const amount = smooth(bridge.halfLength - bridge.ramp, bridge.halfLength, Math.abs(along));
  const end = along < 0 ? bridge.north : bridge.south;
  return bridge.deck + (end - bridge.deck) * amount;
}

export function crossingCameraColliders(bridge) {
  const { halfWidth, halfLength, deck, ramp, north, south, transverse } = bridge;
  const cos = transverse ? 0 : 1;
  const sin = transverse ? 1 : 0;
  const span = halfLength - ramp;
  const box = (across, along, halfX, halfZ, y, top) => ({
    x: bridge.x + across * cos + along * sin,
    z: bridge.z - across * sin + along * cos,
    y, height: top - y, halfX, halfZ, cos, sin, radius: Math.hypot(halfX, halfZ),
  });
  const rampCenter = span + ramp / 2;
  const rail = halfWidth * 0.95;
  return [
    box(0, 0, halfWidth * 1.05, span, deck - 0.17, deck),
    box(0, -rampCenter, halfWidth * 1.05, ramp / 2, Math.min(north, deck) - 0.17, deck),
    box(0, rampCenter, halfWidth * 1.05, ramp / 2, Math.min(south, deck) - 0.17, deck),
    box(-rail, 0, 0.095, span, deck - 0.39, deck + 0.91),
    box(rail, 0, 0.095, span, deck - 0.39, deck + 0.91),
  ];
}

export function villageSupport(x, z, maxHeight, houses, crossings) {
  let support = -Infinity;
  for (const house of houses) {
    const dx = x - house.x;
    const dz = z - house.z;
    if (Math.abs(dx) > 10 || Math.abs(dz) > 10) continue;
    const lx = (dx * house.cos - dz * house.sin) / house.scale;
    const lz = (dx * house.sin + dz * house.cos) / house.scale;
    const t = clamp(1 - (lz - HOUSE.porch) / HOUSE.stairRun, 0, 1);
    const onFloor = Math.abs(lx) <= HOUSE.width / 2 && lz >= -HOUSE.depth / 2 && lz <= HOUSE.porch;
    const onStairs = Math.abs(lx) < HOUSE.stairWidth / 2 && lz > HOUSE.porch && lz < HOUSE.porch + HOUSE.stairRun;
    if (!onFloor && !onStairs) continue;
    const height = house.y + HOUSE.floor * house.scale * t;
    if (height <= maxHeight) support = Math.max(support, height);
  }

  for (const bridge of crossings) {
    const dx = x - bridge.x;
    const dz = z - bridge.z;
    const across = bridge.transverse ? dz : dx;
    const along = bridge.transverse ? dx : dz;
    if (Math.abs(across) > bridge.halfWidth || Math.abs(along) > bridge.halfLength) continue;
    const height = crossingHeight(bridge, along);
    if (height <= maxHeight) support = Math.max(support, height);
  }
  return support;
}

function houseBox(house, lx, lz, halfX, halfZ, floor, height) {
  const { x, z, y, scale, cos, sin } = house;
  return {
    x: x + scale * (lx * cos + lz * sin), z: z + scale * (-lx * sin + lz * cos),
    y: y + scale * floor, height: scale * height, halfX: scale * halfX, halfZ: scale * halfZ,
    cos, sin, radius: scale * Math.hypot(halfX, halfZ),
  };
}

export function stairCameraColliders(house) {
  const spans = 4;
  const length = HOUSE.stairRun / spans;
  return Array.from({ length: spans }, (_, i) => {
    const along = HOUSE.porch + (i + 0.5) * length;
    const bottom = HOUSE.floor * (1 - (i + 1) / spans) - 0.21;
    return houseBox(house, 0, along, HOUSE.stairWidth / 2 + 0.075, length / 2, bottom,
      HOUSE.floor / spans + 0.95);
  });
}

export function houseColliders(house) {
  const result = [];
  const shape = (...dimensions) => result.push(houseBox(house, ...dimensions));

  for (const lx of [-4.25, -1.45, 1.45, 4.25]) {
    for (const lz of [-2.38, 2.43]) shape(lx, lz, 0.14, 0.14, -0.74, 3.25);
  }
  const floor = HOUSE.floor - 0.10;
  shape(0, -2.57, 4.46, 0.10, floor, 2.3);
  shape(-4.43, 0, 0.10, 2.6, floor, 2.3);
  shape(4.43, 0, 0.10, 2.6, floor, 2.3);
  for (const sign of [-1, 1]) {
    shape(sign * 2.67, 2.48, 1.79, 0.10, floor, 2.3);
    shape(sign * 2.84, 3.64, 1.86, 0.09, HOUSE.floor, 0.78);
  }
  shape(0, 0.06, 4.59, 3.07, 3.64, 0.72);
  return result;
}
