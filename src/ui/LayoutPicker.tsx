import { useLayoutPrefs } from './layoutPrefs';

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LayoutPicker() {
  const [prefs, update] = useLayoutPrefs();
  return (
    <>
      <Segmented
        label="Line spacing"
        value={prefs.spacing}
        options={[['compact', 'Compact'], ['normal', 'Normal'], ['relaxed', 'Relaxed']]}
        onChange={(spacing) => update({ spacing })}
      />
      <Segmented
        label="Margins"
        value={prefs.margins}
        options={[['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']]}
        onChange={(margins) => update({ margins })}
      />
    </>
  );
}
