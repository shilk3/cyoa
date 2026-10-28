import { useEffect, useState, type ReactNode } from 'react';
import { getBook } from '../storage/db';
import { isUnlocked, onLockChange, unlockBook, setUpLock, markUnlocked, LockError } from '../security/faceLock';
import { Icon } from './icons';
import { navigate } from './util';

/** Shows its children only when the book isn't locked, or has been unlocked with Face ID. */
export function LockGate({ bookId, children }: { bookId: string; children: ReactNode }) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getBook(bookId).then((b) => !cancelled && setLocked(!!b?.locked));
    return () => {
      cancelled = true;
    };
  }, [bookId]);
  useEffect(() => onLockChange(() => setTick((t) => t + 1)), []);

  if (locked === null) return <div className="loading">Loading…</div>;
  if (!locked || isUnlocked(bookId)) return <>{children}</>;
  return <LockScreen bookId={bookId} />;
}

function LockScreen({ bookId }: { bookId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockBook(bookId);
    } catch (e) {
      setError(e instanceof LockError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // For when the passkey was deleted. Setting up again needs Face ID or the passcode itself,
  // so it doesn't let anyone else in. (No confirm() first: Safari needs the tap for Face ID.)
  const reset = async () => {
    setError(null);
    try {
      await setUpLock();
      markUnlocked(bookId);
    } catch (e) {
      setError(e instanceof LockError ? e.message : String(e));
    }
  };

  return (
    <div className="lock-screen">
      <header className="toolbar">
        <button className="btn ghost tool" onClick={() => navigate('#/')} aria-label="Back to library" title="Library">
          <Icon name="back" />
          <span className="tool-label">Library</span>
        </button>
      </header>
      <div className="lock-body">
        <span className="lock-badge"><Icon name="lock" /></span>
        <h2>This book is locked</h2>
        <p className="muted">Use Face ID to open it.</p>
        <button className="btn primary big" onClick={unlock} disabled={busy}>
          {busy ? 'Waiting for Face ID…' : 'Unlock with Face ID'}
        </button>
        {error && (
          <>
            <p className="error-box">{error}</p>
            <p className="muted small">If Face ID keeps failing, for example after deleting the Inkbook passkey from Passwords:</p>
            <button className="btn small" onClick={reset}>Set up Face ID again</button>
          </>
        )}
      </div>
    </div>
  );
}
