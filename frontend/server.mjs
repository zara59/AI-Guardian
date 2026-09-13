import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, 'dist');
const port = parseInt(process.env.PORT || '3000', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function sendFile(res, filePath) {
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    return false;
  }
  return true;
}

async function distInfo() {
  try {
    const html = await readFile(path.join(dist, 'index.html'), 'utf-8');
    const m = html.match(/<title>([^<]*)<\/title>/);
    return m ? m[1] : 'built app';
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.normalize(path.join(dist, url.pathname));

  if (!filePath.startsWith(dist)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const served = await sendFile(res, filePath);
  if (!served) {
    const title = await distInfo();
    if (!title) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(
        'dist/index.html not found.\n' +
          'Your Render Build Command must run the production build, e.g.:\n' +
          'npm install && npm run build',
      );
      return;
    }
    // SPA fallback: unknown routes get the app shell.
    const servedIndex = await sendFile(res, path.join(dist, 'index.html'));
    if (!servedIndex) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
    }
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`AI Guardian frontend serving ${dist} on http://0.0.0.0:${port}`);
});