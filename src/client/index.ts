/**
 * dsh-code-runner client half.
 *
 * It watches dsh-better-sidebar's editor header (the hashed
 * `editorHeader` element) and appends a Run button after the file-tree
 * toggle. Clicking Run:
 *
 * 1. saves the file if a save button is present,
 * 2. builds a vscode-code-runner style command from the file extension,
 * 3. opens/focuses a terminal in the bottom panel (falling back to the
 *    regular sidebar terminal on narrow viewports),
 * 4. sends the command over the same `/sidebar/ws/terminal` WebSocket the
 *    built-in terminal uses.
 *
 * No runtime value-imports from dsh-better-sidebar are used; collaboration
 * is through the `ctx.betterSidebar` Cordis service and stable DOM/route
 * contracts.
 */
import { buildRunCommand, dirnameOf } from './executor.js'

export const inject = ['betterSidebar']

/* ------------------------------------------------------------------ */
/* Minimal structural types (kept local so the client bundle stays      */
/* dependency-free and type-only imports are unnecessary).              */
/* ------------------------------------------------------------------ */

interface SidebarTabLike {
  id: string
  type: string
  title?: string
  path?: string
}

interface SplitNodeLike {
  kind?: string
  id?: string
  tabs?: SidebarTabLike[]
  children?: SplitNodeLike[]
}

interface SidebarStateLike {
  bottomOpen?: boolean
  bottomSplits?: SplitNodeLike
  splits?: SplitNodeLike
  activePane?: string | null
}

interface SidebarSnapshotLike {
  sessionId?: string
  state?: SidebarStateLike
}

interface BetterSidebarLike {
  getSnapshot(): SidebarSnapshotLike
  openTab(seed: { type: string; title?: string; path?: string }): void
  activateTab(tabId: string): void
  isTabEnabled?(id: string): boolean
}

interface ClientContext {
  effect(fn: () => (() => void) | void, name?: string): void
  betterSidebar: BetterSidebarLike
}

/* ------------------------------------------------------------------ */
/* Module state                                                        */
/* ------------------------------------------------------------------ */

/** WebSockets kept open for terminals we have sent a command to. Keeping
 *  them open avoids the host's reconnect-grace close killing a long-running
 *  process after our send socket drops. */
const terminalSockets = new Map<string, WebSocket>()

/* ------------------------------------------------------------------ */
/* Public plugin entry                                                 */
/* ------------------------------------------------------------------ */

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    if (!ctx.betterSidebar) return
    injectStyle()
    syncRunButtons(ctx)
    const observer = new MutationObserver(() => { syncRunButtons(ctx) })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title'],
    })
    return () => {
      observer.disconnect()
      removeRunButtons()
      removeStyle()
      disposeTerminalSockets()
    }
  }, 'dsh-code-runner: editor run button')
}

/* ------------------------------------------------------------------ */
/* Run button injection                                                */
/* ------------------------------------------------------------------ */

const HEADER_SELECTOR = '[data-dsh-better-sidebar] [class*="editorHeader"]'
const RUN_BUTTON_ATTR = 'data-dsh-code-runner-run'

function injectStyle(): void {
  if (document.getElementById('dsh-code-runner-style') !== null) return
  const style = document.createElement('style')
  style.id = 'dsh-code-runner-style'
  style.textContent = `
.dsh-code-runner-run {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin-left: 2px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #8a8f98);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  flex: none;
}
.dsh-code-runner-run:hover {
  background: var(--dsw-alias-fill-hover, rgba(128,128,128,0.15));
  color: var(--dsw-alias-label-primary, #1a1a1a);
}
.dsh-code-runner-run:active {
  transform: translateY(1px);
}
`
  document.head.appendChild(style)
}

function syncRunButtons(ctx: ClientContext): void {
  const headers = document.querySelectorAll<HTMLElement>(HEADER_SELECTOR)
  for (const header of headers) {
    const path = pathFromHeader(header)
    const runnable = path !== undefined && buildRunCommand(path, '') !== null
    const existing = header.querySelector<HTMLElement>(`[${RUN_BUTTON_ATTR}]`)

    if (!runnable) {
      if (existing !== null) existing.remove()
      continue
    }
    if (existing !== null) continue

    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.dshCodeRunnerRun = ''
    button.className = 'dsh-code-runner-run'
    button.setAttribute('aria-label', '运行代码')
    button.title = '运行代码'
    button.textContent = '▶'
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void runFromHeader(ctx, header)
    })
    header.appendChild(button)
  }
}

function pathFromHeader(header: HTMLElement): string | undefined {
  const input = header.querySelector<HTMLInputElement>('input[class*="editorPathInput"], input[title]')
  const title = input?.title
  if (title !== undefined && title !== '') return title
  const value = input?.value
  return value !== undefined && value !== '' ? value : undefined
}

function removeStyle(): void {
  document.getElementById('dsh-code-runner-style')?.remove()
}

function removeRunButtons(): void {
  for (const button of document.querySelectorAll<HTMLElement>(`[${RUN_BUTTON_ATTR}]`)) {
    button.remove()
  }
}

/* ------------------------------------------------------------------ */
/* Run flow                                                            */
/* ------------------------------------------------------------------ */

