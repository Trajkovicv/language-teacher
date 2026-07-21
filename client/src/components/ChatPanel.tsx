import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { streamSSE, SSERequestError } from '../lib/sse'
import { apiUrl, accessHeaders, setAccessCode } from '../lib/api'
import { Icon } from './Icons'
import Bilingual from './Bilingual'
import VoiceBar from './VoiceBar'
import type { Lang } from '../lib/i18n'
import type { MicZone } from '../lib/mic'

export type UiMessage = { role: 'user' | 'assistant'; content: string }

type MicProps = {
  active: boolean
  levels: number[]
  zone: MicZone
  error: string | null
  onToggle: () => void
}

type Props = {
  active: boolean
  lang: Lang
  characterName: string
  messages: UiMessage[]
  setMessages: Dispatch<SetStateAction<UiMessage[]>>
  onBusyChange: (busy: boolean) => void
  warning: string | null
  mic: MicProps
}

// Muss zu den Server-Limits passen (server/index.ts: MAX_MESSAGES/MAX_MESSAGE_CHARS)
const MAX_INPUT_CHARS = 4000
const HISTORY_WINDOW = 50

const QUICK_REPLIES = ['Doviđenja! 👋', 'Ponovi, molim te', 'Kako se kaže „Tschüss"?'] as const

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

/**
 * Minimales Markdown: **fett** und *kursiv* aus Claude-Antworten hübsch rendern.
 * Sterne paaren bewusst nie über Zeilengrenzen ([^*\n]) — sonst würden
 * *-Aufzählungen und einzelne Sterne den Text zwischen zwei Zeilen kursiv setzen.
 */
function renderRich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <i key={i}>{part.slice(1, -1)}</i>
    return part
  })
}

export default function ChatPanel({
  active,
  lang,
  characterName,
  messages,
  setMessages,
  onBusyChange,
  warning,
  mic,
}: Props) {
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

  // App über den Sprech-Zustand informieren (Voice-Bar + Hero-Ring)
  useEffect(() => {
    onBusyChange(busy)
  }, [busy, onBusyChange])

  // Beim Unmount (z. B. Charakterwechsel via key) laufenden Stream abbrechen —
  // der Server stoppt dann auch den Claude-Stream (Kostenkontrolle)
  useEffect(
    () => () => {
      abortRef.current?.abort()
      onBusyChange(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim()
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
  const assistantCount = messages.filter((m) => m.role === 'assistant').length
  const step = Math.min(assistantCount, 5)

  return (
    <div className={active ? 'panel active' : 'panel'} data-panel="chat">
      <div className="panel-scroll" ref={listRef}>
        <div className="day-hint">
          <Bilingual k="lesson" lang={lang} />
        </div>
        {assistantCount > 0 && (
          <div className="lesson-prog">
            <div className="lp-bar">
              <span style={{ width: `${(step / 5) * 100}%` }} />
            </div>
            <div className="lp-txt">
              Schritt {step} von 5 <i>· Korak {step} od 5</i>
            </div>
          </div>
        )}

        {warning && <div className="msg notice">{warning}</div>}

        {messages.length === 0 && !busy && (
          <p className="chat-hint">
            Schreib {characterName} etwas — z.&nbsp;B. »Zdravo!« oder »Ich möchte Serbisch lernen«.
          </p>
        )}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="msg student">
                <div className="who">Du</div>
                {m.content}
              </div>
            )
          }
          const { main, prevod } = splitPrevod(m.content)
          return (
            <div key={i} className="msg mila">
              <div className="who">
                <span className="charName">{characterName}</span>
              </div>
              {renderRich(main)}
              {prevod && <span className="tl">🇷🇸 {renderRich(prevod)}</span>}
            </div>
          )
        })}

        {pendingText === '' && (
          <div className="msg mila typing">
            <div className="who">
              <span className="charName">{characterName}</span>&nbsp;· schreibt · piše …
            </div>
            <div className="tdots">
              <i></i>
              <i></i>
              <i></i>
            </div>
          </div>
        )}
        {pendingText !== null && pendingText !== '' && (
          <div className="msg mila">
            <div className="who">
              <span className="charName">{characterName}</span>
            </div>
            {renderRich(streaming.main)}
            <span className="cursor" />
            {streaming.prevod && <span className="tl">🇷🇸 {renderRich(streaming.prevod)}</span>}
          </div>
        )}

        {notice && <div className="msg notice">{notice}</div>}

        {!busy && messages.length > 0 && (
          <div className="quick">
            <div className="q-lbl">Schnellantworten · Brzi odgovori</div>
            <div className="q-row">
              {QUICK_REPLIES.map((q) => (
                <button key={q} type="button" className="qr" onClick={() => void send(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <VoiceBar
        characterName={characterName}
        mode={mic.active ? 'user' : busy ? 'teacher' : 'idle'}
        levels={mic.levels}
        zone={mic.zone}
        micError={mic.error}
      />

      <form
        className="inputbar"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <button
          type="button"
          className={mic.active ? 'micbtn active' : 'micbtn'}
          onClick={mic.onToggle}
          title="Mikrofontest · Test mikrofona"
        >
          <Icon id="i-mic" />
        </button>
        <input
          className="in"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={MAX_INPUT_CHARS}
          placeholder="Napiši poruku… · Schreib hier…"
          aria-label="Nachricht"
        />
        {busy ? (
          <button type="button" className="send" onClick={stop}>
            Stopp
          </button>
        ) : (
          <button type="submit" className="send" disabled={!input.trim()}>
            <Bilingual k="send" lang={lang} />
          </button>
        )}
      </form>
    </div>
  )
}
