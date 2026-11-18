import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { createStaticServer } from '../server.mjs';

let directory, server, origin, outside;
before(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'dog-server-'));
  outside = await mkdtemp(resolve(tmpdir(), 'dog-private-'));
  await writeFile(resolve(directory, 'index.html'), '<h1>Dog Motion Lab</h1>');
  await writeFile(resolve(directory, 'main.mjs'), 'export const ready = true;');
  await writeFile(resolve(directory, 'dog.0123456789abcdef.glb'), '0123456789');
  await writeFile(resolve(directory, 'empty.txt'), '');
  await writeFile(resolve(outside, 'secret.txt'), 'private');
  await symlink(resolve(outside, 'secret.txt'), resolve(directory, 'outside.txt'));
  server = createStaticServer(directory);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await Promise.all([directory, outside].filter(Boolean).map(path => rm(path, { recursive: true, force: true })));
});

test('serves the built page and streams models with correct content types', async () => {
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /^text\/html/);
  assert.match(await page.text(), /Dog Motion Lab/);
  const module = await fetch(`${origin}/main.mjs`);
  assert.match(module.headers.get('content-type'), /^text\/javascript/);
  const model = await fetch(`${origin}/dog.0123456789abcdef.glb`);
  assert.equal(model.headers.get('content-type'), 'model/gltf-binary');
  assert.match(model.headers.get('cache-control'), /immutable/);
  assert.equal(await model.text(), '0123456789');
});

test('supports HEAD and byte range downloads', async () => {
  const head = await fetch(`${origin}/dog.0123456789abcdef.glb`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(await head.text(), '');
  const part = await fetch(`${origin}/dog.0123456789abcdef.glb`, { headers: { Range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await part.text(), '2345');
  const suffix = await fetch(`${origin}/dog.0123456789abcdef.glb`, { headers: { Range: 'bytes=-3' } });
  assert.equal(suffix.status, 206);
  assert.equal(await suffix.text(), '789');
  const invalid = await fetch(`${origin}/dog.0123456789abcdef.glb`, { headers: { Range: 'bytes=20-' } });
  assert.equal(invalid.status, 416);
});

test('rejects writes, escaped paths and symlinks outside the website', async () => {
  assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${origin}/%2e%2e%2fsecret.txt`)).status, 403);
  assert.equal((await fetch(`${origin}/outside.txt`)).status, 403);
  assert.equal((await fetch(`${origin}/missing.glb`)).status, 404);
  assert.equal((await fetch(`${origin}/empty.txt`)).status, 200);
});
