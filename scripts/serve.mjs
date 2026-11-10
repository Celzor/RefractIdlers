import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const built = process.argv.includes('--dist');
const directory = path.join(root, built ? 'dist' : '');
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex < 0 ? process.env.PORT || 4175 : process.argv[portIndex + 1]);
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.md':'text/plain' };
http.createServer(async (req, res) => {
  try {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = route === '/' ? 'index.html' : route.replace(/^\/+/, '');
    if (!/^(index\.html|LICENSE|CREDITS\.md|src\/[^.][^\\]*|tools\/[^.][^\\]*|assets\/[^.][^\\]*|favicon\.svg|refract-activity\.js)$/.test(relative)) throw Error('Unknown route');
    const base = !built && /^(assets\/|favicon|refract-activity)/.test(relative) ? path.join(root,'public') : directory;
    let file = path.resolve(base, relative);
    if (!file.startsWith(path.resolve(base) + path.sep)) throw Error('Outside root');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'text/plain'}; charset=utf-8`, 'Cache-Control':'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(404, { 'Content-Type':'text/plain' }); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Refract Idlers: http://127.0.0.1:${port}`));
