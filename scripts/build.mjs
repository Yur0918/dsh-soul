/** Build script: host bundle (single ESM file) + client bundle (loader factory). */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'

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
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-soul", factory: (require, module, exports) => {' },
  footer: { js: 'return module.exports; } });' },
})

console.log('[build] done: lib/plugin.js + client/client.js')
