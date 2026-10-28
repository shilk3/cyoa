# cyoa-reader (Inkbook)

Read, write and export choose-your-own-adventure books written in [ink](https://www.inklestudios.com/ink/).

Everything runs in the browser. Books are stored locally in IndexedDB, and no server is needed.

## Features

**Library**
- Import `.inkbook`, `.ink` or compiled ink `.json` files, either with the file picker or by dropping them on the page
- Shows covers, reading progress and how many endings you've found

**Reader**
- Shows each passage with its choices; your place is saved automatically after every choice
- *Back* undoes your last choice, the way you'd keep a finger in the page of a paper gamebook
- Named bookmarks
- A stats panel showing the story's variables
- Supports images, chapters, page clears and endings marked with tags

**Writer**
- Ink editor with syntax highlighting
- The story compiles as you type, with errors marked inline and listed under Problems (click one to jump to its line)
- Live preview with back, restart and a variable inspector
- Outline of knots and stitches
- Book details: title, author, description, cover, and images or audio to use in the story
- An Ink cheat sheet

**Export**

| Format | Use it for |
|---|---|
| `.inkbook` | This app. Includes the source, so the book can be edited. |
| `.inkbook` (read-only) | Sharing with readers. The source is left out. |
| `.html` | A single file that plays in any browser, with undo and autosave. |
| `.epub` | E-readers. The story is turned into numbered, linked sections ("turn to 12"). |
| `.ink` | Editing in [Inky](https://github.com/inkle/inky) or other ink tools. |
| `.json` | Game engines (Unity ink plugin, inkjs). |

EPUB export works by exploring every reachable state of the story. Stories whose state never settles, such as an endlessly incrementing counter, are refused with a message suggesting the HTML export instead.

## Tags understood by the reader

```
# title: My Book          top of file: default title
# author: Your Name       top of file: default author
# chapter: Part One       chapter heading
# clear                   start a fresh page
# image: assets/map.png   show an image added in the writer's Details tab
# class: whisper          style the line
# ending: good            mark an ending (counted in the library)
```

## Development

```sh
npm install
npm run dev      # start a dev server
npm test         # run unit tests (vitest)
npm run build    # build static files into dist/ (deployable anywhere)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the app is put together, and `stories/` for sample books.
