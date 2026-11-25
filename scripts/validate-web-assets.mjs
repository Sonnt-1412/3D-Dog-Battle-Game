import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forestAssets } from '../web/game/forest-assets.mjs';
import { TERRAIN_GRID } from '../web/game/terrain.mjs';

const publicRoot = process.argv[2] ? resolve(process.argv[2])
  : fileURLToPath(new URL('../public/', import.meta.url));
const catalog = JSON.parse(await readFile(resolve(publicRoot, 'catalog.json'), 'utf8'));
const dog = catalog.dogs?.[0];
if (catalog.dogs?.length !== 1 || dog.id !== 'hmong_bobtail' || catalog.types?.length !== 1
  || catalog.types[0].id !== dog.typeId || !Number.isFinite(dog.height) || dog.height <= 0) {
  throw new Error('The game catalog must expose only the H’Mông cộc model');
}
if (!/^\/models\/hmong_bobtail-play\.[a-f0-9]{16}\.glb$/.test(dog.asset)) {
  throw new Error(`Invalid model URL: ${dog.asset}`);
}
const { size } = await stat(resolve(publicRoot, '.' + dog.asset));
if (size !== dog.bytes || !size || size > 2_000_000) throw new Error(`Wrong model size: ${size} bytes`);
const forestSizes = await Promise.all(Object.values(forestAssets).map(async ({ url, bytes }) => {
  const name = /^\/environment\/[a-zA-Z]+\.([a-f0-9]{16})\.(?:glb|webp|bin)$/.exec(url);
  if (!name) throw new Error(`Invalid forest asset URL: ${url}`);
  const data = await readFile(resolve(publicRoot, '.' + url));
  const digest = createHash('sha256').update(data).digest('hex').slice(0, 16);
  if (!bytes || data.length !== bytes || digest !== name[1]) throw new Error(`Invalid forest asset: ${url}`);
  return bytes;
}));
const forestBytes = forestSizes.reduce((total, bytes) => total + bytes, 0);
if (forestAssets.elevation.bytes !== TERRAIN_GRID ** 2) throw new Error('Elevation dimensions do not match the level');
if (forestBytes > 1_600_000) throw new Error(`Forest exceeds the 1.6 MB asset budget: ${forestBytes} bytes`);
console.log(`Web assets: ${dog.id}, ${(size / 1e6).toFixed(2)} MB. Pine trail, ${(forestBytes / 1e6).toFixed(2)} MB.`);
