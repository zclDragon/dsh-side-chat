import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { apply, SIDE_CHAT_TITLE_MAX, sideChatSeed, sideChatTitleOf } from '../src/index.ts'
import { ROUTE_PREFIX, SIDE_COMMAND } from '../src/invariant.ts'

/** Build a minimal fake session event. */
function event(type: string, seq: number): SessionEvent<never> {
  return { type, seq, time: seq, data: {} } as unknown as SessionEvent<never>
}

function completedSession(events: SessionEvent[]): any {
  return {
    id: 'session-parent',
    header: { cwd: '/tmp/w' },
    events,
    requestHeader: () => ({ config: { provider: 'deepseek', model: 'deepseek-v4-flash' } }),
  }
}

/** Minimal ctx stub covering everything apply() touches. */
function stubCtx(overrides: Record<string, unknown> = {}) {
  const routes: any[] = []
  const commands: any[] = []
  const created: any[] = []
  const listeners: any[] = []
  const ctx: any = {
    logger: { warn: vi.fn() },
    webServer: {
      register: (route: unknown) => {
        routes.push(route)
        return () => { routes.splice(routes.indexOf(route), 1) }
      },
    },
    sessions: {
      get: (id: string) => {
        const s = (overrides.sessions as any)?.[id]
        return s ?? undefined
      },
    },
    agents: {
      create: async (options: unknown) => {
        const dispose = vi.fn(async () => {})
        created.push({ options, dispose })
        return { agent: { status: 'idle' }, dispose }
      },
      get: () => ({ status: 'idle' }),
    },
    agentPresets: overrides.agentPresets ?? {
      resolve: async () => ({ id: 'preset-x' }),
      mount: async () => {},
    },
    commands: {
      register: (definition: unknown) => {
        commands.push(definition)
        return () => { commands.splice(commands.indexOf(definition), 1) }
      },
    },
    workspaceRegistry: overrides.workspaceRegistry ?? {
      archiveSession: vi.fn(async () => {}),
    },
    get: (key: string) => {
      if (key === 'agentPresets') return ctx.agentPresets
      if (key === 'workspaceRegistry') return ctx.workspaceRegistry
      return undefined
    },
    effect: (fn: () => unknown) => fn(),
    on: (event: string, listener: (session: any) => void) => {
      listeners.push({ event, listener })
      return () => {
        const i = listeners.indexOf({ event, listener })
        if (i >= 0) listeners.splice(i, 1)
      }
    },
    ...(overrides.ctx as Record<string, unknown> | undefined),
  }
  return { ctx, routes, commands, created, listeners }
}

/** Fire a captured session/disposed listener for a session id. */
async function fireDisposed(listeners: any[], sessionId: string): Promise<void> {
  const entry = listeners.find((l: any) => l.event === 'session/disposed')
  if (entry === undefined) throw new Error('no session/disposed listener captured')
  await entry.listener({ id: sessionId })
}

/** Drive the captured prefix route with a fake request/response. */
function callRoute(route: any, method: string, url: string, body?: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve) => {
    const req = new PassThrough() as unknown as IncomingMessage & PassThrough
    req.method = method
    req.url = url
    const res: any = {
      writeHead(status: number) { res._status = status },
      end(text: string) {
        resolve({ status: res._status, json: JSON.parse(text) })
      },
    }
    void route.handler(req as IncomingMessage, res as ServerResponse)
    if (body !== undefined) req.write(JSON.stringify(body))
    req.end()
  })
}

describe('sideChatSeed', () => {
  it('returns undefined when no turn completed', () => {
    const s = completedSession([event('turn/start', 0)])
    expect(sideChatSeed(s)).toBeUndefined()
  })

  it('cuts at the last turn/end and extends through trailing appends', () => {
    const s = completedSession([
      event('turn/start', 0),
      event('user/message', 1),
      event('turn/end', 2),
      event('session/title', 3),
      event('turn/start', 4),
      event('user/message', 5),
    ])
    const seed = sideChatSeed(s)
    expect(seed?.map(e => e.seq)).toEqual([0, 1, 2, 3])
  })

  it('excludes the in-flight turn', () => {
    const s = completedSession([
      event('turn/start', 0),
      event('user/message', 1),
      event('turn/end', 2),
      event('turn/start', 3),
      event('user/message', 4),
    ])
    const seed = sideChatSeed(s)
    expect(seed?.map(e => e.seq)).toEqual([0, 1, 2])
  })
})

