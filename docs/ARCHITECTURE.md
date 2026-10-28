# cyoa-reader architecture (Ink-based)

## Overview

```
 AUTHORING                    PACKAGING                     READING
 ─────────                    ─────────                     ───────
 story.ink  ──compile──▶  story.json ──┐
 (inklecate or                         ├─▶  book.inkbook ──▶  Reader app (PWA)
  inkjs compiler)        manifest.json ┤     (zip)              ├─ Library
                         cover.jpg     │                        ├─ Story engine (inkjs)
                         assets/…   ───┘                        ├─ Renderer
                                                                └─ Save manager
```

Authors write `.ink`. A build step compiles it to the runtime JSON and bundles it
with metadata and media into a single `.inkbook` file. The reader never compiles
ink; it only loads the compiled JSON with the lightweight inkjs runtime.

## 1. Book package: `.inkbook`

A zip archive (like EPUB, so it is easy to inspect and generate):

```
book.inkbook
├── manifest.json
├── story.json          # compiled ink (ink runtime format)
├── cover.jpg           # optional
└── assets/             # images/audio referenced by tags
```

`manifest.json`:

```json
{
  "format": "inkbook",
  "formatVersion": 1,
  "id": "urn:uuid:3f6c…",          // stable ID; saves are keyed by it
  "title": "The Lighthouse Keeper",
  "author": "…",
  "language": "en",
  "description": "…",
  "cover": "cover.jpg",
  "story": "story.json",
  "inkVersion": 21,               // ink JSON format version, checked on load
  "storyRevision": 3              // bump when content changes; used to validate saves
}
```

## 2. Authoring conventions (tags)

Plain ink works as-is. The reader also understands a small set of tags so authors
can control presentation without the reader knowing anything story-specific:

| Tag | Meaning |
|---|---|
| `# title: …` / `# author: …` | Global tags at top of file; fallback metadata |
| `# chapter: Name` | Start a new chapter heading (also a table-of-contents / bookmark point) |
| `# clear` | Clear the page before showing the following text |
| `# image: assets/x.jpg` | Show an image inline |
| `# class: whisper` | Apply a CSS class to this paragraph |
| `# ending: good` / `# ending: bad` | Mark an ending; tracked for "endings found" |

Unknown tags are ignored, so books stay forward-compatible.

## 3. Reader app

A static web app / PWA (works offline, installable on phones, no server needed).
Suggested stack: TypeScript + Vite, inkjs runtime, IndexedDB for storage.

### Modules

**Library** — imports `.inkbook` files (file picker / drag-and-drop), unzips with
JSZip, validates `manifest.json`, stores the book in IndexedDB, shows a shelf of
covers with progress and "endings found".

**StoryEngine** — thin wrapper around `inkjs.Story`, the only module that talks
to ink:

```ts
interface Passage { text: string; tags: string[] }
interface Choice  { index: number; text: string; tags: string[] }

class StoryEngine {
  constructor(storyJson: string)
  continue(): Passage[]          // calls story.Continue() while story.canContinue
  get choices(): Choice[]        // story.currentChoices
  choose(index: number): void    // story.ChooseChoiceIndex(i)
  get ended(): boolean           // !canContinue && no choices
  saveState(): string            // story.state.ToJson()
  loadState(json: string): void  // story.state.LoadJson()
  getVar(name: string): unknown  // story.variablesState[name] (for stats panel)
  onVarChange(name, cb)          // story.ObserveVariable (live stat display)
}
```

**Renderer** — turns `Passage[]` + `Choice[]` into DOM. Interprets the tags above,
appends text with a fade-in, renders choices as buttons, shows an ending screen.
Keeps a transcript so the reader can scroll back.

**SaveManager**
- *Autosave* after every choice: `{ bookId, storyRevision, inkState, transcript, timestamp }`.
- *Manual slots* for bookmarks.
- *Undo / "go back"*: keep a stack of `inkState` snapshots (one per choice) —
  this is how a reader "keeps a finger on the page" like with a paper gamebook.
- On load, if `storyRevision` differs, warn that the save may not match.

**Settings** — font, size, theme, text speed, "show visited choices" toggle.

### Turn loop

```
open book → load autosave? ──yes──▶ engine.loadState()
                │no
                ▼
        passages = engine.continue()  → render text (+ tags)
        choices  = engine.choices     → render buttons
                │ user taps choice i
                ▼
        snapshot = engine.saveState() → push undo stack, autosave
        engine.choose(i) → loop
        (no choices left → ending screen, record ending tag)
```

## 4. Build tooling

`tools/build-book` (Node script):
1. Compile `.ink` with the inkjs compiler (`inkjs/full`), fail on errors/warnings.
2. Read global tags for default metadata; merge with an optional `book.yaml`.
3. Zip manifest + story.json + assets into `dist/<slug>.inkbook`.
4. Optional: a "playthrough lint" that walks random choices N times to catch
   dead ends (states with no choices and no `# ending` tag).

## 5. Possible later additions

- EPUB export: for linear-branching stories, unroll knots into linked EPUB
  sections so books also work on ordinary e-readers (state-heavy books won't).
- Mobile wrapper (Capacitor) if app-store distribution is wanted.
