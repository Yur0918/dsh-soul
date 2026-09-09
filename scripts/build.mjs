/** Build script: host bundle (single ESM file) + client bundle (loader factory). */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
// The loader registers client modules under the PACKAGE name (dshmarket does
// id: "dshmarket"); a scoped package must register under the full scoped name.
const LOADER_ID = pkg.name

console.log('[build] host typecheck…')
execFileSync('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], { stdio: 'inherit' })

console.log('[build] host bundle…')
await build({
  entryPoints: ['src/plugin.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'lib/plugin.js',
  sourcemap: false,
})

console.log('[build] client bundle…')
await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
  outfile: 'client/client.js',
  // dshmarket parity: the loader calls factory(require) with ONE argument —
  // module/exports are created inside the factory body (see dshmarket's
  // bundled client/client.js header).
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(LOADER_ID)}, factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
})

console.log('[build] done: lib/plugin.js + client/client.js')
