/**
 * Compact transcript for a side chat: a lightweight render of the runtime's
 * conversation nodes (user messages, assistant text, tool summaries, command
 * cards) plus the live partial while the side agent streams. This is an
 * intentionally small subset of the full conversation UI — side chats are for
 * quick Q&A, so tool details and queue chrome stay out.
 *
 * Scroll behavior: new content auto-scrolls to the bottom while the user is
 * near the bottom (following the conversation). When the user scrolls up to
 * read, following pauses and a "回到底部" pill appears to jump back down.
 * @module dsh-side-chat/compact-transcript
 */
import { createElement, useEffect, useRef, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { textOfAssistant, textOfContent, toolLabel } from './text.ts'
import css from './side-chat.module.css'

/** Structural subset of a runtime conversation node we render. */
type Node = {
  kind: string
  seq: number
  content?: readonly unknown[]
  blocks?: readonly unknown[]
  call?: { name?: string | null } | null
  callId?: string
  name?: string
  summary?: string | null
}

/** Structural subset of the runtime conversation snapshot we read. */
export interface TranscriptSnapshot {
  nodes: readonly unknown[]
  partial: { blocks: readonly unknown[] } | null
  running: boolean
}

/** Distance from the bottom (px) that still counts as "following". */
const PIN_THRESHOLD = 48

/** Rendered transcript row. */
function Row({ node }: { node: Node }) {
  switch (node.kind) {
    case 'user': {
      const text = textOfContent(node.content ?? [])
      if (text.length === 0) return null
      return (
        <div className={css.userRow}>
          <div className={css.userBubble}>{text}</div>
        </div>
      )
    }
    case 'assistant': {
      const text = textOfAssistant(node.blocks ?? [])
      if (text.length === 0) return null
      return (
        <div className={css.assistantRow}>
          <MarkdownText text={text} />
        </div>
      )
    }
    case 'tool-result': {
      const label = toolLabel(node.call, node.callId ?? String(node.seq))
      return <div className={css.toolRow}>⚙ {label}</div>
    }
    case 'command':
      return <div className={css.toolRow}>／{node.name ?? 'command'}</div>
    case 'compaction':
      return <div className={css.toolRow}>🗜 上下文已压缩</div>
    default:
      return null
  }
}

/**
 * Render one side chat's transcript with follow-the-latest scroll.
 * @param props - the conversation snapshot (structural) to render.
 */
export function CompactTranscript({ snapshot }: { snapshot: TranscriptSnapshot }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [following, setFollowing] = useState(true)

  // Follow new content while pinned near the bottom. `snapshot` is a stable
  // reference until the conversation actually changes, so this runs exactly
  // when new events land (including streaming partial updates).
  useEffect(() => {
    if (!following) return
    const el = scrollRef.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
  }, [snapshot, following])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (el === null) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD
    if (nearBottom !== following) setFollowing(nearBottom)
  }

  const jumpToBottom = (): void => {
    const el = scrollRef.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
    setFollowing(true)
  }

  const nodes = snapshot.nodes as Node[]
  const hasAny = nodes.length > 0 || snapshot.partial !== null || snapshot.running
  if (!hasAny) {
    return <div className={css.empty}>侧边对话已就绪，输入你的问题。</div>
  }
  return (
    <div className={css.transcriptWrap}>
      <div className={css.transcript} ref={scrollRef} onScroll={onScroll}>
        {nodes.map(node => <Row key={node.seq} node={node} />)}
        {snapshot.partial !== null && textOfAssistant(snapshot.partial.blocks ?? []).length > 0 && (
          <div className={css.assistantRow}>
            <MarkdownText text={textOfAssistant(snapshot.partial.blocks)} streaming />
          </div>
        )}
        {snapshot.running && snapshot.partial === null && <div className={css.thinking}>思考中…</div>}
      </div>
      {!following && (
        <button type="button" className={css.jumpBottom} onClick={jumpToBottom} title="回到底部">
          ↓ 回到底部
        </button>
      )}
    </div>
  )
}
