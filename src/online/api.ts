/** Client for the online game server (server/ in this repo, deployed on Vercel). */

// Override with VITE_GAME_API when building (e.g. http://localhost:8787 for the local dev server).
// (Cast because the server's type check also sees this file and doesn't know Vite's env types.)
export const GAME_API: string =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GAME_API ?? 'https://cyoa-games.vercel.app/api/game';

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

export interface GameState {
  game: GameView;
  moves: MoveView[];
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, message: string, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function call<T>(op: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(GAME_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) });
  } catch {
    throw new ApiError(0, "Can't reach the game server. Check your internet connection.", {});
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? `The game server answered ${res.status}.`), data);
  return data as T;
}

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBlob(s: string, type: string): Blob {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type });
}

export function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}#/join/${code}`;
}
