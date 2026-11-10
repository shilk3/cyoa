// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import heist from '../../stories/heist/heist.ink?raw';
import { compileInk } from '../ink/compile';
import { handleApi } from '../../server/http';
import { pgliteDb } from '../../server/dev';
import { resetSchemaCache, type Db } from '../../server/db';
import { whoChooses, seatingFor } from '../ink/multiplayer';
import { ReaderSession } from '../ink/session';

const storyJson = compileInk(heist).storyJson!;
let db: Db;

async function api(body: Record<string, unknown>, origin = 'https://shilk3.github.io') {
  const r = await handleApi(() => db, { method: 'POST', origin, body: JSON.stringify(body) });
  return { status: r.status, data: JSON.parse(r.body || '{}'), headers: r.headers };
}

beforeEach(() => {
  resetSchemaCache();
  db = pgliteDb(new PGlite());
});

async function setupGame(people = ['Ann', 'Ben']) {
  const host = await api({ op: 'create', storyJson, bookId: 'b1', title: 'Heist', names: ['Wren', '', ''], playerName: people[0] });
  expect(host.status).toBe(200);
  const tokens = [host.data.token];
  for (const p of people.slice(1)) {
    const j = await api({ op: 'join', code: host.data.code.toLowerCase(), playerName: p });
    expect(j.status).toBe(200);
    tokens.push(j.data.token);
  }
  return { code: host.data.code as string, tokens };
}

/** Plays the choice the server expects next, as whoever's turn it is. */
async function playNext(code: string, tokens: string[], pick = 0) {
  const st = (await api({ op: 'state', code, token: tokens[0] })).data;
  const s = new ReaderSession(storyJson, (e) => e.configure({ seed: st.game.seed, vars: Object.fromEntries(st.game.names.map((n: string, i: number) => [`player${i + 1}`, n])) }));
  s.replay(st.moves.map((m: { choice: number }) => m.choice));
  const turn = whoChooses(seatingFor(st.game.players, st.game.names.length), s.chooser, st.game.seed, s.turn);
  const who = turn.person === 'anyone' ? 0 : turn.person;
  return { turn, res: await api({ op: 'move', code, token: tokens[who], seq: s.turn, choice: s.choices[pick].index }), who, session: s };
}

describe('game server', () => {
  it('creates and joins games, with default names and auto-assigned characters', async () => {
    const { code, tokens } = await setupGame(['Ann', 'Ben']);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const st = (await api({ op: 'state', code, token: tokens[1] })).data;
    expect(st.game.names).toEqual(['Wren', 'Pike the Lookout', 'Sable the Talker']);
    expect(st.game.players.map((p: { name: string; roles: number[] }) => [p.name, p.roles])).toEqual([['Ann', [1]], ['Ben', [2]]]);
    expect(st.game.status).toBe('lobby');
  });

  it('rejects strangers, bad codes and joining a full or started game', async () => {
    const { code, tokens } = await setupGame(['Ann', 'Ben', 'Cat']);
    expect((await api({ op: 'state', code, token: 'nope' })).status).toBe(403);
    expect((await api({ op: 'state', code: 'ZZZZZZ', token: tokens[0] })).status).toBe(404);
    expect((await api({ op: 'join', code, playerName: 'Dan' })).status).toBe(409); // 3 characters, 3 players
    const { code: c2, tokens: t2 } = await setupGame(['Ann']);
    expect((await api({ op: 'start', code: c2, token: t2[0] })).status).toBe(200);
    expect((await api({ op: 'join', code: c2, playerName: 'Late' })).status).toBe(409);
  });

  it('lets players claim free characters only, and only the host start', async () => {
    const { code, tokens } = await setupGame(['Ann', 'Ben']);
    expect((await api({ op: 'claim', code, token: tokens[1], roles: [1] })).status).toBe(409); // Ann has 1
    const ok = await api({ op: 'claim', code, token: tokens[1], roles: [2, 3] });
    expect(ok.data.game.players[1].roles).toEqual([2, 3]);
    expect((await api({ op: 'start', code, token: tokens[1] })).status).toBe(403);
    expect((await api({ op: 'start', code, token: tokens[0] })).data.game.status).toBe('playing');
    expect((await api({ op: 'claim', code, token: tokens[0], roles: [] })).status).toBe(409);
  });

  it('only accepts a choice from the player whose turn it is', async () => {
    const { code, tokens } = await setupGame(['Ann', 'Ben']);
    await api({ op: 'start', code, token: tokens[0] });
    // First choice belongs to character 2 (Pike) = Ben.
    const wrong = await api({ op: 'move', code, token: tokens[0], seq: 0, choice: 0 });
    expect(wrong.status).toBe(403);
    expect(wrong.data.error).toContain("Ben's turn");
    const right = await api({ op: 'move', code, token: tokens[1], seq: 0, choice: 0 });
    expect(right.status).toBe(200);
    expect(right.data.moves).toHaveLength(1);
    expect(right.data.moves[0].text).toContain('take the rooftops');
    // Replaying the same seq again is a conflict, and returns the moves so the device can catch up.
    const again = await api({ op: 'move', code, token: tokens[1], seq: 0, choice: 1 });
    expect(again.status).toBe(409);
    expect(again.data.moves).toHaveLength(1);
    expect((await api({ op: 'move', code, token: tokens[1], seq: 1, choice: 99 })).status).toBe(400);
  });

  it('plays a full game to the end, sharing the unclaimed character', async () => {
    const { code, tokens } = await setupGame(['Ann', 'Ben']); // character 3 is shared
    await api({ op: 'start', code, token: tokens[0] });
    let sharedTurns = 0;
    for (let i = 0; i < 12; i++) {
      const st = (await api({ op: 'state', code, token: tokens[0] })).data;
      if (st.game.status === 'ended') break;
      const { turn, res } = await playNext(code, tokens);
      expect(res.status).toBe(200);
      if (turn.random) sharedTurns++;
    }
    const st = (await api({ op: 'state', code, token: tokens[1] })).data;
    expect(st.game.status).toBe('ended');
    expect(sharedTurns).toBeGreaterThan(0);
    expect((await api({ op: 'move', code, token: tokens[0], seq: st.moves.length, choice: 0 })).status).toBe(409);
    expect((await api({ op: 'state', code, token: tokens[1], since: 2 })).data.moves[0].seq).toBe(2);
  });

  it('serves the book to players and allows the app origin only', async () => {
    const { code, tokens } = await setupGame(['Ann']);
    const book = await api({ op: 'book', code, token: tokens[0] });
    expect(book.data.storyJson).toBe(storyJson);
    expect((await api({ op: 'state', code, token: tokens[0] })).headers['access-control-allow-origin']).toBe('https://shilk3.github.io');
    expect((await api({ op: 'state', code, token: tokens[0] }, 'https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });

  it('explains when no database is configured', async () => {
    const r = await handleApi(() => null, { method: 'POST', body: '{"op":"state"}' });
    expect(r.status).toBe(503);
  });
});
