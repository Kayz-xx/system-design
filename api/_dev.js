// Local dev server with the API routes: node api/_dev.js, then open http://localhost:5173
// Serves the static app like `npm run dev`, plus POST /api/tutor. Reads GEMINI_API_KEY from .env if present.
// The leading underscore keeps Vercel from deploying this file as a route.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tutor from './tutor.js';
import chaosPlan from './chaos/plan.js';
import auditNote from './audit/note.js';
import review from './review.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;
const ROUTES = { '/api/tutor': tutor, '/api/chaos/plan': chaosPlan, '/api/audit/note': auditNote, '/api/review': review };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ROUTES[path]) return ROUTES[path](req, res);
  const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(ROOT) || file.includes(`${ROOT}/.env`)) { res.statusCode = 403; return res.end(); }
  try {
    const data = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}  (tutor ${process.env.GEMINI_API_KEY ? 'on' : 'off: no GEMINI_API_KEY, the app shows template hints'})`);
});
