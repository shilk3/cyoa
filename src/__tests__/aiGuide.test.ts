import { describe, expect, it } from 'vitest';
import guide from '../../docs/WRITING-BOOKS-WITH-AI.md?raw';
import { compileInk } from '../ink/compile';
import { StoryEngine } from '../ink/engine';
import { ReaderSession } from '../ink/session';
import { partyInfo } from '../ink/multiplayer';
import { flattenStory } from '../export/flatten';

// The complete example in the AI writing brief must be a valid Pagefork multiplayer book.
const example = /## 4\. Complete example[\s\S]*?```ink\n([\s\S]*?)```/.exec(guide)![1];

describe('AI writing brief example', () => {
  it('compiles cleanly and declares its players', () => {
    const r = compileInk(example);
    expect(r.issues).toEqual([]);
    const e = new StoryEngine(r.storyJson!);
    expect(partyInfo(e.globalTags, e.variables)).toEqual({ players: 2, names: ['Juno the Juggler', 'Tam the Tinker'] });
  });

  it('never hardcodes character names', () => {
    const body = example.split('\n').filter((l) => !l.startsWith('VAR player'));
    expect(body.join('\n')).not.toMatch(/Juno|Tam the Tinker/);
  });

  it('tags every choice point with a chooser and every ending', () => {
    const json = compileInk(example).storyJson!;
    for (const s of flattenStory(json)) {
      const tags = s.passages.flatMap((p) => p.tags);
      if (s.choices.length) expect(tags.some((t) => t.startsWith('chooser:'))).toBe(true);
      else expect(tags.some((t) => t.startsWith('ending:'))).toBe(true);
    }
  });

  it('reaches every ending', () => {
    const json = compileInk(example).storyJson!;
    const endings = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const s = new ReaderSession(json, (e) => e.configure({ seed }));
      s.start();
      let n = seed;
      while (!s.ended) {
        s.choose(s.choices[n % s.choices.length].index);
        n = Math.floor(n / 2) + 7 * s.turn;
      }
      endings.add(s.ending!);
    }
    expect(endings).toEqual(new Set(['moth found', 'gone at dawn']));
  });
});
