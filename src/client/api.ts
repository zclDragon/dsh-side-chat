/**
 * Thin typed client for the plugin's own /side-chat host routes. Same-origin
 * fetch (the GUI and the host webServer share one origin).
 * @module dsh-sidechat/api
 */

/** One side chat as the host registry reports it. */
export interface SideChatSummary {
  readonly sideSessionId: string
  readonly parentSessionId: string
  readonly createdAt: number
  readonly running: boolean
}

/** Structured request failure surfaced to the panel. */
export class SideChatApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SideChatApiError'
  }
}

async function request(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new SideChatApiError(response.status, `unexpected response from ${path}`)
  }
  if (!response.ok) {
    const message = (payload as { error?: unknown })?.error
    throw new SideChatApiError(response.status, typeof message === 'string' ? message : `request to ${path} failed`)
  }
  return payload
}

/** The plugin's host API surface. */
export const sideChatApi = {
  /** Open a side chat forking a parent session; resolves the new session id. */
  open(parentSessionId: string): Promise<string> {
    return request('/side-chat/open', {
      method: 'POST',
      body: JSON.stringify({ parentSessionId }),
    }).then((payload: { sideSessionId?: unknown }) => {
      if (typeof payload.sideSessionId !== 'string') throw new SideChatApiError(500, 'open response missing sideSessionId')
      return payload.sideSessionId
    })
  },

  /** List a parent session's side chats, newest first. */
  list(parentSessionId: string): Promise<SideChatSummary[]> {
    return request(`/side-chat/list?parentSessionId=${encodeURIComponent(parentSessionId)}`)
      .then((payload: { sideChats?: unknown }) => {
        const rows = payload.sideChats
        if (!Array.isArray(rows)) throw new SideChatApiError(500, 'list response missing sideChats')
        return rows as SideChatSummary[]
      })
  },

  /** Close (dispose) a side chat. */
  close(sideSessionId: string): Promise<void> {
    return request('/side-chat/close', {
      method: 'POST',
      body: JSON.stringify({ sideSessionId }),
    }).then(() => undefined)
  },
}
