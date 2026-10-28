import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Book } from '../book/types';
import type { CompileIssue } from '../ink/compile';
import { applySource } from '../book/ops';
import { mimeFor } from '../book/inkbook';
import { getBook, putBook } from '../storage/db';
import { ReaderSession } from '../ink/session';
import { useAssetUrls, useObjectUrl } from './hooks';
import { InkEditor, type InkEditorHandle } from './InkEditor';
import { StoryView } from './StoryView';
import { VariablesTable } from './Reader';
import { ExportDialog } from './ExportDialog';
import { InkHelp } from './InkHelp';
import { navigate, pickFiles } from './util';
import { LibraryButton } from './LibraryButton';
import { ToolButton } from './icons';

type Tab = 'preview' | 'problems' | 'outline' | 'details' | 'help';
type SaveStatus = 'saved' | 'saving' | 'unsaved';

const COMPILE_DELAY_MS = 500;

export function Writer({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [issues, setIssues] = useState<CompileIssue[]>([]);
  const [compiledOk, setCompiledOk] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [tab, setTab] = useState<Tab>('preview');
  const [mobilePane, setMobilePane] = useState<'editor' | 'side'>('editor');
  const [exporting, setExporting] = useState(false);
  const editorRef = useRef<InkEditorHandle>(null);
  const bookRef = useRef<Book | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pendingSource = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBook(bookId).then((b) => {
      if (cancelled) return;
      bookRef.current = b ?? null;
      setBook(b ?? null);
      if (b?.source != null) {
        const { result } = applySource(b, b.source);
        setIssues(result.issues);
        setCompiledOk(result.ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const save = useCallback(async (next: Book) => {
    bookRef.current = next;
    setBook(next);
    setStatus('saving');
    await putBook(next);
    setStatus(pendingSource.current === null ? 'saved' : 'unsaved');
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const src = pendingSource.current;
    const current = bookRef.current;
    if (src === null || !current) return;
    pendingSource.current = null;
    const { book: next, result } = applySource(current, src);
    setIssues(result.issues);
    setCompiledOk(result.ok);
    await save(next);
  }, [save]);

  const onSourceChange = (src: string) => {
    pendingSource.current = src;
    setStatus('unsaved');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), COMPILE_DELAY_MS);
  };

  // Don't lose the last keystrokes when leaving the page.
  useEffect(() => {
    const onLeave = () => void flush();
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('hashchange', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('hashchange', onLeave);
      void flush();
    };
  }, [flush]);

  const updateManifest = (patch: Partial<Book['manifest']>) => {
    const b = bookRef.current;
    if (!b) return;
    void save({ ...b, manifest: { ...b.manifest, ...patch, modified: new Date().toISOString() } });
  };

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.length - errorCount;

  if (book === undefined) return <div className="loading">Loading…</div>;
  if (book === null) {
    return (
      <div className="empty-state">
        <p>That book isn't in your library.</p>
        <button className="btn" onClick={() => navigate('#/')}>Back to library</button>
      </div>
    );
  }
  if (book.source == null) {
    return (
      <div className="empty-state">
        <p>This book was shared without its ink source, so it can only be read.</p>
        <button className="btn" onClick={() => navigate('#/')}>Back to library</button>
      </div>
    );
  }

  const id = encodeURIComponent(book.id);

  return (
    <div className="writer">
      <header className="toolbar">
        <LibraryButton />
        <h1 className="toolbar-title">{book.manifest.title}</h1>
        <span className={`status status-${status}`} aria-live="polite">
          {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Editing…'}
        </span>
        <div className="toolbar-actions">
          <ToolButton icon="read" label="Read" disabled={!book.storyJson} onClick={async () => { await flush(); navigate(`#/read/${id}`); }} />
          <ToolButton icon="export" label="Export" primary onClick={async () => { await flush(); setExporting(true); }} />
        </div>
      </header>

      <div className="mobile-switch" role="tablist">
        <button role="tab" aria-selected={mobilePane === 'editor'} onClick={() => setMobilePane('editor')}>Write</button>
        <button role="tab" aria-selected={mobilePane === 'side'} onClick={() => setMobilePane('side')}>
          Preview &amp; tools {errorCount > 0 && <span className="badge error">{errorCount}</span>}
        </button>
      </div>

      <div className={`writer-body show-${mobilePane}`}>
        <section className="editor-pane">
          <InkEditor ref={editorRef} value={book.source} issues={issues} onChange={onSourceChange} />
        </section>

        <section className="side-pane">
          <nav className="tabs" role="tablist">
            {(['preview', 'problems', 'outline', 'details', 'help'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t === 'problems' ? (
                  <>
                    Problems
                    {errorCount > 0 && <span className="badge error">{errorCount}</span>}
                    {errorCount === 0 && warnCount > 0 && <span className="badge warn">{warnCount}</span>}
                  </>
                ) : (
                  t[0].toUpperCase() + t.slice(1)
                )}
              </button>
            ))}
          </nav>
          <div className="tab-body">
            {tab === 'preview' && <Preview book={book} compiledOk={compiledOk} onShowProblems={() => setTab('problems')} />}
            {tab === 'problems' && (
              <Problems
                issues={issues}
                onGo={(line) => {
                  editorRef.current?.goToLine(line);
                  setMobilePane('editor');
                }}
              />
            )}
            {tab === 'outline' && (
              <Outline
                source={pendingSource.current ?? book.source}
                onGo={(line) => {
                  editorRef.current?.goToLine(line);
                  setMobilePane('editor');
                }}
              />
            )}
            {tab === 'details' && (
              <Details
                book={book}
                onManifest={updateManifest}
                onCover={(cover) => bookRef.current && void save({ ...bookRef.current, cover })}
                onAssets={(assets) => bookRef.current && void save({ ...bookRef.current, assets })}
                onInsert={(text) => {
                  editorRef.current?.insertAtCursor(text);
                  setMobilePane('editor');
                }}
              />
            )}
            {tab === 'help' && <InkHelp />}
          </div>
        </section>
      </div>
      {exporting && <ExportDialog book={book} onClose={() => setExporting(false)} />}
    </div>
  );
}

function Preview({ book, compiledOk, onShowProblems }: { book: Book; compiledOk: boolean; onShowProblems: () => void }) {
  const assetUrls = useAssetUrls(book.assets);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showVars, setShowVars] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restart the preview whenever the compiled story changes.
  const { session, startError } = useMemo(() => {
    if (!book.storyJson) return { session: null, startError: null };
    const s = new ReaderSession(book.storyJson);
    try {
      s.start();
      return { session: s, startError: null };
    } catch (e) {
      return { session: s, startError: (e as Error).message };
    }
  }, [book.storyJson]);
  useEffect(() => setError(startError), [startError]);

  const act = (fn: () => void) => {
    try {
      fn();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setTick((t) => t + 1);
  };

  if (!session) {
    return (
      <div className="empty-state">
        <p>Fix the errors to see a preview.</p>
        <button className="btn" onClick={onShowProblems}>Show problems</button>
      </div>
    );
  }

  return (
    <div className="preview" ref={scrollRef}>
      <div className="preview-bar">
        <button className="btn small" onClick={() => act(() => session.start())}>Restart</button>
        <button className="btn small" onClick={() => act(() => session.undo())} disabled={!session.canUndo}>Back</button>
        <button className={`btn small ${showVars ? 'active' : ''}`} onClick={() => setShowVars(!showVars)}>Variables</button>
        {!compiledOk && (
          <button className="link small warn-text" onClick={onShowProblems}>Showing last working version</button>
        )}
      </div>
      {showVars && <VariablesTable vars={session.engine.variables} />}
      <StoryView
        transcript={session.transcript}
        choices={session.choices}
        ended={session.ended && !error}
        ending={session.ending}
        assetUrls={assetUrls}
        onChoose={(i) => act(() => session.choose(i))}
        onRestart={() => act(() => session.start())}
        scrollContainer={scrollRef}
      />
      {error && <p className="error-box">Runtime error: {error}</p>}
    </div>
  );
}

function Problems({ issues, onGo }: { issues: CompileIssue[]; onGo: (line: number) => void }) {
  if (!issues.length) return <p className="muted">No problems. The story compiles cleanly.</p>;
  return (
    <ul className="problems">
      {issues.map((i, n) => (
        <li key={n} className={`problem ${i.level}`}>
          <button className="link" onClick={() => i.line && onGo(i.line)} disabled={!i.line}>
            <span className="problem-level">{i.level === 'todo' ? 'TODO' : i.level}</span>
            {i.line && <span className="problem-line">line {i.line}</span>}
            <span className="problem-msg">{i.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function outlineOf(source: string): { name: string; line: number; depth: number }[] {
  const out: { name: string; line: number; depth: number }[] = [];
  source.split('\n').forEach((text, i) => {
    const knot = /^\s*={2,}\s*(?:function\s+)?(\w+)/.exec(text);
    if (knot) return out.push({ name: knot[1], line: i + 1, depth: 0 });
    const stitch = /^\s*=\s*(\w+)/.exec(text);
    if (stitch) out.push({ name: stitch[1], line: i + 1, depth: 1 });
  });
  return out;
}

function Outline({ source, onGo }: { source: string; onGo: (line: number) => void }) {
  const items = outlineOf(source);
  if (!items.length) return <p className="muted">No knots yet. Start a section with <code>=== name ===</code>.</p>;
  return (
    <ul className="outline">
      {items.map((it) => (
        <li key={it.line} style={{ paddingLeft: it.depth * 16 }}>
          <button className="link" onClick={() => onGo(it.line)}>
            {it.depth ? '' : '§ '}
            {it.name}
          </button>
          <span className="muted small"> line {it.line}</span>
        </li>
      ))}
    </ul>
  );
}

function Details({
  book,
  onManifest,
  onCover,
  onAssets,
  onInsert,
}: {
  book: Book;
  onManifest: (p: Partial<Book['manifest']>) => void;
  onCover: (b: Blob | null) => void;
  onAssets: (a: Asset[]) => void;
  onInsert: (text: string) => void;
}) {
  const m = book.manifest;
  const coverUrl = useObjectUrl(book.cover);

  const addAssets = async () => {
    const files = await pickFiles('image/*,audio/*', true);
    const next = [...book.assets];
    for (const f of files) {
      const path = `assets/${f.name.replace(/[^\w.-]+/g, '_')}`;
      const asset = { path, mime: f.type || mimeFor(path), data: f };
      const i = next.findIndex((a) => a.path === path);
      if (i >= 0) next[i] = asset;
      else next.push(asset);
    }
    onAssets(next);
  };

  return (
    <form className="details" onSubmit={(e) => e.preventDefault()}>
      <label>
        Title
        <input defaultValue={m.title} onBlur={(e) => onManifest({ title: e.target.value.trim() || 'Untitled' })} />
      </label>
      <label>
        Author
        <input defaultValue={m.author} onBlur={(e) => onManifest({ author: e.target.value.trim() })} />
      </label>
      <label>
        Description
        <textarea rows={3} defaultValue={m.description} onBlur={(e) => onManifest({ description: e.target.value.trim() })} />
      </label>
      <label>
        Language code
        <input defaultValue={m.language} placeholder="en" onBlur={(e) => onManifest({ language: e.target.value.trim() || 'en' })} />
      </label>

      <fieldset>
        <legend>Cover</legend>
        {coverUrl && <img className="cover-preview" src={coverUrl} alt="Cover" />}
        <div className="row">
          <button type="button" className="btn small" onClick={async () => { const [f] = await pickFiles('image/*'); if (f) onCover(f); }}>
            {book.cover ? 'Replace cover' : 'Add cover image'}
          </button>
          {book.cover && <button type="button" className="btn small ghost" onClick={() => onCover(null)}>Remove</button>}
        </div>
      </fieldset>

      <fieldset>
        <legend>Images &amp; audio</legend>
        <p className="muted small">Show an image in the story with a tag, e.g. <code># image: assets/map.png</code></p>
        <ul className="assets">
          {book.assets.map((a) => (
            <li key={a.path}>
              <code>{a.path}</code>
              {a.mime.startsWith('image/') && (
                <button type="button" className="btn small" onClick={() => onInsert(` # image: ${a.path}`)}>Insert tag</button>
              )}
              <button type="button" className="btn small ghost" onClick={() => onAssets(book.assets.filter((x) => x.path !== a.path))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn small" onClick={addAssets}>Add files…</button>
      </fieldset>
    </form>
  );
}
