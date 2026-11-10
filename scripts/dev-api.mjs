import { build } from 'esbuild';
const outfile = 'node_modules/.tmp/dev-api.mjs';
await build({
  stdin: { contents: "import { startDevServer } from './server/dev.ts'; const port = Number(process.argv[2] ?? 8787); await startDevServer(port); console.log('Game API on http://localhost:' + port);", resolveDir: '.', loader: 'ts' },
  outfile, bundle: true, platform: 'node', format: 'esm', target: 'node20', external: ['@electric-sql/pglite'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
await import('../' + outfile);
