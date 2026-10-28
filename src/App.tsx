import { lazy, Suspense, useEffect, useState } from 'react';
import { Library } from './ui/Library';
import { Reader } from './ui/Reader';
import { useHashRoute } from './ui/hooks';
import { LockGate } from './ui/LockGate';

// The writer pulls in the ink compiler and editor, so it loads on demand.
const Writer = lazy(() => import('./ui/Writer').then((m) => ({ default: m.Writer })));

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
