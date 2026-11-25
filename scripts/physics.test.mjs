import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraReach, movementIntent, moveOnStage, integrateVelocity, turnTo,
  updateStamina, STAGE_RADIUS } from '../web/game/physics.mjs';
import { SPAWN, TERRAIN_GRID, TERRAIN_HALF, terrainSampler } from '../web/game/terrain.mjs';

test('movement remains relative to the camera and diagonal movement is normalized', () => {
  const forward = movementIntent({ x: 0, z: 1 }, 0);
  assert.equal(forward.x, 0); assert.equal(forward.z, -1);
  const rotated = movementIntent({ x: 0, z: 1 }, Math.PI / 2);
  assert.ok(Math.abs(rotated.x + 1) < 1e-10);
  assert.ok(Math.abs(rotated.z) < 1e-10);
  const diagonal = movementIntent({ x: 1, z: 1 }, 0.7);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-10);
});

test('acceleration and travel distance agree across rendering frame rates', () => {
  const runs = [30, 60, 144].map(fps => {
    let value = 0, distance = 0;
    for (let step = 0; step < fps * 3; step++) {
      const next = integrateVelocity(value, step < fps * 2 ? 5 : 0, 10, 1 / fps);
      value = next.value; distance += next.distance;
    }
    return { value, distance };
  });
  for (const run of runs) assert.ok(Math.abs(run.distance - runs[0].distance) < 1e-9);
});

test('the player can move freely inside the stage and slide along its circular perimeter', () => {
  const position = { x: 0, y: 0.7, z: 0 };
  moveOnStage(position, 2, 3);
  assert.deepEqual(position, { x: 2, y: 0.7, z: 3 });

  position.x = STAGE_RADIUS;
  position.z = 0;
  moveOnStage(position, 1, 2);
  assert.ok(Math.abs(Math.hypot(position.x, position.z) - STAGE_RADIUS) < 1e-10);
  assert.ok(position.z > 1.9);
  assert.equal(position.y, 0.7);
  moveOnStage(position, -1, 0);
  assert.ok(Math.hypot(position.x, position.z) < STAGE_RADIUS);
});

test('the dog slides around a prop and can jump over low rocks', () => {
  const obstacle = { x: 0, z: 0, radius: 0.78, height: 0.45 };
  const position = { x: -1.25, y: 0, z: 0.2 };
  moveOnStage(position, 0.5, 0.25, [obstacle]);
  assert.ok(Math.hypot(position.x, position.z) >= 1.04);
  assert.ok(position.z > 0.45);

  position.y = 0.5;
  moveOnStage(position, -position.x, -position.z, [obstacle]);
  assert.deepEqual(position, { x: 0, y: 0.5, z: 0 });
});

test('the chase camera shortens its boom for foliage and rising ground', () => {
  const target = { x: 0, y: 0.52, z: 0 };
  const offset = { x: 0, y: 1, z: 5 };
  const flat = () => 0;
  const branch = { x: 0.9, y: 0, z: 2.5, radius: 0.3, cameraRadius: 0.86, height: 2 };
  assert.ok(cameraReach(target, offset, flat, [branch]) < 0.5);
  assert.equal(cameraReach(target, offset, flat, [{ ...branch, height: 0.1 }]), 1);
  assert.ok(cameraReach(target, offset, (x, z) => z > 2.8 ? 1.2 : 0, []) < 0.65);
});

test('the elevation sampler follows the terrain mesh triangles', () => {
  const samples = new Uint8Array(TERRAIN_GRID ** 2);
  samples[1] = 20;
  samples[TERRAIN_GRID] = 20;
  const heightAt = terrainSampler(samples);
  const cell = TERRAIN_HALF * 2 / (TERRAIN_GRID - 1);
  assert.equal(heightAt(SPAWN.x, SPAWN.z), 0);
  assert.ok(Math.abs(heightAt(-TERRAIN_HALF + cell / 2, -TERRAIN_HALF + cell / 2) - 1.68) < 1e-8);
});

test('sprinting drains energy, resting recovers it, and values stay bounded', () => {
  assert.ok(updateStamina(1, true, true, 1) < 1);
  assert.ok(updateStamina(0.5, false, false, 1) > 0.5);
  assert.equal(updateStamina(0.01, true, true, 10), 0);
  assert.equal(updateStamina(0.95, false, false, 10), 1);
});

test('turning crosses the angle seam without a full spin', () => {
  const next = turnTo(Math.PI - 0.01, -Math.PI + 0.01, 12, 1 / 60);
  assert.ok(next > Math.PI - 0.01);
  assert.ok(next < Math.PI + 0.02);
});
