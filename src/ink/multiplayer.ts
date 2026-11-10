/**
 * Rules for multiplayer books, shared by the app and the game server.
 *
 * Authoring conventions:
 *   # players: 3                 global tag: the preferred number of players
 *   VAR player1 = "Captain Mara"  one variable per character; its value is the default name,
 *   VAR player2 = "The Stranger"  and readers can rename them before a game
 *   # chooser: 2                 on its own line before a choice: who makes it
 *   # chooser: any               anyone may make it (first to pick wins online)
 * A choice with no chooser tag belongs to whoever chose last (player 1 at the start).
 *
 * Every device replays the same choices with the same random seed, so all players
 * see the same story; only the list of choices needs to be shared.
 */
import type { TranscriptEntry } from '../book/types';
import { parseTag } from './tags';

export type Chooser = number | 'any'; // 1-based character number

export interface PartyInfo {
  /** Preferred number of players (characters). 1 for ordinary books. */
  players: number;
  /** Default character names, one per player. */
  names: string[];
}

/** Who plays which character. `owners[i]` is the person index for character i+1, or null when shared. */
export interface Seating {
  people: string[];
  owners: (number | null)[];
}

export const MAX_PLAYERS = 8;

export function nameVar(role: number): string {
  return `player${role}`;
}

/**
 * Reads the multiplayer settings from a story's global tags and variables.
 * `vars` are the story's global variables with their initial values.
 */
export function partyInfo(globalTags: string[], vars: Record<string, unknown>): PartyInfo {
  let players = 0;
  for (const t of globalTags) {
    const { key, value } = parseTag(t);
    if (key === 'players') players = parseInt(value, 10) || 0;
  }
  if (!players) {
    while (players < MAX_PLAYERS && typeof vars[nameVar(players + 1)] === 'string') players++;
  }
  players = Math.min(Math.max(players, 1), MAX_PLAYERS);
  const names = Array.from({ length: players }, (_, i) => {
    const v = vars[nameVar(i + 1)];
    return typeof v === 'string' && v.trim() ? v : `Player ${i + 1}`;
  });
  return { players, names };
}

/** Cheap check of a compiled story's `# players:` tag, without loading it (for the library). */
export function playersFromStoryJson(storyJson: string | null): number {
  if (!storyJson) return 1;
  // Tags compile to "#","^players: 3" (older ink: {"#":"players: 3"}).
  const m = /(?:"#","\^|\{"#":")\s*players:\s*(\d+)/.exec(storyJson);
  return m ? Math.min(Math.max(parseInt(m[1], 10) || 1, 1), MAX_PLAYERS) : 1;
}

/** The chooser for the current choice point: the last `# chooser:` tag seen so far, else player 1. */
export function currentChooser(transcript: TranscriptEntry[]): Chooser {
  let chooser: Chooser = 1;
  for (const e of transcript) {
    for (const t of e.tags) {
      const { key, value } = parseTag(t);
      if (key !== 'chooser') continue;
      if (value.toLowerCase() === 'any') chooser = 'any';
      else {
        const n = parseInt(value.replace(/^player\s*/i, ''), 10);
        if (n >= 1) chooser = n;
      }
    }
  }
  return chooser;
}

/** Number of choices made so far. */
export function turnNumber(transcript: TranscriptEntry[]): number {
  return transcript.filter((e) => e.kind === 'choice').length;
}

/** Deterministic pseudo-random integer in [0, n) from a seed and a turn number (mulberry32). */
export function hashPick(seed: number, turn: number, n: number): number {
  let t = (seed ^ Math.imul(turn + 1, 0x9e3779b9)) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const x = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return Math.floor(x * n);
}

export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
}

export interface Turn {
  /** The character making this choice, or null when anyone may. */
  role: number | null;
  /** Index into `seating.people`, or 'anyone'. */
  person: number | 'anyone';
  /** True when the character is unclaimed and this person was picked at random for this choice. */
  random: boolean;
}

/**
 * Who makes the choice at this point. Characters nobody claimed are shared: each of their
 * choices goes to a randomly picked player, the same pick on every device.
 */
export function whoChooses(seating: Seating, chooser: Chooser, seed: number, turn: number): Turn {
  const n = seating.people.length;
  if (n <= 1) return { role: chooser === 'any' ? null : chooser, person: 0, random: false };
  if (chooser === 'any') return { role: null, person: 'anyone', random: false };
  const owner = seating.owners[chooser - 1];
  if (owner != null && owner < n) return { role: chooser, person: owner, random: false };
  return { role: chooser, person: hashPick(seed, turn, n), random: true };
}

/**
 * Online seating, computed the same way on every device and the server: people in seat order,
 * each character owned by whoever claimed it, unclaimed characters shared.
 */
export function seatingFor(players: { name: string; roles: number[] }[], roleCount: number): Seating {
  const owners: (number | null)[] = Array.from({ length: roleCount }, () => null);
  players.forEach((p, i) => p.roles.forEach((r) => (owners[r - 1] = i)));
  return { people: players.map((p) => p.name), owners };
}

/** Character i goes to person i; characters beyond the number of people are shared. */
export function defaultSeating(players: number, people: string[]): Seating {
  return { people, owners: Array.from({ length: players }, (_, i) => (i < people.length ? i : null)) };
}

/** Variables to set at the start of a game so the story uses the chosen names. */
export function nameVars(names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n, i) => [nameVar(i + 1), n]));
}
