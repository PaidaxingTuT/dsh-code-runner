# dsh-code-runner

在 DSH 的 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 侧边栏中，为打开的代码文件头部添加一个 **运行按钮**。点击后：

1. 自动保存当前文件（如果存在保存按钮）；
2. 按 vscode-code-runner 的 executor 规则，根据文件扩展名生成运行命令；
3. 打开/聚焦 dsh-better-sidebar 的**底部终端**（窄屏或无底部面板时回退到右侧终端）；
4. 通过 better-sidebar 内置的 `/sidebar/ws/terminal` 把命令发送到终端执行。

## 特性

- 基于 dsh-better-sidebar：只在它提供的侧边栏 DOM 中注入按钮，并通过 `ctx.betterSidebar` 服务打开终端。
- 安装时自动检测 dsh-better-sidebar，缺失时自动安装（npm 失败回退 GitHub）。
- 无需修改 DSH 源码，不注册任何工具，不污染聊天上下文。
- 内置常见语言 executor（Node.js / Python / C / C++ / Java / Go / Rust / Ruby / PHP / Shell / PowerShell 等），占位符与 Code Runner 一致（`$dir`、`$fileName`、`$fileNameWithoutExt`、`$fullFileName`、`$workspaceRoot` 等）。

## 安装

### 方式一：本地安装脚本（推荐，自动处理依赖）

```bash
# macOS / Linux / Windows Git Bash
bash scripts/install.sh --profile web

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Profile web
```

脚本会先检查 `~/.dsh/profiles/<profile>/package.json` 中是否已有 `dsh-better-sidebar`：

- 没有 → 自动执行 `dsh plugin --profile <profile> add dsh-better-sidebar@latest`（失败时回退 `github:omdsh-dev/DSH-better-sidebar`）；
- 有 → 跳过。

然后打包当前目录为 tgz 并安装 `dsh-code-runner`。装完重启 DSH 并硬刷新页面。

### 方式二：官方 CLI 直接安装

```bash
# 先装基座
dsh plugin --profile web add dsh-better-sidebar@latest

# 再装 code runner（npm 发布后）
dsh plugin --profile web add dsh-code-runner@latest
```

本包在 `dependencies` 中声明了 `dsh-better-sidebar`，`cordis.patch.yml` 也会在它未挂载时自动挂载。

## 开发

```bash
npm install
npm run build        # host: tsc → lib/
npm run build:client # client: tsdown → lib/client.js
npm pack             # 产物 tgz
```

## 运行命令映射

参考 [vscode-code-runner](https://github.com/formulahendry/vscode-code-runner) 的默认 executor。当前支持扩展名见 `src/client/executor.ts` 的 `EXECUTOR_BY_EXTENSION`。

## 工作原理

- **按钮注入**：`MutationObserver` 监听 `[data-dsh-better-sidebar] [class*="editorHeader"]`，在头部末尾追加 `▶` 按钮。
- **终端打开**：调用 `ctx.betterSidebar.openTab({ type: 'terminal' })`；优先点击底部面板切换按钮 + 聚焦底部 pane，使终端落在底部面板。
- **命令发送**：复用 better-sidebar 的 WebSocket 协议，保持 socket 打开，避免命令运行期间因“发送方断开”触发宿主 reconnect-grace 杀进程。
