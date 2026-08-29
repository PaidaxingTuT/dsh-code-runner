#!/usr/bin/env bash
# =============================================================================
# dsh-code-runner 一键安装脚本（macOS / Linux / Windows Git Bash）
#
# 功能：
#   1. 检测当前 DSH profile 是否已安装/挂载 dsh-better-sidebar；
#      没有则自动通过官方 CLI 安装（npm 失败时回退 GitHub 仓库）。
#   2. 安装 dsh-code-runner（默认打包本地目录，--npm 走 npm registry）。
#
# 用法：
#   bash scripts/install.sh [--profile web] [--npm] [--version latest]
#                          [--restart] [--dry-run]
#
# 环境变量（均可省略）：
#   DSH_HOME    默认 ~/.dsh（Windows Git Bash 下回退 $USERPROFILE/.dsh）
#   DSH_CMD     默认优先 PATH 上的 `dsh`，缺省回退 npx -y --package @deepseek-ai/dsh
# =============================================================================
set -euo pipefail

DSH_HOME="${DSH_HOME:-${HOME:-${USERPROFILE:-}}/.dsh}"
PKG="dsh-better-sidebar"
BASE="dsh-code-runner"
DSH_CMD="${DSH_CMD:-dsh}"

PROFILE_NAME="web"
USE_NPM=false
VERSION_SPEC=""
RESTART=false
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    --profile)
      if [ $# -lt 2 ]; then echo "--profile 需要一个 profile 名（如 web）" >&2; exit 2; fi
      PROFILE_NAME="$2"; shift ;;
    --npm) USE_NPM=true ;;
    --version)
      if [ $# -lt 2 ]; then echo "--version 需要一个版本号/范围" >&2; exit 2; fi
      VERSION_SPEC="$2"; shift ;;
    --restart) RESTART=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      echo "用法: bash scripts/install.sh [--profile web] [--npm] [--version latest] [--restart] [--dry-run]"
      exit 0 ;;
    -*) echo "未知参数: $1" >&2; exit 2 ;;
    *) VERSION_SPEC="$1" ;;
  esac
  shift
done

PROFILE_DIR="$DSH_HOME/profiles/$PROFILE_NAME"
PACKAGE_JSON="$PROFILE_DIR/package.json"
WS_YML="$PROFILE_DIR/pnpm-workspace.yaml"

say()  { printf '\033[32m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "未找到 node（DSH 运行需要 Node.js ≥ 20）"
[ -d "$PROFILE_DIR" ] || die "找不到 profile 目录：$PROFILE_DIR（请先安装并运行过一次 dsh web）"
[ -f "$PACKAGE_JSON" ] || die "找不到 $PACKAGE_JSON"

dsh_cli() {
  if command -v "$DSH_CMD" >/dev/null 2>&1; then
    printf '%s' "$DSH_CMD"
  elif command -v npx >/dev/null 2>&1; then
    printf 'npx -y --package @deepseek-ai/dsh dsh'
  else
    die "未找到 dsh 或 npx。请先安装 DSH，或用 DSH_CMD 指定 dsh 路径。"
  fi
}

ensure_workspace_settings() {
  [ -f "$WS_YML" ] || return 0
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
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
    console.log(t === before ? "unchanged" : "updated");
  ' "$WS_YML" >/dev/null || true
}

has_better_sidebar() {
  node -e '
    const fs = require("fs");
    const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
    const bundles = p.dsh?.profile?.bundles ?? [];
    process.exit(deps["dsh-better-sidebar"] || bundles.includes("dsh-better-sidebar") ? 0 : 1);
  ' "$PACKAGE_JSON"
}

has_code_runner() {
  node -e '
    const fs = require("fs");
    const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
    const bundles = p.dsh?.profile?.bundles ?? [];
    process.exit(deps["dsh-code-runner"] || bundles.includes("dsh-code-runner") ? 0 : 1);
  ' "$PACKAGE_JSON"
}

CLI="$(dsh_cli)"

# ── 1. dsh-better-sidebar 检测 / 自动安装 ─────────────────────────────
if has_better_sidebar; then
  say "已检测到 dsh-better-sidebar，跳过自动安装"
else
  say "未检测到 dsh-better-sidebar，开始自动安装..."
  if [ "$DRY_RUN" = true ]; then
    say "[dry-run] 将执行：$CLI plugin --profile $PROFILE_NAME add dsh-better-sidebar@latest"
  else
    ensure_workspace_settings
    if ! $CLI plugin --profile "$PROFILE_NAME" add "dsh-better-sidebar@latest" 2>&1 | tail -n +1; then
      warn "npm 安装 dsh-better-sidebar 失败，回退到 GitHub 仓库..."
      $CLI plugin --profile "$PROFILE_NAME" add "github:omdsh-dev/DSH-better-sidebar" 2>&1 | tail -n +1
    fi
    has_better_sidebar || die "dsh-better-sidebar 安装后仍未出现在 profile 中，请手动检查。"
    say "dsh-better-sidebar 安装并挂载完成"
  fi
fi

# ── 2. 安装 dsh-code-runner ──────────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  if [ "$USE_NPM" = true ]; then
    say "[dry-run] 将执行：$CLI plugin --profile $PROFILE_NAME add $BASE@${VERSION_SPEC:-latest}"
  else
    say "[dry-run] 将执行：npm pack && $CLI plugin --profile $PROFILE_NAME add file:<tgz>"
  fi
  exit 0
fi

if has_code_runner; then
  say "已检测到 dsh-code-runner，跳过重复安装"
else
  if [ "$USE_NPM" = true ]; then
    say "安装 $BASE@${VERSION_SPEC:-latest} ..."
    $CLI plugin --profile "$PROFILE_NAME" add "$BASE@${VERSION_SPEC:-latest}" 2>&1 | tail -n +1
  else
    [ -d lib ] || die "当前目录缺少 lib/，请先执行 npm install && npm run build 再安装。"
    TMP_DIR="$(mktemp -d)"
    if command -v pnpm >/dev/null 2>&1; then
      TGZ="$(pnpm pack --pack-destination "$TMP_DIR" 2>/dev/null | tail -n 1)"
    else
      TGZ="$(npm pack --pack-destination "$TMP_DIR" 2>/dev/null | tail -n 1)"
    fi
    [ -n "$TGZ" ] || die "打包失败（pnpm/npm pack 均未生成 tgz）"
    say "安装本地包 $TGZ ..."
    $CLI plugin --profile "$PROFILE_NAME" add "file:$TMP_DIR/$TGZ" 2>&1 | tail -n +1
    rm -rf "$TMP_DIR"
  fi
  has_code_runner || die "dsh-code-runner 安装后仍未出现在 profile 中，请手动检查。"
fi

say "安装完成。请重启 DSH 并硬刷新（Cmd/Ctrl+Shift+R）使新副本生效。"
if [ "$RESTART" = true ]; then
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart dsh-web
  else
    warn "未找到 pm2，请手动重启 DSH（如：pm2 restart dsh-web 或 dsh web）"
  fi
fi
