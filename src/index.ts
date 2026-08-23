/**
 * @zhuchenglong/dsh-side-chat host half: Codex-style `/side` side conversations.
 *
 * A side chat is a fork of the parent session — same completed-turn prefix as
 * a model-visible fork, same agent preset composition — created as an ordinary
 * live Agent under the parent's workspace. It is NOT shown as the active
 * conversation: the plugin keeps a small registry (sideSessionId → parent) so
 * the GUI can group side chats under their parent and open them in the
 * floating side panel, while the main task keeps running uninterrupted.
 *
 * Message posting reuses the stock host `session.prompt` path (any live
 * session), so this plugin adds no message transport of its own — it only
 * opens/closes/list the side-session lifecycle over its own `/side-chat`
 * routes, and exposes the `/side` human command as the keyboard entry point.
 *
 * Security note: the routes are served through the same webServer as /api and
 * must be reachable only from the trusted web client. They are thin — they
 * take a sessionId and an optional prompt and delegate to existing host
 * services; there is no new capability a malicious caller gains beyond
 * forking sessions it could already fork.
 *
 * @module @zhuchenglong/dsh-side-chat
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls the Context merges for ctx.sessions / ctx.agents /
// ctx.agentPresets / ctx.commands / ctx.webServer into this compilation.
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import { resolveSessionPreset } from '@deepseek-ai/dsh-agent-presets'
import { ROUTE_PREFIX, SIDE_COMMAND } from './invariant.ts'

export { ROUTE_PREFIX, SIDE_COMMAND, PLUGIN_ID } from './invariant.ts'

/** Plugin identity for cordis.yml rows. */
export const name = '@zhuchenglong/dsh-side-chat'

/** Services required before mounting. */
export const inject = ['webServer', 'sessions', 'agents', 'commands', 'agentPresets']

/** Plugin config. */
export interface Config {
  /** Human-readable description shown in command discovery UI. */
  description: string
}

export const Config: z<Config> = z.object({
  description: z.string().default('打开一个继承当前对话上下文的临时侧边对话（不打断主任务）'),
})

/** One registry record: a side session and its owning parent. */
export interface SideChatSummary {
  readonly sideSessionId: SessionId
  readonly parentSessionId: SessionId
  readonly createdAt: number
  /** Whether the side agent is mid-turn right now. */
  readonly running: boolean
  /** Short display title derived from the side chat's first user message. */
  readonly title: string
}

/** Structured failure for the /side-chat routes. */
class SideChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SideChatError'
  }
}

