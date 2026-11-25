<<<<<<< HEAD
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
console.log(`Web assets: ${dog.id}, ${(size / 1e6).toFixed(2)} MB.`);
||||||| parent of 6218043 (ok)
=======
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
<<<<<<< HEAD
console.log(`Web assets: ${ids.size} models, ${(total / 1e6).toFixed(1)} MB; all files present.`);
>>>>>>> 6218043 (ok)
||||||| parent of c01158c (Simplify Pawtown to a single-dog FPS playground)
console.log(`Web assets: ${ids.size} models, ${(total / 1e6).toFixed(1)} MB; all files present.`);
=======
const { size } = await stat(resolve(publicRoot, '.' + dog.asset));
if (size !== dog.bytes || !size || size > 2_000_000) throw new Error(`Wrong model size: ${size} bytes`);
console.log(`Web assets: ${dog.id}, ${(size / 1e6).toFixed(2)} MB.`);
>>>>>>> c01158c (Simplify Pawtown to a single-dog FPS playground)
