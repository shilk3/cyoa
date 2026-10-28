import { useEffect, useState } from 'react';

export type Spacing = 'compact' | 'normal' | 'relaxed';
export type Margins = 'narrow' | 'normal' | 'wide';

export interface LayoutPrefs {
  spacing: Spacing;
  margins: Margins;
}

const KEY = 'inkbook:layout';
const EVENT = 'inkbook:layoutchange';
const DEFAULTS: LayoutPrefs = { spacing: 'normal', margins: 'normal' };

/** Line height and gap between paragraphs for each spacing choice. */
export const SPACING: Record<Spacing, { lineHeight: number; paragraphGap: string }> = {
  compact: { lineHeight: 1.4, paragraphGap: '0.5em' },
  normal: { lineHeight: 1.65, paragraphGap: '0.9em' },
  relaxed: { lineHeight: 1.9, paragraphGap: '1.2em' },
};

/** Space between the text and the screen edges, in px. */
export const MARGINS: Record<Margins, number> = { narrow: 6, normal: 16, wide: 32 };

export function getLayoutPrefs(): LayoutPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      spacing: v.spacing in SPACING ? v.spacing : DEFAULTS.spacing,
      margins: v.margins in MARGINS ? v.margins : DEFAULTS.margins,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Shared by the ink reader and the e-book reader; saved per device. */
export function useLayoutPrefs(): [LayoutPrefs, (p: Partial<LayoutPrefs>) => void] {
  const [prefs, setPrefs] = useState(getLayoutPrefs);
  useEffect(() => {
    const on = () => setPrefs(getLayoutPrefs());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const update = (p: Partial<LayoutPrefs>) => {
    const next = { ...getLayoutPrefs(), ...p };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Applies for this visit only.
    }
    setPrefs(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [prefs, update];
}

/** CSS variables for the ink reader's page. */
export function layoutStyle(p: LayoutPrefs): Record<string, string | number> {
  return {
    '--story-leading': SPACING[p.spacing].lineHeight,
    '--story-gap': SPACING[p.spacing].paragraphGap,
    '--page-margin': `${MARGINS[p.margins]}px`,
  };
}
