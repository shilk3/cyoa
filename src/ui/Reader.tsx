import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { isEpub, type Book, type SaveGame } from '../book/types';
import { ReaderSession } from '../ink/session';
import { getBook, getSave, listSaves, putSave, deleteSave, recordEnding } from '../storage/db';
import { useAssetUrls } from './hooks';
import { StoryView } from './StoryView';
import { navigate } from './util';
import { LibraryButton } from './LibraryButton';
import { ToolButton } from './icons';
import { ThemePicker } from './ThemePicker';
import { useStoredNumber } from './hooks';

const AUTO = 'auto';

// epub.js is only needed for standard e-books.
const EpubReader = lazy(() => import('./EpubReader').then((m) => ({ default: m.EpubReader })));

export function Reader({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const sessionRef = useRef<ReaderSession | null>(null);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'bookmarks' | 'stats' | 'display'>('none');
  const togglePanel = (p: typeof panel) => setPanel(panel === p ? 'none' : p);
  const [textSize, setTextSize] = useStoredNumber('inkbook:ink-text-size', 100);
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

  if (isEpub(book)) {
    return (
      <Suspense fallback={<div className="loading">Opening book…</div>}>
        <EpubReader book={book} />
      </Suspense>
    );
  }

  return (
    <div className="reader">
      <header className="toolbar">
        <LibraryButton />
        <h1 className="toolbar-title">{book.manifest.title}</h1>
        <div className="toolbar-actions">
          <ToolButton icon="undo" label="Back" onClick={undo} disabled={!s?.canUndo} />
          <ToolButton icon="restart" label="Restart" onClick={restart} disabled={!s} />
          <ToolButton icon="bookmark" label="Bookmarks" active={panel === 'bookmarks'} onClick={() => togglePanel('bookmarks')} />
          <ToolButton icon="stats" label="Stats" active={panel === 'stats'} onClick={() => togglePanel('stats')} />
          <ToolButton icon="display" label="Display" active={panel === 'display'} onClick={() => togglePanel('display')} />
          {book.source != null && <ToolButton icon="edit" label="Edit" onClick={() => navigate(`#/write/${encodeURIComponent(book.id)}`)} />}
        </div>
      </header>

      {panel === 'display' && (
        <aside className="panel">
          <ThemePicker />
          <div className="setting-row">
            <span>Text size</span>
            <button className="btn" onClick={() => setTextSize(textSize - 10)} disabled={textSize <= 70} aria-label="Smaller text">A−</button>
            <span className="muted small">{textSize}%</span>
            <button className="btn" onClick={() => setTextSize(textSize + 10)} disabled={textSize >= 200} aria-label="Larger text">A+</button>
          </div>
        </aside>
      )}

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

      <main className="page" style={{ ['--story-scale' as string]: textSize / 100 }}>
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
