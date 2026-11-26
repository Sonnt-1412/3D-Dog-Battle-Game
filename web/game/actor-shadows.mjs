import * as THREE from 'three';
import { SUN_DIRECTION } from './terrain.mjs';

const CASTER_LAYER = 2;
const SIZE = 384;
const WIDTH = 24;

export function makeActorShadows() {
  const depth = new THREE.DepthTexture(SIZE, SIZE, THREE.UnsignedIntType);
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthTexture: depth });
  const radius = WIDTH / 2;
  const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 1, 64);
  camera.layers.set(CASTER_LAYER);
  const sunDirection = new THREE.Vector3(...SUN_DIRECTION).normalize();
  const depthMaterial = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  const transform = new THREE.Matrix4();
  const bias = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1,
  );
  const strength = { value: 0 };
  const uniformValues = {
    actorDepth: { value: depth }, actorLightMatrix: { value: transform }, actorShadowStrength: strength,
  };
  const receivers = new WeakSet();
  const previousFocus = new THREE.Vector3();
  let lastTime = -Infinity;

  function addCaster(mesh) {
    const { material } = mesh;
    if (mesh.isMesh && !Array.isArray(material) && !material.transparent && material.alphaTest === 0) {
      mesh.layers.enable(CASTER_LAYER);
    }
  }

  function receive(material) {
    if (!material.isMeshStandardMaterial || receivers.has(material)) return;
    receivers.add(material);
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.customProgramCacheKey = () => key + '|actor-shadows';
    material.onBeforeCompile = function (shader, renderer) {
      before.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniformValues);
      shader.vertexShader = `
        uniform mat4 actorLightMatrix;
        varying vec3 vActorDepthUV;
      ` + shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        vec4 actorReceiver = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          actorReceiver = instanceMatrix * actorReceiver;
        #endif
        vActorDepthUV = (actorLightMatrix * modelMatrix * actorReceiver).xyz;
      `);
      shader.fragmentShader = `
        uniform sampler2D actorDepth;
        uniform float actorShadowStrength;
        varying vec3 vActorDepthUV;

        float actorVisibility() {
          vec3 p = vActorDepthUV;
          vec2 edge = min(p.xy, 1.0 - p.xy);
          float strength = actorShadowStrength * smoothstep(0.0, 0.085, min(edge.x, edge.y));
          if (strength <= 0.0 || p.z <= 0.0 || p.z >= 1.0) return 1.0;
          float occluded = 0.0;
          for (int i = 0; i < 4; i++) {
            vec2 offset = i == 0 ? vec2(-0.75, -1.0) : i == 1 ? vec2(1.2, -0.65)
              : i == 2 ? vec2(-1.05, 0.72) : vec2(0.72, 1.2);
            float caster = texture2D(actorDepth, p.xy + offset / ${SIZE}.0).r;
            occluded += step(caster + 0.0011, p.z);
          }
          return 1.0 - occluded * 0.22 * strength;
        }
      ` + shader.fragmentShader.replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        float animatedShade = actorVisibility();
        reflectedLight.directDiffuse *= animatedShade;
        reflectedLight.directSpecular *= animatedShade;
      `);
    };
  }

  function render(renderer, scene, focus, elapsed, quality, shifted) {
    strength.value = THREE.MathUtils.smoothstep(quality, 0.64, 0.94);
    if (strength.value <= 0) {
      lastTime = -Infinity;
      return;
    }
    const moved = previousFocus.distanceToSquared(focus) > 0.0036;
    if (!shifted && elapsed - lastTime < (moved ? 1 / 30 : 1 / 20)) return;
    previousFocus.copy(focus);
    lastTime = elapsed;
    camera.position.copy(focus).addScaledVector(sunDirection, 28);
    camera.lookAt(focus);
    camera.updateMatrixWorld();
    transform.copy(bias).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);

    const currentTarget = renderer.getRenderTarget();
    const shadowEnabled = renderer.shadowMap.enabled;
    const currentOverride = scene.overrideMaterial;
    scene.overrideMaterial = depthMaterial;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(target);
    try {
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(currentTarget);
      renderer.shadowMap.enabled = shadowEnabled;
      scene.overrideMaterial = currentOverride;
    }
  }

  return { addCaster, receive, render };
}
