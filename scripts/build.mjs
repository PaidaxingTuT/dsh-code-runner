// Cross-platform host build: run tsc through the local TypeScript package.
// `scripts/build.sh` is kept for Git Bash / dev_build_plugin environments.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = resolve(root, 'node_modules/typescript/bin/tsc')
const result = spawnSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