/** Read and decode a JSON request body (bounded). */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024) {
        reject(new SideChatError(413, 'request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new SideChatError(400, 'request body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** Write a JSON response. */
function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

/**
 * Replicate the host's fork composition: resolve the session's recorded
 * preset and mount it on the child agent, so the seeded history runs under
 * the same tools/persona that produced it. Mirrors `composeAgent` in the
 * host api-proxy (without the web model-selection store wiring, which this
 * plugin does not need).
 */
async function composeAgentFor(
  ctx: Context,
  presetId: string | undefined,
): Promise<{ agentPreset?: string; setup: (agentCtx: Context) => Promise<void> }> {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) {
    return { setup: async () => {} }
  }
  const resolvedId = (await presets.resolve(presetId)).id
  return {
    agentPreset: resolvedId,
    setup: async (agentCtx: Context) => {
      await presets.mount(agentCtx, resolvedId)
    },
  }
}

/**
 * The balanced completed-turn prefix of a session's log, extended through
 * trailing out-of-band appends up to the next turn/start — the same seed the
 * host's `session.fork` computes, so a side chat inherits exactly the context
 * a fork would.
 */
export function sideChatSeed(parent: Session): readonly import('@deepseek-ai/dsh-session').SessionEvent[] | undefined {
  const events = parent.events
  const boundary = events.findLast(e => e.type === 'turn/end')
  if (boundary === undefined) return undefined
  let cut = boundary.seq + 1
  while (cut < events.length && events[cut]?.type !== 'turn/start') cut++
  return events.slice(0, cut)
}

/**
 * The child's agent options inherited from the parent's last logged model
 * selection, so the side chat runs on the same model the parent is using.
 */
function inheritedAgentOptions(parent: Session): { provider: string; model: string } | undefined {
  const config = parent.requestHeader()?.config
  if (config === undefined) return undefined
  return { provider: config.provider, model: config.model }
}

/** Maximum length of a derived side-chat title (approximate, CJK-aware). */
export const SIDE_CHAT_TITLE_MAX = 24

/**
 * Derive a short display title for a side chat from its first user message —
 * DSH's own title system deliberately skips sessions with a parent, so side
 * chats carry no title; this is a deterministic, recomputable label.
 * @param session - the side session.
 * @returns the truncated first-message text, or undefined when the session
 *   has no user message yet.
 */
export function sideChatTitleOf(session: Session): string | undefined {
  const first = session.events.find(
    (event): event is SessionEvent<'user/message'> =>
      event.type === 'user/message' && event.data.source.kind === 'user',
  )
  if (first === undefined) return undefined
  const text = (first.data.content ?? [])
    .filter((block): block is { type: 'text'; text: string } =>
      typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text')
    .map(block => (block as { text: string }).text)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (text.length === 0) return undefined
  if (text.length <= SIDE_CHAT_TITLE_MAX) return text
  return `${text.slice(0, SIDE_CHAT_TITLE_MAX)}…`
}

/**
 * Plugin body: installs the /side-chat routes, the durable (in-process)
 * side-chat registry, and the /side human command.
 * @param ctx - the host root context.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config?: Config): void {
  const description = config?.description ?? '打开一个继承当前对话上下文的临时侧边对话（不打断主任务）'

  // In-process registry: sideSessionId -> owning parent + live handle. The
  // sessions themselves persist through ordinary session persistence; this
  // registry only records the side-chat grouping, so a process restart loses
  // the grouping (the sessions remain reachable as ordinary forks).
  const registry = new Map<SessionId, { parentSessionId: SessionId; createdAt: number; handle: unknown }>()

  /** Create a side chat for a parent session. */
  async function openSideChat(parentSessionId: SessionId): Promise<SessionId> {
    const parent = ctx.sessions.get(parentSessionId)
    if (parent === undefined) {
      throw new SideChatError(404, `parent session "${parentSessionId}" not found`)
    }
    const seed = sideChatSeed(parent)
    if (seed === undefined || seed.length === 0) {
      throw new SideChatError(
        409,
        `parent session "${parentSessionId}" has no completed turn to fork from`,
      )
    }
    const composition = await composeAgentFor(ctx, resolveSessionPreset({ header: parent.header, events: parent.events }))
    const childId = `session-${randomUUID()}` as SessionId
    const handle = await ctx.agents.create({
      sessionId: childId,
      seed,
      meta: {
        ...(parent.header.cwd === undefined ? {} : { cwd: parent.header.cwd }),
        parentSession: parentSessionId,
        seedLength: seed.length,
        ...(composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset }),
      },
      ...(inheritedAgentOptions(parent) === undefined
        ? {}
        : { agentOptions: inheritedAgentOptions(parent) }),
      setup: composition.setup,
    })
    registry.set(childId, {
      parentSessionId,
      createdAt: Date.now(),
      handle,
    })
    return childId
  }

  /** List side chats of one parent, newest first. */
  function listSideChats(parentSessionId: SessionId): SideChatSummary[] {
    const rows: SideChatSummary[] = []
    for (const [sideSessionId, record] of registry) {
      if (record.parentSessionId !== parentSessionId) continue
      const agent = ctx.agents.get(sideSessionId)
      const side = ctx.sessions.get(sideSessionId)
      rows.push({
        sideSessionId,
        parentSessionId,
        createdAt: record.createdAt,
        running: agent?.status === 'running',
        title: side === undefined ? '' : (sideChatTitleOf(side) ?? ''),
      })
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Close a side chat: dispose the agent (removes the live session → the GUI
   * drops it via `host/session-removed`) and archive the session so it stays
   * hidden from the workspace tree even though the persisted log remains
   * (DSH has no persisted-log delete; archiving is the native "removed from
   * view" operation the workspace browser honors).
   */
  async function closeSideChat(sideSessionId: SessionId): Promise<void> {
    const record = registry.get(sideSessionId)
    if (record === undefined) {
      throw new SideChatError(404, `side chat "${sideSessionId}" not found`)
    }
    registry.delete(sideSessionId)
    const handle = record.handle as { dispose: () => Promise<void> }
    try {
      await handle.dispose()
    } finally {
      // Best-effort: without the workspace service composed, the live
      // dispose above still removes the session from the GUI.
      const workspaces = ctx.get('workspaceRegistry') as
        | { archiveSession(id: SessionId): Promise<void> }
        | undefined
      if (workspaces !== undefined) {
        await workspaces.archiveSession(sideSessionId).catch((error: unknown) => {
          ctx.logger.warn(`[@zhuchenglong/dsh-side-chat] archive "${sideSessionId}" failed: ${String(error)}`)
        })
      }
    }
  }


  /**
   * Orphan cleanup: when a session is disposed, dispose every side chat
   * (transitively) that descends from it. A parent conversation closed or
   * removed must not leave running side agents behind.
   */
  ctx.effect(() => {
    return ctx.on('session/disposed', (session: Session) => {
      void (async () => {
        const doomed: SessionId[] = []
        const seen = new Set<SessionId>([session.id])
        // Cascade through the registry: a side chat may itself be a parent.
        for (let changed = true; changed;) {
          changed = false
          for (const [id, record] of registry) {
            if (!seen.has(record.parentSessionId) || seen.has(id)) continue
            seen.add(id)
            doomed.push(id)
            changed = true
          }
        }
        for (const id of doomed) {
          const record = registry.get(id)
          registry.delete(id)
          if (record === undefined) continue
          try {
            await (record.handle as { dispose: () => Promise<void> }).dispose()
          } catch (error: unknown) {
            ctx.logger.warn(`[@zhuchenglong/dsh-side-chat] orphan cleanup of "${id}" failed: ${String(error)}`)
          }
        }
      })()
    })
  }, '@zhuchenglong/dsh-side-chat: orphan cleanup')

  // ── /side-chat routes ──────────────────────────────────────────────────
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const path = url.pathname.replace(/\/+$/, '') || '/side-chat'
          if (req.method === 'POST' && path === `${ROUTE_PREFIX}/open`) {
            const body = (await readJsonBody(req)) as { parentSessionId?: unknown }
            const parentSessionId = body?.parentSessionId
            if (typeof parentSessionId !== 'string') {
              throw new SideChatError(400, 'missing string field: parentSessionId')
            }
            const sideSessionId = await openSideChat(parentSessionId as SessionId)
            writeJson(res, 200, { sideSessionId })
            return
          }
          if (req.method === 'GET' && path === `${ROUTE_PREFIX}/list`) {
            const parentSessionId = url.searchParams.get('parentSessionId')
            if (parentSessionId === null) {
              throw new SideChatError(400, 'missing query param: parentSessionId')
            }
            writeJson(res, 200, { sideChats: listSideChats(parentSessionId as SessionId) })
            return
          }
          if (req.method === 'POST' && path === `${ROUTE_PREFIX}/close`) {
            const body = (await readJsonBody(req)) as { sideSessionId?: unknown }
            const sideSessionId = body?.sideSessionId
            if (typeof sideSessionId !== 'string') {
              throw new SideChatError(400, 'missing string field: sideSessionId')
            }
            await closeSideChat(sideSessionId as SessionId)
            writeJson(res, 200, { ok: true })
            return
          }
          writeJson(res, 404, { error: 'not-found' })
        } catch (error: unknown) {
          if (error instanceof SideChatError) {
            writeJson(res, error.status, { error: error.message })
            return
          }
          const message = error instanceof Error ? error.message : String(error)
          ctx.logger.warn(`[@zhuchenglong/dsh-side-chat] route error: ${message}`)
          writeJson(res, 500, { error: message })
        }
      },
    })
    return dispose
  }, '@zhuchenglong/dsh-side-chat: /side-chat routes')

  // ── /side human command ────────────────────────────────────────────────
  ctx.effect(() => {
    return ctx.commands.register({
      name: SIDE_COMMAND,
      description,
      recordInput: false,
      handler: async (invocation: CommandInvocation): Promise<{ kind: 'success'; text: string }> => {
        const parentSessionId = invocation.agent.session.id
        const sideSessionId = await openSideChat(parentSessionId)
        return {
          kind: 'success',
          text: `已打开侧边对话（${sideSessionId}），可在侧边面板中继续提问。`,
        }
      },
    })
  }, '@zhuchenglong/dsh-side-chat: /side command')
}
