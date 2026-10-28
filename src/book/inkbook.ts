import JSZip from 'jszip';
import { INKBOOK_FORMAT_VERSION, type Asset, type Book, type Manifest } from './types';

export class InkbookError extends Error {}

export function newId(): string {
  return `urn:uuid:${crypto.randomUUID()}`;
}

export function newManifest(partial: Partial<Manifest> = {}): Manifest {
  const now = new Date().toISOString();
  return {
    format: 'inkbook',
    formatVersion: INKBOOK_FORMAT_VERSION,
    id: newId(),
    title: 'Untitled',
    author: '',
    language: 'en',
    description: '',
    story: 'story.json',
    storyRevision: 1,
    created: now,
    modified: now,
    ...partial,
  };
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

export function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Packs a book into a .inkbook zip. Source is included only when `includeSource` is set. */
export async function packInkbook(book: Book, { includeSource = true } = {}): Promise<Blob> {
  if (!book.storyJson) throw new InkbookError('Book has no compiled story. Fix compile errors first.');
  const zip = new JSZip();
  const manifest: Manifest = { ...book.manifest };
  delete manifest.cover;
  delete manifest.source;

  zip.file(manifest.story, book.storyJson);
  if (includeSource && book.source != null) {
    manifest.source = 'source.ink';
    zip.file('source.ink', book.source);
  }
  if (book.cover) {
    const ext = book.cover.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    manifest.cover = `cover.${ext}`;
    zip.file(manifest.cover, await book.cover.arrayBuffer());
  }
  for (const a of book.assets) zip.file(a.path, await a.data.arrayBuffer());
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
}

export async function unpackInkbook(data: Blob | ArrayBuffer): Promise<Book> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new InkbookError('Not a valid .inkbook file (could not open zip).');
  }
  const mf = zip.file('manifest.json');
  if (!mf) throw new InkbookError('Missing manifest.json.');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await mf.async('string'));
  } catch {
    throw new InkbookError('manifest.json is not valid JSON.');
  }
  if (manifest.format !== 'inkbook') throw new InkbookError('manifest.json is not an inkbook manifest.');
  if (manifest.formatVersion > INKBOOK_FORMAT_VERSION) {
    throw new InkbookError(`This book needs a newer reader (format v${manifest.formatVersion}).`);
  }
  if (!manifest.id) throw new InkbookError('manifest.json has no id.');

  const storyFile = zip.file(manifest.story || 'story.json');
  if (!storyFile) throw new InkbookError('Missing compiled story.');
  const storyJson = await storyFile.async('string');

  const sourceFile = manifest.source ? zip.file(manifest.source) : null;
  const source = sourceFile ? await sourceFile.async('string') : null;

  let cover: Blob | null = null;
  if (manifest.cover) {
    const cf = zip.file(manifest.cover);
    if (cf) cover = new Blob([await cf.async('arraybuffer')], { type: mimeFor(manifest.cover) });
  }

  const assets: Asset[] = [];
  const assetFiles = zip.file(/^assets\//);
  for (const f of assetFiles) {
    if (f.dir) continue;
    assets.push({ path: f.name, mime: mimeFor(f.name), data: new Blob([await f.async('arraybuffer')], { type: mimeFor(f.name) }) });
  }

  return { id: manifest.id, manifest, storyJson, source, cover, assets };
}
