import * as THREE from 'three';
import { riverLevel, riverWidth, riverZ } from './terrain.mjs';

export const WATER_LAYER = 1;

// Oblique clipping follows Three.js's MIT-licensed Reflector.
export function riverReflection() {
  const target = new THREE.WebGLRenderTarget(448, 256, { depthBuffer: true });
  const mirror = new THREE.PerspectiveCamera();
  const transform = new THREE.Matrix4();
  const bias = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1,
  );
  const level = { value: 0 };
  const strength = { value: 0 };
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const corner = new THREE.Vector4();
  const facing = new THREE.Vector3();
  const up = new THREE.Vector3();
  const lastEye = new THREE.Vector3(Infinity, 0, 0);
  const lastRotation = new THREE.Quaternion();
  let lastOriginX, lastOriginZ, lastProjection;
  let lastTime = -Infinity;

  const uniforms = {
    riverMirror: { value: target.texture },
    mirrorTransform: { value: transform },
    mirrorLevel: level,
    mirrorStrength: strength,
  };

  function render(renderer, scene, camera, sky, origin, elapsed, quality) {
    const x = camera.position.x + origin.x;
    const z = camera.position.z + origin.z;
    const river = riverLevel(x);
    const bankDistance = Math.abs(z - riverZ(x)) - riverWidth(x);
    const weight = (1 - THREE.MathUtils.smoothstep(bankDistance, 17, 31))
      * THREE.MathUtils.smoothstep(camera.position.y - river, 0.19, 0.70)
      * THREE.MathUtils.smoothstep(quality, 0.61, 0.84);
    strength.value = weight;
    if (weight <= 0 || renderer.shadowMap.needsUpdate) {
      strength.value = 0;
      lastTime = -Infinity;
      return;
    }

    const projectionScale = camera.projectionMatrix.elements[0];
    const shifted = lastOriginX !== origin.x || lastOriginZ !== origin.z;
    if (!shifted && lastProjection === projectionScale
      && (elapsed - lastTime < 1 / 15 || (elapsed - lastTime < 0.26
        && lastEye.distanceToSquared(camera.position) < 0.025
        && lastRotation.angleTo(camera.quaternion) < 0.016))) return;
    lastEye.copy(camera.position);
    lastRotation.copy(camera.quaternion);
    lastOriginX = origin.x;
    lastOriginZ = origin.z;
    lastProjection = projectionScale;
    lastTime = elapsed;
    level.value = river;

    mirror.position.copy(camera.position);
    mirror.position.y = 2 * river - mirror.position.y;
    facing.set(0, 0, -1).applyQuaternion(camera.quaternion);
    facing.y *= -1;
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    mirror.up.set(up.x, -up.y, up.z);
    mirror.lookAt(facing.add(mirror.position));
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    transform.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);

    plane.normal.set(0, 1, 0);
    plane.constant = -river + 0.08;
    plane.applyMatrix4(mirror.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = mirror.projectionMatrix.elements;
    corner.set((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    clip.multiplyScalar(2 / clip.dot(corner));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = 1 + clip.z;
    p[14] = clip.w;
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

    const previous = renderer.getRenderTarget();
    sky.position.copy(mirror.position);
    renderer.setRenderTarget(target);
    try {
      renderer.render(scene, mirror);
    } finally {
      renderer.setRenderTarget(previous);
      sky.position.copy(camera.position);
    }
  }

  return { uniforms, render };
}
