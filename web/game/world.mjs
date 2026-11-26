import * as THREE from 'three';
import { modelLoader } from './assets.mjs';
import { forestAssets } from './forest-assets.mjs';
import {
  CHUNK_SEGMENTS, CHUNK_SIZE, PADDY, SPAWN, SUN_DIRECTION, TERRAIN_STEP, VILLAGE_SPACING, channelAt, chunkWindow, clamp,
  hash2, makeLandscape, paddyEdge, riverLevel, riverWidth, riverZ, streamAnchor, streamX, streamWidth, trailDistance, waterAt,
} from './terrain.mjs';
import { HOUSE, crossingCameraColliders, houseColliders, stairCameraColliders, villageForChunk, villageSupport } from './village.mjs';
import { makeCrossing, makeStiltHouse, villageMaterials } from './structures.mjs';
import { alignWater, fillChannel, fillGround, makeGround, makeSky, makeWater, terrainMaterial, waterMaterial } from './landscape-render.mjs';
import { riverReflection } from './river-reflection.mjs';
import { installVillageLife } from './village-life.mjs';

const ROCKS = ['rock-a', 'rock-b', 'rock-c'];
const ROCK_RADIUS = [1.16, 0.98, 0.90];
const ROCK_HEIGHT = [0.78, 1.07, 0.61];
const DRAW_RADIUS = 2;
const SHORE_PLANTS = [
  ['bamboo', -14, 3.5, 0.83], ['bamboo', -7.8, 4.8, 0.61], ['bamboo', 16.5, -20.4, 0.91],
  ['bamboo', -14.7, -22, 0.83], ['bamboo', 18.6, 2.9, 0.71], ['bamboo', 6.8, -27.5, 0.81],
  ['bamboo', 25.2, -8.0, 0.80], ['banana', 5.7, 6.5, 0.66], ['banana', -12.7, -16.2, 0.66],
  ['banana', 13.2, -15.4, 0.63], ['banana', -4.5, -21.8, 0.58], ['banana', 18.5, 6.2, 0.70],
  ['fern', -1.9, 7.9, 1.16], ['fern', 2.3, 6.2, 1.10], ['fern', -2.7, 3.9, 1.18],
  ['rock-b', -3.1, 2.5, 0.66], ['rock-a', 4.2, 1.0, 0.81], ['rock-c', -3.5, -17.4, 0.59],
  ['fern', -3.7, 3.8, 1.28], ['fern', 3.1, 3.3, 1.12], ['fern', 4.2, 2.4, 0.82],
  ['grass', -2.55, 3.6, 1.11], ['grass', -2.3, 2.7, 0.91], ['grass', 2.4, 2.9, 1.17],
  ['fig', -5.6, -33.4, 0.47], ['fig', 7.2, -35.3, 0.55], ['fig', -15.5, 6.5, 0.47],
  ['fig', -21.7, -22.1, 0.40], ['fig', 22.4, -28.6, 0.49],
  ['tree-fern', 6.45, 4.4, 0.57], ['tree-fern', -5.9, -22.8, 0.54],
  ['tree-fern', -10.8, -13.6, 0.56], ['tree-fern', 6.6, -27.5, 0.70],
];

const keyOf = (x, z) => `${x},${z}`;
const tileOf = value => Math.floor(value / CHUNK_SIZE);

