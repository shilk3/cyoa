import { useEffect, useState } from 'react';
import type { Book } from '../../book/types';
import { getBook, putGame } from '../../storage/db';
import { StoryEngine } from '../../ink/engine';
import { partyInfo, type PartyInfo } from '../../ink/multiplayer';
import { packInkbook } from '../../book/inkbook';
import { blobToBase64, call } from '../../online/api';
import { LibraryButton } from '../LibraryButton';
import { navigate, rememberName, rememberedName } from '../util';

/** The base64 book is sent so friends get the book (cover, images) without importing it themselves. */
const MAX_SHARED_BOOK = 2_900_000;

export function HostSetup({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [info, setInfo] = useState<PartyInfo | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [me, setMe] = useState(rememberedName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getBook(bookId).then((b) => {
      setBook(b ?? null);
      if (b?.storyJson) {
        const e = new StoryEngine(b.storyJson);
        const i = partyInfo(e.globalTags, e.variables);
        setInfo(i);
        setNames(i.names);
      }
    });
  }, [bookId]);

  const create = async () => {
    if (!book?.storyJson) return;
    setBusy(true);
    setError(null);
    try {
      rememberName(me);
      let bookFile: string | null = await blobToBase64(await packInkbook(book, { includeSource: false }));
      if (bookFile.length > MAX_SHARED_BOOK) bookFile = null; // too big: friends still get the story, without pictures
      const res = await call<{ code: string; playerId: string; token: string }>('create', {
        storyJson: book.storyJson,
        bookFile,
        bookId: book.id,
        title: book.manifest.title,
        names,
        playerName: me,
      });
      await putGame({
        code: res.code,
        playerId: res.playerId,
        token: res.token,
        title: book.manifest.title,
        bookId: book.id,
        storyJson: book.storyJson,
        state: null,
        updated: new Date().toISOString(),
      });
      navigate(`#/game/${res.code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (book === undefined) return <div className="loading">Loading…</div>;
  if (!book?.storyJson || !info) {
    return (
      <div className="empty-state">
        <p>That book can't be played online.</p>
        <button className="btn" onClick={() => navigate('#/')}>Back to library</button>
      </div>
    );
  }

  return (
    <div className="reader">
      <div className="top-bar">
        <header className="toolbar">
          <LibraryButton />
          <h1 className="toolbar-title">{book.manifest.title}</h1>
        </header>
      </div>
      <main className="page">
        <div className="party-setup">
          <h2>Play online</h2>
          <p className="muted">
            You'll get a game code to send to friends. Each person plays on their own phone or computer; nobody can go past a
            choice until the right player has made it.
          </p>
          <section>
            <h3>Your name</h3>
            <label className="field">
              <span>Shown to the other players</span>
              <input value={me} onChange={(e) => setMe(e.target.value)} placeholder="Player 1" maxLength={40} />
            </label>
          </section>
          <section>
            <h3>Characters</h3>
            {names.map((n, i) => (
              <label key={i} className="field">
                <span>Character {i + 1}</span>
                <input value={n} maxLength={40} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
              </label>
            ))}
          </section>
          {error && <p className="error-box">{error}</p>}
          <div className="row">
            <button className="btn primary big" disabled={busy || names.some((n) => !n.trim())} onClick={create}>
              {busy ? 'Creating…' : 'Create game'}
            </button>
            <button className="btn" onClick={() => navigate('#/')}>Cancel</button>
          </div>
        </div>
      </main>
    </div>
  );
}
