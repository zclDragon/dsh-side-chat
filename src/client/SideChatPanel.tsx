/**
 * The side-chat panel: a floating toggle (bottom-right) that opens a panel
 * showing the current conversation's side chats. Selecting one renders its
 * live transcript (opened through the runtime session window) with a composer
 * that posts through the standard `prompt` verb — so the side agent runs
 * concurrently without interrupting the main task.
 *
 * The panel binds sessions purely through the runtime's `sessions` face: the
 * active parent is `sessions.list.current`, and each side session's live
 * conversation comes from `sessions.binding(id).session` (opened via its
 * `open()` verb so the host streams its events).
 * @module dsh-side-chat/panel
 */
import { createElement, useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { sideChatApi, type SideChatSummary } from './api.ts'
import { CompactTranscript } from './CompactTranscript.tsx'
import { Composer } from './Composer.tsx'
import css from './side-chat.module.css'

/** Minimal observable the panel subscribes to (structural subset). */
interface Observable<T> {
  subscribe(fn: () => void): () => void
  getSnapshot(): T
}

/** Minimal session face the panel uses (structural subset of SessionFace). */
interface SideSession {
  open(): Promise<void>
  subscribe(fn: () => void): () => void
  getSnapshot(): unknown
  prompt(content: readonly unknown[], mode: 'queue' | 'steer'): Promise<unknown>
  cancel(): Promise<unknown>
}

/** The runtime `sessions` face the panel needs (structural subset of ISessions). */
export interface SessionsFace {
  list: Observable<{ current?: string; byId: Record<string, unknown> }>
  binding(id: string): { session: SideSession } | undefined
}

/** Panel props: the injected sessions face plus the plugin's own API. */
export interface SideChatPanelProps {
  sessions: SessionsFace
  api: typeof sideChatApi
}

/** How long to wait for a freshly opened side session to appear in the list. */
const LIST_POLL_MS = 200
const LIST_POLL_MAX = 20

/** Wait until a session id is listed (the host pushes session/created async). */
function waitForListed(sessions: SessionsFace, id: string): Promise<void> {
  return new Promise((resolve) => {
    let tries = 0
    const tick = (): void => {
      tries += 1
      if (sessions.list.getSnapshot().byId[id] !== undefined || tries >= LIST_POLL_MAX) {
        resolve()
        return
      }
      setTimeout(tick, LIST_POLL_MS)
    }
    tick()
  })
}

/**
 * The plugin's whole browser surface: floating toggle + side-chat panel.
 * @param props - sessions face and the host API.
 */
export function SideChatPanel({ sessions, api }: SideChatPanelProps) {
  const listState = useSyncExternalStore(
    (fn) => sessions.list.subscribe(fn),
    () => sessions.list.getSnapshot(),
  )
  const parentId = listState.current
  const [visible, setVisible] = useState(false)
  const [sides, setSides] = useState<SideChatSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep the side list fresh while the panel is open and follow the parent.
  useEffect(() => {
    if (!visible || parentId === undefined) {
      setSides([])
      setSelectedId(null)
      return
    }
    let alive = true
    const refresh = async (): Promise<void> => {
      try {
        const list = await api.list(parentId)
        if (!alive) return
        setSides(list)
        setSelectedId(prev => {
          if (prev !== null && list.some(s => s.sideSessionId === prev)) return prev
          return list[0]?.sideSessionId ?? null
        })
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    void refresh()
    const interval = setInterval(() => { void refresh() }, 3000)
    return () => { alive = false; clearInterval(interval) }
  }, [visible, parentId, api])

  // Open a new side chat for the current parent.
  const open = async (): Promise<void> => {
    if (parentId === undefined || busy) return
    setBusy(true)
    setError(null)
    try {
      const id = await api.open(parentId)
      await waitForListed(sessions, id)
      setVisible(true)
      const list = await api.list(parentId)
      setSides(list)
      setSelectedId(id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  // Close (dispose) a side chat.
  const close = async (id: string): Promise<void> => {
    try {
      await api.close(id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    if (parentId !== undefined) {
      const list = await api.list(parentId)
      setSides(list)
      setSelectedId(prev => prev === id ? (list[0]?.sideSessionId ?? null) : prev)
    }
  }

  // Resolve the selected side's live session and open its event window once.
  const binding = selectedId === null ? undefined : sessions.binding(selectedId)
  const session = binding?.session
  useEffect(() => {
    if (session !== undefined) void session.open()
  }, [session])

  const snapshot = useSyncExternalStore<unknown>(
    (fn) => (session === undefined ? () => {} : session.subscribe(fn)),
    () => (session === undefined ? undefined : session.getSnapshot()),
  ) as {
    nodes?: readonly unknown[]
    partial?: { blocks: readonly unknown[] } | null
    running?: boolean
  } | undefined

  const selected = selectedId === null ? undefined : sides.find(s => s.sideSessionId === selectedId)
  const running = snapshot?.running === true || selected?.running === true
  const parentTitle = parentId === undefined
    ? undefined
    : (listState.byId[parentId] as { displayTitle?: string } | undefined)?.displayTitle

  const closeAll = async (): Promise<void> => {
    for (const side of sides) {
      try {
        await api.close(side.sideSessionId)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    setSides([])
    setSelectedId(null)
  }

  const toggle = (): void => { setVisible(v => !v) }

  return (
    <>
      <button
        type="button"
        className={css.toggle}
        onClick={toggle}
        title="侧边对话（/side）"
        aria-label="侧边对话"
      >
        💬 侧聊{visible ? ' ✕' : ''}
      </button>

      {visible && (
        <aside className={css.panel} aria-label="侧边对话面板">
          <header className={css.header}>
            <div className={css.titleWrap}>
              <div className={css.title}>侧边对话</div>
              <div className={css.subtitle}>{parentTitle ?? '当前会话'} · {sides.length} 个</div>
            </div>
            <div className={css.headerActions}>
              <button type="button" className={css.iconButton} onClick={() => { void closeAll() }} disabled={sides.length === 0} title="关闭全部侧边对话">
                全部关闭
              </button>
              <button type="button" className={css.iconButton} onClick={() => { void open() }} disabled={busy || parentId === undefined} title="新建侧边对话">
                ＋ 新建
              </button>
              <button type="button" className={css.iconButton} onClick={toggle} title="收起">✕</button>
            </div>
          </header>

          {error !== null && <div className={css.errorStrip}>{error}</div>}

          {sides.length === 0 && (
            <div className={css.emptyPanel}>
              <p>还没有侧边对话。</p>
              <p className={css.emptyHint}>侧边对话是当前主对话的临时分叉：继承已完成的上下文、不打断主任务、不污染主线程。</p>
            </div>
          )}

          {sides.length > 0 && (
            <div className={css.sideList}>
              {sides.map((side, index) => (
                <button
                  key={side.sideSessionId}
                  type="button"
                  className={selectedId === side.sideSessionId ? css.sideChipActive : css.sideChip}
                  onClick={() => setSelectedId(side.sideSessionId)}
                >
                  <span className={css.chipLabel}>{side.title.length > 0 ? side.title : `#${index + 1}`}</span>
                  <span>{side.running ? '…' : ''}</span>
                </button>
              ))}
            </div>
          )}

          {selectedId !== null && session !== undefined && snapshot !== undefined && (
            <div className={css.conversation}>
              <CompactTranscript snapshot={{ nodes: snapshot.nodes ?? [], partial: snapshot.partial ?? null, running }} />
              <Composer
                session={session}
                running={running}
                onError={(message) => setError(message)}
              />
              <div className={css.footer}>
                <span className={css.footerId}>#{selected?.sideSessionId}</span>
                <button type="button" className={css.closeButton} onClick={() => { void close(selectedId) }}>关闭此侧聊</button>
              </div>
            </div>
          )}
        </aside>
      )}
    </>
  )
}
