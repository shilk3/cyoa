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

/** A book as stored in the library. `source` is present for books that can be edited. */
export interface Book {
  id: string;
  manifest: Manifest;
  storyJson: string | null;
  source: string | null;
  cover: Blob | null;
  assets: Asset[];
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
