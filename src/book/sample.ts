import lighthouse from '../../stories/lighthouse/lighthouse.ink?raw';
import { bookFromInk } from './ops';
import { listBooks, putBook } from '../storage/db';

const SEEDED_KEY = 'inkbook:seeded';

/** Adds the sample book on first run so the library isn't empty. */
export async function seedSampleBook(): Promise<void> {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    return;
  }
  if ((await listBooks()).length > 0) return;
  const { book } = bookFromInk(lighthouse, 'The Lighthouse Keeper');
  await putBook(book);
}
