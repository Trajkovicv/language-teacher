import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { streamSSE, SSERequestError } from '../lib/sse'
import { apiUrl, accessHeaders, setAccessCode } from '../lib/api'
import { useRecognition, type SpeakOpts } from '../lib/speech'
import { clearMemory, getProfile, hasMemory, noteExchange } from '../lib/memory'
import { Icon } from './Icons'
import Bilingual from './Bilingual'
import VoiceBar from './VoiceBar'
import type { Lang } from '../lib/i18n'
import type { MicZone } from '../lib/mic'

/** Anhang im Verlauf: nur Anzeige-Daten (Thumbnail/Name) — die Base64-Rohdaten
 *  werden NICHT im Verlauf gehalten und nur beim Absenden einmal mitgeschickt
 *  (Budget: ein Bild/PDF kostet nur im eigenen Turn Input-Tokens). */
export type UiAttachment = { kind: 'image' | 'pdf'; name: string; preview?: string }
export type UiMessage = { role: 'user' | 'assistant'; content: string; attachment?: UiAttachment }

/** Anhang, der gerade zum Absenden bereitliegt (inkl. Base64-Daten). */
export type PendingAttachment = {
  kind: 'image' | 'pdf'
  name: string
  media: string
  data: string
  preview?: string
}

/** Entwurf (Text + Anhang) — lebt in App pro Charakter, überlebt den key-Remount. */
export type Draft = { input: string; attachment: PendingAttachment | null }

/** Wire-Format an den Server (siehe server/index.ts parseMessages). */
type ApiBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: string; data: string }
  | { type: 'document'; media_type: string; data: string }
type ApiMessage = { role: 'user' | 'assistant'; content: string | ApiBlock[] }

const MAX_PDF_BYTES = 4 * 1024 * 1024

/** Bild client-seitig auf max. 1024px verkleinern → JPEG-Base64 (spart Tokens). */
async function processImage(file: File): Promise<PendingAttachment> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'))
      el.src = url
    })
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas nicht verfügbar')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    if (!base64) throw new Error('Bild konnte nicht umgewandelt werden')

    // kleines Vorschaubild für die Chat-Blase
    const pScale = Math.min(1, 320 / Math.max(canvas.width, canvas.height))
    const pCanvas = document.createElement('canvas')
    pCanvas.width = Math.max(1, Math.round(canvas.width * pScale))
    pCanvas.height = Math.max(1, Math.round(canvas.height * pScale))
    pCanvas.getContext('2d')?.drawImage(canvas, 0, 0, pCanvas.width, pCanvas.height)
    return {
      kind: 'image',
      name: file.name || 'foto.jpg',
      media: 'image/jpeg',
      data: base64,
      preview: pCanvas.toDataURL('image/jpeg', 0.7),
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function processPdf(file: File): Promise<PendingAttachment> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_PDF_BYTES) {
      reject(new Error('PDF ist zu groß — bitte höchstens 4 MB.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('PDF konnte nicht gelesen werden'))
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      if (!base64) {
        reject(new Error('PDF konnte nicht gelesen werden'))
        return
      }
      resolve({ kind: 'pdf', name: file.name || 'dokument.pdf', media: 'application/pdf', data: base64 })
    }
    reader.readAsDataURL(file)
  })
}

type MicProps = {
  active: boolean
  levels: number[]
  zone: MicZone
  error: string | null
  onToggle: () => void
  onStop: () => void
}

type VoiceProps = {
  enabled: boolean
  supported: boolean
  speaking: boolean
  toggle: () => void
  speak: (text: string, lang: Lang, opts?: SpeakOpts) => boolean
  cancel: () => void
  prime: () => void
}

type Props = {
  active: boolean
  lang: Lang
  characterName: string
  messages: UiMessage[]
  setMessages: Dispatch<SetStateAction<UiMessage[]>>
  draft: Draft
  onDraftChange: (update: (d: Draft) => Draft) => void
  onBusyChange: (busy: boolean) => void
  warning: string | null
  mic: MicProps
  voice: VoiceProps
}

// Muss zu den Server-Limits passen (server/index.ts: MAX_MESSAGES/MAX_MESSAGE_CHARS)
const MAX_INPUT_CHARS = 4000
// Verlaufsfenster in STABILEN 20er-Blöcken beschneiden statt gleitend:
// ein gleitendes Fenster würde den Byte-Präfix jede Runde verschieben und
// den Prompt-Cache dauerhaft entwerten (Präfix-Match!). So bleibt der
// Anfang des Fensters über je 20 Nachrichten identisch (Fenster: 41–60).
const HISTORY_MAX = 60
const HISTORY_CHUNK = 20

const QUICK_REPLIES = ['Doviđenja! 👋', 'Ponovi, molim te', 'Kako se kaže „Tschüss"?'] as const

