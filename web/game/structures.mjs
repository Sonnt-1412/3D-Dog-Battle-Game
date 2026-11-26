import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HOUSE, crossingHeight } from './village.mjs';

const UP = new THREE.Vector3(0, 1, 0);

function builder(material) {
  const parts = [];

  function stain(geometry, shade) {
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const value = typeof shade === 'number' ? shade : shade[i];
      colors.fill(value, i * 3, i * 3 + 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
  }

  function box(x, y, z, width, height, depth, shade = 1) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const uv = geo.getAttribute('uv');
    const offset = Math.abs(x * 0.397 + y * 1.71 + z * 0.631) % 1;
    for (let face = 0; face < 6; face++) {
      const w = face < 2 ? depth : width;
      const h = face === 2 || face === 3 ? depth : height;
      for (let corner = 0; corner < 4; corner++) {
        const i = face * 4 + corner;
        const u = uv.getX(i) * w / 1.6;
        const v = uv.getY(i) * h / 1.6;
        if (material.name === 'Timber' && w > h * 1.35) uv.setXY(i, v + offset, u + offset * 0.53);
        else uv.setXY(i, u + offset, v + offset * 0.53);
      }
    }
    geo.translate(x, y, z);
    stain(geo, shade);
  }

  function beam(a, b, thickness, shade = 0.78) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const direction = to.sub(from);
    const length = direction.length();
    if (length < 0.001) return;
    const geometry = new THREE.BoxGeometry(thickness, length, thickness);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.28, uv.getY(i) * length / 1.9);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()));
    geometry.translate(...from.addScaledVector(direction, 0.5));
    stain(geometry, shade);
  }

  function surface(points, uv, shade = 1) {
    const order = points.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(order.flatMap(i => points[i]), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(order.flatMap(i => uv[i]), 2));
    geometry.computeVertexNormals();
    stain(geometry, shade);
  }

  function roofSlope(eaves, ridge, side) {
    const next = (side + 1) % 4;
    const wide = side % 2 === 0;
    const rows = 9;
    const columns = wide ? 24 : 14;
    const along = wide ? 5.8 : 3.8;
    const positions = [], texCoords = [], indices = [], shade = [];
    const mix = THREE.MathUtils.lerp;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      for (let column = 0; column <= columns; column++) {
        const u = column / columns;
        const edge = Math.sin(u * Math.PI);
        const texture = Math.sin(u * 48.0 + side * 1.3) * 0.022 + Math.cos(u * 21.0) * 0.021;
        const droop = 0.25 * Math.sin(t * Math.PI) + (0.09 + texture) * edge * (1 - t) ** 1.7;
        positions.push(...eaves[side].map((a, axis) =>
          mix(mix(a, eaves[next][axis], u), mix(ridge[side][axis], ridge[next][axis], u), t)
          - (axis === 1 ? droop : 0)));
        texCoords.push(u * along * mix(1, wide ? 0.565 : 0.22, t) + side * 0.23, t * 2.9);
        shade.push(0.78 + t * 0.12 + 0.12 * Math.sin(u * 8.7 + t * 2.6) ** 2 + texture);
        if (row === rows || column === columns) continue;
        const i = row * (columns + 1) + column;
        indices.push(i, i + 1, i + columns + 1, i + 1, i + columns + 2, i + columns + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(texCoords, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    stain(geometry, shade);
  }

  function finish(name) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  return { box, beam, surface, roofSlope, finish };
}

export function villageMaterials(textures) {
  const make = (name, key, color, strength, roughness) => new THREE.MeshStandardMaterial({
    name,
    map: textures[key],
    normalMap: textures[key + 'Normal'],
    normalScale: new THREE.Vector2(strength, strength),
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness,
    color,
  });
  return {
    wood: make('Timber', 'wood', '#c3b3a0', 0.58, 0.93),
    wall: make('Woven bamboo', 'wall', '#d6c6a1', 0.57, 0.97),
    roof: make('Reed thatch', 'roof', '#c5b898', 0.83, 0.96),
  };
}

export function makeStiltHouse(materials) {
  const wood = builder(materials.wood);
  const wall = builder(materials.wall);
  const roof = builder(materials.roof);
  const { floor, width, depth, porch, stairWidth, stairRun } = HOUSE;
  const hw = width / 2;
  const hd = depth / 2;
  const wallHeight = 2.16;
  const eaveY = floor + wallHeight + 0.07;
  const ridgeY = eaveY + 2.81;

  const boards = 33;
  const boardWidth = width / boards;
  for (let i = 0; i < boards; i++) {
    const x = -hw + (i + 0.5) * boardWidth;
    const stain = 0.77 + 0.13 * Math.sin(i * 2.21) ** 2;
    wood.box(x, floor - 0.071, (porch - hd) * 0.5, boardWidth - 0.007, 0.142, porch + hd, stain);
  }
  for (const z of [-2.46, 2.48, 3.64]) {
    wood.box(0, floor - 0.27, z, width + 0.28, 0.27, 0.20, 0.74);
  }
  for (const x of [-4.25, -1.45, 1.45, 4.25]) {
    for (const z of [-2.38, 2.43]) {
      wood.beam([x, -1.16, z], [x + 0.025, eaveY + 0.10, z], 0.265, 0.73);
      wood.beam([x, 0.66, z], [x + (x > 0 ? -0.64 : 0.64), floor - 0.22, z], 0.13, 0.63);
    }
  }

  // Raised room with woven bays, open windows and an open entrance.
  wall.box(0, floor + wallHeight / 2, -2.58, 8.88, wallHeight, 0.13, 0.85);
  for (const side of [-1, 1]) {
    const x = side * 4.43;
    wall.box(x, floor + wallHeight / 2, -1.59, 0.14, wallHeight, 1.98, 0.80);
    wall.box(x, floor + wallHeight / 2, 1.65, 0.14, wallHeight, 1.78, 0.90);
    wall.box(x, floor + 0.48, 0.02, 0.14, 0.96, 1.24, 0.73);
    wall.box(x, eaveY - 0.18, 0.02, 0.14, 0.30, 1.24, 0.87);
    wood.box(x, floor + 0.95, 0.02, 0.27, 0.139, 1.29, 0.67);
    wall.box(side * 3.62, floor + wallHeight / 2, 2.54, 1.62, wallHeight, 0.14);
    wall.box(side * 1.11, floor + wallHeight / 2, 2.54, 0.52, wallHeight, 0.14, 0.82);
    wall.box(side * 2.41, floor + 0.44, 2.54, 1.83, 0.88, 0.14, 0.86);
    wall.box(side * 2.41, eaveY - 0.17, 2.54, 1.84, 0.31, 0.14, 0.92);
    wood.box(side * 2.47, floor + 0.89, 2.58, 1.87, 0.12, 0.29, 0.75);
    wood.box(side * 0.83, floor + 1.02, 2.61, 0.15, 2.03, 0.25, 0.66);

    for (let index = 0; index < 4; index++) {
      wood.box(side * (1.04 + index * 1.12), floor + 0.39, porch - 0.11, 0.105, 0.79, 0.115, 0.69);
    }
    wood.box(side * 2.85, floor + 0.81, porch - 0.11, 3.70, 0.12, 0.14, 0.72);
    wood.box(side * 2.85, floor + 0.28, porch - 0.11, 3.70, 0.08, 0.105, 0.66);
    wood.beam([side * 0.70, -0.24, porch + stairRun + 0.08],
      [side * 0.70, floor - 0.15, porch - 0.08], 0.17, 0.74);
    wood.beam([side * 0.76, 0.63, porch + stairRun],
      [side * 0.76, floor + 0.70, porch - 0.08], 0.09, 0.80);
  }
  for (let index = 0; index < 11; index++) {
    const t = (index + 0.5) / 11;
    wood.box(0, floor * t - 0.065, porch + stairRun * (1 - t), stairWidth, 0.13, stairRun / 11 + 0.023, 0.79 + 0.13 * t);
  }
  wood.box(0, floor + 1.995, 2.61, 1.80, 0.16, 0.25, 0.66);
  wood.box(-3.48, floor + 0.29, 3.03, 1.40, 0.18, 0.47, 0.69);
  wood.beam([-3.98, floor, 3.02], [-3.98, floor + 0.29, 3.02], 0.12);
  wood.beam([-3.02, floor, 3.02], [-3.02, floor + 0.29, 3.02], 0.12);

  // A broad hipped roof, with a shallow kick at the lower eaves.
  const eaves = [[-5.60, eaveY, -3.47], [5.60, eaveY, -3.47],
    [5.60, eaveY - 0.09, 4.36], [-5.60, eaveY - 0.09, 4.36]];
  const ridge = [[-3.16, ridgeY, 0.10], [3.16, ridgeY, 0.10],
    [3.16, ridgeY, 0.10], [-3.16, ridgeY, 0.10]];
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4;
    roof.roofSlope(eaves, ridge, side);
    const leaves = side % 2 ? 18 : 28;
    for (let i = 0; i < leaves; i++) {
      const a = i / leaves, b = (i + 1) / leaves;
      const sample = (u, tip) => {
        const fray = 0.028 * Math.sin(u * 84 + side) + 0.019 * Math.cos(u * 126);
        return eaves[side].map((value, axis) => {
          const p = THREE.MathUtils.lerp(value, eaves[next][axis], u);
          return axis === 1 ? p + 0.022 - Math.sin(u * Math.PI) * 0.104
            - (tip ? 0.117 + fray : 0) : p;
        });
      };
      roof.surface([sample(a, false), sample(b, false), sample(b, true), sample(a, true)],
        [[a * 5, 0.36], [b * 5, 0.36], [b * 5, 0.42], [a * 5, 0.42]], 0.65 + 0.12 * Math.sin(i * 2.24) ** 2);
    }
  }
  wood.beam([-3.47, ridgeY - 0.04, 0.10], [3.47, ridgeY - 0.04, 0.10], 0.15, 0.68);
  roof.box(0, ridgeY - 0.025, 0.10, 6.53, 0.16, 0.38, 0.89);
  // Rafters sit beneath the overhang and remain visible from the veranda.
  for (const x of [-4.64, -3.49, -2.32, -1.16, 0, 1.16, 2.32, 3.49, 4.64]) {
    wood.beam([x, eaveY - 0.29, 4.12], [x * 0.65, ridgeY - 0.43, 0.11], 0.09, 0.64);
  }
  const house = new THREE.Group();
  house.name = 'house';
  house.add(roof.finish('thatch'), wood.finish('timber'), wall.finish('bamboo walls'));
  return house;
}

export function makeCrossing(bridge, material, imported) {
  const wood = builder(material);
  const group = new THREE.Group();
  const { halfLength, halfWidth, deck, ramp } = bridge;
  const centerSpan = halfLength - ramp;
  const boards = Math.ceil(halfLength * 2 / 0.24);
  const step = halfLength * 2 / boards;
  const customDeck = !bridge.transverse || !imported;

  for (let i = 0; i < boards; i++) {
    const along = -halfLength + (i + 0.5) * step;
    if (!customDeck && Math.abs(along) < centerSpan - step / 2) continue;
    const y = crossingHeight(bridge, along) - deck;
    wood.box(Math.sin(i * 2.1) * 0.013, y - 0.078, along, halfWidth * 2.08, 0.15,
      step * 0.959, 0.73 + 0.16 * Math.sin(i * 0.91 + 0.2) ** 2);
  }

  if (customDeck) {
    for (const side of [-1, 1]) {
      const x = side * halfWidth * 0.95;
      for (let i = 0; i <= 4; i++) {
        const along = -centerSpan + i * centerSpan / 2;
        wood.beam([x, -0.23, along], [x, 0.90, along], 0.14, 0.76);
      }
      wood.beam([x, 0.76, -centerSpan - 0.12], [x, 0.76, centerSpan + 0.12], 0.12, 0.82);
      wood.beam([x, -0.27, -centerSpan - 0.22], [x, -0.27, centerSpan + 0.22], 0.25, 0.62);
      for (const s of [-1, 1]) {
        const along = s * centerSpan * 0.61;
        wood.beam([x, -2.10, along], [x, -0.11, along], 0.23, 0.68);
      }
    }
  } else {
    const piece = imported.model.clone();
    piece.rotation.y = Math.PI / 2;
    piece.scale.set(centerSpan / imported.halfLength, 0.84, halfWidth / imported.halfWidth);
    piece.position.y = -imported.deck * piece.scale.y;
    group.add(piece);
  }
  group.add(wood.finish('walkway'));
  if (bridge.transverse) group.rotation.y = Math.PI / 2;
  return group;
}
