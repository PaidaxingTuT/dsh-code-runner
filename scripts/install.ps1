## =============================================================================
# dsh-code-runner 一键安装脚本（Windows PowerShell 5.1+ / pwsh）
#
# 功能：
#   1. 检测当前 DSH profile 是否已安装/挂载 dsh-better-sidebar；
#      没有则自动通过官方 CLI 安装（npm 失败时回退 GitHub 仓库）。
#   2. 安装 dsh-code-runner（默认打包本地目录，-Npm 走 npm registry）。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts/install.ps1 [-Profile web] [-Npm] [-Version latest] [-Restart] [-DryRun]
# =============================================================================
param(
  [string]$Profile = 'web',
  [switch]$Npm,
  [string]$Version = '',
  [switch]$Restart,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$BASE = 'dsh-code-runner'
$DEP = 'dsh-better-sidebar'

if ($env:DSH_HOME) {
  $DSH_HOME = $env:DSH_HOME
} elseif ($env:USERPROFILE) {
  $DSH_HOME = Join-Path $env:USERPROFILE '.dsh'
} else {
  $DSH_HOME = Join-Path $HOME '.dsh'
}
$PROFILE_DIR = Join-Path $DSH_HOME "profiles\$Profile"
$PACKAGE_JSON = Join-Path $PROFILE_DIR 'package.json'
$WS_YML = Join-Path $PROFILE_DIR 'pnpm-workspace.yaml'

function Say([string]$m)  { Write-Host "[install] $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "[warn] $m" -ForegroundColor Yellow }
function Die([string]$m)  { Write-Host "[error] $m" -ForegroundColor Red; exit 1 }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die '未找到 node（DSH 运行需要 Node.js >= 20）'
}
if (-not (Test-Path $PROFILE_DIR)) {
  Die "找不到 profile 目录：$PROFILE_DIR（请先安装并运行过一次 dsh web）"
}
if (-not (Test-Path $PACKAGE_JSON)) {
  Die "找不到 $PACKAGE_JSON"
}

function Get-DshCli {
  if ($env:DSH_CMD) { return $env:DSH_CMD }
  if (Get-Command dsh -ErrorAction SilentlyContinue) { return 'dsh' }
  if (Get-Command npx -ErrorAction SilentlyContinue) { return 'npx' }
  return $null
}

function Test-HasDep([string]$Name) {
  $pkg = Get-Content -Raw $PACKAGE_JSON | ConvertFrom-Json
  $deps = @{}
  if ($pkg.dependencies) { $pkg.dependencies.PSObject.Properties | ForEach-Object { $deps[$_.Name] = $_.Value } }
  if ($pkg.devDependencies) { $pkg.devDependencies.PSObject.Properties | ForEach-Object { $deps[$_.Name] = $_.Value } }
  $bundles = @()
  if ($pkg.dsh -and $pkg.dsh.profile -and $pkg.dsh.profile.bundles) {
    $bundles = @($pkg.dsh.profile.bundles)
  }
  return ($deps.ContainsKey($Name) -or $bundles -contains $Name)
}

function Ensure-WorkspaceSettings {
  if (-not (Test-Path $WS_YML)) { return }
  $script = @'
const fs = require("fs");
const p = process.argv[2];
let t = fs.readFileSync(p, "utf8");
const before = t;
t = t.replace(/^(\s*)(node-pty|protobufjs):.*$/gm, "$1$2: true");
if (!/^\s*allowBuilds:\s*$/m.test(t)) {
  t += "\nallowBuilds:\n  node-pty: true\n  protobufjs: true\n";
} else {
  for (const k of ["node-pty", "protobufjs"]) {
    if (!new RegExp("^\\s*" + k + ":\\s*true\\s*$", "m").test(t)) {
      t = t.replace(/^(\s*allowBuilds:\s*)$/m, "$1\n  " + k + ": true");
    }
  }
}
if (!/^\s*-\s+dsh-better-sidebar\s*$/m.test(t)) {
  if (/^\s*minimumReleaseAgeExclude:\s*$/m.test(t)) {
    t = t.replace(/^(\s*minimumReleaseAgeExclude:\s*)$/m, "$1\n  - dsh-better-sidebar");
  } else {
    t += "\nminimumReleaseAgeExclude:\n  - dsh-better-sidebar\n";
  }
}
if (t !== before) fs.writeFileSync(p, t);
'@
  $js = Join-Path $env:TEMP ("dshcr-ws-" + [guid]::NewGuid().ToString('N') + '.js')
  Set-Content -LiteralPath $js -Value $script -Encoding UTF8
  try { node $js "$WS_YML" 2>&1 | Out-Null } finally { Remove-Item -LiteralPath $js -Force -ErrorAction SilentlyContinue }
}

$CLI = Get-DshCli
if (-not $CLI) {
  Die '未找到 dsh 或 npx。请先安装 DSH，或用 DSH_CMD 指定 dsh 路径。'
}

# ── 1. dsh-better-sidebar 检测 / 自动安装 ─────────────────────────────
if (Test-HasDep $DEP) {
  Say "已检测到 $DEP，跳过自动安装"
} else {
  Say "未检测到 $DEP，开始自动安装..."
  if ($DryRun) {
    Say "[dry-run] 将执行：$CLI plugin --profile $Profile add $DEP@latest"
  } else {
    Ensure-WorkspaceSettings
    $addOut = & $CLI plugin --profile $Profile add "$DEP@latest" 2>&1
    if ($LASTEXITCODE -ne 0) {
      Warn 'npm 安装 dsh-better-sidebar 失败，回退到 GitHub 仓库...'
      $addOut = & $CLI plugin --profile $Profile add "github:omdsh-dev/DSH-better-sidebar" 2>&1
    }
    $addOut | ForEach-Object { $_ }
    if (-not (Test-HasDep $DEP)) { Die "$DEP 安装后仍未出现在 profile 中，请手动检查。" }
    Say "$DEP 安装并挂载完成"
  }
}

# ── 2. 安装 dsh-code-runner ──────────────────────────────────────────
if ($DryRun) {
  if ($Npm) {
    Say "[dry-run] 将执行：$CLI plugin --profile $Profile add $BASE@$($(if ($Version) { $Version } else { 'latest' }))"
  } else {
    Say '[dry-run] 将执行：npm pack && dsh plugin add file:<tgz>'
  }
  exit 0
}

if (Test-HasDep $BASE) {
  Say "已检测到 $BASE，跳过重复安装"
} else {
  if ($Npm) {
    $spec = if ($Version) { "$BASE@$Version" } else { "$BASE@latest" }
    Say "安装 $spec ..."
    & $CLI plugin --profile $Profile add $spec 2>&1 | ForEach-Object { $_ }
  } else {
    if (-not (Test-Path (Join-Path (Get-Location) 'lib'))) {
      Die '当前目录缺少 lib/，请先执行 npm install && npm run build 再安装。'
    }
    $tmp = Join-Path $env:TEMP ("dshcr-pack-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
      if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        $packOut = pnpm pack --pack-destination $tmp 2>&1
      } else {
        $packOut = npm pack --pack-destination $tmp 2>&1
      }
      $packOut | ForEach-Object { $_ }
      $tgz = Get-ChildItem -LiteralPath $tmp -Filter '*.tgz' | Select-Object -First 1
      if (-not $tgz) { Die '打包失败（pnpm/npm pack 均未生成 tgz）' }
      Say "安装本地包 $($tgz.Name) ..."
      & $CLI plugin --profile $Profile add "file:$($tgz.FullName)" 2>&1 | ForEach-Object { $_ }
    } finally {
      Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  if (-not (Test-HasDep $BASE)) { Die "$BASE 安装后仍未出现在 profile 中，请手动检查。" }
}

Say '安装完成。请重启 DSH 并硬刷新（Ctrl+Shift+R / Cmd+Shift+R）使新副本生效。'
if ($Restart) {
  if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    pm2 restart dsh-web
  } else {
    Warn '未找到 pm2，请手动重启 DSH（如：pm2 restart dsh-web 或 dsh web）'
  }
}
