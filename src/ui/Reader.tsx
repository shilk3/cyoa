import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { isEpub, type Book, type PartyConfig, type SaveGame } from '../book/types';
import { ReaderSession } from '../ink/session';
import { StoryEngine } from '../ink/engine';
import { nameVars, newSeed, partyInfo, whoChooses, type PartyInfo } from '../ink/multiplayer';
import { PartySetup, type PartyChoice } from './PartySetup';
import { getBook, getSave, listSaves, putSave, deleteSave, recordEnding } from '../storage/db';
import { useAssetUrls } from './hooks';
import { StoryView } from './StoryView';
import { navigate } from './util';
import { LibraryButton } from './LibraryButton';
import { ToolButton } from './icons';
import { DropPanel } from './DropPanel';
import { ThemePicker } from './ThemePicker';
import { layoutStyle, useLayoutPrefs } from './layoutPrefs';
import { LayoutPicker } from './LayoutPicker';
import { useStoredNumber } from './hooks';

const AUTO = 'auto';
const PARTY = 'party';

// epub.js is only needed for standard e-books.
const EpubReader = lazy(() => import('./EpubReader').then((m) => ({ default: m.EpubReader })));

/**
 * Reads an ink book. In `party` mode several people share one device (pass-and-play): the book's
 * characters are assigned to them, and each choice says whose turn it is.
 */