async function runFromHeader(ctx: ClientContext, header: HTMLElement): Promise<void> {
  const path = pathFromHeader(header)
  if (path === undefined) {
    console.warn('[dsh-code-runner] no active file path found in the editor header')
    return
  }

  const snapshot = ctx.betterSidebar.getSnapshot()
  const sessionId = snapshot.sessionId
  if (!sessionId) {
    console.warn('[dsh-code-runner] no active sidebar session')
    return
  }

  // Persist unsaved edits before running, mirroring Code Runner's
  // "save file before run" behavior.
  const saveButton = findSaveButton(header)
  if (saveButton !== undefined) {
    saveButton.click()
    await sleep(60)
  }

  const cwd = (await fetchSessionCwd(sessionId)) ?? dirnameOf(path)
  const command = buildRunCommand(path, cwd)
  if (command === null) {
    console.warn(`[dsh-code-runner] no executor configured for ${path}`)
    return
  }

  const tabId = await ensureBottomTerminal(ctx, sessionId, cwd)
  if (tabId === null) {
    console.warn('[dsh-code-runner] could not open a sidebar terminal')
    return
  }

  sendCommandToTerminal(sessionId, tabId, cwd, command)
}

function findSaveButton(header: HTMLElement): HTMLButtonElement | undefined {
  for (const button of header.querySelectorAll<HTMLButtonElement>('button')) {
    const label = button.getAttribute('aria-label') ?? ''
    const title = button.getAttribute('title') ?? ''
    if (/^(保存|Save)$/i.test(label.trim()) || /Ctrl\/Cmd\+S/i.test(title)) {
      return button
    }
  }
  return undefined
}

async function fetchSessionCwd(sessionId: string): Promise<string | undefined> {
  try {
    const res = await fetch('/sidebar/api/session.cwd', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    const data = await res.json() as { value?: { cwd?: string } }
    return data.value?.cwd
  } catch {
    return undefined
  }
}

/* ------------------------------------------------------------------ */
/* Bottom terminal handling                                            */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function ensureBottomTerminal(
  ctx: ClientContext,
  _sessionId: string,
  _cwd: string,
): Promise<string | null> {
  const bottomPanel = document.querySelector('[data-dsh-bottom-panel]')
  const hasBottom = bottomPanel !== null

  let snapshot = ctx.betterSidebar.getSnapshot()
  let state = snapshot.state

  // Open the bottom panel when it exists but is collapsed.
  if (hasBottom && state !== undefined && state.bottomOpen !== true) {
    clickBottomToggle()
    await sleep(80)
  }

  if (hasBottom) {
    // Focus the bottom pane so openTab lands there.
    const bottomPane = document.querySelector('[data-dsh-bottom-panel] [data-dsh-pane]')
    if (bottomPane !== null) {
      bottomPane.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }))
      await sleep(40)
    }

    snapshot = ctx.betterSidebar.getSnapshot()
    state = snapshot.state
    const existing = collectTerminals(state?.bottomSplits)
    if (existing.length > 0) {
      const tab = existing[existing.length - 1]!
      ctx.betterSidebar.activateTab(tab.id)
      return tab.id
    }

    ctx.betterSidebar.openTab({ type: 'terminal', title: 'Code Runner' })
    await sleep(100)
    snapshot = ctx.betterSidebar.getSnapshot()
    state = snapshot.state
    const after = collectTerminals(state?.bottomSplits)
    const tab = after[after.length - 1]
    if (tab !== undefined) return tab.id
  }

  // Fallback (narrow viewport, or bottom panel unavailable): open in the
  // regular sidebar terminal.
  ctx.betterSidebar.openTab({ type: 'terminal', title: 'Code Runner' })
  await sleep(100)
  const all = collectAllTerminals(ctx.betterSidebar.getSnapshot().state)
  const tab = all[all.length - 1]
  return tab?.id ?? null
}

function clickBottomToggle(): void {
  const cluster = document.querySelector('[data-dsh-toggle-cluster]')
  const button = cluster?.querySelector<HTMLButtonElement>('button')
  button?.click()
}

function collectTerminals(node: SplitNodeLike | undefined): SidebarTabLike[] {
  if (node === undefined) return []
  if (node.kind === 'leaf' || Array.isArray(node.tabs)) {
    return (node.tabs ?? []).filter(tab => tab.type === 'terminal')
  }
  if (Array.isArray(node.children)) {
    return node.children.flatMap(collectTerminals)
  }
  return []
}

function collectAllTerminals(state: SidebarStateLike | undefined): SidebarTabLike[] {
  if (state === undefined) return []
  return [
    ...collectTerminals(state.splits),
    ...collectTerminals(state.bottomSplits),
  ]
}

/* ------------------------------------------------------------------ */
/* Terminal command transport                                          */
/* ------------------------------------------------------------------ */

function sendCommandToTerminal(sessionId: string, tabId: string, cwd: string, command: string): void {
  const key = `${sessionId}:${tabId}`
  const existing = terminalSockets.get(key)
  if (existing !== undefined && existing.readyState === WebSocket.OPEN) {
    existing.send(`${command}\r`)
    return
  }
  if (existing !== undefined) {
    existing.close()
    terminalSockets.delete(key)
  }

  const url = new URL('/sidebar/ws/terminal', location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.search = new URLSearchParams({ sessionId, tab: tabId, cwd }).toString()
  const ws = new WebSocket(url.toString())
  terminalSockets.set(key, ws)

  ws.addEventListener('open', () => {
    if (ws.readyState === WebSocket.OPEN) ws.send(`${command}\r`)
  })
  ws.addEventListener('close', () => {
    if (terminalSockets.get(key) === ws) terminalSockets.delete(key)
  })
  ws.addEventListener('error', () => {
    if (terminalSockets.get(key) === ws) terminalSockets.delete(key)
  })
}

function disposeTerminalSockets(): void {
  for (const [key, ws] of terminalSockets) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        // Park instead of letting our close schedule a reconnect-grace kill:
        // the terminal tab itself stays open and owned by better-sidebar.
        ws.send(JSON.stringify({ type: 'park' }))
      }
      ws.close()
    } catch {
      // ignore socket teardown errors
    }
    terminalSockets.delete(key)
  }
}
