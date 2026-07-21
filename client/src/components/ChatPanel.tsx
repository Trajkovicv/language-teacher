import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { streamSSE, SSERequestError } from '../lib/sse'
import { apiUrl, accessHeaders, setAccessCode } from '../lib/api'

export type UiMessage = { role: 'user' | 'assistant'; content: string }

type Props = {
  characterName: string
  messages: UiMessage[]
  setMessages: Dispatch<SetStateAction<UiMessage[]>>
}

// Muss zu den Server-Limits passen (server/index.ts: MAX_MESSAGES/MAX_MESSAGE_CHARS)
const MAX_INPUT_CHARS = 4000
const HISTORY_WINDOW = 50

/**
 * Letzte N Nachrichten senden; die erste muss role 'user' haben (API-Anforderung).
 * Inhalte werden defensiv auf das Server-Limit gekappt — sonst würde eine einzige
 * überlange Assistant-Antwort jeden weiteren Request dauerhaft mit 400 blockieren.
 */
function windowForApi(history: UiMessage[]): UiMessage[] {
  let win = history.slice(-HISTORY_WINDOW)
  while (win.length > 0 && win[0].role !== 'user') win = win.slice(1)
  return win.map((m) =>
    m.content.length > MAX_INPUT_CHARS ? { ...m, content: m.content.slice(0, MAX_INPUT_CHARS) } : m,
  )
}

/**
 * Trennt die »PREVOD:«-Übersetzungszeile vom Haupttext.
 * Es zählt die LETZTE Fundstelle am Zeilenanfang — eine Erwähnung von
 * »PREVOD:« mitten im Erklärtext bleibt so Teil der Nachricht.
 */
function splitPrevod(text: string): { main: string; prevod: string | null } {
  const matches = [...text.matchAll(/^PREVOD:/gm)]
  const last = matches[matches.length - 1]
  if (!last || last.index === undefined) return { main: text, prevod: null }
  return {
    main: text.slice(0, last.index).trimEnd(),
    prevod: text.slice(last.index + 'PREVOD:'.length).trim() || null,
  }
}

/**
 * Verbirgt während des Streamings ein unvollständiges »PREVOD:«-Präfix am
 * Textende (z. B. "…\nPREV"), damit der Marker nicht kurz als Text aufblitzt.
 */
function hidePartialPrevodMarker(text: string): string {
  const marker = 'PREVOD:'
  for (let len = marker.length - 1; len > 0; len--) {
    const tail = marker.slice(0, len)
    if (text.endsWith('\n' + tail)) return text.slice(0, -tail.length)
    if (text === tail) return ''
  }
  return text
}

export default function ChatPanel({ characterName, messages, setMessages }: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // null = kein Stream aktiv; '' = Anfrage läuft, noch kein Token (Tipp-Indikator)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const pauseMessage = `${characterName} macht kurz Pause… Versuch es gleich noch einmal.`

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pendingText, notice])

  // Beim Unmount (z. B. Charakterwechsel via key) laufenden Stream abbrechen —
  // der Server stoppt dann auch den Claude-Stream (Kostenkontrolle)
  useEffect(() => () => abortRef.current?.abort(), [])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setNotice(null)
    setBusy(true)
    try {
      await runExchange(messages, text)
    } finally {
      setBusy(false)
      setPendingText(null)
      abortRef.current = null
    }
  }

  /** Ein Frage-Antwort-Austausch; ruft sich bei neu eingegebenem Zugangscode einmal selbst auf. */
  async function runExchange(baseHistory: UiMessage[], text: string): Promise<void> {
    const history: UiMessage[] = [...baseHistory, { role: 'user', content: text }]
    setMessages(history)
    setPendingText('')

    const controller = new AbortController()
    abortRef.current = controller
    let acc = ''
    let truncated = false

    try {
      await streamSSE(
        apiUrl('/api/chat'),
        { messages: windowForApi(history), character: characterName },
        {
          signal: controller.signal,
          headers: accessHeaders(),
          onEvent: (ev) => {
            if (ev.type === 'text') {
              acc += ev.text
              setPendingText(acc)
            } else if (ev.type === 'truncated') {
              truncated = true
            } else if (ev.type === 'error') {
              setNotice(ev.message ?? pauseMessage)
            }
          },
        },
      )
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      if (!aborted) {
        // Geschützte Instanz: Zugangscode erfragen und einmal neu versuchen
        if (err instanceof SSERequestError && err.status === 401) {
          setMessages(baseHistory)
          const code = window.prompt('Diese App ist geschützt. Zugangscode eingeben:')
          if (code?.trim()) {
            setAccessCode(code.trim())
            return runExchange(baseHistory, text)
          }
          setInput(text)
          setNotice('Ohne gültigen Zugangscode kann keine Nachricht gesendet werden.')
          return
        }
        if (acc === '') {
          // Anfrage kam gar nicht durch (400/429/Netz): Nachricht zurückrollen,
          // Eingabe wiederherstellen, damit nichts verloren geht
          setMessages(baseHistory)
          setInput(text)
        }
        // Nur Server-Meldungen anzeigen; rohe Browser-Fehler ("Failed to fetch") → Pausen-Meldung
        setNotice(
          err instanceof SSERequestError && !err.message.startsWith('HTTP') ? err.message : pauseMessage,
        )
      }
    } finally {
      if (acc) setMessages((m) => [...m, { role: 'assistant', content: acc }])
      if (truncated) setNotice('Die Antwort wurde wegen des Token-Limits gekürzt.')
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  const streaming = splitPrevod(hidePartialPrevodMarker(pendingText ?? ''))

  return (
    <section className="chat">
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && !busy && (
          <p className="chat-hint">
            Schreib {characterName} etwas — z.&nbsp;B. »Zdravo!« oder »Ich möchte Serbisch lernen«.
          </p>
        )}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="bubble user">
                <div className="who">Du</div>
                <div>{m.content}</div>
              </div>
            )
          }
          const { main, prevod } = splitPrevod(m.content)
          return (
            <div key={i} className="bubble assistant">
              <div className="who">{characterName}</div>
              <div className="msg-text">{main}</div>
              {prevod && <div className="prevod">🇷🇸 {prevod}</div>}
            </div>
          )
        })}

        {pendingText !== null && (
          <div className="bubble assistant">
            <div className="who">{characterName}</div>
            {pendingText === '' ? (
              <div className="typing">tippt…</div>
            ) : (
              <>
                <div className="msg-text">
                  {streaming.main}
                  <span className="cursor">▍</span>
                </div>
                {streaming.prevod && <div className="prevod">🇷🇸 {streaming.prevod}</div>}
              </>
            )}
          </div>
        )}

        {notice && <div className="bubble notice">{notice}</div>}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={MAX_INPUT_CHARS}
          placeholder={`Nachricht an ${characterName}…`}
          aria-label="Nachricht"
        />
        {busy ? (
          <button type="button" onClick={stop}>
            Stopp
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Senden
          </button>
        )}
      </form>
    </section>
  )
}
