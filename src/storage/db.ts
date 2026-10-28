import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, Progress, SaveGame } from '../book/types';

interface CyoaDB extends DBSchema {
  books: { key: string; value: Book };
  saves: { key: [string, string]; value: SaveGame; indexes: { byBook: string } };
  progress: { key: string; value: Progress };
}

let dbPromise: Promise<IDBPDatabase<CyoaDB>> | null = null;

function db() {
  dbPromise ??= openDB<CyoaDB>('cyoa-reader', 1, {
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' });
      const saves = d.createObjectStore('saves', { keyPath: ['bookId', 'slot'] });
      saves.createIndex('byBook', 'bookId');
      d.createObjectStore('progress', { keyPath: 'bookId' });
    },
  });
  return dbPromise;
}

export async function listBooks(): Promise<Book[]> {
  const books = await (await db()).getAll('books');
  return books.sort((a, b) => b.manifest.modified.localeCompare(a.manifest.modified));
}

export async function getBook(id: string): Promise<Book | undefined> {
  return (await db()).get('books', id);
}

export async function putBook(book: Book): Promise<void> {
  await (await db()).put('books', book);
}

export async function deleteBook(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['books', 'saves', 'progress'], 'readwrite');
  await tx.objectStore('books').delete(id);
  const saveKeys = await tx.objectStore('saves').index('byBook').getAllKeys(id);
  for (const k of saveKeys) await tx.objectStore('saves').delete(k);
  await tx.objectStore('progress').delete(id);
  await tx.done;
}

export async function getSave(bookId: string, slot: string): Promise<SaveGame | undefined> {
  return (await db()).get('saves', [bookId, slot]);
}

export async function listSaves(bookId: string): Promise<SaveGame[]> {
  return (await db()).getAllFromIndex('saves', 'byBook', bookId);
}

export async function putSave(save: SaveGame): Promise<void> {
  await (await db()).put('saves', save);
}

export async function deleteSave(bookId: string, slot: string): Promise<void> {
  await (await db()).delete('saves', [bookId, slot]);
}

export async function getProgress(bookId: string): Promise<Progress> {
  return (await (await db()).get('progress', bookId)) ?? { bookId, endings: [] };
}

export async function recordEnding(bookId: string, ending: string): Promise<Progress> {
  const p = await getProgress(bookId);
  if (!p.endings.includes(ending)) p.endings.push(ending);
  await (await db()).put('progress', p);
  return p;
}
