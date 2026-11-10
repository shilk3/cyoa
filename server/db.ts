import { neon } from '@neondatabase/serverless';

/** The little the game server needs from Postgres: parameterised queries returning rows. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** Neon over HTTP: no connection to keep open, which suits short-lived serverless functions. */
export function neonDb(url: string): Db {
  const sql = neon(url);
  return { query: (text, params) => sql.query(text, params ?? []) as never };
}

export const SCHEMA = `
create table if not exists games (
  code text primary key,
  title text not null,
  book_id text not null,
  story_json text not null,
  book_file text,
  names jsonb not null,
  seed bigint not null,
  status text not null default 'lobby',
  host uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists players (
  game_code text not null references games(code) on delete cascade,
  id uuid not null,
  token_hash text not null,
  name text not null,
  seat int not null,
  roles int[] not null default '{}',
  joined_at timestamptz not null default now(),
  primary key (game_code, id)
);
create table if not exists moves (
  game_code text not null references games(code) on delete cascade,
  seq int not null,
  player_id uuid not null,
  choice int not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (game_code, seq)
);
`;

let schemaReady: Promise<void> | null = null;

/** Creates the tables on first use, so a fresh Neon database needs no setup step. */
export function ensureSchema(db: Db): Promise<void> {
  schemaReady ??= (async () => {
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

export function resetSchemaCache(): void {
  schemaReady = null;
}
