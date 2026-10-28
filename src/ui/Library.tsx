import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Book, Progress } from '../book/types';
import { listBooks, deleteBook, getProgress, getSave, getPosition, putBook } from '../storage/db';
import { isEpub } from '../book/types';
import { useObjectUrl } from './hooks';
import { navigate, pickFiles } from './util';
import { ToolButton } from './icons';
import { DropPanel } from './DropPanel';
import { ThemePicker } from './ThemePicker';
import { useThemePref } from './theme';
import { Icon, type IconName } from './icons';
import { isUnlocked, lockAvailable, lockIsSetUp, onLockChange, setUpLock, unlockBook, verifyUser, LockError } from '../security/faceLock';

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
  const [canLock, setCanLock] = useState(false);
  const [, setLockTick] = useState(0);
  useEffect(() => {
    void lockAvailable().then(setCanLock);
    return onLockChange(() => setLockTick((t) => t + 1));
  }, []);

  /** Runs `fn` after Face ID when the book is locked and not yet open in this session. */
  const guarded = (b: Book, fn: () => void | Promise<void>) => async () => {
    setError(null);
    try {
      if (b.locked && !isUnlocked(b.id)) await unlockBook(b.id);
      await fn();
    } catch (e) {
      setError(e instanceof LockError ? e.message : (e as Error).message);
    }
  };

  const toggleLock = (b: Book) => async () => {
    setError(null);
    try {
      if (b.locked) {
        await verifyUser();
      } else if (!lockIsSetUp()) {
        await setUpLock();
      }
      await putBook({ ...b, locked: !b.locked });
      await refresh();
    } catch (e) {
      setError(e instanceof LockError ? e.message : (e as Error).message);
    }
  };
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
      <div className="top-bar">
        <header className="toolbar">
          <h1 className="brand">Inkbook</h1>
          <div className="toolbar-actions">
            <ToolButton icon="import" label="Import…" onClick={async () => doImport(await pickFiles('', true))} />
            <ToolButton icon={themeIcon} label="Theme" active={showTheme} onClick={() => setShowTheme(!showTheme)} />
            <ToolButton icon="plus" label="New book" primary onClick={onNew} />
          </div>
        </header>
        {showTheme && (
          <DropPanel onClose={() => setShowTheme(false)}>
            <ThemePicker />
          </DropPanel>
        )}
      </div>

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
              <BookCard
                key={e.book.id}
                entry={e}
                canLock={canLock}
                guarded={(fn) => guarded(e.book, fn)}
                onToggleLock={toggleLock(e.book)}
                onExport={() => setExporting(e.book)}
                onDelete={() => onDelete(e.book)}
              />
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

interface CardProps {
  entry: Entry;
  canLock: boolean;
  guarded: (fn: () => void | Promise<void>) => () => Promise<void>;
  onToggleLock: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function BookCard({ entry, canLock, guarded, onToggleLock, onExport, onDelete }: CardProps) {
  const { book, progress, started, percent } = entry;
  const readable = isEpub(book) || !!book.storyJson;
  const cover = useObjectUrl(book.cover);
  const id = encodeURIComponent(book.id);
  const m = book.manifest;
  const read = guarded(() => navigate(`#/read/${id}`));

  // Locked and not opened since the app was last in the background: show nothing about the book.
  if (book.locked && !isUnlocked(book.id)) {
    return (
      <li className="card">
        <button className="cover" onClick={read} aria-label="Open locked book with Face ID">
          <span className="cover-locked">
            <Icon name="lock" />
            <span>Locked</span>
          </span>
        </button>
        <div className="card-body">
          <h3>Locked book</h3>
          <p className="muted small">Open with Face ID</p>
          <div className="card-actions">
            <button className="btn small primary" onClick={read} disabled={!readable}>Open</button>
            <CardMenu label="More actions for locked book">
              <MenuItem icon="trash" danger onClick={guarded(onDelete)} label="Delete locked book">Delete</MenuItem>
            </CardMenu>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="card">
      <button className="cover" onClick={read} aria-label={`Read ${m.title}`}>
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
          <button className="btn small primary" onClick={read} disabled={!readable}>
            {started ? 'Continue' : 'Read'}
          </button>
          <CardMenu label={`More actions for ${m.title}`}>
            {book.source != null && <MenuItem icon="edit" onClick={() => navigate(`#/write/${id}`)}>Edit</MenuItem>}
            <MenuItem icon="export" onClick={onExport}>Export</MenuItem>
            {canLock && (
              <MenuItem
                icon={book.locked ? 'unlock' : 'lock'}
                onClick={onToggleLock}
                label={book.locked ? `Remove Face ID lock from ${m.title}` : `Lock ${m.title} with Face ID`}
              >
                {book.locked ? 'Remove lock' : 'Lock with Face ID'}
              </MenuItem>
            )}
            <MenuItem icon="trash" danger onClick={onDelete} label={`Delete ${m.title}`}>Delete</MenuItem>
          </CardMenu>
        </div>
      </div>
    </li>
  );
}

/** "⋯" button that opens a small menu of less-used actions. Tapping an item or outside closes it. */
function CardMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-menu">
      <button className="btn small card-more" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="more" />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu" onClick={() => setOpen(false)}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, onClick, label, danger, children }: { icon: IconName; onClick: () => void; label?: string; danger?: boolean; children: ReactNode }) {
  return (
    <button role="menuitem" className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick} aria-label={label}>
      <Icon name={icon} />
      {children}
    </button>
  );
}

function hueFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
