import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterDogs, initialDog, normalize, recall, remember } from '../web/catalog.mjs';

const catalog = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'));
const dogs = catalog.dogs;

test('all original and saved models are available in the web catalog', () => {
  assert.equal(dogs.length, 317);
  assert.equal(dogs.filter(dog => dog.custom).length, 23);
  assert.equal(new Set(dogs.map(dog => dog.id)).size, 317);
});

test('Vietnamese search works with accented and unaccented text', () => {
  assert.equal(normalize('Đầu nhỏ'), 'dau nho');
  const results = filterDogs(dogs, { query: 'phu quoc' });
  assert.ok(results.length >= 7);
  assert.ok(results.every(dog => dog.typeId === 'phu_quoc'));
});

test('breed, life stage and saved filters combine', () => {
  const results = filterDogs(dogs, { type: 'hmong_bobtail', stage: 'puppy', saved: true });
  assert.ok(results.length);
  assert.ok(results.every(dog => dog.custom && dog.ageStage === 'puppy' && dog.typeId === 'hmong_bobtail'));
  assert.deepEqual(filterDogs(dogs, { query: 'nonexistent companion 12345' }), []);
});

test('shared URLs take precedence over remembered or default selection', () => {
  assert.equal(initialDog(dogs, 'phu_quoc', 'labrador').id, 'phu_quoc');
  assert.equal(initialDog(dogs, 'missing', 'labrador').id, 'labrador');
  assert.equal(initialDog(dogs, 'missing', 'missing').id, 'saved_wispy-black-dog-20261116');
  assert.equal(initialDog([dogs[0]], '', '').id, dogs[0].id);
});

test('storage failure does not prevent browsing', () => {
  const disabled = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
  assert.equal(recall(disabled), null);
  assert.doesNotThrow(() => remember(disabled, 'phu_quoc'));
  assert.equal(recall(undefined), null);
});
