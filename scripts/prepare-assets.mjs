import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('public/assets/vendor/', root);
await mkdir(output, { recursive: true });
for (const [source, target] of [
  ['dist/css/bootstrap.min.css', 'bootstrap.min.css'],
  ['dist/js/bootstrap.bundle.min.js', 'bootstrap.bundle.min.js'],
  ['LICENSE', 'bootstrap.LICENSE'],
]) {
  await copyFile(new URL(`frontend/node_modules/bootstrap/${source}`, root), new URL(target, output));
}
console.log(`Local Bootstrap assets prepared in ${fileURLToPath(output)}`);
