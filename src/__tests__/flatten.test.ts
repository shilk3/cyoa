import { describe, expect, it } from 'vitest';
import lighthouse from '../../stories/lighthouse/lighthouse.ink?raw';
import { compileInk } from '../ink/compile';
import { flattenStory, FlattenError } from '../export/flatten';

describe('flattenStory', () => {
  it('flattens the sample into a finite set of linked sections', () => {
    const json = compileInk(lighthouse).storyJson!;
    const sections = flattenStory(json);
    expect(sections.length).toBeGreaterThan(5);
    for (const s of sections) for (const c of s.choices) expect(c.target).toBeLessThanOrEqual(sections.length);
    const endings = sections.filter((s) => s.choices.length === 0);
    const tags = new Set(endings.flatMap((s) => s.passages.flatMap((p) => p.tags)));
    expect(tags).toContain('ending: good');
    expect(tags).toContain('ending: bad');
  });

  it('merges identical states reached by different routes', () => {
    // Sticky (+) choices don't record visit counts, so both routes end in the same state.
    const json = compileInk('+ [A] -> mid\n+ [B] -> mid\n=== mid ===\nMiddle.\n* [Done] -> END').storyJson!;
    const sections = flattenStory(json);
    expect(sections[0].choices[0].target).toBe(sections[0].choices[1].target);
  });

  it('gives up on unbounded state', () => {
    const json = compileInk('VAR n = 0\n-> loop\n=== loop ===\n~ n++\nCount {n}\n+ [Again] -> loop').storyJson!;
    expect(() => flattenStory(json, 50)).toThrow(FlattenError);
  });
});

describe('exportEpub', () => {
  it('writes an EPUB with mimetype first and one file per section', async () => {
    const { default: JSZip } = await import('jszip');
    const { exportEpub } = await import('../export/epub');
    const { newManifest } = await import('../book/inkbook');
    const manifest = newManifest({ title: 'Lighthouse & Co' });
    const blob = await exportEpub({ id: manifest.id, manifest, storyJson: compileInk(lighthouse).storyJson, source: null, cover: null, assets: [] });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)[0]).toBe('mimetype');
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>Lighthouse &amp; Co</dc:title>');
    expect(zip.file('OEBPS/s1.xhtml')).not.toBeNull();
  });
});
