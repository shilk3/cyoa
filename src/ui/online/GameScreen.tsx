import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnlineGame } from '../../book/types';
import { ApiError, call, inviteLink, type GameState } from '../../online/api';
import { deleteGame, getBook, getGame, putGame } from '../../storage/db';
import type { Asset } from '../../book/types';
import { ReaderSession } from '../../ink/session';
import { nameVars, seatingFor, whoChooses, type Turn } from '../../ink/multiplayer';
import { StoryView } from '../StoryView';
import { LibraryButton } from '../LibraryButton';
import { ToolButton } from '../icons';
import { DropPanel } from '../DropPanel';
import { ThemePicker } from '../ThemePicker';
import { LayoutPicker } from '../LayoutPicker';
import { layoutStyle, useLayoutPrefs } from '../layoutPrefs';
import { useAssetUrls, useStoredNumber } from '../hooks';
import { navigate } from '../util';

/** How often to check for other players' moves (only while the app is on screen). */
const POLL_WAITING_MS = 3000;
const POLL_MY_TURN_MS = 15000;

export function GameScreen({ code }: { code: string }) {
  const [game, setGame] = useState<OnlineGame | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'players' | 'display'>('none');
  const [textSize, setTextSize] = useStoredNumber('inkbook:ink-text-size', 100);
  const [layout] = useLayoutPrefs();
  const sessionRef = useRef<ReaderSession | null>(null);
  const appliedRef = useRef<string>(''); // which moves the session has replayed
  const wasMyTurnRef = useRef<boolean | null>(null);
  const gameRef = useRef<OnlineGame | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const assetUrls = useAssetUrls(assets);

  /** Brings the local copy up to date with a state from the server and replays any new choices. */
  const apply = useCallback(async (st: GameState) => {
    const g = gameRef.current;
    if (!g) return;
    const next: OnlineGame = { ...g, state: st, updated: new Date().toISOString() };
    gameRef.current = next;
    setGame(next);
    await putGame(next);
  }, []);

  const refresh = useCallback(async () => {
    const g = gameRef.current;
    if (!g) return;
    try {
      await apply(await call<GameState>('state', { code: g.code, token: g.token }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    getGame(code).then((g) => {
      if (cancelled) return;
      gameRef.current = g ?? null;
      setGame(g ?? null);
      if (g) {
        void refresh();
        // Pictures come from the library copy of the book, when this device has one.
        void getBook(g.bookId).then((b) => !cancelled && b && setAssets(b.assets));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, refresh]);

  const st = game?.state ?? null;

  // Replay the story whenever the list of choices (or the game's setup) changes.
  if (game && st && st.game.status !== 'lobby') {
    const key = `${st.game.seed}|${st.game.names.join('\u0001')}|${st.moves.map((m) => m.choice).join(',')}`;
    if (appliedRef.current !== key) {
      const s = new ReaderSession(game.storyJson, (e) => e.configure({ seed: st.game.seed, vars: nameVars(st.game.names) }));
      try {
        s.replay(st.moves.map((m) => m.choice));
      } catch (e) {
        console.error(e);
      }
      sessionRef.current = s;
      appliedRef.current = key;
    }
  }
  const s = st && st.game.status !== 'lobby' ? sessionRef.current : null;
  const me = st ? st.game.players.findIndex((p) => p.id === game?.playerId) : -1;
  const turn: Turn | null =
    s && st && !s.ended ? whoChooses(seatingFor(st.game.players, st.game.names.length), s.chooser, st.game.seed, s.turn) : null;
  const myTurn = !!turn && (turn.person === 'anyone' || turn.person === me);

  // Tell the player when it becomes their turn.
  useEffect(() => {
    if (!st || st.game.status !== 'playing') return;
    const prev = wasMyTurnRef.current;
    wasMyTurnRef.current = myTurn;
    if (prev === false && myTurn) {
      setToast('Your turn!');
      navigator.vibrate?.(200);
      setTimeout(() => setToast(null), 4000);
    }
    document.title = myTurn ? `● Your turn · ${st.game.title}` : st.game.title;
    return () => {
      document.title = 'Pagefork';
    };
  }, [myTurn, st]);

  // Check for other players' moves while the app is visible.
  const delay = !st || st.game.status === 'ended' ? null : st.game.status === 'lobby' || !myTurn ? POLL_WAITING_MS : POLL_MY_TURN_MS;
  useEffect(() => {
    if (delay == null) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const id = setInterval(tick, delay);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [delay, refresh]);

  const act = async (op: string, body: Record<string, unknown>) => {
    const g = gameRef.current;
    if (!g) return;
    setBusy(true);
    setError(null);
    try {
      await apply(await call<GameState>(op, { code: g.code, token: g.token, ...body }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await refresh();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choose = (index: number) => {
    if (!s || !myTurn || busy) return;
    void act('move', { seq: s.turn, choice: index });
  };

  if (game === undefined) return <div className="loading">Loading…</div>;
  if (game === null) {
    return (
      <div className="empty-state">
        <p>This game isn't on this device yet.</p>
        <button className="btn primary" onClick={() => navigate(`#/join/${code}`)}>Join with code {code}</button>
        <button className="btn" onClick={() => navigate('#/')}>Back to library</button>
      </div>
    );
  }

  const roleName = (r: number) => st?.game.names[r - 1] ?? `Player ${r}`;
  const personName = (i: number) => st?.game.players[i]?.name ?? 'someone';
  const isHost = st?.game.host === game.playerId;

  const players = st && (
    <div className="online-players">
      <p className="muted small">Game code</p>
      <p className="game-code">{game.code}</p>
      <ul className="seat-list">
        {st.game.names.map((n, i) => {
          const owner = st.game.players.find((p) => p.roles.includes(i + 1));
          return (
            <li key={i}>
              <strong>{n}</strong> <span className="muted">{owner ? `played by ${owner.id === game.playerId ? 'you' : owner.name}` : 'shared (random each time)'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="reader">
      <div className="top-bar">
        <header className="toolbar">
          <LibraryButton />
          <h1 className="toolbar-title">{game.title}</h1>
          <div className="toolbar-actions">
            <ToolButton icon="users" label="Players" active={panel === 'players'} onClick={() => setPanel(panel === 'players' ? 'none' : 'players')} />
            <ToolButton icon="display" label="Display" active={panel === 'display'} onClick={() => setPanel(panel === 'display' ? 'none' : 'display')} />
          </div>
        </header>
        {panel === 'players' && (
          <DropPanel onClose={() => setPanel('none')}>
            {players}
            <button className="btn small" onClick={() => shareInvite(game.code, game.title)}>Share invite</button>
            <button
              className="btn small ghost danger"
              onClick={async () => {
                if (!confirm('Remove this game from this device? You can rejoin with the code while it is in the lobby, but not once it has started.')) return;
                await deleteGame(game.code);
                navigate('#/');
              }}
            >
              Remove from this device
            </button>
          </DropPanel>
        )}
        {panel === 'display' && (
          <DropPanel onClose={() => setPanel('none')}>
            <ThemePicker />
            <LayoutPicker />
            <div className="setting-row">
              <span>Text size</span>
              <button className="btn" onClick={() => setTextSize(textSize - 10)} disabled={textSize <= 70} aria-label="Smaller text">A−</button>
              <span className="muted small">{textSize}%</span>
              <button className="btn" onClick={() => setTextSize(textSize + 10)} disabled={textSize >= 200} aria-label="Larger text">A+</button>
            </div>
          </DropPanel>
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <main className="page" style={{ ['--story-scale' as string]: textSize / 100, ...layoutStyle(layout) }}>
        {!st ? (
          <p className="loading">{error ?? 'Connecting to the game…'}</p>
        ) : st.game.status === 'lobby' ? (
          <Lobby
            st={st}
            playerId={game.playerId}
            isHost={isHost}
            busy={busy}
            onClaim={(roles) => act('claim', { roles })}
            onStart={() => act('start', {})}
            onShare={() => shareInvite(game.code, game.title)}
          />
        ) : (
          s && (
            <StoryView
              transcript={s.transcript}
              choices={s.choices}
              ended={s.ended}
              ending={s.ending}
              assetUrls={assetUrls}
              onChoose={choose}
              choicesDisabled={!myTurn || busy}
              choicesHeader={
                turn && (
                  <div className={`turn-banner ${myTurn ? 'mine' : ''}`} aria-live="polite">
                    {turn.person === 'anyone' ? (
                      <>
                        <strong>Anyone</strong>
                        <span>can make this choice — first to pick wins</span>
                      </>
                    ) : myTurn && busy ? (
                      <>
                        <strong>Sending your choice…</strong>
                        <span>the others will see it in a moment</span>
                      </>
                    ) : myTurn ? (
                      <>
                        <strong>Your turn</strong>
                        <span>
                          choose for {turn.role ? roleName(turn.role) : 'everyone'}
                          {turn.random && <em> (shared character, picked at random)</em>}
                        </span>
                      </>
                    ) : (
                      <>
                        <strong>Waiting for {personName(turn.person as number)}</strong>
                        <span>
                          to choose for {turn.role ? roleName(turn.role) : 'everyone'}
                          {turn.random && <em> (shared character, picked at random)</em>}
                        </span>
                      </>
                    )}
                  </div>
                )
              }
            />
          )
        )}
        {error && st && <p className="error-box">{error}</p>}
      </main>
    </div>
  );
}

function Lobby({
  st,
  playerId,
  isHost,
  busy,
  onClaim,
  onStart,
  onShare,
}: {
  st: GameState;
  playerId: string;
  isHost: boolean;
  busy: boolean;
  onClaim: (roles: number[]) => void;
  onStart: () => void;
  onShare: () => void;
}) {
  const g = st.game;
  const mine = g.players.find((p) => p.id === playerId)?.roles ?? [];
  const host = g.players.find((p) => p.id === g.host);
  return (
    <div className="lobby">
      <h2>{g.title}</h2>
      <p className="muted">Invite friends with this code or link. Friends open the link in their browser; no install needed.</p>
      <div className="code-box">
        <span className="game-code">{g.code}</span>
        <button className="btn primary" onClick={onShare}>Share invite</button>
      </div>

      <h3>Players ({g.players.length} of up to {g.names.length})</h3>
      <ul className="seat-list">
        {g.players.map((p) => (
          <li key={p.id}>
            <strong>{p.id === playerId ? `${p.name} (you)` : p.name}</strong>
            {p.id === g.host && <span className="muted small"> · host</span>}
          </li>
        ))}
      </ul>

      <h3>Characters</h3>
      <p className="muted small">Tap to play or release a character. Characters nobody plays are shared: each of their choices goes to a random player.</p>
      <ul className="role-list">
        {g.names.map((n, i) => {
          const role = i + 1;
          const owner = g.players.find((p) => p.roles.includes(role));
          const isMine = owner?.id === playerId;
          return (
            <li key={role}>
              <button
                className={`role ${isMine ? 'mine' : ''}`}
                disabled={busy || (!!owner && !isMine)}
                onClick={() => onClaim(isMine ? mine.filter((r) => r !== role) : [...mine, role])}
              >
                <strong>{n}</strong>
                <span>{owner ? (isMine ? 'You' : owner.name) : 'Shared (random)'}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {isHost ? (
        <button className="btn primary big" disabled={busy} onClick={onStart}>Start the story</button>
      ) : (
        <p className="notice">Waiting for {host?.name ?? 'the host'} to start the story…</p>
      )}
    </div>
  );
}

async function shareInvite(code: string, title: string) {
  const url = inviteLink(code);
  const text = `Join my Pagefork game "${title}". Game code: ${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: `Pagefork: ${title}`, text, url });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    alert('Invite link copied.');
  } catch {
    prompt('Copy this invite link:', url);
  }
}
