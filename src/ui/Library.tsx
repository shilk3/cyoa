import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { Book, Progress } from '../book/types';
import { listBooks, deleteBook, getProgress, getSave, getPosition } from '../storage/db';
import { isEpub } from '../book/types';
import { useObjectUrl } from './hooks';
import { navigate, pickFiles } from './util';
import { ToolButton } from './icons';
import { ThemePicker } from './ThemePicker';
import { useThemePref } from './theme';

// Import/export code includes the ink compiler; load it only when needed.
const ops = () => import('../book/ops');
const ExportDialog = lazy(() => import('./ExportDialog').then((m) => ({ default: m.ExportDialog })));

interface Entry {
  book: Book;
  progress: Progress;
  started: boolean;
  percent: number | null; // e-books only
}

export function Library() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<Book | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [themePref] = useThemePref();
  const themeIcon = themePref === 'dark' ? 'moon' : themePref === 'light' ? 'sun' : 'system';

  const refresh = useCallback(async () => {
    const books = await listBooks();
    setEntries(
      await Promise.all(
        books.map(async (book) => {
          if (isEpub(book)) {
            const pos = await getPosition(book.id);
            return { book, progress: { bookId: book.id, endings: [] }, started: !!pos, percent: pos?.percent ?? null };
          }
          return { book, progress: await getProgress(book.id), started: !!(await getSave(book.id, 'auto')), percent: null };
        }),
      ),
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doImport = async (files: File[]) => {
    setError(null);
    for (const f of files) {
      try {
        await (await ops()).importFile(f);
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`);
      }
    }
    await refresh();
  };

  const onNew = async () => {
    const b = await (await ops()).createNewBook();
    navigate(`#/write/${encodeURIComponent(b.id)}`);
  };

  const onDelete = async (b: Book) => {
    if (!confirm(`Delete “${b.manifest.title}” and your reading progress? This can't be undone.`)) return;
    await deleteBook(b.id);
    await refresh();
  };

  return (
    <div
      className={`library ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void doImport(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="toolbar">
        <h1 className="brand">Inkbook</h1>
        <div className="toolbar-actions">
          <ToolButton icon="import" label="Import…" onClick={async () => doImport(await pickFiles('', true))} />
          <ToolButton icon={themeIcon} label="Theme" active={showTheme} onClick={() => setShowTheme(!showTheme)} />
          <ToolButton icon="plus" label="New book" primary onClick={onNew} />
        </div>
      </header>
      {showTheme && (
        <aside className="panel">
          <ThemePicker />
        </aside>
      )}

      <main className="shelf-wrap">
        {error && <p className="error-box">{error}</p>}
        {entries === null ? (
          <p className="loading">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <h2>Your library is empty</h2>
            <p>Import an e-book (<code>.epub</code>), an ink book (<code>.inkbook</code> or <code>.ink</code>), or drop one here. Or start writing your own.</p>
            <button className="btn primary" onClick={onNew}>Write a new book</button>
          </div>
        ) : (
          <ul className="shelf">
            {entries.map((e) => (
              <BookCard key={e.book.id} entry={e} onExport={() => setExporting(e.book)} onDelete={() => onDelete(e.book)} />
            ))}
          </ul>
        )}
      </main>
      {exporting && (
        <Suspense fallback={null}>
          <ExportDialog book={exporting} onClose={() => setExporting(null)} />
        </Suspense>
      )}
    </div>
  );
}

function BookCard({ entry, onExport, onDelete }: { entry: Entry; onExport: () => void; onDelete: () => void }) {
  const { book, progress, started, percent } = entry;
  const readable = isEpub(book) || !!book.storyJson;
  const cover = useObjectUrl(book.cover);
  const id = encodeURIComponent(book.id);
  const m = book.manifest;
  return (
    <li className="card">
      <button className="cover" onClick={() => navigate(`#/read/${id}`)} aria-label={`Read ${m.title}`}>
        {cover ? (
          <img src={cover} alt="" />
        ) : (
          <span className="cover-generated" style={{ ['--hue' as string]: hueFor(book.id) }}>
            <span className="cover-title">{m.title}</span>
            {m.author && <span className="cover-author">{m.author}</span>}
          </span>
        )}
      </button>
      <div className="card-body">
        <h3>{m.title}</h3>
        {m.author && <p className="muted small">{m.author}</p>}
        <p className="muted small">
          {isEpub(book)
            ? started
              ? percent !== null
                ? `${Math.round(percent * 100)}% read`
                : 'In progress'
              : 'E-book · not started'
            : !book.storyJson
              ? 'Draft: has errors'
              : started
                ? 'In progress'
                : 'Not started'}
          {progress.endings.length > 0 && ` · ${progress.endings.length} ending${progress.endings.length === 1 ? '' : 's'} found`}
        </p>
        <div className="card-actions">
          <button className="btn small primary" onClick={() => navigate(`#/read/${id}`)} disabled={!readable}>
            {started ? 'Continue' : 'Read'}
          </button>
          {book.source != null && <button className="btn small" onClick={() => navigate(`#/write/${id}`)}>Edit</button>}
          <button className="btn small" onClick={onExport}>Export</button>
          <button className="btn small ghost danger" onClick={onDelete} aria-label={`Delete ${m.title}`}>Delete</button>
        </div>
      </div>
    </li>
  );
}

function hueFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
