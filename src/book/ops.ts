import { compileInk, type CompileResult } from '../ink/compile';
import { metaFromGlobalTags } from '../ink/tags';
import { newManifest, unpackInkbook, packInkbook, InkbookError } from './inkbook';
import type { Book } from './types';
import { putBook } from '../storage/db';

export const NEW_BOOK_TEMPLATE = `# title: My Adventure
# author: Anonymous

VAR courage = 0

-> start

=== start ===
# chapter: The Beginning
You wake up somewhere unfamiliar. A door stands to your left; a window to your right.

* [Try the door]
    -> door
* [Look out of the window]
    -> window

=== door ===
The door creaks open onto a long corridor.
~ courage += 1
-> ending

=== window ===
Outside, the sea stretches to the horizon.
-> ending

=== ending ===
# ending: good
You take a deep breath. The adventure begins.
-> END
`;

/** Creates a library book from ink source. Compile errors are allowed; the book just isn't readable yet. */
export function bookFromInk(source: string, fallbackTitle = 'Untitled'): { book: Book; result: CompileResult } {
  const result = compileInk(source);
  const meta = metaFromGlobalTags(result.globalTags);
  const manifest = newManifest({
    title: meta.title || fallbackTitle,
    author: meta.author ?? '',
    description: meta.description ?? '',
    language: meta.language ?? 'en',
  });
  return { book: { id: manifest.id, manifest, storyJson: result.storyJson, source, cover: null, assets: [] }, result };
}

export async function createNewBook(): Promise<Book> {
  const { book } = bookFromInk(NEW_BOOK_TEMPLATE);
  await putBook(book);
  return book;
}

/** Imports a .inkbook, .ink or compiled ink .json file into the library. */
export async function importFile(file: File): Promise<Book> {
  const name = file.name.toLowerCase();
  let book: Book;
  if (name.endsWith('.inkbook') || name.endsWith('.zip')) {
    // Re-importing a book with the same id replaces it; saves are keyed by id so progress is kept.
    book = await unpackInkbook(await file.arrayBuffer());
  } else if (name.endsWith('.ink')) {
    book = bookFromInk(await file.text(), file.name.replace(/\.ink$/i, '')).book;
  } else if (name.endsWith('.json')) {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.inkVersion !== 'number') throw new Error();
    } catch {
      throw new InkbookError('That .json file is not a compiled ink story.');
    }
    const manifest = newManifest({ title: file.name.replace(/\.json$/i, '') });
    book = { id: manifest.id, manifest, storyJson: text, source: null, cover: null, assets: [] };
  } else {
    throw new InkbookError('Unsupported file. Import .inkbook, .ink or compiled ink .json files.');
  }
  await putBook(book);
  return book;
}

/** Recompiles a book's source. Keeps the last good compiled story if the new source has errors. */
export function applySource(book: Book, source: string): { book: Book; result: CompileResult } {
  const result = compileInk(source);
  const changed = result.ok && result.storyJson !== book.storyJson;
  return {
    result,
    book: {
      ...book,
      source,
      storyJson: result.ok ? result.storyJson : book.storyJson,
      manifest: {
        ...book.manifest,
        modified: new Date().toISOString(),
        storyRevision: book.manifest.storyRevision + (changed ? 1 : 0),
      },
    },
  };
}

export type ExportKind = 'inkbook' | 'inkbook-nosource' | 'ink' | 'html' | 'epub' | 'json';

export const EXPORTS: { kind: ExportKind; label: string; hint: string; ext: string; needsSource?: boolean }[] = [
  { kind: 'inkbook', label: 'Ink book (.inkbook)', hint: 'For this app. Includes source, so it can be edited.', ext: 'inkbook' },
  { kind: 'inkbook-nosource', label: 'Ink book, read-only', hint: 'For sharing with readers only.', ext: 'inkbook' },
  { kind: 'html', label: 'Web page (.html)', hint: 'One file that plays in any browser.', ext: 'html' },
  { kind: 'epub', label: 'E-book (.epub)', hint: 'Numbered, linked sections for e-readers.', ext: 'epub' },
  { kind: 'ink', label: 'Ink source (.ink)', hint: 'Open in Inky or other ink tools.', ext: 'ink', needsSource: true },
  { kind: 'json', label: 'Compiled ink (.json)', hint: 'For game engines (Unity, inkjs).', ext: 'json' },
];

export async function exportBook(book: Book, kind: ExportKind): Promise<Blob> {
  switch (kind) {
    case 'inkbook':
      return packInkbook(book, { includeSource: true });
    case 'inkbook-nosource':
      return packInkbook(book, { includeSource: false });
    case 'html':
      return (await import('../export/html')).exportHtml(book);
    case 'epub':
      return (await import('../export/epub')).exportEpub(book);
    case 'ink':
      if (book.source == null) throw new InkbookError('This book has no ink source.');
      return new Blob([book.source], { type: 'text/plain' });
    case 'json':
      if (!book.storyJson) throw new InkbookError('Book has no compiled story.');
      return new Blob([book.storyJson], { type: 'application/json' });
  }
}
