export const STAGE_RADIUS = 37;
const DOG_RADIUS = 0.26;
const CAMERA_MARGIN = 0.20;

export function damping(rate, dt) { return 1 - Math.exp(-rate * dt); }

export function integrateVelocity(value, target, rate, dt) {
  const decay = Math.exp(-rate * dt);
  return { value: target + (value - target) * decay,
    distance: target * dt + (value - target) * (1 - decay) / rate };
}

export function turnTo(angle, target, rate, dt) {
  const delta = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
  return angle + delta * damping(rate, dt);
}

export function movementIntent(input, cameraYaw) {
  const length = Math.hypot(input.x, input.z);
  if (!length) return { x: 0, z: 0, strength: 0 };
  const x = input.x / length;
  const z = input.z / length;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  return { x: x * cos - z * sin, z: -x * sin - z * cos, strength: Math.min(1, length) };
}

export function moveOnStage(position, dx, dz, obstacles = []) {
  let x = position.x + dx;
  let z = position.z + dz;
  for (const obstacle of obstacles) {
    if (position.y >= obstacle.height) continue;
    const ox = x - obstacle.x;
    const oz = z - obstacle.z;
    const radius = obstacle.radius + DOG_RADIUS;
    const distanceSquared = ox * ox + oz * oz;
    if (distanceSquared >= radius * radius) continue;
    if (distanceSquared < 1e-8) {
      x = position.x;
      z = position.z;
      continue;
    }
    const scale = radius / Math.sqrt(distanceSquared);
    x = obstacle.x + ox * scale;
    z = obstacle.z + oz * scale;
  }
  const distance = Math.hypot(x, z);
  const scale = distance > STAGE_RADIUS ? STAGE_RADIUS / distance : 1;
  position.x = x * scale;
  position.z = z * scale;
}

export function cameraReach(target, offset, heightAt, obstacles) {
  const horizontalSquared = offset.x ** 2 + offset.z ** 2;
  const length = Math.hypot(offset.x, offset.y, offset.z);
  const padding = CAMERA_MARGIN / length;
  let limit = 1;
  for (const obstacle of obstacles) {
    const dx = obstacle.x - target.x;
    const dz = obstacle.z - target.z;
    const closest = (dx * offset.x + dz * offset.z) / horizontalSquared;
    const cross = dx * offset.z - dz * offset.x;
    if (closest <= 0) continue;
    const radius = (obstacle.cameraRadius ?? obstacle.radius) + CAMERA_MARGIN;
    const remaining = radius ** 2 - cross ** 2 / horizontalSquared;
    if (remaining <= 0) continue;
    const halfSpan = Math.sqrt(remaining / horizontalSquared);
    const entry = Math.max(0, closest - halfSpan);
    const exit = Math.min(limit, closest + halfSpan);
    if (entry > exit) continue;
    const bottom = obstacle.y - CAMERA_MARGIN;
    const top = obstacle.y + obstacle.height + CAMERA_MARGIN;
    const contact = Math.max(entry, (bottom - target.y) / offset.y);
    if (contact <= exit && target.y + contact * offset.y <= top) limit = Math.max(0, contact - padding);
  }
  // Short rays across a crest should keep the camera above the ground too.
  for (let t = 0.4 / length; t < limit; t += 0.35 / length) {
    const x = target.x + offset.x * t;
    const z = target.z + offset.z * t;
    if (target.y + offset.y * t < heightAt(x, z) + CAMERA_MARGIN) {
      limit = Math.max(0, t - padding);
      break;
    }
  }
  return Math.max(0.17 / length, limit);
}

export function updateStamina(value, sprinting, moving, dt, endurance = 1) {
  return Math.max(0, Math.min(1, value + (sprinting && moving ? -0.17 / endurance : 0.12) * dt));
}
