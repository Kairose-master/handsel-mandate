import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/model.js', ['model.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  const entry = files.get((req.url || '/').split('?')[0]);
  if (!entry) { res.writeHead(404); return res.end('Not found'); }
  try {
    const body = await readFile(new URL(`../seller/${entry[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Unable to load studio'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Seller Studio: http://127.0.0.1:4173'));
