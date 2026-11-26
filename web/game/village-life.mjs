import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { VILLAGE_SPACING, riverWidth, riverZ, smooth } from './terrain.mjs';

const TAU = Math.PI * 2;
const bank = (x, side, distance) => riverZ(x) + side * (riverWidth(x) + distance);

function walkingRoute(points, speed, pause) {
  let duration = 0;
  const legs = points.slice(1).map(([x, z], i) => {
    const [startX, startZ] = points[i];
    const dx = x - startX, dz = z - startZ;
    const length = Math.hypot(dx, dz) / speed;
    const leg = { startX, startZ, dx, dz, start: duration, length, heading: Math.atan2(dx, dz) };
    duration += length;
    return leg;
  });
  const half = duration + pause;
  return (time, state) => {
    const loop = time % (2 * half);
    const reverse = loop >= half;
    const elapsed = loop % half;
    const moving = elapsed < duration;
    const distance = reverse ? duration - Math.min(elapsed, duration) : Math.min(elapsed, duration);
    const leg = legs.find(segment => distance <= segment.start + segment.length) ?? legs.at(-1);
    const t = (distance - leg.start) / leg.length;
    state.x = leg.startX + leg.dx * t;
    state.z = leg.startZ + leg.dz * t;
    state.heading = leg.heading + (reverse ? Math.PI : 0);
    state.speed = moving ? speed : 0;
  };
}

function resident(scene, asset, dressing, { hat, scale, phase }) {
  const root = new THREE.Group();
  root.name = 'Villager';
  const model = clone(asset.scene);
  root.add(model);
  model.scale.setScalar(scale);
  const mixer = new THREE.AnimationMixer(model);
  const look = mixer.clipAction(THREE.AnimationClip.findByName(asset.animations, 'look_around'));
  const walk = mixer.clipAction(THREE.AnimationClip.findByName(asset.animations, 'walk'));
  look.play();
  look.time = phase % look.getClip().duration;
  walk.play().setEffectiveWeight(0);
  walk.time = phase % walk.getClip().duration;
  mixer.update(0);
  const hips = model.getObjectByName('hips');
  const hipX = hips.position.x, hipZ = hips.position.z;
  if (hat) {
    const straw = dressing.getObjectByName('fieldHat').clone();
    const fieldHat = new THREE.Group().add(straw);
    straw.material = straw.material.clone();
    straw.material.color.set('#cbaa6a');
    fieldHat.position.set(0.005, 0.13, 0.012);
    fieldHat.rotation.z = -0.09;
    fieldHat.scale.set(1.25, 0.86, 1.25);
    model.getObjectByName('head').add(fieldHat);
  }
  scene.add(root);
  let walkWeight = 0;
  return {
    root, phase, width: 0.37, length: 0.34,
    animate(dt, time, state) {
      walkWeight = THREE.MathUtils.damp(walkWeight, state.speed ? 1 : 0, 8, dt);
      look.setEffectiveWeight(1 - walkWeight);
      walk.setEffectiveWeight(walkWeight).setEffectiveTimeScale(Math.max(0.62, state.speed / 1.12));
      mixer.update(dt);
      hips.position.x = hipX;
      hips.position.z = hipZ;
    },
  };
}

function buffalo(scene, asset, scale, phase) {
  const root = new THREE.Group();
  root.name = 'Water buffalo';
  const model = clone(asset.scene);
  model.scale.setScalar(scale);
  model.rotation.y = Math.PI;
  root.add(model);
  scene.add(root);
  const bones = Object.fromEntries(['neck', 'jaw', 'tail', 'ribs', 'earL', 'earR'].map(name => [name, model.getObjectByName(name)]));
  const neckHeight = bones.neck.position.y;
  let lowered = 0;
  return {
    root, phase, width: scale * 0.83, length: scale * 1.62,
    animate(dt, time, state, dog) {
      const t = time + phase;
      const distance = Math.hypot(dog.x - state.x, dog.z - state.z);
      const grazing = smooth(0.06, 0.55, Math.sin(t * 0.38)) * smooth(1.8, 4.0, distance);
      lowered = THREE.MathUtils.damp(lowered, grazing, 3.2, dt);
      const relative = THREE.MathUtils.euclideanModulo(Math.atan2(dog.x - state.x, dog.z - state.z) - state.heading + Math.PI, TAU) - Math.PI;
      const glance = THREE.MathUtils.clamp(relative, -0.26, 0.26);
      bones.neck.position.y = neckHeight - lowered * 0.24;
      bones.neck.rotation.set(-lowered * 1.06 + Math.sin(t * 1.17) * 0.036,
        -Math.sin(t * 0.58) * 0.093 + glance * (1 - smooth(2.8, 7, distance)), 0);
      bones.jaw.rotation.x = Math.max(0, Math.sin(t * 7.0)) * (0.045 + lowered * 0.065);
      bones.ribs.scale.set(1 + Math.sin(t * 2.5) * 0.018, 1 + Math.sin(t * 2.5) * 0.007, 1);
      bones.tail.rotation.z = Math.sin(t * 1.43) * (0.11 + 0.44 * smooth(0.73, 1, Math.sin(t * 0.71)));
      const flick = Math.sin(t * 13) * 0.25 * smooth(0.82, 1, Math.sin(t * 0.89));
      bones.earL.rotation.y = flick;
      bones.earR.rotation.y = -flick * 0.64;
    },
  };
}

