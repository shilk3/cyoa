import { Icon } from './icons';
import { navigate } from './util';

/** "← Library" on wide screens, just the arrow on phones. */
export function LibraryButton() {
  return (
    <button className="btn ghost tool" onClick={() => navigate('#/')} aria-label="Back to library" title="Library">
      <Icon name="back" />
      <span className="tool-label">Library</span>
    </button>
  );
}
