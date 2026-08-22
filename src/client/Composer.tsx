/**
 * Side-chat composer: a single textarea + send, with a stop button while the
 * side agent is running. Posts through the runtime session's `prompt` verb
 * (the same path the main composer uses).
 * @module dsh-side-chat/composer
 */
import { createElement, useState } from 'react'
import type { FormEvent } from 'react'
import css from './side-chat.module.css'

/** The composer's session verbs (structural subset of SessionFace). */
export interface ComposerSession {
  prompt(content: readonly unknown[], mode: 'queue' | 'steer'): Promise<unknown>
  cancel(): Promise<unknown>
}

/**
 * Render the composer.
 * @param props - the side session object (methods are invoked on it so `this`
 *   stays bound — extracting `session.prompt` would lose the receiver), the
 *   running flag, and an error reporter.
 */
export function Composer({ session, running, onError }: {
  session: ComposerSession
  running: boolean
  onError: (message: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (): Promise<void> => {
    const text = draft.trim()
    if (text.length === 0 || sending) return
    setDraft('')
    setSending(true)
    try {
      const result = await session.prompt([{ type: 'text', text }], 'queue')
      if (result != null && typeof result === 'object' && 'ok' in result && (result as { ok?: boolean }).ok === false) {
        const err = (result as { error?: { message?: string } }).error
        onError(err?.message ?? '消息发送失败')
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '消息发送失败')
    } finally {
      setSending(false)
    }
  }

  const stop = (): void => {
    void session.cancel()
  }

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void submit()
  }

  return (
    <form className={css.composer} onSubmit={onSubmit}>
      <textarea
        className={css.composerInput}
        rows={3}
        value={draft}
        placeholder="向侧边对话提问…（Enter 发送，Shift+Enter 换行）"
        onChange={event => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
      />
      <div className={css.composerActions}>
        {running
          ? <button type="button" className={css.stopButton} onClick={stop}>停止</button>
          : <button type="submit" className={css.sendButton} disabled={draft.trim().length === 0 || sending}>发送</button>}
      </div>
    </form>
  )
}
