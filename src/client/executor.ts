/**
 * Executor mapping for dsh-code-runner.
 *
 * The map is a focused port of vscode-code-runner's default `executorMap` /
 * `executorMapByFileExtension`. Because the sidebar knows the file path (not
 * a VSCode language id), the lookup is keyed by lower-case file extension.
 * Commands use the same `$dir`, `$fileName`, `$fileNameWithoutExt`,
 * `$fullFileName`, `$workspaceRoot`, `$driveLetter` and
 * `$dirWithoutTrailingSlash` placeholders as Code Runner.
 */

export const EXECUTOR_BY_EXTENSION: Record<string, string> = {
  '.js': 'node',
  '.mjs': 'node',
  '.cjs': 'node',
  '.jsx': 'node',
  '.ts': 'ts-node',
  '.mts': 'ts-node',
  '.cts': 'ts-node',
  '.tsx': 'ts-node',
  '.py': 'python -u',
  '.rb': 'ruby',
  '.php': 'php',
  '.go': 'go run',
  '.rs': 'cd $dir && rustc $fileName && $dir$fileNameWithoutExt',
  '.c': 'cd $dir && gcc $fileName -o $fileNameWithoutExt && $dir$fileNameWithoutExt',
  '.cpp': 'cd $dir && g++ $fileName -o $fileNameWithoutExt && $dir$fileNameWithoutExt',
  '.cc': 'cd $dir && g++ $fileName -o $fileNameWithoutExt && $dir$fileNameWithoutExt',
  '.cxx': 'cd $dir && g++ $fileName -o $fileNameWithoutExt && $dir$fileNameWithoutExt',
  '.java': 'cd $dir && javac $fileName && java $fileNameWithoutExt',
  '.kt': 'cd $dir && kotlinc $fileName -include-runtime -d $fileNameWithoutExt.jar && java -jar $fileNameWithoutExt.jar',
  '.kts': 'kotlinc -script',
  '.swift': 'swift',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.ps1': 'powershell -ExecutionPolicy ByPass -File',
  '.bat': 'cmd /c',
  '.cmd': 'cmd /c',
  '.lua': 'lua',
  '.pl': 'perl',
  '.r': 'Rscript',
  '.jl': 'julia',
  '.dart': 'dart',
  '.exs': 'elixir',
  '.scala': 'scala',
  '.fsx': 'dotnet fsi',
  '.csx': 'dotnet script',
  '.hs': 'runghc',
  '.ml': 'ocaml',
  '.clj': 'clojure',
  '.groovy': 'groovy',
  '.nim': 'nim compile --verbosity:0 --hints:off --run',
  '.v': 'v run',
  '.zig': 'zig run',
  '.mojo': 'mojo run',
  '.gleam': 'gleam run -m $fileNameWithoutExt',
}

export function extnameOf(path: string): string {
  const index = path.lastIndexOf('.')
  if (index <= 0) return ''
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (index < slash) return ''
  return path.slice(index).toLowerCase()
}

export function basenameOf(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

export function dirnameOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (index <= 0) return path
  return path.slice(0, index)
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function buildRunCommand(path: string, workspaceRoot: string): string | null {
  const ext = extnameOf(path)
  const executor = EXECUTOR_BY_EXTENSION[ext]
  if (executor === undefined) return null

  const dirRaw = dirnameOf(path)
  const dir = dirRaw.endsWith('/') || dirRaw.endsWith('\\')
    ? dirRaw
    : dirRaw + (dirRaw.includes('\\') && !dirRaw.includes('/') ? '\\' : '/')
  const dirWithoutTrailing = dir.replace(/[\\/]+$/, '')
  const fileName = basenameOf(path)
  const fileNameWithoutExt = fileName.replace(/\.[^.]*$/, '')
  const driveMatch = /^([A-Za-z]:)/.exec(path)
  const driveLetter = driveMatch?.[1] ?? ''

  let command = executor
  command = command.replace(/\$workspaceRoot/g, quote(workspaceRoot))
  command = command.replace(/\$fileNameWithoutExt/g, fileNameWithoutExt)
  command = command.replace(/\$fullFileName/g, quote(path))
  command = command.replace(/\$fileName/g, fileName)
  command = command.replace(/\$driveLetter/g, driveLetter)
  command = command.replace(/\$dirWithoutTrailingSlash/g, quote(dirWithoutTrailing))
  command = command.replace(/\$dir/g, quote(dir))
  command = command.replace(/\$pythonPath/g, 'python')

  // Like Code Runner: if the executor does not reference the file through a
  // placeholder, append the quoted file path.
  if (command === executor) {
    command = `${executor} ${quote(path)}`
  }
  return command
}
