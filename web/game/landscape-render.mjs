import * as THREE from 'three';
import {
  CHUNK_SEGMENTS, CHUNK_SIZE, TERRAIN_STEP, clamp, channelAt, paddyEdge, riverLevel, riverWidth, riverZ,
  streamAnchor, streamLevel, streamWidth, streamX, trailDistance,
} from './terrain.mjs';
import { WATER_LAYER } from './river-reflection.mjs';
import { SKY_SAMPLE } from './atmosphere.mjs';

const WAVE_AXES = [
  new THREE.Vector2(1.18, 1.82), new THREE.Vector2(2.67, -3.85),
];

export function alignWater(material, origin) {
  // Keep the phase continuous when a chunk changes the floating origin.
  const offsets = material.uniforms.waveOffset.value;
  for (let i = 0; i < WAVE_AXES.length; i++) {
    const { x, y } = WAVE_AXES[i];
    offsets.setComponent(i, (origin.x * x + origin.z * y) % (Math.PI * 2));
  }
}

export function terrainMaterial(textures, atmosphere, shadow, time, mobile) {
  const material = new THREE.MeshStandardMaterial({
    map: textures.grass,
    normalMap: textures.grassNormal,
    normalScale: new THREE.Vector2(0.69, 0.69),
    roughness: 0.98,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, atmosphere, {
      trailColor: { value: textures.trail },
      trailNormals: { value: textures.trailNormal },
      bankColor: { value: textures.mud },
      bankNormals: { value: textures.mudNormal },
      rippleMap: { value: textures.rippleNormal },
      dogLocation: { value: shadow.position },
      dogForward: { value: shadow.forward },
      jumpHeight: { get value() { return shadow.lift; } },
      clock: time,
    });
    shader.vertexShader = `
      attribute vec4 landBlend;
      varying vec4 vLandBlend;
      varying vec3 vTerrainPosition;
    ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vLandBlend = landBlend;
      vTerrainPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    `);
    shader.fragmentShader = SKY_SAMPLE + `
      varying vec4 vLandBlend;
      varying vec3 vTerrainPosition;
      uniform sampler2D trailColor;
      uniform sampler2D trailNormals;
      uniform sampler2D bankColor;
      uniform sampler2D bankNormals;
      uniform sampler2D rippleMap;
      uniform vec3 dogLocation;
      uniform vec2 dogForward;
      uniform float jumpHeight;
      uniform float clock;
    ` + shader.fragmentShader.replace('#include <map_fragment>', `
      vec3 grassColor = texture2D(map, vMapUv).rgb;
      vec2 broadUv = vec2(-vMapUv.y, vMapUv.x) * 0.125;
      float moisture = texture2D(map, broadUv).g;
      float speckle = (grassColor.g - moisture) * 0.66;
      vec2 trailUv = vec2(vMapUv.y, -vMapUv.x) * 1.125;
      vec2 mudUv = vMapUv * 2.0;
      vec3 gravel = texture2D(trailColor, trailUv).rgb;
      vec3 loam = texture2D(bankColor, mudUv).rgb;
      float trailMix = smoothstep(0.25, 0.87, vLandBlend.x + speckle);
      float inMud = smoothstep(0.13, 0.83, max(vLandBlend.y, vLandBlend.w) + speckle * 0.7);
      float canopy = mix(0.91, 1.11, smoothstep(0.08, 0.29, moisture));
      vec2 delta = vTerrainPosition.xz - dogLocation.xz;
      vec2 body = vec2(dot(delta, vec2(dogForward.y, -dogForward.x)) * 4.0, dot(delta, dogForward) * 2.0);
      float contact = exp(-dot(body, body) / (1.0 + 2.4 * jumpHeight)) * exp(-3.0 * jumpHeight);
      vec3 undergrowth = grassColor * vec3(0.73, 1.02, 0.65) * canopy;
      vec3 path = mix(loam * vec3(1.24, 1.10, 0.96), gravel * vec3(0.83, 0.80, 0.72), 0.53);
      vec3 bank = loam * mix(vec3(0.92, 0.83, 0.73), vec3(0.55, 0.65, 0.56), vLandBlend.y);
      float caustic = 0.0;
      if (vLandBlend.z > 0.01) {
        vec2 bed = vTerrainPosition.xz * 0.625 + vec2(-0.032, 0.014) * clock;
        vec2 bend = texture2D(rippleMap, bed).rg * 2.0 - 1.0;
        float refracted = sin((bed.x + bend.x * 0.29) * 23.0) * sin((bed.y + bend.y * 0.25) * 19.0);
        caustic = smoothstep(0.54, 0.98, refracted) * vLandBlend.z;
      }
      diffuseColor.rgb *= mix(mix(undergrowth, path, trailMix), bank, inMud)
        * (1.0 - ${mobile ? '0.61' : '0.36'} * contact) * (1.0 + caustic * 0.31);
    `).replace('#include <normal_fragment_maps>', `
      vec3 grassN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
      vec3 trailN = texture2D(trailNormals, trailUv).xyz * 2.0 - 1.0;
      vec3 mudN = texture2D(bankNormals, mudUv).xyz * 2.0 - 1.0;
      vec3 mapN = mix(mix(grassN, vec3(-trailN.y, trailN.x, trailN.z), trailMix), mudN, inMud);
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.47, inMud * vLandBlend.y * 0.66);
    `).replace('#include <fog_fragment>', `
      #include <fog_fragment>
      float haze = smoothstep(75.0, 109.0, length(vTerrainPosition.xz - cameraPosition.xz));
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
  geometry.setAttribute('landBlend', new THREE.BufferAttribute(new Uint8Array(size * 4), 4, true));
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
      const { riverEdge, streamEdge, anchor } = channelAt(wx, wz);
      const track = clamp(1.44 - trailDistance(wx, wz) * 0.81, 0, 1);
      const wetness = clamp((1.6 - Math.min(riverEdge, streamEdge)) * 0.49, 0, 1);
      const level = Math.max(riverEdge < 2.6 ? riverLevel(wx) : -Infinity,
        streamEdge < 1.12 ? streamLevel(wz, anchor) : -Infinity);
      const depth = level - heights[h];
      const caustic = clamp(depth * 6, 0, 1) * clamp(1.3 - depth, 0, 1);
      const soil = clamp((0.62 - paddyEdge(wx, wz)) * 1.60, 0, 1);
      land.setXYZW(i, track * (1 - wetness * 0.40) * (1 - soil), wetness, caustic, soil);
    }
  }
  for (const attribute of [position, normal, uv, land]) attribute.needsUpdate = true;
  geo.computeBoundingSphere();
}

export function waterMaterial(atmosphere, ripples, time, swimmer, reflection) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    defines: reflection ? { RIVER_MIRROR: 1 } : {},
    uniforms: {
      ...atmosphere, clock: time, swimmer: { value: swimmer }, rippleMap: { value: ripples },
      waveAxes: { value: WAVE_AXES }, waveOffset: { value: new THREE.Vector2() }, ...reflection?.uniforms,
    },
    vertexShader: `
      varying vec3 vWater;
      varying vec2 vChannel;
      attribute vec2 channel;
      #ifdef RIVER_MIRROR
      uniform mat4 mirrorTransform;
      uniform float mirrorLevel;
      varying vec4 vMirror;
      #endif
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWater = world.xyz;
        vChannel = channel;
        #ifdef RIVER_MIRROR
        vMirror = mirrorTransform * vec4(world.x, mirrorLevel, world.z, 1.0);
        #endif
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: SKY_SAMPLE + `
      varying vec3 vWater;
      varying vec2 vChannel;
      uniform float clock;
      uniform vec3 swimmer;
      uniform sampler2D rippleMap;
      uniform vec2 waveAxes[2];
      uniform vec2 waveOffset;
      #ifdef RIVER_MIRROR
      uniform sampler2D riverMirror;
      uniform float mirrorStrength;
      varying vec4 vMirror;
      #endif
      void main() {
        vec3 eye = cameraPosition - vWater;
        float d = length(eye);
        vec3 view = eye / max(d, 0.01);
        float depth = max(vChannel.x, 0.0);
        vec2 flow = mix(vec2(0.04, -0.15), vec2(-0.14, -0.021), vChannel.y);
        vec2 coarse = vWater.xz * vec2(0.25, 0.375) + flow * clock;
        vec2 fine = vec2(vWater.z, -vWater.x) * vec2(0.625, 0.5) - flow.yx * clock * 0.61;
        vec2 a = texture2D(rippleMap, coarse).rg * 2.0 - 1.0;
        vec2 b = texture2D(rippleMap, fine + a * 0.06).rg * 2.0 - 1.0;
        float swell = sin(dot(vWater.xz, waveAxes[0]) + waveOffset.x - clock * 1.72);
        float wave = sin(dot(vWater.xz, waveAxes[1]) + waveOffset.y + swell * 0.52 - clock * 2.45);
        vec2 wakeVector = vWater.xz - swimmer.xz;
        float wake = length(wakeVector);
        float ring = sin(wake * 19.0 - clock * 13.0) * exp(-wake * 1.45) * swimmer.y;
        vec2 slope = a * 0.103 + vec2(-b.y, b.x) * 0.069 + vec2(swell, wave) * 0.021
          + wakeVector / max(wake, 0.16) * ring * 0.14;
        vec3 n = normalize(vec3(slope.x, 1.0, slope.y));
        float towardEye = clamp(abs(dot(view, n)), 0.0, 1.0);
        float fresnel = 0.032 + 0.968 * pow(1.0 - towardEye, 4.35);
        vec3 reflection = skyColor(reflect(-view, n));
        #ifdef RIVER_MIRROR
        if (mirrorStrength > 0.0 && vChannel.y > 0.0 && vMirror.w > 0.0) {
          vec2 uv = vMirror.xy / vMirror.w + slope * mix(0.14, 0.071, fresnel);
          vec2 border = min(uv, vec2(1.0) - uv);
          float weight = smoothstep(0.0, 0.09, min(border.x, border.y)) * (1.0 - smoothstep(28.0, 63.0, d));
          reflection = mix(reflection, texture2D(riverMirror, uv).rgb, mirrorStrength * weight * 0.92);
        }
        #endif
        float absorbed = 1.0 - exp(-depth * (0.94 + (1.0 - towardEye) * 0.67));
        float reflectance = fresnel * mix(0.68, 1.0, smoothstep(0.015, 0.22, depth));
        float opacity = reflectance + absorbed * (1.0 - reflectance);
        vec3 water = (reflection * reflectance * vec3(0.91, 1.0, 0.97)
          + vec3(0.045, 0.128, 0.096) * absorbed * (1.0 - reflectance)) / max(opacity, 0.02);
        float glint = pow(max(dot(n, normalize(sunDirection + view)), 0.0), 250.0);
        float shore = smoothstep(0.008, 0.042, depth) * (1.0 - smoothstep(0.060, 0.17, depth));
        float foam = shore * smoothstep(0.38, 0.77, a.x * 0.54 + b.y * 0.53 + wave * 0.27);
        water += vec3(0.98, 0.92, 0.75) * (glint * 0.52 + foam * 0.19 + max(ring, 0.0) * 0.12);
        float mist = smoothstep(48.0, 104.0, d);
        if (mist > 0.0) water = mix(water, skyColor(vWater - cameraPosition), mist);
        gl_FragColor = vec4(water, mix(opacity + foam * 0.27, 0.97, mist) * smoothstep(0.0, 0.038, depth));
        #include <colorspace_fragment>
      }
    `,
  });
}

