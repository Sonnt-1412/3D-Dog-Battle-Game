<<<<<<< HEAD
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const script = name => fileURLToPath(new URL(name, import.meta.url));

test('the playable catalog ships one small, decodable H’Mông cộc model with all gameplay motions', async () => {
  await exec(process.execPath, [script('validate-web-assets.mjs')]);
  await exec(process.execPath, [script('check-web-models.mjs')]);
});
||||||| parent of 6218043 (ok)
=======
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PLAYABLE_IDS, ROSTER, initialDog, recall, remember } from '../web/roster.mjs';

const catalog = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'));
const dogs = catalog.dogs;

test('the deployed game exposes exactly 10 distinct playable breeds', () => {
  assert.equal(ROSTER.length, 10);
  assert.equal(dogs.length, 10);
  assert.equal(new Set(dogs.map(dog => dog.typeId)).size, 10);
  assert.deepEqual(new Set(dogs.map(dog => dog.id)), new Set(PLAYABLE_IDS));
  assert.equal(catalog.types.length, 10);
});

test('the game uses bounded tuning values and includes Vietnamese dogs', () => {
  for (const dog of ROSTER) {
    assert.ok(dog.speed >= 3 && dog.speed <= 5);
    assert.ok(dog.stamina > 0);
    assert.ok(dog.description && dog.tag);
  }
  for (const id of ['phu_quoc', 'hmong_bobtail', 'bac_ha']) assert.ok(PLAYABLE_IDS.includes(id));
});

test('shared and remembered selections are restricted to the playable roster', () => {
  assert.equal(initialDog(dogs, 'corgi', 'labrador').id, 'corgi');
  assert.equal(initialDog(dogs, 'saved_wispy-black-dog-20261116', 'labrador').id, 'labrador');
  assert.equal(initialDog(dogs, 'missing', 'missing').id, 'phu_quoc');
});

test('storage failure does not prevent starting a game', () => {
  const disabled = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
  assert.equal(recall(disabled), null);
  assert.doesNotThrow(() => remember(disabled, 'phu_quoc'));
  assert.equal(recall(undefined), null);
});
>>>>>>> 6218043 (ok)
