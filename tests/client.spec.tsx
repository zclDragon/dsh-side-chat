// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { SideChatPanel, type SessionsFace } from '../src/client/SideChatPanel.tsx'
import { sideChatApi } from '../src/client/api.ts'

// The real @deepseek-ai/dsh-client-ui-primitives ships ESM CSS imports Node's
// loader cannot load; the side-chat transcript uses its MarkdownText. Stub it
// to a text passthrough so the tests exercise the panel, not stylesheet loading.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  MarkdownText: ({ text }: { text: string }) => text,
}))

/** A tiny observable store for the fake sessions face. */
function makeListStore(initial: { current?: string; byId: Record<string, unknown> }) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    state,
    set(next: typeof state) {
      state = next
      for (const fn of listeners) fn()
    },
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    getSnapshot() {
      return state
    },
  }
}

/** Fake session face with controllable snapshot + prompt capture. */
function makeSideSession(initialSnapshot: any) {
  let snapshot = initialSnapshot
  const listeners = new Set<() => void>()
  return {
    snapshot,
    setSnapshot(next: any) {
      snapshot = next
      for (const fn of listeners) fn()
    },
    open: vi.fn(async () => {}),
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    getSnapshot() {
      return snapshot
    },
    prompt: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
    cancel: vi.fn(async () => ({ ok: true as const })),
  }
}

/** Render the panel into a detached host and return helpers. */
function mountPanel(sessions: SessionsFace, api: typeof sideChatApi) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(createElement(SideChatPanel, { sessions, api }))
  })
  const text = (): string => host.textContent ?? ''
  const click = (label: string): void => {
    const button = [...host.querySelectorAll('button')].find(b => (b.textContent ?? '').includes(label))
    if (button === undefined) throw new Error(`button not found: ${label}`)
    act(() => { button.click() })
  }
  return { host, root, text, click }
}

