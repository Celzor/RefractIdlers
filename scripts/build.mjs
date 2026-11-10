import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'LICENSE', 'CREDITS.md']) await cp(file, `dist/${file}`);
for (const folder of ['src', 'tools']) await cp(folder, `dist/${folder}`, { recursive: true });
await cp('public', 'dist', { recursive: true });
console.log('Built Refract Idlers in dist/ — no runtime dependencies.');
