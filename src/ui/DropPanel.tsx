import type { ReactNode } from 'react';

/**
 * A panel that drops down from the toolbar, over the page. It stays in view however far the
 * page is scrolled; tapping outside it closes it.
 */
export function DropPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="panel drop-panel">{children}</aside>
    </>
  );
}
