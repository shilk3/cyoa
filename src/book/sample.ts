import lighthouse from '../../stories/lighthouse/lighthouse.ink?raw';
import heist from '../../stories/heist/heist.ink?raw';
import { bookFromInk } from './ops';
import { listBooks, putBook } from '../storage/db';

/** Each sample is added once per device (tracked by its key), and never if a book with its title exists. */
const SAMPLES = [
  { key: 'inkbook:seeded', source: lighthouse, title: 'The Lighthouse Keeper', onlyIfEmpty: true },
  { key: 'inkbook:seeded-heist', source: heist, title: 'The Clocktower Heist', onlyIfEmpty: false },
];

/** Adds the sample books so the library isn't empty and there's a multiplayer book to try. */
export async function seedSampleBook(): Promise<void> {
  for (const sample of SAMPLES) {
    try {
      if (localStorage.getItem(sample.key)) continue;
      localStorage.setItem(sample.key, '1');
    } catch {
      return;
    }
    const books = await listBooks();
    if (sample.onlyIfEmpty && books.length > 0) continue;
    if (books.some((b) => b.manifest.title === sample.title)) continue;
    const { book } = bookFromInk(sample.source, sample.title);
    await putBook(book);
  }
}
