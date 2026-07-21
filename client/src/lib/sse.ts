export type SSEEvent =
  | { type: 'text'; text: string }
  | { type: 'truncated' }
  | { type: 'error'; message?: string }

/**
 * Liest einen SSE-Stream via fetch + ReadableStream (bewusst kein EventSource:
 * das kann kein POST mit Verlauf im Body und würde LLM-Requests auto-reconnecten).
 * Endet beim Signal `data: [DONE]` oder wenn der Server den Stream schließt.
 */
export class SSERequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function streamSSE(
  url: string,
  body: unknown,
  opts: { signal?: AbortSignal; headers?: Record<string, string>; onEvent: (ev: SSEEvent) => void },
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    let message: string | undefined
    try {
      message = ((await res.json()) as { error?: string }).error
    } catch {
      // Body war kein JSON — generische Meldung reicht
    }
    throw new SSERequestError(message ?? `HTTP ${res.status}`, res.status)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE-Events sind durch Leerzeilen getrennt; unvollständige Chunks bleiben im Puffer
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of rawEvent.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6)
        if (data === '[DONE]') return
        try {
          opts.onEvent(JSON.parse(data) as SSEEvent)
        } catch {
          // Unbekannte oder unvollständige Events tolerant ignorieren
        }
      }
    }
  }
}
