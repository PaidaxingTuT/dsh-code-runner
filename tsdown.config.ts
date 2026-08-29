import type { UserConfig } from 'tsdown'

/**
 * dsh-code-runner client bundle.
 *
 * The client half is intentionally dependency-free: it only uses DOM APIs,
 * fetch, WebSocket and the `ctx.betterSidebar` service provided by
 * dsh-better-sidebar. The output is a DSH ModuleLoader CJS factory, so it is
 * loaded exactly like dsh-better-sidebar's own client bundles.
 */
const PLUGIN_ID = 'dsh-code-runner'

const clientBundle: UserConfig = {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  deps: {
    neverBundle: [],
    alwaysBundle: () => true,
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(PLUGIN_ID) + ', factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    codeSplitting: false,
  },
}

export default [clientBundle] satisfies UserConfig[]
