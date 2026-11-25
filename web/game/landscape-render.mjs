import * as THREE from 'three';
import {
  CHUNK_SEGMENTS, CHUNK_SIZE, TERRAIN_STEP, clamp, channelAt, riverLevel, riverWidth, riverZ,
  streamAnchor, streamLevel, streamWidth, streamX, trailDistance,
} from './terrain.mjs';

const SKY_SAMPLE = `
  uniform sampler2D panorama;
  vec3 skyColor(vec3 direction) {
    vec3 ray = normalize(direction);
    vec2 uv = vec2(atan(ray.z, ray.x) * 0.15915494 + 0.50,
      asin(clamp(ray.y, -1.0, 1.0)) * 0.31830989 + 0.535);
    return texture2D(panorama, uv).rgb;
  }
`;

export function makeSky(panorama) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(114, 28, 14), new THREE.ShaderMaterial({
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

export function terrainMaterial(textures, shadow) {
  const material = new THREE.MeshStandardMaterial({
    map: textures.grass,
    normalMap: textures.grassNormal,
    normalScale: new THREE.Vector2(0.58, 0.58),
    roughness: 0.98,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      trailColor: { value: textures.trail },
      trailNormals: { value: textures.trailNormal },
      panorama: { value: textures.sky },
      dogLocation: { value: shadow.position },
      dogForward: { value: shadow.forward },
      jumpHeight: { get value() { return shadow.lift; } },
    });
    shader.vertexShader = `
      attribute vec2 landBlend;
      varying vec2 vLandBlend;
      varying vec3 vTerrainPosition;
    ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vLandBlend = landBlend;
      vTerrainPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    `);
    shader.fragmentShader = SKY_SAMPLE + `
      varying vec2 vLandBlend;
      varying vec3 vTerrainPosition;
      uniform sampler2D trailColor;
      uniform sampler2D trailNormals;
      uniform vec3 dogLocation;
      uniform vec2 dogForward;
      uniform float jumpHeight;
    ` + shader.fragmentShader.replace('#include <map_fragment>', `
      vec4 grassColor = texture2D(map, vMapUv);
      vec2 trailUv = vec2(vMapUv.y, -vMapUv.x) * 1.125;
      vec4 stoneColor = texture2D(trailColor, trailUv);
      float edge = (grassColor.g - stoneColor.r) * 0.57;
      float trailMix = smoothstep(0.17, 0.83, max(vLandBlend.x, vLandBlend.y) + edge);
      float patches = 0.85 + 0.13 * sin(vMapUv.x * 0.94 + vMapUv.y * 0.47)
        * sin(vMapUv.y * 1.2 - vMapUv.x * 0.58);
      vec2 delta = vTerrainPosition.xz - dogLocation.xz;
      vec2 body = vec2(dot(delta, vec2(dogForward.y, -dogForward.x)) * 4.0, dot(delta, dogForward) * 2.0);
      float contact = exp(-dot(body, body) / (1.0 + 2.4 * jumpHeight)) * exp(-3.0 * jumpHeight);
      vec3 undergrowth = grassColor.rgb * vec3(0.68, 0.89, 0.53) * patches;
      vec3 path = stoneColor.rgb * mix(vec3(0.85, 0.78, 0.66), vec3(0.44, 0.52, 0.43), vLandBlend.y * 0.82);
      diffuseColor.rgb *= mix(undergrowth, path, trailMix) * (1.0 - 0.64 * contact);
    `).replace('#include <normal_fragment_maps>', `
      vec3 grassN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
      vec3 trailN = texture2D(trailNormals, trailUv).xyz * 2.0 - 1.0;
      vec3 mapN = mix(grassN, vec3(-trailN.y, trailN.x, trailN.z), trailMix);
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);
    `).replace('#include <fog_fragment>', `
      #include <fog_fragment>
      float haze = smoothstep(66.0, 87.0, length(vTerrainPosition.xz - cameraPosition.xz));
      if (haze > 0.0) {
        vec4 horizon = linearToOutputTexel(vec4(skyColor(vTerrainPosition - cameraPosition), 1.0));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, horizon.rgb, haze);
      }
    `);
  };
  return material;
}

