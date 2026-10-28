import { useEffect, useRef, useState } from 'react';
import ePub, { type Book as EpubBook, type Rendition, type NavItem } from 'epubjs';
import type { Book } from '../book/types';
import { getPosition, putPosition } from '../storage/db';
import { LibraryButton } from './LibraryButton';
import { ToolButton } from './icons';
import { DropPanel } from './DropPanel';
import { ThemePicker } from './ThemePicker';
import { onThemeChange } from './theme';
import { MARGINS, SPACING, useLayoutPrefs, type LayoutPrefs } from './layoutPrefs';
import { LayoutPicker } from './LayoutPicker';

type Flow = 'paginated' | 'scrolled-doc';

const PREFS_KEY = 'inkbook:epub-prefs';

interface Prefs {
  fontSize: number; // percent
  flow: Flow;
}

function loadPrefs(): Prefs {
  try {
    return { fontSize: 100, flow: 'paginated', ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { fontSize: 100, flow: 'paginated' };
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

/**
 * Styles injected into the book's iframe: the app's theme colours (so dark mode applies inside
 * the book too) and the reader's line-spacing choice. In scroll layout the side margins are body
 * padding; in page layout epub.js manages body padding itself, so margins come from its `gap`.
 */
function themeRules(layout: LayoutPrefs, flow: Flow) {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const { lineHeight, paragraphGap } = SPACING[layout.spacing];
  const body: Record<string, string> = {
    color: `${v('--fg')} !important`,
    background: `${v('--bg')} !important`,
    'line-height': `${lineHeight} !important`,
  };
  if (flow === 'scrolled-doc') body.padding = `0 ${MARGINS[layout.margins]}px !important`;
  return {
    body,
    'p, li, blockquote, div': { 'line-height': `${lineHeight} !important` },
    p: { 'margin-top': '0 !important', 'margin-bottom': `${paragraphGap} !important` },
    'a, a:link, a:visited': { color: `${v('--accent')} !important` },
  };
}

export function EpubReader({ book }: { book: Book }) {
  const host = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const epubRef = useRef<EpubBook | null>(null);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [panel, setPanel] = useState<'none' | 'toc' | 'settings'>('none');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [layout] = useLayoutPrefs();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [percent, setPercent] = useState<number | null>(null);
  const [chapter, setChapter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  // (Re)create the rendition when the book or the layout mode changes.
  useEffect(() => {
    if (!book.epub || !host.current) return;
    let cancelled = false;
    const el = host.current;
    let epub: EpubBook | null = null;
    let rendition: Rendition | null = null;

    (async () => {
      try {
        epub = ePub(await book.epub!.arrayBuffer());
        epubRef.current = epub;
        // `gap` is a real epub.js option that its type definitions leave out.
        rendition = epub.renderTo(el, {
          width: '100%',
          height: '100%',
          flow: prefs.flow,
          spread: 'none',
          // Space between pages; half of it shows at each side of the text.
          gap: MARGINS[layout.margins] * 2,
          allowScriptedContent: false,
        } as Parameters<EpubBook['renderTo']>[1]);
        renditionRef.current = rendition;
        rendition.themes.register('app', themeRules(layoutRef.current, prefs.flow));
        rendition.themes.select('app');
        rendition.themes.fontSize(`${prefs.fontSize}%`);

        const nav = await epub.loaded.navigation;
        if (cancelled) return;
        setToc(nav.toc);
        const labelFor = (href: string) => {
          const file = href.split('#')[0];
          const flat = (items: NavItem[]): NavItem[] => items.flatMap((i) => [i, ...flat(i.subitems ?? [])]);
          return flat(nav.toc).find((i) => i.href.split('#')[0].endsWith(file) || file.endsWith(i.href.split('#')[0]))?.label.trim() ?? '';
        };

        const saved = await getPosition(book.id);
        if (cancelled) return;
        // Until page counts are ready, keep showing (and saving) the last known percentage.
        let lastPercent = saved?.percent ?? null;
        let lastCfi = saved?.cfi ?? '';
        const savePosition = () => {
          if (lastCfi) void putPosition({ bookId: book.id, cfi: lastCfi, percent: lastPercent, updated: new Date().toISOString() });
        };

        rendition.on('relocated', (loc: { start: { cfi: string; href: string }; atStart: boolean; atEnd: boolean }) => {
          setAtStart(loc.atStart);
          setAtEnd(loc.atEnd);
          setChapter(labelFor(loc.start.href));
          lastCfi = loc.start.cfi;
          if (epub!.locations.length()) lastPercent = epub!.locations.percentageFromCfi(loc.start.cfi);
          setPercent(lastPercent);
          savePosition();
        });

        // Swipe and tap-to-turn on touch screens. Links inside the book still work.
        let touchX = 0;
        let touchY = 0;
        rendition.on('touchstart', (e: TouchEvent) => {
          touchX = e.changedTouches[0].screenX;
          touchY = e.changedTouches[0].screenY;
        });
        rendition.on('touchend', (e: TouchEvent) => {
          if (prefs.flow !== 'paginated') return;
          const dx = e.changedTouches[0].screenX - touchX;
          const dy = e.changedTouches[0].screenY - touchY;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            void (dx < 0 ? rendition!.next() : rendition!.prev());
          }
        });
        rendition.on('click', (e: MouseEvent) => {
          if (prefs.flow !== 'paginated') return;
          if ((e.target as Element | null)?.closest?.('a')) return;
          const x = e.screenX - window.screenX;
          const w = window.innerWidth;
          if (x < w * 0.25) void rendition!.prev();
          else if (x > w * 0.75) void rendition!.next();
        });
        rendition.on('keyup', (e: KeyboardEvent) => onKey(e));

        await rendition.display(saved?.cfi || undefined);

        // Page counts need a pass over the whole book; do it after the first page shows.
        await epub.locations.generate(1600);
        if (cancelled) return;
        if (lastCfi) {
          lastPercent = epub.locations.percentageFromCfi(lastCfi);
          setPercent(lastPercent);
          savePosition();
        }
      } catch (e) {
        if (!cancelled) setError(`Couldn't open this e-book: ${(e as Error).message}`);
      }
    })();

    return () => {
      cancelled = true;
      rendition?.destroy();
      epub?.destroy();
      renditionRef.current = null;
      epubRef.current = null;
    };
    // Font size, colours and spacing are applied live below; layout and margin changes need a
    // fresh rendition (epub.js only reads its page gap when it starts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.epub, prefs.flow, layout.margins]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${prefs.fontSize}%`);
    savePrefs(prefs);
  }, [prefs]);

  // Restyle the book when the theme (picker or system setting) or line spacing changes.
  const restyle = () => {
    const r = renditionRef.current;
    if (!r) return;
    r.themes.register('app', themeRules(layoutRef.current, prefs.flow));
    r.themes.select('app');
  };
  useEffect(() => onThemeChange(restyle));
  useEffect(restyle, [layout.spacing]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') void renditionRef.current?.prev();
    if (e.key === 'ArrowRight' || e.key === 'PageDown') void renditionRef.current?.next();
  };
  useEffect(() => {
    window.addEventListener('keyup', onKey);
    return () => window.removeEventListener('keyup', onKey);
  }, []);

  const goTo = (href: string) => {
    void renditionRef.current?.display(href);
    setPanel('none');
  };

  return (
    <div className="epub-reader">
      <div className="top-bar">
        <header className="toolbar">
          <LibraryButton />
          <h1 className="toolbar-title">{book.manifest.title}</h1>
          <div className="toolbar-actions">
            <ToolButton icon="contents" label="Contents" active={panel === 'toc'} onClick={() => setPanel(panel === 'toc' ? 'none' : 'toc')} />
            <ToolButton icon="display" label="Display" active={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} />
          </div>
        </header>

        {panel === 'toc' && (
          <DropPanel onClose={() => setPanel('none')}>
            {toc.length === 0 ? <p className="muted">This book has no table of contents.</p> : <TocList items={toc} onGo={goTo} />}
          </DropPanel>
        )}
        {panel === 'settings' && (
          <DropPanel onClose={() => setPanel('none')}>
            <ThemePicker />
            <LayoutPicker />
            <div className="setting-row">
              <span>Text size</span>
              <button className="btn" onClick={() => setPrefs({ ...prefs, fontSize: Math.max(70, prefs.fontSize - 10) })} aria-label="Smaller text">A−</button>
              <span className="muted small">{prefs.fontSize}%</span>
              <button className="btn" onClick={() => setPrefs({ ...prefs, fontSize: Math.min(200, prefs.fontSize + 10) })} aria-label="Larger text">A+</button>
            </div>
            <div className="setting-row">
              <span>Layout</span>
              <button className={`btn ${prefs.flow === 'paginated' ? 'active' : ''}`} onClick={() => setPrefs({ ...prefs, flow: 'paginated' })}>Pages</button>
              <button className={`btn ${prefs.flow === 'scrolled-doc' ? 'active' : ''}`} onClick={() => setPrefs({ ...prefs, flow: 'scrolled-doc' })}>Scroll</button>
            </div>
          </DropPanel>
        )}
      </div>

      {error ? (
        <div className="empty-state"><p className="error-box">{error}</p></div>
      ) : (
        <div className={`ebook-stage flow-${prefs.flow}`} style={{ ['--page-margin' as string]: `${MARGINS[layout.margins]}px` }}>
          <div className="ebook-host" ref={host} />
        </div>
      )}

      <footer className="epub-footer">
        <button className="btn" onClick={() => void renditionRef.current?.prev()} disabled={atStart} aria-label="Previous page">‹</button>
        <span className="epub-where muted small">
          {chapter && <span className="epub-chapter">{chapter}</span>}
          {percent !== null && <span>{Math.round(percent * 100)}%</span>}
        </span>
        <button className="btn" onClick={() => void renditionRef.current?.next()} disabled={atEnd} aria-label="Next page">›</button>
      </footer>
    </div>
  );
}

function TocList({ items, onGo }: { items: NavItem[]; onGo: (href: string) => void }) {
  return (
    <ul className="toc">
      {items.map((i) => (
        <li key={i.id || i.href}>
          <button className="link" onClick={() => onGo(i.href)}>{i.label.trim()}</button>
          {i.subitems && i.subitems.length > 0 && <TocList items={i.subitems} onGo={onGo} />}
        </li>
      ))}
    </ul>
  );
}