export function Reader({ bookId, mode = 'solo' }: { bookId: string; mode?: 'solo' | 'party' }) {
  const slot = mode === 'party' ? PARTY : AUTO;
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const sessionRef = useRef<ReaderSession | null>(null);
  const partyRef = useRef<PartyConfig | null>(null);
  const [info, setInfo] = useState<PartyInfo | null>(null);
  const [setup, setSetup] = useState<'none' | 'new' | 'edit'>('none');
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'bookmarks' | 'stats' | 'display'>('none');
  const togglePanel = (p: typeof panel) => setPanel(panel === p ? 'none' : p);
  const [textSize, setTextSize] = useStoredNumber('inkbook:ink-text-size', 100);
  const [layout] = useLayoutPrefs();
  const [bookmarks, setBookmarks] = useState<SaveGame[]>([]);
  const assetUrls = useAssetUrls(book?.assets);
  const rerender = () => setTick((t) => t + 1);

  const persist = useCallback(
    async (slot: string) => {
      const s = sessionRef.current;
      if (!s || !book) return;
      const snap = s.snapshot();
      await putSave({
        bookId: book.id,
        slot,
        storyRevision: book.manifest.storyRevision,
        inkState: snap.inkState,
        transcript: snap.transcript,
        undo: slot === AUTO || slot === PARTY ? snap.undo : [],
        updated: new Date().toISOString(),
        party: slot === PARTY ? (partyRef.current ?? undefined) : undefined,
      });
    },
    [book],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await getBook(bookId);
      if (cancelled) return;
      setBook(b ?? null);
      if (!b?.storyJson) return;
      const engine = new StoryEngine(b.storyJson);
      setInfo(partyInfo(engine.globalTags, engine.variables));
      const s = makeSession(b.storyJson);
      const auto = await getSave(b.id, slot);
      if (mode === 'party') {
        if (!auto?.party) {
          setSetup('new');
          return;
        }
        partyRef.current = auto.party;
      }
      sessionRef.current = s;
      let restored = false;
      if (auto) {
        try {
          s.restore({ inkState: auto.inkState, transcript: auto.transcript, undo: auto.undo });
          restored = true;
          if (auto.storyRevision !== b.manifest.storyRevision) {
            setNotice('This book has changed since you last read it. If things look odd, restart.');
          }
        } catch {
          setNotice('Your saved place no longer fits this version of the book, so it starts from the beginning.');
        }
      }
      try {
        if (!restored) s.start();
      } catch (e) {
        setError((e as Error).message);
      }
      setBookmarks((await listSaves(b.id)).filter((x) => x.slot.startsWith('bm:')));
      rerender();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, mode]);

  /** A session that applies the party's seed and character names each time it starts. */
  function makeSession(storyJson: string) {
    return new ReaderSession(storyJson, (e) => {
      const p = partyRef.current;
      if (p) e.configure({ seed: p.seed, vars: nameVars(p.names) });
    });
  }

  const startParty = async (c: PartyChoice) => {
    if (!book?.storyJson) return;
    if (setup === 'edit' && partyRef.current) {
      // Changing who plays whom mid-game; the story so far stays as it is.
      partyRef.current = { ...partyRef.current, people: c.seating.people, owners: c.seating.owners };
      setSetup('none');
      await persist(PARTY);
      rerender();
      return;
    }
    partyRef.current = { names: c.names, people: c.seating.people, owners: c.seating.owners, seed: newSeed() };
    const s = makeSession(book.storyJson);
    sessionRef.current = s;
    try {
      s.start();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setSetup('none');
    await persist(PARTY);
    rerender();
  };

  const s = sessionRef.current;

  const afterMove = async () => {
    rerender();
    await persist(slot);
    const ending = sessionRef.current?.ending;
    if (ending && book) await recordEnding(book.id, ending);
  };

  const choose = (i: number) => {
    try {
      s?.choose(i);
      setError(null);
    } catch (e) {
      setError(`The story hit an error: ${(e as Error).message}`);
    }
    void afterMove();
  };

  const undo = () => {
    s?.undo();
    setError(null);
    void afterMove();
  };

  const restart = () => {
    if (!s) return;
    if (s.transcript.some((e) => e.kind === 'choice') && !s.ended && !confirm('Start again from the beginning?')) return;
    // A fresh game gets fresh random events.
    if (partyRef.current) partyRef.current = { ...partyRef.current, seed: newSeed() };
    try {
      s.start();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setNotice(null);
    void afterMove();
  };

  const addBookmark = async () => {
    const name = prompt('Name this bookmark', `Bookmark ${bookmarks.length + 1}`);
    if (!name || !book) return;
    await persist(`bm:${name}`);
    setBookmarks((await listSaves(book.id)).filter((x) => x.slot.startsWith('bm:')));
  };

  const loadBookmark = (bm: SaveGame) => {
    if (!s) return;
    try {
      s.restore({ inkState: bm.inkState, transcript: bm.transcript, undo: [] });
      setPanel('none');
      setError(null);
      void afterMove();
    } catch {
      setError('That bookmark no longer fits this version of the book.');
    }
  };

  const removeBookmark = async (bm: SaveGame) => {
    if (!book) return;
    await deleteSave(book.id, bm.slot);
    setBookmarks((await listSaves(book.id)).filter((x) => x.slot.startsWith('bm:')));
  };

  if (book === undefined) return <div className="loading">Loading…</div>;
  if (book === null) {
    return (
      <div className="empty-state">
        <p>That book isn't in your library.</p>
        <button className="btn" onClick={() => navigate('#/')}>Back to library</button>
      </div>
    );
  }

  if (isEpub(book)) {
    return (
      <Suspense fallback={<div className="loading">Opening book…</div>}>
        <EpubReader book={book} />
      </Suspense>
    );
  }

  if (setup !== 'none' && info) {
    const p = partyRef.current;
    return (
      <div className="reader">
        <div className="top-bar">
          <header className="toolbar">
            <LibraryButton />
            <h1 className="toolbar-title">{book.manifest.title}</h1>
          </header>
        </div>
        <main className="page">
          <PartySetup
            info={info}
            title={setup === 'new' ? 'Play together on this device' : 'Players'}
            initial={p ? { names: p.names, seating: { people: p.people, owners: p.owners } } : undefined}
            lockNames={setup === 'edit'}
            startLabel={setup === 'new' ? 'Start the story' : 'Save'}
            onStart={startParty}
            onCancel={() => (setup === 'edit' ? setSetup('none') : navigate('#/'))}
          />
        </main>
      </div>
    );
  }

  const turnHeader = s && info ? <TurnBanner session={s} info={info} party={mode === 'party' ? partyRef.current : null} /> : null;

  return (
    <div className="reader">
      <div className="top-bar">
        <header className="toolbar">
          <LibraryButton />
          <h1 className="toolbar-title">{book.manifest.title}</h1>
          <div className="toolbar-actions">
            <ToolButton icon="undo" label="Back" onClick={undo} disabled={!s?.canUndo} />
            <ToolButton icon="restart" label="Restart" onClick={restart} disabled={!s} />
            {mode === 'party' ? (
              <ToolButton icon="users" label="Players" onClick={() => setSetup('edit')} />
            ) : (
              <ToolButton icon="bookmark" label="Bookmarks" active={panel === 'bookmarks'} onClick={() => togglePanel('bookmarks')} />
            )}
            <ToolButton icon="stats" label="Stats" active={panel === 'stats'} onClick={() => togglePanel('stats')} />
            <ToolButton icon="display" label="Display" active={panel === 'display'} onClick={() => togglePanel('display')} />
            {book.source != null && <ToolButton icon="edit" label="Edit" onClick={() => navigate(`#/write/${encodeURIComponent(book.id)}`)} />}
          </div>
        </header>

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

        {panel === 'bookmarks' && (
          <DropPanel onClose={() => setPanel('none')}>
            <button className="btn primary" onClick={addBookmark} disabled={!s}>Bookmark this page</button>
            {bookmarks.length === 0 ? (
              <p className="muted">No bookmarks yet. Bookmark a page before a big decision so you can come back to it.</p>
            ) : (
              <ul className="bookmark-list">
                {bookmarks.map((bm) => (
                  <li key={bm.slot}>
                    <button className="link" onClick={() => loadBookmark(bm)}>{bm.slot.replace(/^bm:/, '')}</button>
                    <span className="muted small">{new Date(bm.updated).toLocaleString()}</span>
                    <button className="btn ghost small" onClick={() => removeBookmark(bm)} aria-label="Delete bookmark">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </DropPanel>
        )}

        {panel === 'stats' && s && (
          <DropPanel onClose={() => setPanel('none')}>
            <VariablesTable vars={s.engine.variables} />
          </DropPanel>
        )}
      </div>

      <main className="page" style={{ ['--story-scale' as string]: textSize / 100, ...layoutStyle(layout) }}>
        {!book.storyJson ? (
          <div className="empty-state">
            <p>This book doesn't compile yet, so there's nothing to read.</p>
            <button className="btn primary" onClick={() => navigate(`#/write/${encodeURIComponent(book.id)}`)}>Open in writer</button>
          </div>
        ) : (
          <>
            <p className="page-title">{book.manifest.title}</p>
            {notice && <p className="notice">{notice}</p>}
            {s && (
              <StoryView
                transcript={s.transcript}
                choices={s.choices}
                ended={s.ended && !error}
                ending={s.ending}
                assetUrls={assetUrls}
                onChoose={choose}
                onRestart={restart}
                choicesHeader={turnHeader}
              />
            )}
            {error && (
              <div className="error-box">
                <p>{error}</p>
                {s?.canUndo && <button className="btn" onClick={undo}>Go back</button>}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Whose choice it is. Solo readers of a multiplayer book just see which character is choosing. */
function TurnBanner({ session, info, party }: { session: ReaderSession; info: PartyInfo; party: PartyConfig | null }) {
  if (info.players <= 1 && !party) return null;
  const names = party?.names ?? info.names;
  const roleName = (r: number) => names[r - 1] ?? `Player ${r}`;
  const chooser = session.chooser;
  if (!party || party.people.length <= 1) {
    return <p className="turn-banner small-banner">{chooser === 'any' ? 'Anyone’s choice' : `${roleName(chooser)}’s choice`}</p>;
  }
  const turn = whoChooses({ people: party.people, owners: party.owners }, chooser, party.seed, session.turn);
  if (turn.person === 'anyone') {
    return (
      <div className="turn-banner" aria-live="polite">
        <strong>Anyone</strong>
        <span>can make this choice</span>
      </div>
    );
  }
  return (
    <div className="turn-banner" aria-live="polite">
      <strong>{party.people[turn.person]}</strong>
      <span>
        choose for {turn.role ? roleName(turn.role) : 'everyone'}
        {turn.random && <em> (shared character, picked at random)</em>}
      </span>
    </div>
  );
}

export function VariablesTable({ vars }: { vars: Record<string, unknown> }) {
  const entries = Object.entries(vars);
  if (!entries.length) return <p className="muted">This story doesn't track any variables.</p>;
  return (
    <table className="vars">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>{formatValue(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return String(v.toString?.() ?? JSON.stringify(v));
  return String(v);
}
