import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, SaveGame } from '../book/types';
import { ReaderSession } from '../ink/session';
import { getBook, getSave, listSaves, putSave, deleteSave, recordEnding } from '../storage/db';
import { useAssetUrls } from './hooks';
import { StoryView } from './StoryView';
import { navigate } from './util';

const AUTO = 'auto';

export function Reader({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const sessionRef = useRef<ReaderSession | null>(null);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'bookmarks' | 'stats'>('none');
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
        undo: slot === AUTO ? snap.undo : [],
        updated: new Date().toISOString(),
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
      const s = new ReaderSession(b.storyJson);
      sessionRef.current = s;
      const auto = await getSave(b.id, AUTO);
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
      setBookmarks((await listSaves(b.id)).filter((x) => x.slot !== AUTO));
      rerender();
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const s = sessionRef.current;

  const afterMove = async () => {
    rerender();
    await persist(AUTO);
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
    setBookmarks((await listSaves(book.id)).filter((x) => x.slot !== AUTO));
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
    setBookmarks((await listSaves(book.id)).filter((x) => x.slot !== AUTO));
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

  return (
    <div className="reader">
      <header className="toolbar">
        <button className="btn ghost" onClick={() => navigate('#/')} aria-label="Back to library">← Library</button>
        <h1 className="toolbar-title">{book.manifest.title}</h1>
        <div className="toolbar-actions">
          <button className="btn" onClick={undo} disabled={!s?.canUndo} title="Undo the last choice">Back</button>
          <button className="btn" onClick={restart} disabled={!s}>Restart</button>
          <button className={`btn ${panel === 'bookmarks' ? 'active' : ''}`} onClick={() => setPanel(panel === 'bookmarks' ? 'none' : 'bookmarks')}>
            Bookmarks
          </button>
          <button className={`btn ${panel === 'stats' ? 'active' : ''}`} onClick={() => setPanel(panel === 'stats' ? 'none' : 'stats')}>
            Stats
          </button>
          {book.source != null && (
            <button className="btn" onClick={() => navigate(`#/write/${encodeURIComponent(book.id)}`)}>Edit</button>
          )}
        </div>
      </header>

      {panel === 'bookmarks' && (
        <aside className="panel">
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
        </aside>
      )}

      {panel === 'stats' && s && (
        <aside className="panel">
          <VariablesTable vars={s.engine.variables} />
        </aside>
      )}

      <main className="page">
        {!book.storyJson ? (
          <div className="empty-state">
            <p>This book doesn't compile yet, so there's nothing to read.</p>
            <button className="btn primary" onClick={() => navigate(`#/write/${encodeURIComponent(book.id)}`)}>Open in writer</button>
          </div>
        ) : (
          <>
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
