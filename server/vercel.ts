// Entry point for the Vercel function (bundled into .vercel/output by scripts/build-api.mjs).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { neonDb, type Db } from './db';
import { handleApi } from './http';

let db: Db | null = null;

function getDb(): Db | null {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return null;
  db ??= neonDb(url);
  return db;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 4_400_000) throw new Error('too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  let body = '';
  try {
    body = req.method === 'POST' ? await readBody(req) : '';
  } catch {
    res.writeHead(413, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'That book is too large to share online.' }));
    return;
  }
  const out = await handleApi(getDb, { method: req.method ?? 'GET', origin: req.headers.origin, body });
  res.writeHead(out.status, out.headers).end(out.body);
}