export async function loadValley(scene, mobile) {
  const loader = new THREE.TextureLoader();
  const roles = ['grass', 'grassNormal', 'trail', 'trailNormal', 'sky', 'roof', 'roofNormal', 'wood', 'woodNormal', 'wall', 'wallNormal'];
  const models = ['props', 'valley', 'dressing', 'villager', 'keeper', 'buffalo'];
  const [imports, elevation, ...images] = await Promise.all([
    Promise.all(models.map(async name => [name, await modelLoader.loadAsync(forestAssets[name].url)])),
    fetch(forestAssets.elevation.url).then(response => {
      if (!response.ok) throw new Error(`Elevation request failed: ${response.status}`);
      return response.arrayBuffer();
    }),
    ...roles.map(key => loader.loadAsync(forestAssets[key].url)),
  ]);
  const assets = Object.fromEntries(imports);
  const textures = Object.fromEntries(roles.map((key, i) => [key, images[i]]));
  for (const key of roles) {
    const texture = textures[key];
    texture.wrapS = THREE.RepeatWrapping;
    if (key !== 'sky') texture.wrapT = THREE.RepeatWrapping;
    if (!key.endsWith('Normal')) texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = mobile ? 2 : 4;
  }
  textures.sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.fog = new THREE.Fog('#9eafb4', 39, 97);
  const sky = makeSky(textures.sky);
  scene.add(sky);

  const shadow = { position: new THREE.Vector3(), forward: new THREE.Vector2(0, -1), lift: 0 };
  const swimmer = new THREE.Vector3();
  const time = { value: 0 };
  const materials = villageMaterials(textures);
  const library = new THREE.Group().add(assets.props.scene, assets.valley.scene, assets.dressing.scene, makeStiltHouse(materials));
  library.updateMatrixWorld(true);
  const bridge = importedFootbridge(library.getObjectByName('bridge'));
  const batches = installBatches(scene, library, mobile, time);
  const wildlife = installWildlife(scene, library, mobile);
  const life = installVillageLife(scene, assets, assets.dressing.scene, mobile, surfaceAt, heightAt);
  const landscape = makeLandscape(new Uint8Array(elevation));
  const terrain = terrainMaterial(textures, shadow, time);
  const reflection = mobile ? null : riverReflection();
  const water = waterMaterial(textures.sky, time, swimmer, reflection);
  const capacity = (DRAW_RADIUS * 2 + 1) ** 2;
  const tiles = new Map();
  const free = [];
  const origin = new THREE.Vector3();
  const nearHouses = [];
  const nearCrossings = [];
  const colliders = [];
  const cameraColliders = [];
  const lastEye = new THREE.Vector2(Infinity, Infinity);
  let centerX = Infinity;
  let centerZ = Infinity;
  let pending = [];
  let dirty = true;

  function obtainTile() {
    if (free.length) return free.pop();
    const root = new THREE.Group();
    root.name = 'Valley chunk';
    const deck = new THREE.Group();
    const ground = makeGround(terrain);
    const river = makeWater(water);
    const stream = makeWater(water);
    root.add(ground, river, stream, deck);
    scene.add(root);
    return { root, deck, ground, river, stream };
  }

  function fillTile(x, z) {
    const tile = obtainTile();
    const x0 = x * CHUNK_SIZE, z0 = z * CHUNK_SIZE;
    tile.x = x;
    tile.z = z;
    tile.root.position.set(x0 - origin.x, 0, z0 - origin.z);
    tile.root.visible = true;
    fillGround(tile.ground, x0, z0, landscape.rawHeight);
    tile.height = tile.ground.geometry.getAttribute('position').array;
    tiles.set(keyOf(x, z), tile);
    fillChannel(tile.river, x0, z0, false, heightAt);
    fillChannel(tile.stream, x0, z0, true, heightAt);
    const village = villageForChunk(x, z, heightAt);
    tile.houses = village.houses;
    tile.crossings = village.crossings;
    const layout = tileLayout(x, z, heightAt, village.houses);
    tile.points = layout.points;
    tile.colliders = layout.colliders;
    for (const crossing of village.crossings) {
      const mesh = makeCrossing(crossing, materials.wood, bridge);
      mesh.position.set(crossing.x - x0, crossing.deck, crossing.z - z0);
      tile.deck.add(mesh);
    }
  }

  function releaseTile(tile) {
    // Walkway meshes are the only chunk-specific geometry outside the pooled ground and water.
    for (const crossing of tile.deck.children) crossing.children.at(-1).geometry.dispose();
    tile.deck.clear();
    tile.root.visible = false;
    free.push(tile);
  }

  function sync(x, z, initial = false) {
    const nextX = tileOf(x);
    const nextZ = tileOf(z);
    if (nextX === centerX && nextZ === centerZ) return false;
    centerX = nextX;
    centerZ = nextZ;
    origin.set((centerX + 0.5) * CHUNK_SIZE, 0, (centerZ + 0.5) * CHUNK_SIZE);
    alignWater(water, origin);
    const desired = chunkWindow(x, z, DRAW_RADIUS);
    const keys = new Set(desired.map(cell => keyOf(cell.x, cell.z)));
    for (const [key, tile] of tiles) {
      if (keys.has(key)) {
        tile.root.position.set(tile.x * CHUNK_SIZE - origin.x, 0, tile.z * CHUNK_SIZE - origin.z);
      } else {
        tiles.delete(key);
        releaseTile(tile);
      }
    }
    pending = [];
    nearHouses.length = nearCrossings.length = colliders.length = cameraColliders.length = 0;
    for (const cell of desired) {
      const key = keyOf(cell.x, cell.z);
      if (!tiles.has(key)) {
        if (initial || cell.range <= 1) fillTile(cell.x, cell.z);
        else pending.push(cell);
      }
      if (cell.range > 1) continue;
      const tile = tiles.get(key);
      nearHouses.push(...tile.houses);
      nearCrossings.push(...tile.crossings);
      colliders.push(...tile.colliders);
      cameraColliders.push(...tile.colliders, ...tile.crossings.flatMap(crossingCameraColliders),
        ...tile.houses.flatMap(stairCameraColliders));
    }
    dirty = true;
    return true;
  }

  function heightAt(x, z) {
    const ix = tileOf(x), iz = tileOf(z);
    const tile = tiles.get(keyOf(ix, iz));
    if (!tile) return landscape.heightAt(x, z);
    const gx = (x - ix * CHUNK_SIZE) / TERRAIN_STEP;
    const gz = (z - iz * CHUNK_SIZE) / TERRAIN_STEP;
    const cx = clamp(Math.floor(gx), 0, CHUNK_SEGMENTS - 1);
    const cz = clamp(Math.floor(gz), 0, CHUNK_SEGMENTS - 1);
    const columns = CHUNK_SEGMENTS + 1;
    const i = (cz * columns + cx) * 3 + 1;
    const a = tile.height[i], b = tile.height[i + 3];
    const c = tile.height[i + columns * 3], d = tile.height[i + columns * 3 + 3];
    const u = gx - cx, v = gz - cz;
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  function surfaceAt(x, z, maxHeight = Infinity) {
    const ground = heightAt(x, z);
    const level = waterAt(x, z);
    const platform = villageSupport(x, z, maxHeight, nearHouses, nearCrossings);
    const floor = Math.max(ground, level - 0.31, platform);
    const depth = platform >= level ? 0 : Math.max(0, level - ground);
    return { floor, depth };
  }

  function update(eye, position, dt, inWater) {
    const next = pending.shift();
    if (next) {
      fillTile(next.x, next.z);
      if (!pending.length) dirty = true;
    }
    time.value += dt;
    swimmer.set(position.x - origin.x, inWater ? 1 : 0, position.z - origin.z);
    wildlife(position, origin, time.value);
    life(eye, position, origin, time.value, dt);
    if (!dirty && (eye.x - lastEye.x) ** 2 + (eye.z - lastEye.y) ** 2 < 3.2 ** 2) return;
    lastEye.set(eye.x, eye.z);
    dirty = false;
    for (const batch of batches) batch(tiles, eye.x, eye.z, origin);
  }

  sync(SPAWN.x, SPAWN.z, true);
  return {
    origin, colliders, cameraColliders, shadow, sky, environment: textures.sky, heightAt, surfaceAt, sync, update,
    reflect(renderer, camera, quality) {
      reflection?.render(renderer, scene, camera, sky, origin, time.value, quality);
    },
    get chunkCount() { return tiles.size; },
    get chunkPoolSize() { return tiles.size + free.length; },
    capacity,
  };
}

export function addValleyLighting(scene, mobile) {
  scene.add(new THREE.HemisphereLight('#dcefff', '#afa18c', 1.91));
  const sun = new THREE.DirectionalLight('#ffe8c2', 2.92);
  sun.position.fromArray(SUN_DIRECTION).normalize().multiplyScalar(66);
  sun.castShadow = true;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  sun.shadow.mapSize.setScalar(mobile ? 1024 : 1536);
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 2, far: 142 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.09;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 1.4;
  sun.shadow.intensity = 0.70;
  scene.add(sun);
  return sun;
}

function importedFootbridge(model) {
  if (!model) return null;
  const bounds = new THREE.Box3().setFromObject(model);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(model, true);
  model.traverse(part => {
    if (!part.isMesh) return;
    part.castShadow = true;
    part.receiveShadow = true;
  });
  return { model, deck: hits[0]?.point.y ?? 0.43, halfLength: (bounds.max.x - bounds.min.x) / 2,
    halfWidth: (bounds.max.z - bounds.min.z) / 2 };
}

function tileLayout(tx, tz, heightAt, houses) {
  const x0 = tx * CHUNK_SIZE, z0 = tz * CHUNK_SIZE;
  let seed = Math.floor(hash2(tx + 273, tz - 158) * 4294967296);
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const points = {};
  const colliders = houses.flatMap(houseColliders);
  const add = (role, x, z, scale, angle = random() * Math.PI * 2, radius = 0, height = 0, y = heightAt(x, z)) => {
    (points[role] ??= []).push({ x, z, y, scale, angle, tint: 0.84 + random() * 0.25 });
    if (radius > 0) colliders.push({ x, z, y, radius: radius * scale, height: height * scale });
  };
  for (const house of houses) {
    add('house', house.x, house.z, house.scale, house.yaw, 0, 0, house.y);
    const place = (role, lx, lz, scale, floor) => {
      const x = house.x + house.scale * (lx * house.cos + lz * house.sin);
      const z = house.z + house.scale * (-lx * house.sin + lz * house.cos);
      add(role, x, z, scale * house.scale, house.yaw + lx * 0.11, 0, 0, floor ?? heightAt(x, z));
    };
    place('basket', 3.10, 3.21, 1.15, house.y + HOUSE.floor * house.scale + 0.026);
    place('basket', -3.0, 0.04, 1.42, house.y + HOUSE.floor * house.scale + 0.026);
    place('firewood', 3.58, 2.88, 1.65);
    place('firewood', 2.62, 2.39, 1.3);
  }

  const villageX = Math.round((x0 + CHUNK_SIZE / 2) / VILLAGE_SPACING) * VILLAGE_SPACING;
  const settlement = (role, dx, offset, scale, angle, floating = false) => {
    const x = villageX + dx;
    const z = riverZ(x) + offset;
    if (tileOf(x) === tx && tileOf(z) === tz) {
      add(role, x, z, scale, angle, 0, 0, floating ? riverLevel(x) + 0.023 : heightAt(x, z));
    }
  };
  for (const offset of [-2.50, 0, 2.50]) {
    const dx = PADDY.x + offset;
    const x = villageX + dx;
    const yaw = -Math.atan2(riverZ(x + 1) - riverZ(x - 1), 2);
    settlement('rice', dx, -riverWidth(x) - PADDY.bankOffset, 0.74, yaw);
  }
  for (const dx of [13.2, 15.35, 17.45]) {
    settlement('corn', dx, -riverWidth(villageX + dx) - 5.2, 0.85, 1.12);
  }
  settlement('pottery', 4.2, -riverWidth(villageX + 4.2) - 3.95, 1.12, -0.19);
  settlement('basket', 5.2, -riverWidth(villageX + 5.2) - 3.66, 1.25, 0.51);
  settlement('basket', 2.95, -riverWidth(villageX + 2.95) - 4.13, 0.91, 0.47);

  for (const [role, x, z, scale] of SHORE_PLANTS) {
    if (tileOf(x) !== tx || tileOf(z) !== tz) continue;
    const variant = ROCKS.indexOf(role);
    const radius = role === 'fig' ? 2.15 : role === 'tree-fern' ? 0.38 : ROCK_RADIUS[variant] ?? 0;
    const height = role === 'fig' ? 16 : role === 'tree-fern' ? 4.8 : ROCK_HEIGHT[variant] ?? 0;
    add(role, x, z, scale, undefined, radius, height);
  }

  for (let i = 0; i < 31; i++) {
    const x = x0 + 1 + random() * (CHUNK_SIZE - 2);
    const z = z0 + 1 + random() * (CHUNK_SIZE - 2);
    const { riverEdge, streamEdge } = channelAt(x, z);
    const zoneX = x - Math.round(x / VILLAGE_SPACING) * VILLAGE_SPACING;
    const village = Math.abs(zoneX) < 24 && Math.abs(z - riverZ(x)) < 21;
    if (village || Math.min(riverEdge, streamEdge) < 2.7 || trailDistance(x, z) < 2.1) continue;
    const wet = riverEdge < 18 || streamEdge < 9;
    if (i % 5 === 2 && Math.min(riverEdge, streamEdge) < 38) {
      add('fig', x, z, 0.37 + random() * 0.35, undefined, 2.15, 16);
    } else if (wet && i % 4 === 1) {
      add('tree-fern', x, z, 0.47 + random() * 0.36, undefined, 0.38, 4.8);
    } else {
      const role = wet ? 'bamboo' : (i % 6 === 0 ? 'pine' : 'spruce');
      const scale = wet ? 0.54 + random() * 0.62 : 0.45 + random() * 0.40;
      add(role, x, z, scale, undefined, wet ? 0.71 : role === 'pine' ? 0.46 : 2.25, wet ? 5.4 : 12);
    }
  }

  for (let i = 0; i < 178; i++) {
    const x = x0 + random() * CHUNK_SIZE;
    const z = z0 + random() * CHUNK_SIZE;
    const { riverEdge, streamEdge } = channelAt(x, z);
    const shore = Math.min(riverEdge, streamEdge);
    if (shore < 0.5 || trailDistance(x, z) < 1.25 || paddyEdge(x, z) < 0.25) continue;
    const herb = i % 11 === 0;
    add(herb ? 'fern' : 'grass', x, z, herb ? 0.72 + random() * 0.74 : 0.73 + random() * 0.92);
  }

  for (let i = 0; i < 15; i++) {
    const x = x0 + (i + random()) * CHUNK_SIZE / 15;
    const side = i % 2 ? 1 : -1;
    const z = riverZ(x) + side * (riverWidth(x) + 1.32 + random() * 1.35);
    if (tileOf(z) !== tz || trailDistance(x, z) < 1.48 || paddyEdge(x, z) < 0.12) continue;
    add('reed', x, z, 0.39 + random() * 0.31);
    add('grass', x - 0.26, z + side * 0.66, 1.04 + random() * 0.27);
    if (i % 4 === 0) {
      const variant = i % ROCKS.length;
      add(ROCKS[variant], x + 0.2, z + side * 0.5, 0.44 + random() * 0.85, undefined,
        ROCK_RADIUS[variant], ROCK_HEIGHT[variant]);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = x0 + (i + random()) * CHUNK_SIZE / 9;
    const z = riverZ(x) + (i % 2 ? 1 : -1) * riverWidth(x) * (0.59 + random() * 0.19);
    if (tileOf(z) !== tz || Math.abs(x - villageX) < 2) continue;
    add('lily', x, z, 0.39 + random() * 0.31, undefined, 0, 0, riverLevel(x) + 0.024);
  }

  const creek = streamAnchor(x0 + CHUNK_SIZE / 2);
  for (let i = 0; i < 10; i++) {
    const z = z0 + (i + random()) * CHUNK_SIZE / 10;
    const x = streamX(z, creek) + (i % 2 ? 1 : -1) * (streamWidth(z) + 0.89);
    if (z >= riverZ(creek) - 2 || tileOf(x) !== tx || trailDistance(x, z) < 1.3) continue;
    add('reed', x, z, 0.34 + random() * 0.31);
  }

  const canoeX = villageX + 6.7;
  const canoeZ = riverZ(canoeX) + riverWidth(canoeX) * 0.58;
  if (tileOf(canoeX) === tx && tileOf(canoeZ) === tz) {
    add('canoe', canoeX, canoeZ, 0.92, Math.PI / 2 - 0.24, 0, 0, riverLevel(canoeX) - 0.19);
  }
  return { points, colliders };
}

function installBatches(scene, library, mobile, time) {
  const types = [
    ['house', 18, 93, true],
    ['spruce', mobile ? 16 : 24, mobile ? 28 : 39, true, 'spruce-low', 225, 82],
    ['pine', mobile ? 12 : 20, mobile ? 36 : 49, true, 'spruce-low', 86, 84],
    ['fig', mobile ? 6 : 11, mobile ? 43 : 57, true],
    ['tree-fern', mobile ? 7 : 13, mobile ? 22 : 37, true],
    ['bamboo', mobile ? 13 : 25, mobile ? 25 : 35, true, 'young-bamboo', 88, 72, 1.78],
    ['banana', 14, 35, true],
    ['reed', mobile ? 46 : 75, mobile ? 23 : 37, false],
    ['fern', mobile ? 30 : 48, mobile ? 13 : 19, false, 'fern-low', 70, 29],
    ['grass', mobile ? 100 : 153, mobile ? 11 : 16, false, 'grass-low', 340, mobile ? 23 : 33],
    ['rice', 6, 47, false],
    ['corn', 8, 48, false],
    ['lily', mobile ? 12 : 21, mobile ? 27 : 45, false],
    ['pottery', 3, 62, true],
    ['firewood', 20, 42, true],
    ['basket', 20, 38, true],
    ['canoe', 6, 60, false],
    ...ROCKS.map(name => [name, mobile ? 11 : 17, mobile ? 28 : 40, true]),
  ];
  const dummy = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  function batch(name, capacity, castsShadow) {
    const model = library.getObjectByName(name);
    if (!model) throw new Error(`Missing valley model: ${name}`);
    const parts = [];
    model.traverse(part => {
      if (!part.isMesh) return;
      const source = part.material;
      const foliage = source.alphaTest > 0;
      const material = foliage && !source.isMeshBasicMaterial ? new THREE.MeshLambertMaterial({
        map: source.map, color: source.color.clone().multiplyScalar(1.35), side: source.side,
        alphaTest: source.alphaTest, vertexColors: source.vertexColors,
      }) : source;
      if (foliage && !mobile) material.alphaToCoverage = true;
      if (foliage && name === 'fig') material.color.multiply(new THREE.Color('#c3c8af'));
      const wind = ['reed', 'corn'].includes(name);
      const canopy = name === 'fig' || (foliage && !material.isMeshBasicMaterial
        && ['spruce', 'pine', 'bamboo', 'banana', 'tree-fern'].includes(name));
      if (wind || canopy) {
        material.customProgramCacheKey = () => String(Number(wind) + Number(canopy) * 2);
        material.onBeforeCompile = shader => {
          if (wind) {
            shader.uniforms.clock = time;
            shader.vertexShader = 'uniform float clock;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
              #include <begin_vertex>
              float top = max(0.0, (mat3(instanceMatrix) * position).y);
              float wind = sin(clock * 1.75 + instanceMatrix[3].x * 0.32 + instanceMatrix[3].z * 0.17);
              transformed.x += wind * top * 0.11;
              transformed.z += wind * top * 0.045;
            `);
          }
          if (canopy) {
            // Clear the chase camera when it passes through an overhanging crown.
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
              float canopyDistance = dot(vViewPosition, vViewPosition);
              if (canopyDistance < 7.29) {
                float coverage = smoothstep(2.89, 7.29, canopyDistance);
                float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
                if (noise >= coverage) discard;
              }
              #include <map_fragment>
            `);
          }
        };
      }
      const mesh = new THREE.InstancedMesh(part.geometry, material, capacity);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = castsShadow;
      mesh.receiveShadow = castsShadow && !foliage;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, color.setScalar(1));
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
      parts.push({ mesh, transform: part.matrixWorld });
    });
    return parts;
  }

  const insert = (parts, point, origin, scale, i) => {
    dummy.position.set(point.x - origin.x, point.y - 0.025, point.z - origin.z);
    dummy.rotation.y = point.angle;
    dummy.scale.setScalar(point.scale * scale);
    dummy.updateMatrix();
    color.setScalar(point.tint);
    for (const { mesh, transform } of parts) {
      mesh.setMatrixAt(i, matrix.multiplyMatrices(dummy.matrix, transform));
      mesh.setColorAt(i, color);
    }
  };
  const commit = (parts, count) => {
    for (const { mesh } of parts) {
      mesh.count = count;
      mesh.visible = count > 0;
      if (!mesh.visible) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  };

  return types.map(([name, cap, distance, shadows, farName, farCap, farDistance, scale = 1]) => {
    const near = batch(name, cap, shadows);
    const far = farName ? batch(farName, farCap, false) : [];
    const maxDistance = (farName ? farDistance : distance) ** 2;
    const detail = distance ** 2;
    const selected = [];
    return (tiles, x, z, origin) => {
      selected.length = 0;
      for (const tile of tiles.values()) {
        const tileX = tile.x * CHUNK_SIZE;
        const tileZ = tile.z * CHUNK_SIZE;
        const dx = Math.max(tileX - x, x - tileX - CHUNK_SIZE, 0);
        const dz = Math.max(tileZ - z, z - tileZ - CHUNK_SIZE, 0);
        if (dx * dx + dz * dz > maxDistance) continue;
        for (const point of tile.points[name] ?? []) {
          const d = (point.x - x) ** 2 + (point.z - z) ** 2;
          if (d < maxDistance) selected.push({ point, d });
        }
      }
      selected.sort((a, b) => a.d - b.d);
      let n = 0, f = 0;
      for (const { point, d } of selected) {
        if (n < cap && d < detail) insert(near, point, origin, 1, n++);
        else if (farName && f < farCap) insert(far, point, origin, scale, f++);
      }
      commit(near, n);
      commit(far, f);
    };
  });
}

function installWildlife(scene, library, mobile) {
  const fish = library.getObjectByName('carp');
  const flock = library.getObjectByName('osprey');
  if (!fish || !flock) return () => {};
  const fishPart = fish.getObjectByProperty('isMesh', true);
  const birdPart = flock.getObjectByProperty('isMesh', true);
  const fishCount = mobile ? 6 : 12;
  const school = new THREE.InstancedMesh(fishPart.geometry, fishPart.material, fishCount);
  const birds = new THREE.InstancedMesh(birdPart.geometry, birdPart.material, 2);
  school.name = 'River fish';
  birds.name = 'Osprey';
  scene.add(school, birds);
  school.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const point = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  let last = -Infinity, lastX = Infinity, lastZ = Infinity;

  return (position, origin, time) => {
    if (time - last < 1 / 24 && origin.x === lastX && origin.z === lastZ) return;
    last = time;
    lastX = origin.x;
    lastZ = origin.z;
    const middle = Math.round(position.x / 16) * 16;
    const shore = Math.abs(position.z - riverZ(position.x));
    school.visible = shore < 24;
    birds.visible = shore < 63;
    if (school.visible) {
      for (let i = 0; i < fishCount; i++) {
        const travel = time * 0.72 + i * 0.89;
        const x = middle + (i < fishCount / 2 ? -3.4 : 6.1) + Math.sin(travel) * 2.7;
        const z = riverZ(x) + Math.cos(travel) * 0.81;
        point.position.set(x - origin.x, riverLevel(x) - 0.45 + 0.12 * Math.sin(travel * 0.6), z - origin.z);
        point.rotation.set(0, Math.atan2(Math.sin(travel) * 0.81, Math.cos(travel) * 2.7), 0);
        point.scale.setScalar(0.36 + (i % 4) * 0.058);
        point.updateMatrix();
        school.setMatrixAt(i, matrix.multiplyMatrices(point.matrix, fishPart.matrixWorld));
      }
      school.computeBoundingSphere();
      school.instanceMatrix.needsUpdate = true;
    }
    if (birds.visible) {
      const flightX = Math.round(position.x / 82) * 82;
      for (let i = 0; i < 2; i++) {
        const angle = time * 0.13 + i * 1.9;
        const x = flightX + Math.sin(angle) * 26.0;
        const z = riverZ(flightX) - 7.5 + Math.cos(angle) * 20;
        point.position.set(x - origin.x, 9 + i * 2.1 + Math.sin(angle * 2) * 1.35, z - origin.z);
        point.rotation.set(0, Math.atan2(Math.cos(angle) * 26, -Math.sin(angle) * 20), 0.19 * Math.cos(angle));
        point.scale.setScalar(0.88 + i * 0.11);
        point.updateMatrix();
        birds.setMatrixAt(i, matrix.multiplyMatrices(point.matrix, birdPart.matrixWorld));
      }
      birds.computeBoundingSphere();
      birds.instanceMatrix.needsUpdate = true;
    }
  };
}
