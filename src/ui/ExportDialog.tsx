import { useState } from 'react';
import { isEpub, type Book } from '../book/types';
import { exportsFor, exportBook, type ExportKind } from '../book/ops';
import { saveFile, slugify } from './util';

export function ExportDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: ExportKind, ext: string) => {
    setBusy(kind);
    setError(null);
    try {
      const blob = await exportBook(book, kind);
      await saveFile(blob, `${slugify(book.manifest.title)}.${ext}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export book" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Export “{book.manifest.title}”</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!book.storyJson && !isEpub(book) && <p className="error-box">This book doesn't compile yet. Fix the errors in the writer first.</p>}
        <ul className="export-list">
          {exportsFor(book).map((x) => (
            <li key={x.kind}>
              <button className="export-item" disabled={(!book.storyJson && !isEpub(book)) || busy !== null} onClick={() => run(x.kind, x.ext)}>
                <span className="export-label">{busy === x.kind ? 'Exporting…' : x.label}</span>
                <span className="muted small">{x.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="error-box">{error}</p>}
      </div>
    </div>
  );
}
