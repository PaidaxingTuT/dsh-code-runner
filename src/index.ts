/**
 * dsh-code-runner host half.
 *
 * The plugin is intentionally client-centric: it leans on
 * dsh-better-sidebar's existing terminal service/WebSocket, so the host half
 * is a no-op loader entry. Keeping a minimal host entry lets the package be
 * installed through DSH's standard bundle channel.
 */

export const name = 'dsh-code-runner'

export const inject: string[] = []

export function apply(_ctx: unknown): void {
  // Everything happens in the browser half (src/client/index.ts).
}
