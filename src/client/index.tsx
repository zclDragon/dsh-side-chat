/**
 * Client half of dsh-sidechat: mounts the floating side-chat panel into a
 * document.body host (the better-sidebar portal pattern — the panel floats
 * above the app, outside the layout columns, so no core slot changes are
 * needed). The panel binds sessions purely through `ctx.sessions`.
 * @module dsh-sidechat/client
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Context } from '@deepseek-ai/cordis'
import { sideChatApi } from './api.ts'
import { SideChatPanel, type SessionsFace } from './SideChatPanel.tsx'

/** Required services before mounting. */
export const inject = ['sessions']

/**
 * Client plugin body: create one host element and mount the panel.
 * @param ctx - the client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const host = document.createElement('div')
    host.setAttribute('data-dsh-sidechat', '')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(createElement(SideChatPanel, {
      sessions: ctx.sessions as unknown as SessionsFace,
      api: sideChatApi,
    }))
    return () => {
      root.unmount()
      host.remove()
    }
  }, 'dsh-sidechat: panel mount')
}
