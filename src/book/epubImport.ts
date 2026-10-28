import JSZip from 'jszip';
import { InkbookError, newManifest } from './inkbook';
import type { Book } from './types';

/** Resolves `href` relative to the directory of `base` inside the zip. */
function resolvePath(base: string, href: string): string {
  const parts = base.split('/').slice(0, -1);
  for (const seg of decodeURIComponent(href.split('#')[0]).split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';

/** Elements by local name, ignoring namespace prefixes (dc:title, opf:item, …). */
function byLocalName(doc: Document, name: string): Element[] {
  return Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === name);
}

function firstByLocalName(doc: Document, name: string): Element | null {
  return byLocalName(doc, name)[0] ?? null;
}

/** Reads a standard EPUB's metadata and cover so it can be shelved in the library. */
export async function bookFromEpub(data: Blob | ArrayBuffer, fallbackTitle = 'Untitled'): Promise<Book> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new InkbookError('Not a valid .epub file (could not open zip).');
  }
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new InkbookError('Not a valid .epub file (missing META-INF/container.xml).');
  const parser = new DOMParser();
  const container = parser.parseFromString(containerXml, 'application/xml');
  const opfPath = firstByLocalName(container, 'rootfile')?.getAttribute('full-path');
  const opfXml = opfPath ? await zip.file(opfPath)?.async('string') : undefined;
  if (!opfPath || !opfXml) throw new InkbookError('Not a valid .epub file (missing package document).');
  const opf = parser.parseFromString(opfXml, 'application/xml');

  const title = text(firstByLocalName(opf, 'title')) || fallbackTitle;
  const author = byLocalName(opf, 'creator').map(text).filter(Boolean).join(', ');
  const language = text(firstByLocalName(opf, 'language')) || 'en';
  const description = text(firstByLocalName(opf, 'description')).replace(/<[^>]+>/g, '');

  // Cover: EPUB 3 marks it with properties="cover-image"; EPUB 2 uses <meta name="cover" content="item-id">.
  const items = byLocalName(opf, 'item');
  let coverItem = items.find((i) => (i.getAttribute('properties') ?? '').split(/\s+/).includes('cover-image'));
  if (!coverItem) {
    const coverId = byLocalName(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    if (coverId) coverItem = items.find((i) => i.getAttribute('id') === coverId);
  }
  let cover: Blob | null = null;
  const coverHref = coverItem?.getAttribute('href');
  const coverType = coverItem?.getAttribute('media-type') ?? '';
  if (coverHref && coverType.startsWith('image/')) {
    const f = zip.file(resolvePath(opfPath, coverHref));
    if (f) cover = new Blob([await f.async('arraybuffer')], { type: coverType });
  }

  const epub = data instanceof Blob ? data : new Blob([data], { type: 'application/epub+zip' });
  const manifest = newManifest({ title, author, language, description });
  return { id: manifest.id, kind: 'epub', epub, manifest, storyJson: null, source: null, cover, assets: [] };
}