describe('apply — /side-chat routes and /side command', () => {
  it('registers the prefix route and the /side command', () => {
    const { ctx, routes, commands } = stubCtx()
    apply(ctx, { description: 'x' })
    expect(routes).toHaveLength(1)
    expect(routes[0].kind).toBe('prefix')
    expect(routes[0].path).toBe(ROUTE_PREFIX)
    expect(commands).toHaveLength(1)
    expect(commands[0].name).toBe(SIDE_COMMAND)
  })

  it('open forks the parent with the completed-turn seed and parent meta', async () => {
    const parent = completedSession([
      event('turn/start', 0),
      event('user/message', 1),
      event('turn/end', 2),
    ])
    const { ctx, routes, created } = stubCtx({ sessions: { 'session-parent': parent } })
    apply(ctx, { description: 'x' })
    const open = await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/open`, { parentSessionId: 'session-parent' })
    expect(open.status).toBe(200)
    expect(typeof open.json.sideSessionId).toBe('string')
    expect(created).toHaveLength(1)
    const options = created[0].options
    expect(options.meta.parentSession).toBe('session-parent')
    expect(options.meta.seedLength).toBe(3)
    expect(options.meta.cwd).toBe('/tmp/w')
    expect(options.meta.agentPreset).toBe('preset-x')
    expect(options.seed.map((e: any) => e.seq)).toEqual([0, 1, 2])
    expect(options.agentOptions).toEqual({ provider: 'deepseek', model: 'deepseek-v4-flash' })
    expect(typeof options.setup).toBe('function')
  })

  it('open rejects a parent without a completed turn', async () => {
    const parent = completedSession([event('turn/start', 0)])
    const { ctx, routes, created } = stubCtx({ sessions: { 'session-parent': parent } })
    apply(ctx, { description: 'x' })
    const open = await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/open`, { parentSessionId: 'session-parent' })
    expect(open.status).toBe(409)
    expect(created).toHaveLength(0)
  })

  it('list returns opened side chats grouped by parent', async () => {
    const parent = completedSession([
      event('turn/start', 0),
      event('user/message', 1),
      event('turn/end', 2),
    ])
    const { ctx, routes } = stubCtx({ sessions: { 'session-parent': parent } })
    apply(ctx, { description: 'x' })
    await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/open`, { parentSessionId: 'session-parent' })
    const list = await callRoute(routes[0], 'GET', `${ROUTE_PREFIX}/list?parentSessionId=session-parent`)
    expect(list.status).toBe(200)
    expect(list.json.sideChats).toHaveLength(1)
    expect(list.json.sideChats[0].parentSessionId).toBe('session-parent')
  })

  it('close disposes the agent, archives the session, and drops the registry row', async () => {
    const parent = completedSession([
      event('turn/start', 0),
      event('user/message', 1),
      event('turn/end', 2),
    ])
    const { ctx, routes, created } = stubCtx({ sessions: { 'session-parent': parent } })
    apply(ctx, { description: 'x' })
    const open = await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/open`, { parentSessionId: 'session-parent' })
    const sideSessionId = open.json.sideSessionId as SessionId
    const close = await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/close`, { sideSessionId })
    expect(close.status).toBe(200)
    expect(created[0].dispose).toHaveBeenCalledTimes(1)
    expect(ctx.workspaceRegistry.archiveSession).toHaveBeenCalledWith(sideSessionId)
    const list = await callRoute(routes[0], 'GET', `${ROUTE_PREFIX}/list?parentSessionId=session-parent`)
    expect(list.json.sideChats).toHaveLength(0)
  })

  it('close still disposes when no workspace service is composed', async () => {
    const parent = completedSession([
      event('turn/start', 0),
      event('user/message', 1),
      event('turn/end', 2),
    ])
    const { ctx, routes, created } = stubCtx({
      sessions: { 'session-parent': parent },
      ctx: { get: (key: string) => key === 'agentPresets' ? undefined : undefined },
    })
    apply(ctx, { description: 'x' })
    const open = await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/open`, { parentSessionId: 'session-parent' })
    const close = await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/close`, { sideSessionId: open.json.sideSessionId })
    expect(close.status).toBe(200)
    expect(created[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('validates request fields', async () => {
    const { ctx, routes } = stubCtx()
    apply(ctx, { description: 'x' })
    const bad = await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/open`, {})
    expect(bad.status).toBe(400)
    const unknown = await callRoute(routes[0], 'GET', `${ROUTE_PREFIX}/list`)
    expect(unknown.status).toBe(400)
  })
})

describe('sideChatTitleOf', () => {
  it('returns undefined when the session has no user message', () => {
    const s = completedSession([event('turn/start', 0)])
    expect(sideChatTitleOf(s)).toBeUndefined()
  })

  it('derives a title from the first user message and truncates long ones', () => {
    const long = '这是一个非常非常长的第一条消息，用来验证标题截断逻辑是否正常工作。'
    const s = completedSession([
      event('turn/start', 0),
      {
        type: 'user/message', seq: 1, time: 1,
        data: { source: { kind: 'user' }, content: [{ type: 'text', text: long }] },
      } as SessionEvent<'user/message'>,
      event('turn/end', 2),
    ])
    const title = sideChatTitleOf(s)
    expect(title?.endsWith('…')).toBe(true)
    expect(title?.length).toBeLessThanOrEqual(SIDE_CHAT_TITLE_MAX + 1)
  })
})

describe('apply — orphan cleanup', () => {
  it('disposes side chats when the parent session is disposed', async () => {
    const parent = completedSession([
      event('turn/start', 0),
      event('user/message', 1),
      event('turn/end', 2),
    ])
    const { ctx, routes, created, listeners } = stubCtx({ sessions: { 'session-parent': parent } })
    apply(ctx, { description: 'x' })
    const open = await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/open`, { parentSessionId: 'session-parent' })
    const sideSessionId = open.json.sideSessionId as string
    expect(created[0].dispose).not.toHaveBeenCalled()

    await fireDisposed(listeners, 'session-parent')

    expect(created[0].dispose).toHaveBeenCalledTimes(1)
    // The disposed side chat is gone from the list.
    const list = await callRoute(routes[0], 'GET', `${ROUTE_PREFIX}/list?parentSessionId=session-parent`)
    expect(list.json.sideChats).toHaveLength(0)
  })

  it('leaves unrelated sessions alone on disposal', async () => {
    const parent = completedSession([
      event('turn/start', 0),
      event('user/message', 1),
      event('turn/end', 2),
    ])
    const { ctx, routes, created, listeners } = stubCtx({ sessions: { 'session-parent': parent } })
    apply(ctx, { description: 'x' })
    await callRoute(routes[0], 'POST', `${ROUTE_PREFIX}/open`, { parentSessionId: 'session-parent' })

    await fireDisposed(listeners, 'some-other-session')

    expect(created[0].dispose).not.toHaveBeenCalled()
  })
})