let waterIndices;
const WATER_COLUMNS = 9;
export function makeWater(material) {
  const points = WATER_COLUMNS * (CHUNK_SEGMENTS + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3));
  geometry.setAttribute('channel', new THREE.BufferAttribute(new Float32Array(points * 2), 2));
  if (!waterIndices) {
    const indices = [];
    for (let row = 0; row < CHUNK_SEGMENTS; row++) {
      for (let col = 0; col < WATER_COLUMNS - 1; col++) {
        const i = row * WATER_COLUMNS + col;
        indices.push(i, i + 1, i + WATER_COLUMNS, i + WATER_COLUMNS, i + 1, i + WATER_COLUMNS + 1);
      }
    }
    waterIndices = new THREE.Uint16BufferAttribute(indices, 1);
  }
  geometry.setIndex(waterIndices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.layers.set(WATER_LAYER);
  mesh.name = 'Water channel';
  mesh.visible = false;
  return mesh;
}

export function fillChannel(mesh, x0, z0, creek, heightAt) {
  const pos = mesh.geometry.getAttribute('position');
  const channel = mesh.geometry.getAttribute('channel');
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

    for (let side = 0; side < WATER_COLUMNS; side++) {
      const offset = low + (high - low) * side / (WATER_COLUMNS - 1);
      const x = creek ? offset : along;
      const z = creek ? along : offset;
      const y = creek ? streamLevel(along, anchor) : riverLevel(along);
      const vertex = i * WATER_COLUMNS + side;
      pos.setXYZ(vertex, x - x0, y + (creek ? 0.014 : 0), z - z0);
      channel.setXY(vertex, y - heightAt(x, z), creek ? 0 : 1);
    }
  }
  mesh.visible = crosses;
  if (!crosses) return;
  for (const attribute of [pos, channel]) attribute.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}
