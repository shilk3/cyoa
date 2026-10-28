// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { bookFromEpub } from '../book/epubImport';
import { exportEpub } from '../export/epub';
import { newManifest } from '../book/inkbook';
import { compileInk } from '../ink/compile';

async function epub2(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file('content/book.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Pride &amp; Prejudice</dc:title>
    <dc:creator opf:role="aut">Jane Austen</dc:creator>
    <dc:language>en-GB</dc:language>
    <meta name="cover" content="cov"/>
  </metadata>
  <manifest>
    <item id="cov" href="../images/cover.jpg" media-type="image/jpeg"/>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`);
  zip.file('images/cover.jpg', new Uint8Array([0xff, 0xd8, 0xff, 1, 2]));
  zip.file('content/ch1.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>It is a truth…</p></body></html>');
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('bookFromEpub', () => {
  it('reads EPUB 2 metadata and the cover named by <meta name="cover">', async () => {
    const book = await bookFromEpub(await epub2());
    expect(book.kind).toBe('epub');
    expect(book.manifest).toMatchObject({ title: 'Pride & Prejudice', author: 'Jane Austen', language: 'en-GB' });
    expect(book.cover?.type).toBe('image/jpeg');
    expect(book.cover?.size).toBe(5);
    expect(book.epub).toBeTruthy();
  });

  it('reads EPUB 3 books, including ones this app exported', async () => {
    const manifest = newManifest({ title: 'Choices', author: 'Me' });
    const blob = await exportEpub({ id: manifest.id, manifest, storyJson: compileInk('Hi\n* [Go] -> END').storyJson, source: null, cover: null, assets: [] });
    const book = await bookFromEpub(await blob.arrayBuffer());
    expect(book.manifest).toMatchObject({ title: 'Choices', author: 'Me' });
    expect(book.id).not.toBe(manifest.id);
  });

  it('rejects files that are not EPUBs', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(bookFromEpub(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow(/container\.xml/);
  });
});
