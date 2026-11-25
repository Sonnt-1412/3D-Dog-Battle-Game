import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraReach, movementIntent, moveInWorld, integrateVelocity, turnTo,
  updateStamina } from '../web/game/physics.mjs';
import {
  CHUNK_SIZE, SPAWN, TERRAIN_GRID, TERRAIN_HALF, chunkWindow, makeLandscape, riverZ, streamX, terrainSampler, waterAt,
} from '../web/game/terrain.mjs';
import { HOUSE, crossingHeight, houseColliders, villageForChunk, villageSupport } from '../web/game/village.mjs';

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

test('movement keeps world coordinates beyond the former stage and through negative chunks', () => {
  const position = { x: 0, y: 0.7, z: 0 };
  moveInWorld(position, 2, 3);
  assert.deepEqual(position, { x: 2, y: 0.7, z: 3 });
  position.x = -8000;
  position.z = 1200;
  moveInWorld(position, -1, 2);
  assert.deepEqual(position, { x: -8001, y: 0.7, z: 1202 });
});

test('the dog slides around a prop and can jump over low rocks', () => {
  const obstacle = { x: 0, z: 0, radius: 0.78, height: 0.45 };
  const position = { x: -1.25, y: 0, z: 0.2 };
  moveInWorld(position, 0.5, 0.25, [obstacle]);
  assert.ok(Math.hypot(position.x, position.z) >= 1.04);
  assert.ok(position.z > 0.45);

  position.y = 0.5;
  moveInWorld(position, -position.x, -position.z, [obstacle]);
  assert.deepEqual(position, { x: 0, y: 0.5, z: 0 });
});

test('nearby chunks follow the player while keeping the same finite window', () => {
  const previous = chunkWindow(CHUNK_SIZE - 0.01, -0.01);
  const next = chunkWindow(CHUNK_SIZE + 0.01, -0.01);
  assert.equal(previous.length, 25);
  assert.equal(next.length, 25);
  assert.deepEqual(next[0], { x: 1, z: -1, range: 0, rank: 0 });
  const keys = new Set(previous.map(tile => `${tile.x}:${tile.z}`));
  assert.equal(next.filter(tile => keys.has(`${tile.x}:${tile.z}`)).length, 20);
  assert.ok(chunkWindow(-10_000, 20_000).every(tile => tile.x < -200 && tile.z > 410));
});

test('river and tributary surfaces sit above the continuous terrain bed', () => {
  const { heightAt } = makeLandscape(new Uint8Array(TERRAIN_GRID ** 2));
  for (const x of [-801, -48, 0, 48, 716]) {
    const z = riverZ(x);
    assert.ok(waterAt(x, z) - heightAt(x, z) > 0.73);
    assert.ok(Math.abs(heightAt(x - 0.001, z) - heightAt(x + 0.001, z)) < 0.01);
  }
  const z = -25;
  const x = streamX(z, 27);
  assert.ok(waterAt(x, z) > heightAt(x, z));
});

test('the bridge and house stairs are walkable without lifting a dog beneath the floor', () => {
  const groundAt = () => 0;
  const { houses, crossings } = villageForChunk(0, -1, groundAt);
  const house = houses[0];
  const bridge = crossings.find(crossing => !crossing.transverse);
  assert.ok(bridge);
  assert.equal(villageSupport(bridge.x, bridge.z, Infinity, [], [bridge]), bridge.deck);
  assert.equal(crossingHeight(bridge, bridge.halfLength), bridge.south);
  assert.equal(villageSupport(house.x, house.z, 0.34, [house], []), -Infinity);
  assert.equal(villageSupport(house.x, house.z, Infinity, [house], []), HOUSE.floor * house.scale);
  const stair = HOUSE.porch + HOUSE.stairRun / 2;
  const x = house.x + house.sin * stair * house.scale;
  const z = house.z + house.cos * stair * house.scale;
  assert.ok(Math.abs(villageSupport(x, z, Infinity, [house], []) - HOUSE.floor * house.scale / 2) < 1e-9);

  const below = { x: house.x, y: 0, z: house.z - 2.2 };
  moveInWorld(below, 0, -0.8, houseColliders(house));
  assert.ok(Math.abs(below.z - (house.z - 3)) < 1e-9);
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
