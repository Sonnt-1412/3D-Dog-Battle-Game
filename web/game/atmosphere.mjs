import * as THREE from 'three';
import { SUN_DIRECTION } from './terrain.mjs';

const RIDGE_SAMPLES = 256;

export const SKY_SAMPLE = `
  uniform sampler2D panorama;
  uniform sampler2D ridgelines;
  uniform vec3 sunDirection;

  vec3 skyColor(vec3 direction) {
    vec3 ray = normalize(direction);
    float azimuth = atan(ray.z, ray.x) * 0.15915494 + 0.5;
    float altitude = asin(clamp(ray.y, 0.0, 1.0)) * 0.31830989 + 0.5;
    vec3 clouds = texture2D(panorama, vec2(azimuth, altitude)).rgb;
    float sunlight = pow(max(dot(ray, sunDirection), 0.0), 9.0);
    vec3 air = mix(vec3(0.42, 0.56, 0.61), vec3(0.75, 0.66, 0.49), sunlight * 0.64);
    vec3 sky = mix(clouds, air, 0.43 * exp(-max(ray.y, 0.0) * 8.0));

    // The layers store the elevation angle of distant ridges sampled from the DEM.
    vec3 peaks = texture2D(ridgelines, vec2(azimuth, 0.5)).rgb * 0.32;
    vec3 below = 1.0 - smoothstep(peaks - 0.003, peaks + 0.003, vec3(ray.y));
    float fill = smoothstep(-0.16, 0.18, ray.y);
    sky = mix(sky, air * mix(vec3(0.74, 0.82, 0.86), vec3(0.60, 0.73, 0.80), fill), below.b);
    sky = mix(sky, air * mix(vec3(0.72, 0.82, 0.84), vec3(0.44, 0.60, 0.65), fill), below.g);
    return mix(sky, air * mix(vec3(0.68, 0.78, 0.81), vec3(0.34, 0.51, 0.52), fill), below.r);
  }
`;

export function atmosphereUniforms(panorama, data) {
  if (data.length !== RIDGE_SAMPLES * 4) throw new Error('Invalid ridgeline data');
  const ridges = new THREE.DataTexture(data, RIDGE_SAMPLES, 1);
  ridges.wrapS = THREE.RepeatWrapping;
  ridges.magFilter = ridges.minFilter = THREE.LinearFilter;
  ridges.needsUpdate = true;
  return {
    panorama: { value: panorama },
    ridgelines: { value: ridges },
    sunDirection: { value: new THREE.Vector3(...SUN_DIRECTION).normalize() },
  };
}

export function makeSky(atmosphere) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(114, 28, 14), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: atmosphere,
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
