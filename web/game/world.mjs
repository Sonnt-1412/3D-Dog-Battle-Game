import * as THREE from 'three';
import { modelLoader } from './assets.mjs';
import { forestAssets } from './forest-assets.mjs';
import { STAGE_RADIUS } from './physics.mjs';
import { SUN_DIRECTION, TERRAIN_GRID, TERRAIN_HALF, terrainSampler, trailDistance } from './terrain.mjs';

const ROCKS = ['rock-a', 'rock-b', 'rock-c'];
const ROCK_RADIUS = [1.16, 0.98, 0.90];
const ROCK_HEIGHT = [0.78, 1.07, 0.61];
const SKY_SAMPLE = `
  uniform sampler2D panorama;
  vec3 skyColor(vec3 direction) {
    vec3 ray = normalize(direction);
    vec2 uv = vec2(atan(ray.z, ray.x) * 0.15915494 + 0.50,
      asin(clamp(ray.y, -1.0, 1.0)) * 0.31830989 + 0.535);
    return texture2D(panorama, uv).rgb;
  }
`;

export async function loadForest(scene, mobile) {
  const loader = new THREE.TextureLoader();
  const [props, elevation, grass, grassNormal, trail, trailNormal, panorama] = await Promise.all([
    modelLoader.loadAsync(forestAssets.props.url),
    fetch(forestAssets.elevation.url).then(response => {
      if (!response.ok) throw new Error(`Elevation request failed: ${response.status}`);
      return response.arrayBuffer();
    }),
    ...['grass', 'grassNormal', 'trail', 'trailNormal', 'sky'].map(key => loader.loadAsync(forestAssets[key].url)),
  ]);

  for (const texture of [grass, grassNormal, trail, trailNormal]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = mobile ? 2 : 4;
  }
  for (const texture of [grass, trail, panorama]) texture.colorSpace = THREE.SRGBColorSpace;
  panorama.wrapS = THREE.RepeatWrapping;
  panorama.mapping = THREE.EquirectangularReflectionMapping;
  scene.fog = new THREE.Fog('#a1aba5', 25, 68);

  const heightAt = terrainSampler(new Uint8Array(elevation));
  const shadow = { position: new THREE.Vector3(), forward: new THREE.Vector2(0, -1), lift: 0 };
  const sky = makeSky(panorama);
  scene.add(sky, makeTerrain(heightAt, { grass, grassNormal, trail, trailNormal, panorama }, shadow));

  const { fields, colliders } = forestLayout(heightAt);
  props.scene.updateMatrixWorld(true);
  const place = (name, options) => makeInstances(scene, props.scene, fields[name], name, {
    antialias: !mobile, ...options,
  });
  const groups = [
    place('spruce', { farName: 'spruce-low', detailDistance: mobile ? 20 : 29, castsShadow: true }),
    place('pine', { castsShadow: true }),
    place('sapling', { drawDistance: mobile ? 29 : 39, castsShadow: true }),
    place('stump', { castsShadow: true }),
    ...ROCKS.map(name => place(name, { castsShadow: true })),
    place('fern', { farName: 'fern-low', detailDistance: mobile ? 9 : 13, drawDistance: mobile ? 17 : 25 }),
    place('grass', { farName: 'grass-low', detailDistance: mobile ? 8 : 12, drawDistance: mobile ? 15 : 22 }),
  ];

  const lastEye = new THREE.Vector2(Infinity, Infinity);
  function updateDetail(eye) {
    if ((eye.x - lastEye.x) ** 2 + (eye.z - lastEye.y) ** 2 < 1.5 ** 2) return;
    lastEye.set(eye.x, eye.z);
    for (const group of groups) group(eye.x, eye.z);
  }
  return { heightAt, colliders, shadow, sky, environment: panorama, updateDetail };
}

export function addForestLighting(scene, mobile) {
  scene.add(new THREE.HemisphereLight('#dce8ff', '#8b8b75', 1.75));
  const sun = new THREE.DirectionalLight('#fff1dd', 2.72);
  sun.position.fromArray(SUN_DIRECTION).normalize().multiplyScalar(56);
  sun.castShadow = true;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  sun.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 2, far: 115 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.10;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 1.7;
  sun.shadow.intensity = 0.78;
  scene.add(sun);
}

