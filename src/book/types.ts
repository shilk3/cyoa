export const INKBOOK_FORMAT_VERSION = 1;

export interface Manifest {
  format: 'inkbook';
  formatVersion: number;
  id: string;
  title: string;
  author: string;
  language: string;
  description: string;
  cover?: string;
  story: string;
  source?: string;
  storyRevision: number;
  created: string;
  modified: string;
}

export interface Asset {
  path: string; // e.g. "assets/map.png"
  mime: string;
  data: Blob;
}

/**
 * A book as stored in the library. Ink books have `storyJson` (and `source` when editable);
 * standard e-books have `kind: 'epub'` and keep the original file in `epub`.
 */
export interface Book {
  id: string;
  kind?: 'ink' | 'epub'; // missing on books saved before EPUB support: treat as 'ink'
  epub?: Blob | null;
  manifest: Manifest;
  storyJson: string | null;
  source: string | null;
  cover: Blob | null;
  assets: Asset[];
  /** Needs Face ID to open on this device. Not part of the book file, so exports never carry it. */
  locked?: boolean;
}

export interface SaveGame {
  bookId: string;
  slot: string; // "auto" or a user-named slot
  storyRevision: number;
  inkState: string;
  transcript: TranscriptEntry[];
  undo: UndoEntry[];
  updated: string;
}

export interface TranscriptEntry {
  kind: 'text' | 'choice';
  text: string;
  tags: string[];
}

export interface UndoEntry {
  inkState: string;
  transcriptLength: number;
}

export interface Progress {
  bookId: string;
  endings: string[]; // ending tag values discovered
}

/** Reading position in a standard EPUB. */
export interface EpubPosition {
  bookId: string;
  cfi: string;
  percent: number | null;
  updated: string;
}

export const isEpub = (b: Book) => b.kind === 'epub';
