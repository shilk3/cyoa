import { StoryEngine, type Passage } from '../ink/engine';

/**
 * Flattens a story into numbered sections, gamebook style ("turn to 12"), by
 * exploring every reachable choice point. Used for EPUB export so books work on
 * ordinary e-readers. Identical states reached by different routes share a
 * section, so stories with lots of tracked state can blow up; we cap the count.
 */

export interface FlatChoice {
  text: string;
  target: number; // section number
}

export interface FlatSection {
  number: number;
  passages: Passage[];
  choices: FlatChoice[];
}

export class FlattenError extends Error {}

export const DEFAULT_MAX_SECTIONS = 1500;

/** Drops fields that differ between equivalent states (turn counters, thread ids). */
function normalizeState(stateJson: string): string {
  const st = JSON.parse(stateJson);
  const turnIdx: number = st.turnIdx ?? 0;
  const relTurns: Record<string, number> = {};
  for (const [k, v] of Object.entries(st.turnIndices ?? {})) relTurns[k] = turnIdx - (v as number);
  st.turnIndices = relTurns;
  delete st.turnIdx;
  const strip = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(strip);
    if (o && typeof o === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (k === 'threadIndex' || k === 'threadCounter') continue;
        if (k === 'choiceThreads') {
          out[k] = Object.values(v as object).map(strip).map((x) => JSON.stringify(x)).sort();
          continue;
        }
        out[k] = strip(v);
      }
      return out;
    }
    return o;
  };
  return JSON.stringify(strip(st));
}

export function flattenStory(storyJson: string, maxSections = DEFAULT_MAX_SECTIONS): FlatSection[] {
  const engine = new StoryEngine(storyJson);
  const sections: FlatSection[] = [];
  const byKey = new Map<string, number>();
  const queue: { number: number; state: string }[] = [];

  const register = (passages: Passage[]): number => {
    const state = engine.saveState();
    const key = JSON.stringify(passages) + '\u0000' + normalizeState(state);
    const existing = byKey.get(key);
    if (existing !== undefined) return existing;
    if (sections.length >= maxSections) {
      throw new FlattenError(
        `This story has more than ${maxSections} distinct sections once all its state is tracked, ` +
          'so it cannot be turned into a plain ebook. Export it as HTML instead.',
      );
    }
    const number = sections.length + 1;
    sections.push({ number, passages, choices: [] });
    byKey.set(key, number);
    queue.push({ number, state });
    return number;
  };

  engine.reset();
  register(engine.continue());

  while (queue.length) {
    const { number, state } = queue.shift()!;
    engine.loadState(state);
    const choices = engine.choices;
    const section = sections[number - 1];
    for (const c of choices) {
      engine.loadState(state);
      engine.choose(c.index);
      const target = register(engine.continue());
      section.choices.push({ text: c.text, target });
    }
  }
  return sections;
}
