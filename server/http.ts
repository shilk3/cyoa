import type { Db } from './db';
import { ensureSchema } from './db';
import { HttpError, OPS } from './games';

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Sites allowed to call the API from a browser. */
const ALLOWED_ORIGINS = [/^https:\/\/shilk3\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

function cors(origin: string | undefined): Record<string, string> {
  const ok = origin && ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    ...(ok ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

/** Handles one API request: POST a JSON body with `op` (create, join, claim, start, state, book, move). */
export async function handleApi(
  getDb: () => Db | null,
  req: { method: string; origin?: string; body: string },
): Promise<ApiResponse> {
  const headers = { ...cors(req.origin), 'content-type': 'application/json', 'cache-control': 'no-store' };
  const reply = (status: number, data: unknown): ApiResponse => ({ status, headers, body: JSON.stringify(data) });
  if (req.method === 'OPTIONS') return { status: 204, headers, body: '' };
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(req.body || '{}');
  } catch {
    return reply(400, { error: 'Request body must be JSON.' });
  }
  const op = OPS[String(body.op)];
  if (!op) return reply(400, { error: 'Unknown operation.' });

  const db = getDb();
  if (!db) return reply(503, { error: "Online play isn't set up yet: the game server has no database." });
  try {
    await ensureSchema(db);
    return reply(200, await op(db, body));
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message, ...('moves' in e ? { moves: e.moves } : {}) });
    console.error(e);
    return reply(500, { error: 'The game server hit a problem. Please try again.' });
  }
}