function makeSky(panorama) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(85, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { panorama: { value: panorama } },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: SKY_SAMPLE + `
      varying vec3 vDirection;
      void main() {
        gl_FragColor = vec4(skyColor(vDirection), 1.0);
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

function makeTerrain(heightAt, textures, shadow) {
  const size = TERRAIN_HALF * 2;
  const segments = TERRAIN_GRID - 1;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments).rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const track = new Float32Array(positions.count);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, heightAt(x, z));
    uv.setXY(i, x / 2.3, -z / 2.3);
    const width = 1.35 + 0.16 * Math.sin(x * 0.57 + z * 0.39);
    track[i] = THREE.MathUtils.clamp((width - trailDistance(x, z)) * 1.35 + 0.52, 0, 1);
  }
  geometry.setAttribute('trailWeight', new THREE.BufferAttribute(track, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: textures.grass,
    normalMap: textures.grassNormal,
    normalScale: new THREE.Vector2(0.62, 0.62),
    roughness: 0.98,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      trailColor: { value: textures.trail },
      trailNormals: { value: textures.trailNormal },
      panorama: { value: textures.panorama },
      dogLocation: { value: shadow.position },
      dogForward: { value: shadow.forward },
      jumpHeight: { get value() { return shadow.lift; } },
    });
    shader.vertexShader = `
      attribute float trailWeight;
      varying float vTrailWeight;
      varying vec3 vGround;
    ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vTrailWeight = trailWeight;
      vGround = position;
    `);
    shader.fragmentShader = SKY_SAMPLE + `
      varying float vTrailWeight;
      varying vec3 vGround;
      uniform sampler2D trailColor;
      uniform sampler2D trailNormals;
      uniform vec3 dogLocation;
      uniform vec2 dogForward;
      uniform float jumpHeight;
    ` + shader.fragmentShader.replace('#include <map_fragment>', `
      vec4 grassColor = texture2D(map, vMapUv);
      vec2 trailUv = vec2(vMapUv.y, -vMapUv.x) * 1.16;
      vec4 stoneColor = texture2D(trailColor, trailUv);
      float edge = (grassColor.g - stoneColor.r) * 0.57;
      float trailMix = smoothstep(0.17, 0.83, vTrailWeight + edge);
      float patches = 0.85 + 0.13 * sin(vGround.x * 0.38 + vGround.z * 0.21)
        * sin(vGround.z * 0.49 - vGround.x * 0.23);
      vec2 delta = vGround.xz - dogLocation.xz;
      vec2 body = vec2(dot(delta, vec2(dogForward.y, -dogForward.x)) * 4.0, dot(delta, dogForward) * 2.0);
      float contact = exp(-dot(body, body) / (1.0 + 2.4 * jumpHeight)) * exp(-3.0 * jumpHeight);
      vec3 undergrowth = grassColor.rgb * vec3(0.72, 0.89, 0.61) * patches;
      diffuseColor.rgb *= mix(undergrowth, stoneColor.rgb * 0.81, trailMix) * (1.0 - 0.64 * contact);
    `).replace('#include <normal_fragment_maps>', `
      vec3 grassN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
      vec3 trailN = texture2D(trailNormals, trailUv).xyz * 2.0 - 1.0;
      vec3 mapN = mix(grassN, vec3(-trailN.y, trailN.x, trailN.z), trailMix);
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);
    `).replace('#include <fog_fragment>', `
      #include <fog_fragment>
      float boundary = smoothstep(32.0, 45.7, max(abs(vGround.x), abs(vGround.z)));
      if (boundary > 0.0) {
        vec4 horizon = linearToOutputTexel(vec4(skyColor(vGround - cameraPosition), 1.0));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, horizon.rgb, boundary);
      }
    `);
  };
  const ground = new THREE.Mesh(geometry, material);
  ground.receiveShadow = true;
  return ground;
}

function forestLayout(heightAt) {
  const fields = Object.fromEntries(['spruce', 'pine', 'sapling', 'fern', 'grass', 'stump', ...ROCKS].map(name => [name, []]));
  const colliders = [];
  const trees = [];
  let seed = 0x5272ced1;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const point = new THREE.Object3D();

  function plant(name, x, z, scale, angle, radius = 0, height = 0, cameraRadius = radius) {
    const y = heightAt(x, z);
    point.position.set(x, y - 0.035, z);
    point.rotation.y = angle;
    point.scale.setScalar(scale);
    point.updateMatrix();
    const tint = 0.86 + random() * 0.24;
    fields[name].push({ x, z, matrix: point.matrix.clone(), color: new THREE.Color(tint, tint, tint) });
    if (radius > 0) colliders.push({
      x, y, z, radius: radius * scale, height: height * scale, cameraRadius: cameraRadius * scale,
    });
  }

  function tree(name, x, z, size) {
    trees.push({ x, z });
    const spruce = name === 'spruce';
    plant(name, x, z, size, random() * Math.PI * 2, spruce ? 2.85 : 0.45,
      spruce ? 7 : 16, spruce ? 4.0 : 0.58);
  }

  for (const [name, x, z, scale] of [
    ['spruce', -8.2, 6.5, 0.70], ['pine', 5.3, 5.3, 0.82],
    ['pine', -5.8, -0.8, 0.63], ['spruce', 5.4, -4.2, 0.62],
    ['spruce', -9.4, -6.8, 0.61], ['pine', 9, -10.2, 0.71],
    ['spruce', -6.8, -13, 0.64], ['spruce', 14.0, -13.8, 0.65],
    ['pine', -11.5, -18.8, 0.78], ['spruce', -5.2, -22.3, 0.59],
    ['spruce', 12.6, -23.2, 0.76], ['pine', 16, -25, 0.81],
    ['spruce', 6.0, 14.1, 0.67], ['pine', -5.4, 9.1, 0.67],
    ['spruce', -8.7, 14.1, 0.58], ['pine', 9.3, 21.2, 0.86],
  ]) {
    tree(name, x, z, scale);
  }

  for (let i = 0; i < 720 && trees.length < 81; i++) {
    const x = (random() * 2 - 1) * 43;
    const z = (random() * 2 - 1) * 43;
    if (Math.hypot(x, z) > 43.8 || (Math.abs(x) < 5.8 && z < -24) || trailDistance(x, z) < 3.7
      || Math.hypot(x, z - 6) < 8 || trees.some(tree => (tree.x - x) ** 2 + (tree.z - z) ** 2 < 4.55 ** 2)) continue;
    tree(random() < 0.20 ? 'pine' : 'spruce', x, z, 0.45 + random() * 0.39);
  }

  for (const [variant, x, z, scale, angle] of [
    [1, 2.8, 1.9, 1.08, 0.9], [0, 4.5, 0.0, 0.61, 1.2], [2, 2.5, 4.6, 0.4, 0.2],
    [0, -4.5, -2.8, 0.65, 2.0], [2, -3.7, -0.2, 0.43, 0.8], [1, -8.3, -8.2, 1.32, 2.1],
    [1, 11.0, -19.3, 1.75, 1.6], [0, 12.8, -21.0, 1.27, 2.8], [2, 11.5, -16.5, 0.66, 2.1],
    [1, -1.2, -34.0, 1.4, 0.5], [0, -5.1, -33.5, 1.1, 0.1], [2, -8.4, -31.8, 0.91, 1.7],
    [0, 15.8, 7.3, 1.36, 1.1], [2, -16, 10.1, 1.25, 2.4], [1, -25.2, -7, 1.60, 4.6],
  ]) {
    plant(ROCKS[variant], x, z, scale, angle, ROCK_RADIUS[variant], ROCK_HEIGHT[variant]);
  }
  for (const [x, z, size] of [[-2.5, 5, 0.72], [6.1, -9.1, 0.88], [10.8, 11.2, 0.95], [-15.9, -10.5, 0.79]]) {
    plant('stump', x, z, size, random() * 6.28, 0.46, 0.35);
  }

  for (const [x, z, scale] of [
    [-3.8, 3.8, 0.68], [3.6, 2.6, 0.56], [5.3, -0.7, 0.51], [-5.7, -4.6, 0.62],
    [-3.5, -9.8, 0.47], [7.2, -12.9, 0.58], [-8.2, -17.4, 0.58], [3.5, -27.5, 0.35],
  ]) {
    plant('sapling', x, z, scale, random() * 6.28, 0.78, 2.7, 1.48);
  }

  for (const parent of trees.slice(0, 48)) {
    const x = parent.x + (random() * 2 - 1) * 4.3;
    const z = parent.z + (random() * 2 - 1) * 4.3;
    if (trailDistance(x, z) > 2.35 && Math.hypot(x, z) < TERRAIN_HALF - 1) {
      plant('sapling', x, z, 0.34 + random() * 0.48, random() * 6.28, 0.56, 2.7, 1.44);
    }
  }

  for (let i = 0; i < 3600; i++) {
    const x = (random() * 2 - 1) * 39;
    const z = (random() * 2 - 1) * 39;
    const range = Math.hypot(x, z);
    const distance = trailDistance(x, z);
    if (range > STAGE_RADIUS + 2 || distance < 1.27 || (distance > 4.6 && random() < 0.43)) continue;
    const fern = i % 8 === 0;
    const scale = fern ? 0.62 + random() * 0.92 : 0.68 + random() * 1.3;
    plant(fern ? 'fern' : 'grass', x, z, scale, random() * 6.28);
    if (!fern && distance < 3.5) plant('grass', x + 0.28, z + 0.17, scale * 0.7, random() * 6.28);
  }
  for (const [x, z, size] of [[-1.8, 7.5, 1.12], [2.1, 5.8, 0.94], [-2.9, 3.8, 1.26],
    [1.8, 1.7, 1.10], [3.1, 0.2, 1.25], [-4.4, -0.9, 1.15]]) {
    plant('fern', x, z, size, random() * 6.28);
  }
  return { fields, colliders };
}

function makeInstances(scene, library, plants, nearName, {
  farName, detailDistance = 0, drawDistance = Infinity, castsShadow = false, antialias,
}) {
  const matrix = new THREE.Matrix4();
  const fixed = !farName && drawDistance === Infinity;

  function create(name) {
    const model = library.getObjectByName(name);
    if (!model) throw new Error(`Missing forest model: ${name}`);
    const parts = [];
    model.traverse(part => {
      if (!part.isMesh) return;
      const source = part.material;
      const foliage = source.alphaTest > 0;
      const material = foliage && !source.isMeshBasicMaterial ? new THREE.MeshLambertMaterial({
        map: source.map, color: source.color.clone().multiplyScalar(1.47), side: source.side, alphaTest: source.alphaTest,
        vertexColors: source.vertexColors,
      }) : source;
      if (foliage && antialias) material.alphaToCoverage = true;
      const mesh = new THREE.InstancedMesh(part.geometry, material, plants.length);
      mesh.name = name;
      mesh.frustumCulled = drawDistance === Infinity;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = castsShadow;
      mesh.receiveShadow = castsShadow && !foliage;
      // Allocate instance colors before the first draw even if this LOD starts empty.
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      if (!fixed) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      mesh.count = 0;
      scene.add(mesh);
      parts.push({ mesh, matrix: part.matrixWorld });
    });
    return parts;
  }

  const near = create(nearName);
  const far = farName ? create(farName) : near;
  const all = far === near ? near : [...near, ...far];
  const maxDistanceSquared = drawDistance ** 2;
  const detailDistanceSquared = detailDistance ** 2;
  let initialized = false;
  return (x, z) => {
    if (fixed && initialized) return;
    initialized = true;
    for (const { mesh } of all) mesh.count = 0;
    for (const plant of plants) {
      const distanceSquared = (plant.x - x) ** 2 + (plant.z - z) ** 2;
      if (distanceSquared > maxDistanceSquared) continue;
      const parts = distanceSquared <= detailDistanceSquared ? near : far;
      for (const part of parts) {
        const mesh = part.mesh;
        matrix.multiplyMatrices(plant.matrix, part.matrix);
        mesh.setMatrixAt(mesh.count, matrix);
        mesh.setColorAt(mesh.count, plant.color);
        mesh.count++;
      }
    }
    for (const { mesh } of all) {
      mesh.visible = mesh.count > 0;
      if (!mesh.visible) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      if (mesh.frustumCulled) mesh.computeBoundingSphere();
    }
  };
}
