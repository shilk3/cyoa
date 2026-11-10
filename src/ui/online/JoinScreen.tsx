import { useEffect, useState } from 'react';
import { getBook, getGame, putBook, putGame } from '../../storage/db';
import { base64ToBlob, call } from '../../online/api';
import { unpackInkbook } from '../../book/inkbook';
import { LibraryButton } from '../LibraryButton';
import { navigate, rememberName, rememberedName } from '../util';

/** Joins a game from an invite link (#/join/CODE) or a typed code. */
export function JoinScreen({ code: initialCode }: { code?: string }) {
  const [code, setCode] = useState((initialCode ?? '').toUpperCase());
  const [me, setMe] = useState(rememberedName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already in this game on this device: go straight to it.
  useEffect(() => {
    if (initialCode) getGame(initialCode.toUpperCase()).then((g) => g && navigate(`#/game/${g.code}`));
  }, [initialCode]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      rememberName(me);
      const res = await call<{ code: string; playerId: string; token: string }>('join', { code, playerName: me });
      const book = await call<{ storyJson: string; bookFile: string | null }>('book', { code: res.code, token: res.token });
      const st = await call<{ game: { title: string; bookId: string } }>('state', { code: res.code, token: res.token });
      // Add the book to this device's library too (without replacing a copy that's already there).
      if (book.bookFile) {
        try {
          const b = await unpackInkbook(base64ToBlob(book.bookFile, 'application/zip'));
          if (!(await getBook(b.id))) await putBook(b);
        } catch {
          // The game still works from the story alone.
        }
      }
      await putGame({
        code: res.code,
        playerId: res.playerId,
        token: res.token,
        title: st.game.title,
        bookId: st.game.bookId,
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

  const validCode = code.replace(/[^A-Z0-9]/g, '').length === 6;

  return (
    <div className="reader">
      <div className="top-bar">
        <header className="toolbar">
          <LibraryButton />
          <h1 className="toolbar-title">Join a game</h1>
        </header>
      </div>
      <main className="page">
        <div className="party-setup">
          <h2>Join a game</h2>
          <label className="field">
            <span>Game code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={8} autoCapitalize="characters" className="code-input" />
          </label>
          <label className="field">
            <span>Your name (shown to the other players)</span>
            <input value={me} onChange={(e) => setMe(e.target.value)} placeholder="Your name" maxLength={40} />
          </label>
          {error && <p className="error-box">{error}</p>}
          <div className="row">
            <button className="btn primary big" disabled={busy || !validCode} onClick={join}>
              {busy ? 'Joining…' : 'Join'}
            </button>
            <button className="btn" onClick={() => navigate('#/')}>Cancel</button>
          </div>
        </div>
      </main>
    </div>
  );
}
