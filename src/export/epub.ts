import JSZip from 'jszip';
import type { Book } from '../book/types';
import { parseTag } from '../ink/tags';
import { flattenStory, FlattenError, type FlatSection } from './flatten';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2 { text-align: center; }
.num { text-align: center; font-weight: bold; font-size: 1.4em; margin: 1.5em 0 0.5em; }
.chapter { text-align: center; font-variant: small-caps; margin-top: 1em; }
ul.choices { list-style: none; padding: 0; margin-top: 1.2em; }
ul.choices li { margin: 0.5em 0; }
.end { text-align: center; font-weight: bold; margin-top: 2em; }
img { max-width: 100%; display: block; margin: 1em auto; }
.title-page { text-align: center; margin-top: 20%; }
`;

function xhtml(title: string, body: string, lang: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`;
}

function sectionBody(section: FlatSection, assetPaths: Set<string>): string {
  let html = `<section epub:type="chapter" id="s${section.number}"><p class="num">${section.number}</p>\n`;
  for (const p of section.passages) {
    let cls = '';
    for (const t of p.tags) {
      const { key, value } = parseTag(t);
      if (key === 'chapter' && value) html += `<h2 class="chapter">${esc(value)}</h2>\n`;
      if (key === 'image' && assetPaths.has(value)) html += `<img src="${esc(value)}" alt=""/>\n`;
      if (key === 'class' && value) cls = value;
    }
    if (p.text.trim()) html += `<p${cls ? ` class="${esc(cls)}"` : ''}>${esc(p.text)}</p>\n`;
  }
  if (section.choices.length) {
    html += '<ul class="choices">\n';
    for (const c of section.choices) {
      html += `<li><a href="s${c.target}.xhtml">${esc(c.text)}</a> <span class="turn">(turn to ${c.target})</span></li>\n`;
    }
    html += '</ul>\n';
  } else {
    html += '<p class="end">THE END</p>\n';
  }
  return html + '</section>';
}

export async function exportEpub(book: Book): Promise<Blob> {
  if (!book.storyJson) throw new FlattenError('Book has no compiled story. Fix compile errors first.');
  let sections: FlatSection[];
  try {
    sections = flattenStory(book.storyJson);
  } catch (e) {
    if (e instanceof FlattenError) throw e;
    throw new FlattenError(`The story hit an error while being explored: ${(e as Error).message}`);
  }
  const m = book.manifest;
  const lang = m.language || 'en';
  const zip = new JSZip();
  // The mimetype entry must be first and uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  const manifestItems: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>',
  ];
  const spine: string[] = ['<itemref idref="title"/>'];

  zip.file('OEBPS/style.css', CSS);

  let coverImg = '';
  if (book.cover) {
    const ext = book.cover.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    zip.file(`OEBPS/cover.${ext}`, await book.cover.arrayBuffer());
    manifestItems.push(`<item id="cover-image" href="cover.${ext}" media-type="${book.cover.type}" properties="cover-image"/>`);
    coverImg = `<img src="cover.${ext}" alt="Cover"/>`;
  }

  const assetPaths = new Set<string>();
  book.assets.forEach((a, i) => {
    assetPaths.add(a.path);
    zip.file(`OEBPS/${a.path}`, a.data.arrayBuffer());
    manifestItems.push(`<item id="asset${i}" href="${esc(a.path)}" media-type="${esc(a.mime)}"/>`);
  });

  zip.file(
    'OEBPS/title.xhtml',
    xhtml(
      m.title,
      `<div class="title-page">${coverImg}<h1>${esc(m.title)}</h1>${m.author ? `<p>${esc(m.author)}</p>` : ''}
${m.description ? `<p><em>${esc(m.description)}</em></p>` : ''}
<p>Don't read this book straight through. At the end of each section, choose what to do and follow the link (or turn to the numbered section).</p>
<p><a href="s1.xhtml">Begin at section 1</a></p></div>`,
      lang,
    ),
  );

  for (const s of sections) {
    zip.file(`OEBPS/s${s.number}.xhtml`, xhtml(`${m.title} — ${s.number}`, sectionBody(s, assetPaths), lang));
    manifestItems.push(`<item id="s${s.number}" href="s${s.number}.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="s${s.number}"/>`);
  }

  zip.file(
    'OEBPS/nav.xhtml',
    xhtml(
      'Contents',
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
<li><a href="title.xhtml">${esc(m.title)}</a></li>
<li><a href="s1.xhtml">Begin</a></li>
</ol></nav>`,
      lang,
    ),
  );

  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${esc(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${esc(m.id)}</dc:identifier>
    <dc:title>${esc(m.title)}</dc:title>
    ${m.author ? `<dc:creator>${esc(m.author)}</dc:creator>` : ''}
    <dc:language>${esc(lang)}</dc:language>
    ${m.description ? `<dc:description>${esc(m.description)}</dc:description>` : ''}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spine.join('\n    ')}
  </spine>
</package>`,
  );

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
}
