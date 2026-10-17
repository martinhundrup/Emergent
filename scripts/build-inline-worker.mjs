// Fallback bundle for publishing static files through the Workers API.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const output = resolve(root, '.cloudflare/inline-worker.js');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };
const assets = {};
for (const name of await readdir(dist)) {
  if (name === '_headers') continue;
  const extension = name.slice(name.lastIndexOf('.'));
  assets[`/protoform.ing/${name}`] = [(await readFile(resolve(dist, name))).toString('base64'), mime[extension] ?? 'application/octet-stream'];
}
const source = `const ASSETS=${JSON.stringify(assets)};
addEventListener('fetch', event => event.respondWith(handle(event.request)));
async function handle(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  let path = url.pathname;
  if (path === '/protoform.ing') {
    url.pathname = '/protoform.ing/';
    return Response.redirect(url.toString(), 308);
  }
  if (/^\\/protoform\\.ing\\/\\d+\\/$/.test(path)) {
    url.pathname = path.slice(0, -1);
    return Response.redirect(url.toString(), 308);
  }
  if (path === '/protoform.ing/' || /^\\/protoform\\.ing\\/\\d+$/.test(path)) path = '/protoform.ing/index.html';
  const asset = ASSETS[path];
  if (!asset) return new Response('Not found', { status: 404 });
  const bytes = Uint8Array.from(atob(asset[0]), char => char.charCodeAt(0));
  return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
    'Content-Type': asset[1], 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
  } });
}`;
await mkdir(resolve(root, '.cloudflare'), { recursive: true });
await writeFile(output, source);
console.log(`Built inline Worker at ${output} (${Buffer.byteLength(source)} bytes).`);