function contactShadows(scene, capacity) {
  const geometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    vertexShader: `
      varying vec2 vCircle;
      void main() {
        vCircle = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vCircle;
      void main() {
        float shadow = 1.0 - smoothstep(0.10, 1.0, dot(vCircle, vCircle));
        gl_FragColor = vec4(0.045, 0.049, 0.042, shadow * 0.35);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  return mesh;
}

export function installVillageLife(scene, assets, dressing, mobile, surfaceAt, heightAt) {
  const people = [
    resident(scene, assets.villager, dressing, { hat: false, scale: 0.96, phase: 0.94 }),
    resident(scene, assets.keeper, dressing, { hat: true, scale: 0.91, phase: 3.74 }),
    resident(scene, assets.villager, dressing, { hat: false, scale: 1.01, phase: 2.10 }),
  ];
  if (!mobile) people.push(resident(scene, assets.keeper, dressing, { hat: false, scale: 0.95, phase: 1.27 }));
  const herd = [
    buffalo(scene, assets.buffalo, 0.77, 4.3),
    buffalo(scene, assets.buffalo, 0.66, 11.2),
  ];
  const actors = people.concat(herd);
  for (const actor of actors) {
    actor.state = {};
    actor.elapsed = 0;
    actor.root.visible = false;
    actor.root.updateMatrixWorld(true);
    actor.root.traverse(part => {
      if (part.isMesh) {
        part.receiveShadow = true;
        if (part.isSkinnedMesh) {
          part.computeBoundingSphere();
          part.boundingSphere.radius *= 1.3;
        }
      }
    });
  }
  const shadows = contactShadows(scene, actors.length);
  const shadow = new THREE.Object3D();
  shadow.rotation.order = 'YXZ';
  let village = Infinity;
  const still = (x, z, heading) => (time, state) => {
    state.x = x;
    state.z = z;
    state.speed = 0;
    state.heading = heading;
  };

  return (eye, player, origin, time, dt) => {
    const center = Math.round(player.x / VILLAGE_SPACING) * VILLAGE_SPACING;
    const active = Math.abs(eye.x - center) < 68 && Math.abs(eye.z - riverZ(center)) < 62;
    const changed = village !== center;
    if (active && changed) {
      const river = riverZ(center);
      const span = riverWidth(center) + 4.4;
      const near = center + 2.95, far = center + 3.18;
      people[0].path = walkingRoute([
        [near, bank(near, 1, 4.8)], [center + 0.40, river + span + 0.32], [center + 0.37, river - span - 0.30],
        [far, bank(far, -1, 4.35)],
      ], 0.99, 3.2);
      people[1].path = still(center - 5.62, bank(center - 5.62, 1, 5.45), -0.7);
      people[2].path = still(center + 2.85, bank(center + 2.85, -1, 4.8), -0.54);
      if (people[3]) {
        const x = center - 12.9, end = center - 4.45;
        people[3].path = walkingRoute([[x, bank(x, -1, 6.6)], [end, bank(end, -1, 6.0)]], 0.80, 4.8);
      }
      const x = center - 4.05, other = center - 9.6;
      herd[0].path = still(x, bank(x, 1, 3.9), 1.4);
      herd[1].path = still(other, bank(other, 1, 4.4), -1.9);
      village = center;
    }
    let count = 0;
    for (const actor of actors) {
      const { root, path, state } = actor;
      if (active) path(time + actor.phase, state);
      const distance = (state.x - eye.x) ** 2 + (state.z - eye.z) ** 2;
      const wasVisible = root.visible;
      root.visible = active && distance < 56 ** 2;
      if (!root.visible) continue;
      const y = surfaceAt(state.x, state.z).floor;
      root.position.set(state.x - origin.x, y, state.z - origin.z);
      const delta = THREE.MathUtils.euclideanModulo(state.heading - root.rotation.y + Math.PI, TAU) - Math.PI;
      root.rotation.y += changed || !wasVisible ? delta : delta * (1 - Math.exp(-dt * 6.5));
      actor.elapsed += dt;
      const step = distance < 18 ** 2 ? (mobile ? 1 / 30 : 0) : 1 / 15;
      if (!wasVisible || actor.elapsed >= step) {
        actor.animate(Math.min(0.10, actor.elapsed), time, state, player);
        actor.elapsed = 0;
      }
      if (distance >= 36 ** 2) continue;
      shadow.position.copy(root.position).y += 0.033;
      const ground = heightAt(state.x, state.z);
      const slope = Math.abs(y - ground) < 0.075;
      const frontX = Math.sin(root.rotation.y) * 0.42, frontZ = Math.cos(root.rotation.y) * 0.42;
      const pitch = slope ? heightAt(state.x - frontX, state.z - frontZ) - heightAt(state.x + frontX, state.z + frontZ) : 0;
      const roll = slope ? heightAt(state.x + frontZ, state.z - frontX) - heightAt(state.x - frontZ, state.z + frontX) : 0;
      shadow.rotation.set(Math.atan2(pitch, 0.84), root.rotation.y, Math.atan2(roll, 0.84));
      shadow.scale.set(actor.width, 1, actor.length);
      shadow.updateMatrix();
      shadows.setMatrixAt(count++, shadow.matrix);
    }
    shadows.count = count;
    shadows.visible = count > 0;
    if (count) shadows.instanceMatrix.needsUpdate = true;
  };
}