/**
 * Letzte N Nachrichten senden; die erste muss role 'user' haben (API-Anforderung).
 * Inhalte werden defensiv auf das Server-Limit gekappt — sonst würde eine einzige
 * überlange Assistant-Antwort jeden weiteren Request dauerhaft mit 400 blockieren.
 * Frühere Anhänge werden zu Text-Markern („[Bild: …]") — die Rohdaten gehen nur
 * im Turn des Anhangs selbst mit (Budget!).
 */
function windowForApi(history: UiMessage[], pending?: PendingAttachment | null): ApiMessage[] {
  const overflow = history.length - HISTORY_MAX
  const start = overflow > 0 ? Math.ceil(overflow / HISTORY_CHUNK) * HISTORY_CHUNK : 0
  let win = history.slice(start)
  // API-Anforderung: die erste Nachricht muss role 'user' haben
  while (win.length > 0 && win[0].role !== 'user') win = win.slice(1)
  const messages: ApiMessage[] = win.map((m) => {
    let text = m.content
    if (m.attachment) {
      const marker = `[${m.attachment.kind === 'image' ? 'Bild' : 'PDF'}: ${m.attachment.name}]`
      text = text ? `${marker} ${text}` : marker
    }
    return { role: m.role, content: text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text }
  })
  // Der aktuelle Turn (letzte Nachricht) trägt den Anhang als echte Blöcke
  const last = messages[messages.length - 1]
  if (pending && last?.role === 'user') {
    const blocks: ApiBlock[] = [
      pending.kind === 'image'
        ? { type: 'image', media_type: pending.media, data: pending.data }
        : { type: 'document', media_type: pending.media, data: pending.data },
    ]
    const text = win[win.length - 1].content.trim()
    if (text) blocks.push({ type: 'text', text: text.slice(0, MAX_INPUT_CHARS) })
    messages[messages.length - 1] = { role: 'user', content: blocks }
  }
  return messages
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
  draft,
  onDraftChange,
  onBusyChange,
  warning,
  mic,
  voice,
}: Props) {
  // Entwurf lebt in App (pro Charakter) — hier nur bequeme Zugriffe darauf
  const input = draft.input
  const attachment = draft.attachment
  const setInput = (v: string | ((cur: string) => string)) =>
    onDraftChange((d) => ({ ...d, input: typeof v === 'function' ? v(d.input) : v }))
  const setAttachment = (
    v: PendingAttachment | null | ((cur: PendingAttachment | null) => PendingAttachment | null),
  ) => onDraftChange((d) => ({ ...d, attachment: typeof v === 'function' ? v(d.attachment) : v }))

  const [busy, setBusy] = useState(false)
  // null = kein Stream aktiv; '' = Anfrage läuft, noch kein Token (Tipp-Indikator)
  const [pendingText, setPendingText] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // iOS-PWA: webkitSpeechRecognition existiert, scheitert aber mit
  // service-not-allowed — dann dauerhaft auf den Mikrofontest ausweichen
  const recFailedRef = useRef(false)

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
  // der Server stoppt dann auch den Claude-Stream (Kostenkontrolle). Ebenso die
  // Sprachausgabe: sonst spräche die alte Stimme über dem neuen Avatar weiter.
  useEffect(
    () => () => {
      abortRef.current?.abort()
      voice.cancel()
      onBusyChange(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Diktat: erkannter Satz wird direkt gesendet
  const rec = useRecognition(
    (text) => void send(text),
    (code) => {
      if (code === 'no-speech') setNotice('Nichts verstanden — tippe aufs Mikro und sprich direkt los.')
      else if (code === 'service-not-allowed') {
        // Typisch installierte iOS-App: Diktat-Dienst nicht verfügbar, obwohl die
        // API existiert. Ab jetzt macht der Mikro-Knopf den Pegel-Mikrofontest.
        recFailedRef.current = true
        setNotice('Diktat ist hier leider nicht verfügbar (installierte App). Der Mikro-Knopf zeigt jetzt den Mikrofontest — zum Diktieren die App im Safari-Browser öffnen.')
      } else if (code === 'not-allowed')
        setNotice('Mikrofon nicht erlaubt — bitte die Berechtigung im Browser/System freigeben.')
      else setNotice('Spracheingabe hat nicht geklappt — bitte nochmal versuchen.')
    },
  )

  /** Tipp-zum-Anhören: explicit=true spricht auch bei „Ton aus" (gezielter Wunsch). */
  function speakTap(text: string, speakLang: Lang) {
    voice.prime()
    rec.stop() // nie ins offene Erkennungs-Mikrofon sprechen
    voice.speak(text, speakLang, { force: true, explicit: true })
  }

  // WICHTIG: Erkennung und Pegel-Mikrofon NIE gleichzeitig — auf vielen Handys
  // kann nur einer das Mikrofon halten, die Erkennung bräche sonst sofort ab.
  // Mit Erkennung: nur Diktat. Ohne (z. B. Firefox): der reine Mikrofontest.
  function micToggle() {
    voice.prime() // Mobile: Audio in der Geste entsperren
    if (mic.active || rec.listening) {
      mic.onStop()
      rec.stop()
      return
    }
    voice.cancel()
    if (rec.supported && !recFailedRef.current) {
      rec.start(lang)
    } else {
      mic.onToggle()
    }
  }

  /** Datei ausgewählt: Bild verkleinern bzw. PDF einlesen, als Anhang bereitlegen. */
  async function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // dieselbe Datei soll erneut wählbar sein
    if (!file) return
    setNotice(null)
    setAttaching(true)
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        setAttachment(await processPdf(file))
        if (file.size > 1_500_000) {
          // Kosten-Transparenz: PDF-Seiten kosten spürbar Input-Tokens (Budget-Regel)
          setNotice('Hinweis: Große PDFs mit vielen Seiten verbrauchen spürbar Budget — im Zweifel nur die relevanten Seiten schicken.')
        }
      } else if (file.type.startsWith('image/') || file.type === '') {
        setAttachment(await processImage(file))
      } else {
        setNotice('Nur Fotos und PDFs können angehängt werden.')
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Anhang konnte nicht gelesen werden.')
    } finally {
      setAttaching(false)
    }
  }

  async function send(textOverride?: string, opts?: { withAttachment?: boolean }) {
    const text = (textOverride ?? input).trim()
    // Schnellantworten senden den liegenden Anhang NICHT mit (withAttachment:false) —
    // Diktat und Eingabezeile schon, die sind bewusst verfasste Nachrichten.
    const att = opts?.withAttachment === false ? null : attachment
    if (busy) {
      // Läuft schon ein Austausch (z. B. Diktat währenddessen): Text nicht
      // verwerfen, sondern ins Eingabefeld legen — nichts geht verloren.
      if (text) setInput((cur) => (cur.trim() ? cur : text))
      return
    }
    if (!text && !att) return
    voice.prime() // Mobile: Audio innerhalb der Nutzer-Geste entsperren
    voice.cancel() // laufende Sprachausgabe stoppen, neue Runde beginnt
    rec.stop() // Erkennung nie parallel zur Antwort laufen lassen
    setInput('')
    if (att) setAttachment(null)
    setNotice(null)
    setBusy(true)
    try {
      await runExchange(messages, text, att)
    } finally {
      setBusy(false)
      setPendingText(null)
      abortRef.current = null
    }
  }

  /** Ein Frage-Antwort-Austausch; ruft sich bei neu eingegebenem Zugangscode einmal selbst auf. */
  async function runExchange(baseHistory: UiMessage[], text: string, att?: PendingAttachment | null): Promise<void> {
    const history: UiMessage[] = [
      ...baseHistory,
      {
        role: 'user',
        content: text,
        attachment: att ? { kind: att.kind, name: att.name, preview: att.preview } : undefined,
      },
    ]
    setMessages(history)
    setPendingText('')

    const controller = new AbortController()
    abortRef.current = controller
    let acc = ''
    let truncated = false

    try {
      await streamSSE(
        apiUrl('/api/chat'),
        // profile = Lern-Gedächtnis aus früheren Sitzungen (localStorage, Phase 2)
        { messages: windowForApi(history, att), character: characterName, profile: getProfile(characterName) },
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
            return runExchange(baseHistory, text, att)
          }
          // Nur wiederherstellen, wenn der Nutzer nicht längst weitergetippt hat
          setInput((cur) => (cur.trim() ? cur : text))
          setAttachment((cur) => cur ?? att ?? null)
          setNotice('Ohne gültigen Zugangscode kann keine Nachricht gesendet werden.')
          return
        }
        if (acc === '') {
          // Anfrage kam gar nicht durch (400/429/Netz): Nachricht zurückrollen,
          // Eingabe + Anhang wiederherstellen — ohne einen neuen Entwurf zu überschreiben
          setMessages(baseHistory)
          setInput((cur) => (cur.trim() ? cur : text))
          setAttachment((cur) => cur ?? att ?? null)
        }
        // Nur Server-Meldungen anzeigen; rohe Browser-Fehler ("Failed to fetch") → Pausen-Meldung
        setNotice(
          err instanceof SSERequestError && !err.message.startsWith('HTTP') ? err.message : pauseMessage,
        )
      }
    } finally {
      if (acc) {
        setMessages((m) => [...m, { role: 'assistant', content: acc }])
        // Antwort laut vorlesen (ohne PREVOD-Zeile) — aber NICHT nach Abbruch
        // (Stopp-Knopf/Charakterwechsel): der Nutzer erwartet dann Stille.
        if (!controller.signal.aborted) {
          voice.speak(splitPrevod(acc).main.replace(/\*/g, ''), lang)
        }
        // Lern-Gedächtnis fortschreiben (persistierter Puffer, fire-and-forget).
        // Anhänge als Text-Marker, damit der Summarizer den Kontext kennt.
        const userForMemory = att ? `[${att.kind === 'image' ? 'Bild' : 'PDF'}: ${att.name}] ${text}`.trim() : text
        noteExchange(characterName, userForMemory, acc)
      }
      if (truncated) setNotice('Die Antwort wurde wegen des Token-Limits gekürzt.')
    }
  }

  function stop() {
    abortRef.current?.abort()
    voice.cancel() // „Stopp" heißt Stille — auch eine laufende Vorlesung beenden
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
            {hasMemory(characterName) && (
              <>
                <br />
                <span className="mem-hint">
                  🧠 {characterName} erinnert sich an frühere Sitzungen.{' '}
                  <button
                    type="button"
                    className="mem-clear"
                    onClick={() => {
                      if (window.confirm(`Lern-Gedächtnis von ${characterName} wirklich löschen? Niveau, Themen und Fehlerprofil gehen verloren.`)) {
                        clearMemory(characterName)
                        setNotice('Lern-Gedächtnis gelöscht — die nächste Sitzung beginnt bei null.')
                      }
                    }}
                  >
                    Gedächtnis löschen
                  </button>
                </span>
              </>
            )}
          </p>
        )}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="msg student">
                <div className="who">Du</div>
                {m.attachment?.kind === 'image' && m.attachment.preview && (
                  <img className="att-thumb" src={m.attachment.preview} alt={m.attachment.name} />
                )}
                {m.attachment?.kind === 'pdf' && <span className="att-chip">📄 {m.attachment.name}</span>}
                {m.content}
              </div>
            )
          }
          const { main, prevod } = splitPrevod(m.content)
          return (
            <div key={i} className="msg mila">
              <div className="who">
                <span className="charName">{characterName}</span>
                <button
                  type="button"
                  className="msg-spk"
                  title="Nochmal anhören · Poslušaj ponovo"
                  aria-label="Nachricht vorlesen"
                  onClick={() => speakTap(main.replace(/\*/g, ''), lang)}
                >
                  <Icon id="i-speaker" />
                </button>
              </div>
              {renderRich(main)}
              {prevod && (
                <span
                  className="tl tl-tap"
                  role="button"
                  tabIndex={0}
                  title="Antippen zum Anhören · Dodirni i poslušaj"
                  aria-label="Serbische Übersetzung anhören"
                  onClick={() => speakTap(prevod.replace(/\*/g, ''), 'sr')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      speakTap(prevod.replace(/\*/g, ''), 'sr')
                    }
                  }}
                >
                  🇷🇸 {renderRich(prevod)}
                </span>
              )}
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
                <button key={q} type="button" className="qr" onClick={() => void send(q, { withAttachment: false })}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <VoiceBar
        characterName={characterName}
        mode={mic.active || rec.listening ? 'user' : busy || voice.speaking ? 'teacher' : 'idle'}
        levels={mic.levels}
        zone={mic.zone}
        micError={mic.error}
        listening={rec.listening}
        interim={rec.interim}
        voiceEnabled={voice.enabled}
        voiceSupported={voice.supported}
        onVoiceToggle={voice.toggle}
      />

      {attachment && (
        <div className="att-pending">
          {attachment.kind === 'image' && attachment.preview ? (
            <img src={attachment.preview} alt="" />
          ) : (
            <span className="att-ico">📄</span>
          )}
          <span className="att-name">{attachment.name}</span>
          <button type="button" className="att-x" title="Anhang entfernen · Ukloni" onClick={() => setAttachment(null)}>
            ✕
          </button>
        </div>
      )}

      <form
        className="inputbar"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => void onFileSelected(e)}
        />
        <button
          type="button"
          className={attachment ? 'micbtn active' : 'micbtn'}
          onClick={() => fileRef.current?.click()}
          disabled={attaching || busy}
          title="Foto oder PDF anhängen · Priloži sliku ili PDF"
        >
          <Icon id="i-clip" />
        </button>
        <button
          type="button"
          className={mic.active || rec.listening ? 'micbtn active' : 'micbtn'}
          onClick={micToggle}
          title={rec.supported ? 'Sprechen · Govori' : 'Mikrofontest · Test mikrofona'}
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
          <button type="submit" className="send" disabled={!input.trim() && !attachment}>
            <Bilingual k="send" lang={lang} />
          </button>
        )}
      </form>
    </div>
  )
}
