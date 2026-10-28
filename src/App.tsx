import { lazy, Suspense, useEffect, useState } from 'react';
import { Library } from './ui/Library';
import { Reader } from './ui/Reader';
import { useHashRoute } from './ui/hooks';

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
  if (view === 'read' && id) return <Reader key={id} bookId={id} />;
  if (view === 'write' && id) {
    return (
      <Suspense fallback={<div className="loading">Loading writer…</div>}>
        <Writer key={id} bookId={id} />
      </Suspense>
    );
  }
  return <Library />;
}
