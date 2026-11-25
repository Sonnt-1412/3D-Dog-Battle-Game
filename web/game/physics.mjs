const DOG_RADIUS = 0.26;
const CAMERA_MARGIN = 0.20;
const DOG_HEIGHT = 0.53;

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

export function moveInWorld(position, dx, dz, obstacles = []) {
  let x = position.x + dx;
  let z = position.z + dz;
  for (const obstacle of obstacles) {
    const bottom = obstacle.y ?? 0;
    if (position.y >= bottom + obstacle.height || position.y + DOG_HEIGHT <= bottom) continue;
    const ox = x - obstacle.x;
    const oz = z - obstacle.z;
    const radius = obstacle.radius + DOG_RADIUS;
    const distanceSquared = ox * ox + oz * oz;
    if (distanceSquared >= radius * radius) continue;
    if (obstacle.halfX !== undefined) {
      const { halfX, halfZ, cos, sin } = obstacle;
      let lx = ox * cos - oz * sin;
      let lz = ox * sin + oz * cos;
      const dx = halfX + DOG_RADIUS - Math.abs(lx);
      const dz = halfZ + DOG_RADIUS - Math.abs(lz);
      if (dx <= 0 || dz <= 0) continue;
      if (dx < dz) lx += Math.sign(lx || 1) * dx;
      else lz += Math.sign(lz || 1) * dz;
      x = obstacle.x + lx * cos + lz * sin;
      z = obstacle.z - lx * sin + lz * cos;
      continue;
    }
    if (distanceSquared < 1e-8) {
      x = position.x;
      z = position.z;
      continue;
    }
    const scale = radius / Math.sqrt(distanceSquared);
    x = obstacle.x + ox * scale;
    z = obstacle.z + oz * scale;
  }
  position.x = x;
  position.z = z;
}

export function cameraReach(target, offset, heightAt, obstacles) {
  const horizontalSquared = offset.x ** 2 + offset.z ** 2;
  const length = Math.hypot(offset.x, offset.y, offset.z);
  const padding = CAMERA_MARGIN / length;
  let limit = 1;
  for (const obstacle of obstacles) {
    const dx = obstacle.x - target.x;
    const dz = obstacle.z - target.z;
    if (Math.abs(dx) > length + obstacle.radius + 2 || Math.abs(dz) > length + obstacle.radius + 2) continue;
    const closest = (dx * offset.x + dz * offset.z) / horizontalSquared;
    if (closest <= 0) continue;
    let entry = 0;
    let exit = limit;
    if (obstacle.halfX === undefined) {
      const cross = dx * offset.z - dz * offset.x;
      const radius = (obstacle.cameraRadius ?? obstacle.radius) + CAMERA_MARGIN;
      const remaining = radius ** 2 - cross ** 2 / horizontalSquared;
      if (remaining <= 0) continue;
      const halfSpan = Math.sqrt(remaining / horizontalSquared);
      entry = Math.max(entry, closest - halfSpan);
      exit = Math.min(exit, closest + halfSpan);
    } else {
      const { cos, sin, halfX, halfZ } = obstacle;
      const localX = -dx * cos + dz * sin;
      const localZ = -dx * sin - dz * cos;
      const rayX = offset.x * cos - offset.z * sin;
      const rayZ = offset.x * sin + offset.z * cos;
      for (const [origin, ray, size] of [[localX, rayX, halfX], [localZ, rayZ, halfZ]]) {
        const h = size + CAMERA_MARGIN;
        if (Math.abs(ray) < 1e-8) {
          if (Math.abs(origin) > h) exit = -1;
          continue;
        }
        const a = (-h - origin) / ray;
        const b = (h - origin) / ray;
        entry = Math.max(entry, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
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
  return Math.min(1, Math.max(0.17 / length, limit));
}

export function updateStamina(value, sprinting, moving, dt, endurance = 1) {
  return Math.max(0, Math.min(1, value + (sprinting && moving ? -0.17 / endurance : 0.12) * dt));
}
