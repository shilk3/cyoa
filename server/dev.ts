// Local game server for development and tests: the real API on an in-memory Postgres (PGlite).
//   node scripts/dev-api.mjs [port]
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from './db';
import { handleApi } from './http';

export function pgliteDb(pg: PGlite): Db {
  return { query: async (text, params) => (await pg.query(text, params ?? [])).rows as never };
}

export async function startDevServer(port: number) {
  const db = pgliteDb(new PGlite());
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const out = await handleApi(() => db, { method: req.method ?? 'GET', origin: req.headers.origin, body });
    res.writeHead(out.status, out.headers).end(out.body);
  });
  await new Promise<void>((r) => server.listen(port, r));
  return server;
}
