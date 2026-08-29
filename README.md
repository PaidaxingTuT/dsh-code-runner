# dsh-code-runner

`dsh-code-runner` 是一个基于 [DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 的 DSH 插件，为侧边栏中打开的代码文件提供一键运行能力。它参考 [vscode-code-runner](https://github.com/formulahendry/vscode-code-runner) 的 executor 规则，在 better-sidebar 的底部终端中执行当前文件。

## 功能特性

- 在 DSH-better-sidebar 编辑器头部自动注入运行按钮。
- 仅对可运行的代码文件显示按钮，避免干扰图片、PDF 等非代码文件。
- 点击后自动保存当前文件（如存在保存按钮）。
- 按文件扩展名匹配 executor，生成对应运行命令。
- 优先在 better-sidebar 底部终端运行；窄屏或无底部面板时自动回退到右侧终端。
- 通过 better-sidebar 内置的 `/sidebar/ws/terminal` WebSocket 发送命令，保持连接稳定，避免长时间任务被误杀。
- 安装时自动检测并安装 `dsh-better-sidebar`，无需手动处理基座依赖。
- 不修改 DSH 源码，不注册工具，不污染会话上下文。

## 安装

### 前置条件

- 已安装并启动 DSH（Node.js >= 20）。
- 已初始化目标 profile（默认 `web`）。

### 本地源码安装

```bash
# macOS / Linux / Windows Git Bash
bash scripts/install.sh --profile web

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Profile web
```

脚本会自动检测 `dsh-better-sidebar`：

- 已安装：跳过基座安装；
- 未安装：自动执行 `dsh plugin --profile web add dsh-better-sidebar@latest`，npm 安装失败时回退到 `github:omdsh-dev/DSH-better-sidebar`。

随后脚本会将当前源码打包为 tgz 并安装到目标 profile。安装完成后重启 DSH 并硬刷新页面（`Ctrl+Shift+R` / `Cmd+Shift+R`）。

## 使用说明

1. 打开 DSH-better-sidebar。
2. 在文件树中打开一个可运行的代码文件（如 `.py`、`.js`、`.ts`、`.c`、`.cpp`、`.go`、`.rs` 等）。
3. 点击编辑器头部右侧的 `▶` 按钮。
4. 插件会自动保存文件、打开/聚焦底部终端，并执行当前文件。

## 支持的语言

当前内置 executor 覆盖以下常见语言/文件类型：

- JavaScript / TypeScript / JSX / TSX
- Python / Ruby / PHP / Perl
- C / C++ / Java / Kotlin / Swift
- Go / Rust / Zig / Mojo / Gleam
- Shell / PowerShell / Batch
- Lua / R / Julia / Dart / Elixir
- Scala / F# / Haskell / OCaml / Clojure / Groovy / Nim / V

完整映射见 [`src/client/executor.ts`](src/client/executor.ts)。

## 工作原理

- **按钮注入**：通过 `MutationObserver` 监听 `[data-dsh-better-sidebar] [class*="editorHeader"]`，在头部末尾追加运行按钮。
- **终端管理**：调用 `ctx.betterSidebar.openTab({ type: 'terminal' })` 打开终端，并优先聚焦底部面板。
- **命令执行**：复用 better-sidebar 的 `/sidebar/ws/terminal` WebSocket 协议发送命令；发送后保持 WebSocket 打开，避免因发送方断开触发宿主 reconnect-grace 而终止正在运行的任务。

## 开发

```bash
# 安装依赖
npm install

# 构建 host 与 client
npm run build
npm run build:client

# 类型检查
npm run typecheck

# 打包
npm pack
```

## 项目结构

```text
dsh-code-runner/
├── src/
│   ├── index.ts              # host 入口
│   └── client/
│       ├── index.ts          # 运行按钮注入与终端逻辑
│       └── executor.ts       # executor 映射与命令生成
├── scripts/
│   ├── install.sh            # macOS/Linux/Git Bash 安装脚本
│   ├── install.ps1           # Windows PowerShell 安装脚本
│   ├── build.sh              # Git Bash 构建脚本
│   └── build.mjs             # 跨平台构建脚本
├── cordis.patch.yml          # DSH bundle patch
├── dsh.plugin.json           # 插件清单
└── package.json
```

## License

[MIT](LICENSE)
