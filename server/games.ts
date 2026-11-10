/**
 * Online multiplayer games. The server stores each game's book, character names, random seed,
 * players and the list of choices made. It replays the story to check that each choice is
 * made by the right player; the devices replay the same choices to show the story.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Db } from './db';
import { ReaderSession } from '../src/ink/session';
import { StoryEngine } from '../src/ink/engine';
import { nameVars, partyInfo, seatingFor, whoChooses, MAX_PLAYERS } from '../src/ink/multiplayer';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_STORY = 3_000_000;
const MAX_BOOK_FILE = 3_000_000; // base64; the request body limit is about 4.5 MB
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I
const MAX_NAME = 40;

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  roles: number[];
}

export interface GameView {
  code: string;
  title: string;
  bookId: string;
  names: string[];
  seed: number;
  status: 'lobby' | 'playing' | 'ended';
  host: string;
  players: PlayerView[];
  me: string;
}

export interface MoveView {
  seq: number;
  playerId: string;
  choice: number;
  text: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

function newCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function cleanName(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME) : '';
  return s || fallback;
}

function str(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string' || !v) throw new HttpError(400, `Missing ${field}.`);
  if (v.length > max) throw new HttpError(413, `The ${field} is too large to share online.`);
  return v;
}

export function normaliseCode(v: unknown): string {
  const code = typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (code.length !== 6) throw new HttpError(400, 'Game codes are 6 letters and numbers.');
  return code;
}

interface GameRow {
  code: string;
  title: string;
  book_id: string;
  story_json: string;
  names: string[];
  seed: string | number;
  status: GameView['status'];
  host: string;
}

async function loadGame(db: Db, code: string): Promise<GameRow> {
  const [g] = await db.query<GameRow>('select code, title, book_id, story_json, names, seed, status, host from games where code = $1', [code]);
  if (!g) throw new HttpError(404, 'No game with that code. Check the code, or the game may have expired.');
  return g;
}

async function loadPlayers(db: Db, code: string): Promise<PlayerView[]> {
  const rows = await db.query<{ id: string; name: string; seat: number; roles: number[] }>(
    'select id, name, seat, roles from players where game_code = $1 order by seat',
    [code],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, seat: r.seat, roles: r.roles ?? [] }));
}

/** The player a token belongs to, or a 403. */
async function auth(db: Db, code: string, token: unknown): Promise<string> {
  if (typeof token !== 'string' || !token) throw new HttpError(401, 'Missing player token.');
  const [p] = await db.query<{ id: string }>('select id from players where game_code = $1 and token_hash = $2', [code, hash(token)]);
  if (!p) {
    await loadGame(db, code); // a wrong code is a 404 rather than "not a player"
    throw new HttpError(403, "You're not a player in this game.");
  }
  return p.id;
}

function view(g: GameRow, players: PlayerView[], me: string): GameView {
  return {
    code: g.code,
    title: g.title,
    bookId: g.book_id,
    names: g.names,
    seed: Number(g.seed),
    status: g.status,
    host: g.host,
    players,
    me,
  };
}

async function loadMoves(db: Db, code: string, since = 0): Promise<MoveView[]> {
  const rows = await db.query<{ seq: number; player_id: string; choice: number; text: string }>(
    'select seq, player_id, choice, text from moves where game_code = $1 and seq >= $2 order by seq',
    [code, since],
  );
  return rows.map((r) => ({ seq: r.seq, playerId: r.player_id, choice: r.choice, text: r.text }));
}

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function createGame(db: Db, body: Record<string, unknown>) {
  const storyJson = str(body.storyJson, 'story', MAX_STORY);
  const bookFile = body.bookFile == null ? null : str(body.bookFile, 'book file', MAX_BOOK_FILE);
  let info;
  try {
    const engine = new StoryEngine(storyJson);
    info = partyInfo(engine.globalTags, engine.variables);
  } catch {
    throw new HttpError(400, "That story couldn't be loaded.");
  }
  const given = Array.isArray(body.names) ? body.names : [];
  const names = info.names.map((n, i) => cleanName(given[i], n));
  const title = cleanName(body.title, 'Untitled').slice(0, 120);
  const bookId = str(body.bookId, 'book id', 200);
  const hostName = cleanName(body.playerName, 'Player 1');
  const seed = randomBytes(4).readUInt32BE() & 0x7fffffff;
  const id = randomUUID();
  const token = newToken();

  // Games nobody has touched for 60 days are removed to keep the free database small.
  await db.query("delete from games where updated_at < now() - interval '60 days'");

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const inserted = await db.query(
      `insert into games (code, title, book_id, story_json, book_file, names, seed, host)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) on conflict (code) do nothing returning code`,
      [code, title, bookId, storyJson, bookFile, JSON.stringify(names), seed, id],
    );
    if (!inserted.length) continue;
    await db.query('insert into players (game_code, id, token_hash, name, seat, roles) values ($1, $2, $3, $4, 0, $5)', [
      code,
      id,
      hash(token),
      hostName,
      [1],
    ]);
    return { code, playerId: id, token, players: info.players };
  }
  throw new HttpError(503, "Couldn't create a game code. Please try again.");
}

