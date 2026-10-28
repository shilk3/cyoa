import { Icon } from './icons';
import { useThemePref, type ThemePref } from './theme';

const OPTIONS: { value: ThemePref; label: string; icon: 'system' | 'sun' | 'moon' }[] = [
  { value: 'system', label: 'System', icon: 'system' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

/** System / Light / Dark switch. "System" follows the phone's or computer's setting. */
export function ThemePicker() {
  const [pref, setPref] = useThemePref();
  return (
    <div className="setting-row">
      <span>Theme</span>
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((o) => (
          <button key={o.value} role="radio" aria-checked={pref === o.value} className={pref === o.value ? 'on' : ''} onClick={() => setPref(o.value)}>
            <Icon name={o.icon} />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
