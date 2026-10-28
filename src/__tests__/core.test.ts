import { describe, expect, it } from 'vitest';
import lighthouse from '../../stories/lighthouse/lighthouse.ink?raw';
import { compileInk, parseIssue } from '../ink/compile';
import { ReaderSession } from '../ink/session';
import { packInkbook, unpackInkbook, newManifest, InkbookError } from '../book/inkbook';
import type { Book } from '../book/types';


describe('compileInk', () => {
  it('compiles the sample story and reads global tags', () => {
    const r = compileInk(lighthouse);
    expect(r.ok).toBe(true);
    expect(r.globalTags).toContain('title: The Lighthouse Keeper');
  });

  it('reports errors with line numbers', () => {
    const r = compileInk('Hello\n~ x = \n-> END');
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ level: 'error', line: 2 });
  });

  it('reports a divert to a missing knot', () => {
    const r = compileInk('Hello\n-> nowhere');
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.level === 'error' && /nowhere/.test(i.message))).toBe(true);
  });

  it('parses issue strings', () => {
    expect(parseIssue('WARNING: line 7: hmm', 'error')).toEqual({ level: 'warning', line: 7, message: 'hmm' });
    expect(parseIssue('weird', 'todo')).toEqual({ level: 'todo', line: null, message: 'weird' });
  });
});

describe('ReaderSession', () => {
  const json = compileInk(lighthouse).storyJson!;

  it('plays to an ending and records the ending tag', () => {
    const s = new ReaderSession(json);
    s.start();
    // Climb path, call out, suggest leaving -> bad ending
    s.choose(0); s.choose(0); s.choose(s.choices.length - 1);
    expect(s.ended).toBe(true);
    expect(s.ending).toBe('bad');
  });

  it('undoes choices and restores the transcript', () => {
    const s = new ReaderSession(json);
    s.start();
    const before = s.transcript.length;
    const choicesBefore = s.choices.map((c) => c.text);
    s.choose(1);
    expect(s.transcript.length).toBeGreaterThan(before);
    s.undo();
    expect(s.transcript.length).toBe(before);
    expect(s.choices.map((c) => c.text)).toEqual(choicesBefore);
  });

  it('round-trips through a snapshot', () => {
    const a = new ReaderSession(json);
    a.start(); a.choose(1);
    const b = new ReaderSession(json);
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    expect(b.choices.map((c) => c.text)).toEqual(a.choices.map((c) => c.text));
    expect(b.canUndo).toBe(true);
  });
});

describe('inkbook', () => {
  it('packs and unpacks a book with source and assets', async () => {
    const r = compileInk(lighthouse);
    const manifest = newManifest({ title: 'Lighthouse' });
    const book: Book = {
      id: manifest.id, manifest, storyJson: r.storyJson, source: lighthouse,
      cover: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      assets: [{ path: 'assets/a.png', mime: 'image/png', data: new Blob([new Uint8Array([9])], { type: 'image/png' }) }],
    };
    const blob = await packInkbook(book);
    const back = await unpackInkbook(await blob.arrayBuffer());
    expect(back.id).toBe(book.id);
    expect(back.manifest.title).toBe('Lighthouse');
    expect(back.storyJson).toBe(r.storyJson);
    expect(back.source).toBe(lighthouse);
    expect(back.cover?.size).toBe(3);
    expect(back.assets.map((a) => a.path)).toEqual(['assets/a.png']);
  });

  it('omits source when asked', async () => {
    const manifest = newManifest();
    const blob = await packInkbook({ id: manifest.id, manifest, storyJson: '{}', source: 'x', cover: null, assets: [] }, { includeSource: false });
    const back = await unpackInkbook(await blob.arrayBuffer());
    expect(back.source).toBeNull();
  });

  it('rejects non-zip input', async () => {
    await expect(unpackInkbook(new TextEncoder().encode('nope').buffer as ArrayBuffer)).rejects.toBeInstanceOf(InkbookError);
  });
});
