import { describe, expect, it } from 'vitest';
import heist from '../../stories/heist/heist.ink?raw';
import lighthouse from '../../stories/lighthouse/lighthouse.ink?raw';
import { compileInk } from '../ink/compile';
import { ReaderSession } from '../ink/session';
import { StoryEngine } from '../ink/engine';
import { partyInfo, playersFromStoryJson, whoChooses, defaultSeating, hashPick, nameVars } from '../ink/multiplayer';

const heistJson = compileInk(heist).storyJson!;

function info(json: string) {
  const e = new StoryEngine(json);
  return partyInfo(e.globalTags, e.variables);
}

describe('multiplayer books', () => {
  it('reads players and default names', () => {
    expect(compileInk(heist).issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(info(heistJson)).toEqual({ players: 3, names: ['Wren the Locksmith', 'Pike the Lookout', 'Sable the Talker'] });
    expect(playersFromStoryJson(heistJson)).toBe(3);
    expect(info(compileInk(lighthouse).storyJson!).players).toBe(1);
    expect(playersFromStoryJson(compileInk(lighthouse).storyJson!)).toBe(1);
  });

  it('substitutes chosen names and tracks the chooser', () => {
    const s = new ReaderSession(heistJson, (e) => e.configure({ seed: 5, vars: nameVars(['Ann', 'Ben', 'Cat']) }));
    s.start();
    expect(s.transcript.map((t) => t.text).join(' ')).toContain('Ann, Ben and Cat');
    expect(s.chooser).toBe(2);
    expect(s.choices[0].text).toBe('Ben: take the rooftops to scout ahead');
    s.choose(0);
    expect(s.chooser).toBe(3);
    s.choose(0);
    expect(s.chooser).toBe(1);
    s.choose(0);
    expect(s.chooser).toBe('any');
    expect(s.turn).toBe(3);
  });

  it('replays identically on every device with the same seed', () => {
    const play = (seed: number) => {
      const s = new ReaderSession(heistJson, (e) => e.configure({ seed }));
      s.replay([0, 1, 0, 1, 0, 1]);
      return JSON.stringify(s.transcript);
    };
    expect(play(99)).toBe(play(99));
    const texts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(play));
    expect(texts.size).toBeGreaterThan(1); // random text varies with the seed
  });

  it('gives shared characters to a random player, the same on every device', () => {
    const seating = defaultSeating(3, ['Ann', 'Ben']);
    expect(seating.owners).toEqual([0, 1, null]);
    expect(whoChooses(seating, 1, 7, 0)).toEqual({ role: 1, person: 0, random: false });
    const picks = Array.from({ length: 40 }, (_, turn) => whoChooses(seating, 3, 7, turn));
    expect(picks.every((p) => p.random && p.role === 3)).toBe(true);
    expect(new Set(picks.map((p) => p.person))).toEqual(new Set([0, 1])); // both players get some
    expect(whoChooses(seating, 3, 7, 5)).toEqual(whoChooses(seating, 3, 7, 5));
    expect(whoChooses(seating, 'any', 7, 0).person).toBe('anyone');
    expect(whoChooses(defaultSeating(3, ['Solo']), 2, 7, 0)).toEqual({ role: 2, person: 0, random: false });
  });

  it('spreads random picks evenly', () => {
    const counts = [0, 0, 0];
    for (let t = 0; t < 3000; t++) counts[hashPick(12345, t, 3)]++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });
});