export async function joinGame(db: Db, body: Record<string, unknown>) {
  const code = normaliseCode(body.code);
  const g = await loadGame(db, code);
  if (g.status !== 'lobby') throw new HttpError(409, 'This game has already started.');
  const players = await loadPlayers(db, code);
  if (players.length >= Math.min(g.names.length, MAX_PLAYERS)) {
    throw new HttpError(409, `This game is full (${g.names.length} players).`);
  }
  const id = randomUUID();
  const token = newToken();
  const seat = players.length ? Math.max(...players.map((p) => p.seat)) + 1 : 0;
  // Give the newcomer the first character nobody has claimed.
  const taken = new Set(players.flatMap((p) => p.roles));
  const free = g.names.findIndex((_, i) => !taken.has(i + 1));
  await db.query('insert into players (game_code, id, token_hash, name, seat, roles) values ($1, $2, $3, $4, $5, $6)', [
    code,
    id,
    hash(token),
    cleanName(body.playerName, `Player ${seat + 1}`),
    seat,
    free >= 0 ? [free + 1] : [],
  ]);
  await touch(db, code);
  return { code, playerId: id, token };
}

async function touch(db: Db, code: string) {
  await db.query('update games set updated_at = now() where code = $1', [code]);
}

/** Lobby: claim or release characters. `roles` is the full list this player wants. */
export async function claimRoles(db: Db, body: Record<string, unknown>) {
  const code = normaliseCode(body.code);
  const me = await auth(db, code, body.token);
  const g = await loadGame(db, code);
  if (g.status !== 'lobby') throw new HttpError(409, 'Characters are fixed once the game starts.');
  const want = Array.isArray(body.roles) ? [...new Set(body.roles.map(Number))] : [];
  if (want.some((r) => !Number.isInteger(r) || r < 1 || r > g.names.length)) throw new HttpError(400, 'Unknown character.');
  const players = await loadPlayers(db, code);
  const takenByOthers = new Set(players.filter((p) => p.id !== me).flatMap((p) => p.roles));
  if (want.some((r) => takenByOthers.has(r))) throw new HttpError(409, 'Someone else has already claimed that character.');
  await db.query('update players set roles = $3 where game_code = $1 and id = $2', [code, me, want.sort((a, b) => a - b)]);
  await touch(db, code);
  return getState(db, { code, token: body.token });
}

export async function startGame(db: Db, body: Record<string, unknown>) {
  const code = normaliseCode(body.code);
  const me = await auth(db, code, body.token);
  const g = await loadGame(db, code);
  if (g.host !== me) throw new HttpError(403, 'Only the person who created the game can start it.');
  if (g.status === 'lobby') {
    await db.query("update games set status = 'playing', updated_at = now() where code = $1", [code]);
  }
  return getState(db, { code, token: body.token });
}

export async function getState(db: Db, body: Record<string, unknown>) {
  const code = normaliseCode(body.code);
  const me = await auth(db, code, body.token);
  const g = await loadGame(db, code);
  const since = Number.isInteger(body.since) ? (body.since as number) : 0;
  return { game: view(g, await loadPlayers(db, code), me), moves: await loadMoves(db, code, since) };
}

export async function getBook(db: Db, body: Record<string, unknown>) {
  const code = normaliseCode(body.code);
  await auth(db, code, body.token);
  const [row] = await db.query<{ story_json: string; book_file: string | null }>('select story_json, book_file from games where code = $1', [code]);
  return { storyJson: row.story_json, bookFile: row.book_file };
}

/**
 * Records a choice. `seq` is the number of choices the device has seen, so two players
 * choosing at once can't both win: the second gets a 409 and the latest moves.
 */
export async function makeMove(db: Db, body: Record<string, unknown>) {
  const code = normaliseCode(body.code);
  const me = await auth(db, code, body.token);
  const g = await loadGame(db, code);
  if (g.status === 'lobby') throw new HttpError(409, "The game hasn't started yet.");
  if (g.status === 'ended') throw new HttpError(409, 'This story has already ended.');
  const seq = Number(body.seq);
  const choice = Number(body.choice);
  const moves = await loadMoves(db, code);
  if (seq !== moves.length) {
    throw Object.assign(new HttpError(409, 'Someone else chose first.'), { moves });
  }

  const players = await loadPlayers(db, code);
  const session = new ReaderSession(g.story_json, (e) => e.configure({ seed: Number(g.seed), vars: nameVars(g.names) }));
  session.replay(moves.map((m) => m.choice));
  const option = session.choices.find((c) => c.index === choice);
  if (!option) throw new HttpError(400, "That isn't one of the choices.");
  const turn = whoChooses(seatingFor(players, g.names.length), session.chooser, Number(g.seed), session.turn);
  const mySeatIndex = players.findIndex((p) => p.id === me);
  if (turn.person !== 'anyone' && turn.person !== mySeatIndex) {
    throw new HttpError(403, `It's ${players[turn.person as number]?.name ?? 'someone else'}'s turn to choose.`);
  }

  const inserted = await db.query(
    'insert into moves (game_code, seq, player_id, choice, text) values ($1, $2, $3, $4, $5) on conflict do nothing returning seq',
    [code, seq, me, choice, option.text],
  );
  if (!inserted.length) throw Object.assign(new HttpError(409, 'Someone else chose first.'), { moves: await loadMoves(db, code) });
  session.choose(choice);
  await db.query(`update games set updated_at = now()${session.ended ? ", status = 'ended'" : ''} where code = $1`, [code]);
  return getState(db, { code, token: body.token });
}

export const OPS: Record<string, (db: Db, body: Record<string, unknown>) => Promise<unknown>> = {
  create: createGame,
  join: joinGame,
  claim: claimRoles,
  start: startGame,
  state: getState,
  book: getBook,
  move: makeMove,
};
