import inkRuntime from '../../node_modules/inkjs/dist/ink.js?raw';
import type { Book } from '../book/types';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Makes JavaScript safe to place inside a <script> element. */
const scriptSafe = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1');
/** JSON can only contain '<' inside strings, where \u003c is equivalent. */
const jsonSafe = (s: string) => s.replace(/</g, '\\u003c');

async function blobToDataUrl(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

// Minimal standalone player. Mirrors the app reader: tags, undo, restart, autosave.
const PLAYER = `
(function () {
  var data = JSON.parse(document.getElementById('book-data').textContent);
  var story = new inkjs.Story(data.story);
  var key = 'inkbook:' + data.id;
  var out = document.getElementById('story');
  var choicesEl = document.getElementById('choices');
  var transcript = [], undo = [];
  function tag(t) { var i = t.indexOf(':'); return i < 0 ? [t.trim().toLowerCase(), ''] : [t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()]; }
  function renderEntry(e) {
    if (e.kind === 'choice') { var c = document.createElement('p'); c.className = 'picked'; c.textContent = e.text; out.appendChild(c); return; }
    var cls = '';
    (e.tags || []).forEach(function (t) {
      var kv = tag(t);
      if (kv[0] === 'clear') { var hr = document.createElement('hr'); out.appendChild(hr); }
      if (kv[0] === 'chapter' && kv[1]) { var h = document.createElement('h2'); h.textContent = kv[1]; out.appendChild(h); }
      if (kv[0] === 'image' && data.assets[kv[1]]) { var img = document.createElement('img'); img.src = data.assets[kv[1]]; img.alt = ''; out.appendChild(img); }
      if (kv[0] === 'class') cls = kv[1];
    });
    if (e.text.trim()) { var p = document.createElement('p'); p.textContent = e.text; if (cls) p.className = cls; out.appendChild(p); }
  }
  function advance() {
    try {
      while (story.canContinue) { var t = story.Continue().replace(/\\n$/, ''); transcript.push({ kind: 'text', text: t, tags: story.currentTags || [] }); }
    } catch (err) { transcript.push({ kind: 'text', text: '[Story error: ' + err.message + ']', tags: [] }); }
  }
  function save() { try { localStorage.setItem(key, JSON.stringify({ s: story.state.ToJson(), t: transcript, u: undo })); } catch (e) {} }
  function render() {
    out.innerHTML = ''; transcript.forEach(renderEntry);
    choicesEl.innerHTML = '';
    story.currentChoices.forEach(function (c) {
      var b = document.createElement('button'); b.textContent = c.text;
      b.onclick = function () {
        undo.push({ s: story.state.ToJson(), n: transcript.length });
        transcript.push({ kind: 'choice', text: c.text, tags: [] });
        story.ChooseChoiceIndex(c.index); advance(); save(); render();
        var last = out.querySelector('.picked:last-of-type'); if (last) last.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      choicesEl.appendChild(b);
    });
    if (!story.currentChoices.length) { var end = document.createElement('p'); end.className = 'end'; end.textContent = 'THE END'; choicesEl.appendChild(end); }
    document.getElementById('undo').disabled = !undo.length;
  }
  function restart() { story.ResetState(); transcript = []; undo = []; advance(); save(); render(); window.scrollTo(0, 0); }
  document.getElementById('undo').onclick = function () {
    var u = undo.pop(); if (!u) return; story.state.LoadJson(u.s); transcript = transcript.slice(0, u.n); save(); render();
  };
  document.getElementById('restart').onclick = function () { if (confirm('Start again from the beginning?')) restart(); };
  try {
    var saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved) { story.state.LoadJson(saved.s); transcript = saved.t; undo = saved.u || []; render(); return; }
  } catch (e) {}
  restart();
})();
`;

const STYLE = `
:root { --bg: #fbf8f1; --fg: #2b2620; --muted: #7a6f60; --accent: #8a4b1f; --btn: #f1e8d6; --border: #e0d5c0; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1a16; --fg: #ece5d8; --muted: #a39887; --accent: #e0a46b; --btn: #2b2620; --border: #3d362d; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 19px/1.6 Georgia, 'Iowan Old Style', serif; }
header { position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--border); padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
header h1 { font-size: 16px; margin: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
header button { font: 14px system-ui, sans-serif; background: var(--btn); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
header button:disabled { opacity: .4; cursor: default; }
main { max-width: 38em; margin: 0 auto; padding: 24px 16px 80px; }
h2 { text-align: center; font-variant: small-caps; color: var(--accent); }
hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }
img { max-width: 100%; display: block; margin: 1em auto; border-radius: 4px; }
.picked { color: var(--muted); font-style: italic; border-left: 3px solid var(--accent); padding-left: 10px; }
.whisper { font-style: italic; color: var(--muted); }
#choices { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
#choices button { font: inherit; text-align: left; background: var(--btn); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; cursor: pointer; }
#choices button:hover { border-color: var(--accent); }
.end { text-align: center; font-weight: bold; letter-spacing: .1em; }
`;

export async function exportHtml(book: Book): Promise<Blob> {
  if (!book.storyJson) throw new Error('Book has no compiled story. Fix compile errors first.');
  const assets: Record<string, string> = {};
  for (const a of book.assets) assets[a.path] = await blobToDataUrl(a.data);
  const m = book.manifest;
  const payload = JSON.stringify({ id: m.id, story: JSON.parse(book.storyJson), assets });
  const html = `<!doctype html>
<html lang="${esc(m.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)}</title>
${m.author ? `<meta name="author" content="${esc(m.author)}">` : ''}
<style>${STYLE}</style>
</head>
<body>
<header><h1>${esc(m.title)}${m.author ? ` <small>by ${esc(m.author)}</small>` : ''}</h1><button id="undo">Back</button><button id="restart">Restart</button></header>
<main><div id="story"></div><div id="choices"></div></main>
<script type="application/json" id="book-data">${jsonSafe(payload)}</script>
<script>${scriptSafe(inkRuntime)}</script>
<script>${scriptSafe(PLAYER)}</script>
</body>
</html>`;
  return new Blob([html], { type: 'text/html' });
}
