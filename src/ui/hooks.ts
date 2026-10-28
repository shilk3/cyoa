import { useEffect, useMemo, useState } from 'react';
import type { Asset } from '../book/types';

/** Object URLs for a book's assets, keyed by their path in the book (e.g. "assets/map.png"). */
export function useAssetUrls(assets: Asset[] | undefined): Record<string, string> {
  const urls = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of assets ?? []) out[a.path] = URL.createObjectURL(a.data);
    return out;
  }, [assets]);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export function useHashRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** A number kept in localStorage (a per-device preference such as text size). */
export function useStoredNumber(key: string, initial: number): [number, (n: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) && v > 0 ? v : initial;
    } catch {
      return initial;
    }
  });
  const set = (n: number) => {
    setValue(n);
    try {
      localStorage.setItem(key, String(n));
    } catch {
      // Preference only lasts for this visit.
    }
  };
  return [value, set];
}
