import { useState } from 'react';
import { defaultSeating, MAX_PLAYERS, type PartyInfo, type Seating } from '../ink/multiplayer';

export interface PartyChoice {
  names: string[];
  seating: Seating;
}

const SHARED = -1;

/**
 * Sets up a game for several people: character names (defaults from the book), who is playing,
 * and who plays which character. Characters left unassigned are shared: each of their choices
 * goes to a random player.
 */
export function PartySetup({
  info,
  title,
  initial,
  lockNames,
  startLabel,
  onStart,
  onCancel,
}: {
  info: PartyInfo;
  title: string;
  initial?: PartyChoice;
  /** Character names can't change once a game has begun (they're already in the story). */
  lockNames?: boolean;
  startLabel: string;
  onStart: (c: PartyChoice) => void;
  onCancel: () => void;
}) {
  const [names, setNames] = useState<string[]>(initial?.names ?? info.names);
  const [people, setPeople] = useState<string[]>(
    initial?.seating.people ?? Array.from({ length: Math.min(info.players, 2) }, (_, i) => `Player ${i + 1}`),
  );
  const [owners, setOwners] = useState<(number | null)[]>(initial?.seating.owners ?? defaultSeating(info.players, people).owners);

  const setPeopleAndReseat = (next: string[]) => {
    setPeople(next);
    // Keep assignments that still point at someone; give new people the next free character.
    setOwners((prev) => {
      const out = prev.map((o) => (o != null && o < next.length ? o : null));
      next.forEach((_, p) => {
        if (!out.includes(p)) {
          const free = out.findIndex((o) => o == null);
          if (free >= 0) out[free] = p;
        }
      });
      return out;
    });
  };

  const valid = names.every((n) => n.trim()) && people.every((p) => p.trim()) && people.length >= 1;

  return (
    <div className="party-setup">
      <h2>{title}</h2>
      <p className="muted">
        This book is written for {info.players} player{info.players === 1 ? '' : 's'}, but any number from 1 to {info.players} can play.
        Characters nobody plays are shared: each of their choices goes to a random player.
      </p>

      <section>
        <h3>Characters</h3>
        {lockNames && <p className="muted small">Names can't change once the game has started.</p>}
        {names.map((n, i) => (
          <label key={i} className="field">
            <span>Character {i + 1}</span>
            <input value={n} disabled={lockNames} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </section>

      <section>
        <h3>Who's playing</h3>
        {people.map((p, i) => (
          <div key={i} className="field row">
            <input
              aria-label={`Player ${i + 1} name`}
              value={p}
              onChange={(e) => setPeople(people.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {people.length > 1 && (
              <button className="btn small ghost" aria-label={`Remove ${p}`} onClick={() => setPeopleAndReseat(people.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {people.length < Math.min(info.players, MAX_PLAYERS) && (
          <button className="btn small" onClick={() => setPeopleAndReseat([...people, `Player ${people.length + 1}`])}>
            Add player
          </button>
        )}
      </section>

      <section>
        <h3>Who plays whom</h3>
        {names.map((n, i) => (
          <label key={i} className="field">
            <span>{n || `Character ${i + 1}`}</span>
            <select
              value={owners[i] ?? SHARED}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOwners(owners.map((o, j) => (j === i ? (v === SHARED ? null : v) : o)));
              }}
            >
              {people.map((p, j) => (
                <option key={j} value={j}>{p || `Player ${j + 1}`}</option>
              ))}
              <option value={SHARED}>Shared (random each time)</option>
            </select>
          </label>
        ))}
      </section>

      <div className="row">
        <button className="btn primary big" disabled={!valid} onClick={() => onStart({ names: names.map((n) => n.trim()), seating: { people: people.map((p) => p.trim()), owners } })}>
          {startLabel}
        </button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
