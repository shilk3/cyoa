import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'inkbook:theme';
const EVENT = 'inkbook:themechange';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // Storage blocked: fall back to the system setting.
  }
  return 'system';
}

/** The theme actually showing, after resolving "system". */
export function effectiveTheme(pref: ThemePref = getThemePref()): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies a theme preference to the page. Called once at startup and whenever it changes. */
export function applyTheme(pref: ThemePref = getThemePref()): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  // Keep the browser and status bar colour in step with the page.
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', bg);
    m.removeAttribute('media');
  });
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Not persisted, but still applied for this visit.
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

/** Calls `cb` whenever the visible theme may have changed (user choice or system switch). */
export function onThemeChange(cb: () => void): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const sys = () => {
    if (getThemePref() === 'system') {
      applyTheme('system');
      cb();
    }
  };
  mq?.addEventListener('change', sys);
  window.addEventListener(EVENT, cb);
  return () => {
    mq?.removeEventListener('change', sys);
    window.removeEventListener(EVENT, cb);
  };
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  useEffect(() => onThemeChange(() => setPref(getThemePref())), []);
  return [pref, setThemePref];
}
