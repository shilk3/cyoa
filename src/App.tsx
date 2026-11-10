import { lazy, Suspense, useEffect, useState } from 'react';
import { Library } from './ui/Library';
import { Reader } from './ui/Reader';
import { useHashRoute } from './ui/hooks';
import { LockGate } from './ui/LockGate';

// The writer pulls in the ink compiler and editor, so it loads on demand.
const Writer = lazy(() => import('./ui/Writer').then((m) => ({ default: m.Writer })));
const GameScreen = lazy(() => import('./ui/online/GameScreen').then((m) => ({ default: m.GameScreen })));
const HostSetup = lazy(() => import('./ui/online/HostSetup').then((m) => ({ default: m.HostSetup })));
const JoinScreen = lazy(() => import('./ui/online/JoinScreen').then((m) => ({ default: m.JoinScreen })));
const loading = <div className="loading">Loading…</div>;

export default function App() {
  const route = useHashRoute();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    import('./book/sample')
      .then((m) => m.seedSampleBook())
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="loading">Loading…</div>;
  const [view, id] = route;
  if (view === 'read' && id) {
    return (
      <LockGate key={id} bookId={id}>
        <Reader bookId={id} />
      </LockGate>
    );
  }
  if (view === 'game' && id) {
    return (
      <Suspense fallback={loading}>
        <GameScreen key={id} code={id.toUpperCase()} />
      </Suspense>
    );
  }
  if (view === 'join') {
    return (
      <Suspense fallback={loading}>
        <JoinScreen key={id ?? ''} code={id} />
      </Suspense>
    );
  }
  if (view === 'online' && id) {
    return (
      <LockGate key={`online:${id}`} bookId={id}>
        <Suspense fallback={loading}>
          <HostSetup bookId={id} />
        </Suspense>
      </LockGate>
    );
  }
  if (view === 'party' && id) {
    return (
      <LockGate key={`party:${id}`} bookId={id}>
        <Reader bookId={id} mode="party" />
      </LockGate>
    );
  }
  if (view === 'write' && id) {
    return (
      <LockGate key={id} bookId={id}>
        <Suspense fallback={<div className="loading">Loading writer…</div>}>
          <Writer bookId={id} />
        </Suspense>
      </LockGate>
    );
  }
  return <Library />;
}
