import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const target = path.resolve(root, 'dist');
// Delete only the fixed build output inside this checkout, never a supplied path.
if (path.dirname(target) !== root || path.basename(target) !== 'dist') throw Error('Invalid build target');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of ['index.html', 'LICENSE', 'CREDITS.md']) await cp(path.join(root,file), path.join(target,file));
for (const folder of ['src', 'tools']) await cp(path.join(root,folder), path.join(target,folder), { recursive: true });
await cp(path.join(root,'public'), target, { recursive: true });
console.log('Built Refract Idlers in dist/ — no runtime dependencies.');
