// Bundles the game API into Vercel's Build Output format (.vercel/output), so the
// deployment doesn't depend on how Vercel would compile TypeScript in api/.
import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const out = '.vercel/output';
const fn = `${out}/functions/api/game.func`;
await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });
await mkdir(`${out}/static`, { recursive: true });

await build({
  entryPoints: ['server/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: true,
  // Some dependencies still call require(); give ESM output a require of its own.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

await writeFile(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, regions: ['syd1'] }));
await writeFile(`${out}/static/index.html`, '<!doctype html><title>Pagefork game server</title><p>Pagefork game server. The app is at <a href="https://shilk3.github.io/cyoa/">shilk3.github.io/cyoa</a>.</p>');
await writeFile(`${out}/config.json`, JSON.stringify({ version: 3 }));
console.log('Built', fn);
