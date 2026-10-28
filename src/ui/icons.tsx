// Small stroke icons (24×24 grid) so toolbars fit on one line on phones.

const PATHS = {
  back: 'M15 18l-6-6 6-6',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  restart: 'M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z',
  stats: 'M18 20V10M12 20V4M6 20v-6',
  display: 'M4 7V5h16v2M9 19h6M12 5v14',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z',
  read: 'M2 4h6a4 4 0 014 4v13a3 3 0 00-3-3H2zM22 4h-6a4 4 0 00-4 4v13a3 3 0 013-3h7z',
  export: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13',
  import: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M8 11l4 4 4-4M12 15V3',
  plus: 'M12 5v14M5 12h14',
  contents: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  system: 'M3 4h18v12H3zM8 20h8M12 16v4',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 017.75-1.4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * Toolbar button: icon plus a text label. On narrow screens only the icon shows,
 * and the label stays available to screen readers and as a tooltip.
 */
export function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  primary,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      className={`btn tool ${active ? 'active' : ''} ${primary ? 'primary' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon name={icon} />
      <span className="tool-label">{label}</span>
    </button>
  );
}