let groundIndices;
export function makeGround(material) {
  const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS)
    .rotateX(-Math.PI / 2).translate(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
  groundIndices ??= geometry.index;
  geometry.setIndex(groundIndices);
  const size = (CHUNK_SEGMENTS + 1) ** 2;
  geometry.setAttribute('landBlend', new THREE.BufferAttribute(new Uint8Array(size * 2), 2, true));
  for (const key of ['position', 'normal', 'uv', 'landBlend']) {
    geometry.getAttribute(key).setUsage(THREE.DynamicDrawUsage);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'Terrain chunk';
  return mesh;
}

const PADDED = CHUNK_SEGMENTS + 3;
const heights = new Float64Array(PADDED ** 2);
export function fillGround(ground, x0, z0, rawHeight) {
  const geo = ground.geometry;
  const position = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const land = geo.getAttribute('landBlend');

  // Neighbour samples give both chunks identical normals along their shared edge.
  for (let z = 0; z < PADDED; z++) {
    for (let x = 0; x < PADDED; x++) {
      heights[z * PADDED + x] = rawHeight(x0 + (x - 1) * TERRAIN_STEP, z0 + (z - 1) * TERRAIN_STEP);
    }
  }
  for (let z = 0; z <= CHUNK_SEGMENTS; z++) {
    for (let x = 0; x <= CHUNK_SEGMENTS; x++) {
      const i = z * (CHUNK_SEGMENTS + 1) + x;
      const h = (z + 1) * PADDED + x + 1;
      const lx = x * TERRAIN_STEP, lz = z * TERRAIN_STEP;
      const wx = x0 + lx, wz = z0 + lz;
      const nx = heights[h - 1] - heights[h + 1];
      const nz = heights[h - PADDED] - heights[h + PADDED];
      const ny = 2 * TERRAIN_STEP;
      const length = Math.hypot(nx, ny, nz);
      position.setXYZ(i, lx, heights[h], lz);
      normal.setXYZ(i, nx / length, ny / length, nz / length);
      uv.setXY(i, (lx + x0 % 192) / 2.4, -(lz + z0 % 192) / 2.4);
      const { riverEdge, streamEdge } = channelAt(wx, wz);
      const track = clamp(1.43 - trailDistance(wx, wz) * 0.68, 0, 1);
      const wetness = clamp((1.22 - Math.min(riverEdge, streamEdge)) * 0.58, 0, 1);
      land.setXY(i, track * (1 - wetness * 0.40), wetness);
    }
  }
  for (const attribute of [position, normal, uv, land]) attribute.needsUpdate = true;
  geo.computeBoundingSphere();
}

export function waterMaterial(panorama, time, swimmer) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    uniforms: { panorama: { value: panorama }, clock: time, swimmer: { value: swimmer } },
    vertexShader: `
      varying vec3 vWater;
      varying vec2 vFlow;
      varying float vShore;
      attribute float shore;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWater = world.xyz;
        vFlow = uv;
        vShore = shore;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: SKY_SAMPLE + `
      varying vec3 vWater;
      varying vec2 vFlow;
      varying float vShore;
      uniform float clock;
      uniform vec3 swimmer;
      void main() {
        vec3 eye = cameraPosition - vWater;
        float d = length(eye);
        vec3 view = eye / max(d, 0.01);
        float ripple = sin(vFlow.x * 2.0 + vFlow.y * 1.8 - clock * 2.15);
        float small = sin(vFlow.x * 2.75 - vFlow.y * 3.4 - clock * 1.48);
        float wake = length(vWater.xz - swimmer.xz);
        float ring = sin(wake * 18.0 - clock * 12.0) * exp(-wake * 1.45) * swimmer.y;
        vec3 n = normalize(vec3(ripple * 0.042 + small * 0.018, 1.0, small * 0.040 - ripple * 0.012 + ring * 0.075));
        float fresnel = pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 3.0);
        vec3 reflection = skyColor(reflect(-view, n));
        vec3 water = mix(vec3(0.025, 0.137, 0.096), reflection, 0.17 + fresnel * 0.55);
        float shallow = smoothstep(0.58, 1.0, vShore);
        water = mix(water, vec3(0.17, 0.22, 0.103), shallow * (1.0 - fresnel) * 0.64);
        float glint = pow(max(dot(reflect(-normalize(vec3(0.64, 0.69, 0.32)), n), view), 0.0), 110.0);
        float streak = smoothstep(0.89, 0.995, ripple * 0.5 + small * 0.5) * (0.055 + shallow * 0.13);
        water += vec3(0.85, 0.94, 0.85) * (glint * 0.48 + streak + max(ring, 0.0) * 0.12);
        float mist = smoothstep(45.0, 89.0, d);
        if (mist > 0.0) water = mix(water, skyColor(vWater - cameraPosition), mist);
        gl_FragColor = vec4(water, mix(0.55 + fresnel * 0.39 - shallow * 0.13, 1.0, mist));
        #include <colorspace_fragment>
      }
    `,
  });
}

let waterIndices;
export function makeWater(material) {
  const points = 3 * (CHUNK_SEGMENTS + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(points * 2), 2));
  geometry.setAttribute('shore', new THREE.BufferAttribute(new Float32Array(points), 1));
  if (!waterIndices) {
    const indices = [];
    for (let row = 0; row < CHUNK_SEGMENTS; row++) {
      for (let col = 0; col < 2; col++) {
        const i = row * 3 + col;
        indices.push(i, i + 1, i + 3, i + 3, i + 1, i + 4);
      }
    }
    waterIndices = new THREE.Uint16BufferAttribute(indices, 1);
  }
  geometry.setIndex(waterIndices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Water channel';
  mesh.visible = false;
  return mesh;
}

export function fillChannel(mesh, x0, z0, creek) {
  const pos = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  const shore = mesh.geometry.getAttribute('shore');
  const anchor = streamAnchor(x0 + CHUNK_SIZE / 2);
  const start = creek ? z0 : x0;
  const cross = creek ? x0 : z0;
  const end = creek ? Math.min(z0 + CHUNK_SIZE, riverZ(anchor) + 1.7) : x0 + CHUNK_SIZE;
  if (end <= start) { mesh.visible = false; return; }

  let crosses = false;
  for (let i = 0; i <= CHUNK_SEGMENTS; i++) {
    const along = start + (end - start) * i / CHUNK_SEGMENTS;
    const center = creek ? streamX(along, anchor) : riverZ(along);
    const width = creek ? streamWidth(along) : riverWidth(along);
    const padding = creek ? 1.12 : 2.6;
    const low = clamp(center - width - padding, cross, cross + CHUNK_SIZE);
    const high = clamp(center + width + padding, cross, cross + CHUNK_SIZE);
    if (high - low > 0.01) crosses = true;

    const offsets = [low, clamp(center, low, high), high];
    for (let side = 0; side < 3; side++) {
      const offset = offsets[side];
      const x = creek ? offset : along;
      const z = creek ? along : offset;
      const y = creek ? streamLevel(along, anchor) : riverLevel(along);
      const vertex = i * 3 + side;
      pos.setXYZ(vertex, x - x0, y + (creek ? 0.014 : 0), z - z0);
      uv.setXY(vertex, (x - x0) + x0 % 192, (z - z0) + z0 % 192);
      shore.setX(vertex, Math.abs(offset - center) / (width + padding));
    }
  }
  mesh.visible = crosses;
  if (!crosses) return;
  for (const attribute of [pos, uv, shore]) attribute.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}