describe('SideChatPanel', () => {
  it('renders a floating toggle', () => {
    const list = makeListStore({ current: 'session-main', byId: { 'session-main': {} } })
    const sessions: SessionsFace = {
      list,
      binding: () => undefined,
    }
    const { host, text } = mountPanel(sessions, sideChatApi)
    expect(text()).toContain('侧聊')
    host.remove()
  })

  it('opens the panel with an empty state, then creates a side chat', async () => {
    const list = makeListStore({ current: 'session-main', byId: { 'session-main': {} } })
    const sideSession = makeSideSession({ nodes: [], partial: null, running: false })
    const api = {
      open: vi.fn(async () => 'session-side-1'),
      list: vi.fn(async (): Promise<any[]> => []),
      close: vi.fn(async () => {}),
    }
    const sessions: SessionsFace = {
      list,
      binding: vi.fn(() => ({ session: sideSession })),
    }

    const { host, text, click } = mountPanel(sessions, api as unknown as typeof sideChatApi)
    click('侧聊')
    expect(text()).toContain('还没有侧边对话')

    // After open, the host list gains the side session (as the runtime would).
    api.list.mockImplementation(async () => [
      { sideSessionId: 'session-side-1', parentSessionId: 'session-main', createdAt: 1, running: false, title: '侧聊示例' },
    ])
    list.set({ current: 'session-main', byId: { 'session-main': {}, 'session-side-1': {} } })
    click('新建')

    // waitForListed polls until byId contains the side id.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300))
    })
    expect(api.open).toHaveBeenCalledWith('session-main')
    expect(sideSession.open).toHaveBeenCalled()
    expect(text()).toContain('侧边对话已就绪')
    host.remove()
  })

  it('renders the transcript and sends a prompt through the composer', async () => {
    const list = makeListStore({ current: 'session-main', byId: { 'session-main': {}, 'session-side-1': {} } })
    const sideSession = makeSideSession({
      nodes: [
        { kind: 'user', seq: 0, content: [{ type: 'text', text: '你好' }] },
        { kind: 'assistant', seq: 1, blocks: [{ kind: 'text', text: '你好！' }] },
        { kind: 'tool-result', seq: 2, call: { name: 'bash' }, callId: 'c1' },
      ],
      partial: null,
      running: false,
    })
    const api = {
      open: vi.fn(async () => 'session-side-1'),
      list: vi.fn(async () => [
        { sideSessionId: 'session-side-1', parentSessionId: 'session-main', createdAt: 1, running: false, title: '侧聊示例' },
      ]),
      close: vi.fn(async () => {}),
    }
    const sessions: SessionsFace = {
      list,
      binding: () => ({ session: sideSession }),
    }

    const { host, text, click } = mountPanel(sessions, api as unknown as typeof sideChatApi)
    click('侧聊')
    // First list refresh resolves the single side chat and selects it.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(sideSession.open).toHaveBeenCalled()
    expect(text()).toContain('你好')
    expect(text()).toContain('你好！')
    expect(text()).toContain('bash')

    // Type into the composer and send.
    const textarea = host.querySelector('textarea')
    if (textarea === null) throw new Error('composer textarea missing')
    act(() => {
      // React controlled input: dispatch through native setter then input event.
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, '再来一次')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    click('发送')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(sideSession.prompt).toHaveBeenCalledWith([{ type: 'text', text: '再来一次' }], 'queue')
    host.remove()
  })

  it('closes a side chat through the API', async () => {
    const list = makeListStore({ current: 'session-main', byId: { 'session-main': {}, 'session-side-1': {} } })
    const sideSession = makeSideSession({ nodes: [], partial: null, running: false })
    let closed = false
    const api = {
      open: vi.fn(async () => 'session-side-1'),
      list: vi.fn(async () => [
        { sideSessionId: 'session-side-1', parentSessionId: 'session-main', createdAt: 1, running: false, title: '侧聊示例' },
      ]),
      close: vi.fn(async () => { closed = true }),
    }
    const sessions: SessionsFace = {
      list,
      binding: () => ({ session: sideSession }),
    }

    const { host, click } = mountPanel(sessions, api as unknown as typeof sideChatApi)
    click('侧聊')
    // The panel's list refresh resolves the pre-existing side chat and selects it.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    click('关闭此侧聊')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(closed).toBe(true)
    host.remove()
  })

  it('shows parent title, side-chat title labels, and closes all', async () => {
    const list = makeListStore({
      current: 'session-main',
      byId: { 'session-main': { displayTitle: 'main-project' }, 'session-side-1': {}, 'session-side-2': {} },
    })
    const sideSession = makeSideSession({ nodes: [], partial: null, running: false })
    const closedIds: string[] = []
    const api = {
      open: vi.fn(async () => 'session-side-1'),
      list: vi.fn(async () => [
        { sideSessionId: 'session-side-1', parentSessionId: 'session-main', createdAt: 1, running: false, title: '第一个问题' },
        { sideSessionId: 'session-side-2', parentSessionId: 'session-main', createdAt: 2, running: false, title: '第二个问题' },
      ]),
      close: vi.fn(async (id: string) => { closedIds.push(id) }),
    }
    const sessions: SessionsFace = {
      list,
      binding: () => ({ session: sideSession }),
    }

    const { host, text, click } = mountPanel(sessions, api as unknown as typeof sideChatApi)
    click('侧聊')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    // Header: parent title + count.
    expect(text()).toContain('main-project')
    expect(text()).toContain('2 个')
    // Side chips keep the #N labels; the derived title rides the tooltip.
    expect(text()).toContain('#1')
    expect(text()).toContain('#2')
    const chips = host.querySelectorAll('button[title^="侧聊："]')
    expect(chips).toHaveLength(2)
    expect(chips[0]?.getAttribute('title')).toContain('第一个问题')
    expect(chips[1]?.getAttribute('title')).toContain('第二个问题')

    click('全部关闭')
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(closedIds).toEqual(['session-side-1', 'session-side-2'])
    expect(text()).toContain('还没有侧边对话')
    host.remove()
  })
})
