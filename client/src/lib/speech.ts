import { useEffect, useRef, useState } from 'react'
import type { Lang } from './i18n'

// Phase-1-Zwischenlösung: Browser-Stimmen (Web Speech API) — 0 CHF.
// Deutsch/Englisch klingen gut; für Serbisch haben Browser meist keine Stimme
// (kommt in Phase 3 über Azure TTS, das auch Latinica+Ćirilica spricht).
const SPEECH_LANG: Record<Lang, string> = { de: 'de-DE', en: 'en-US', sr: 'sr-RS' }

/** Mundformen für die Gratis-Lippensynchronisation (kein externes Konto nötig). */
export type MouthShape = 'rest' | 'closed' | 'small' | 'open' | 'round'

/** Vokale eines Wortes → Sequenz von Mundformen (max. 5 pro Wort). */
function visemesForWord(word: string): MouthShape[] {
  const w = word.toLowerCase()
  const shapes: MouthShape[] = []
  if (/^[mbp]/.test(w)) shapes.push('closed')
  for (const ch of w) {
    if ('aáä'.includes(ch)) shapes.push('open')
    else if ('oóuúöü'.includes(ch)) shapes.push('round')
    else if ('eéiíy'.includes(ch)) shapes.push('small')
  }
  if (shapes.length === 0) shapes.push('small')
  return shapes.slice(0, 5)
}

const VISEME_MS = 110

export function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const [mouth, setMouth] = useState<MouthShape>('rest')
  const timersRef = useRef<number[]>([])
  const boundarySeenRef = useRef(false)
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem('lt-voice') !== 'off'
    } catch {
      return true
    }
  })

  function clearTimers() {
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current = []
  }

  function scheduleShapes(shapes: MouthShape[], closeAfter: boolean) {
    shapes.forEach((s, i) => {
      timersRef.current.push(window.setTimeout(() => setMouth(s), i * VISEME_MS))
    })
    if (closeAfter) {
      timersRef.current.push(window.setTimeout(() => setMouth('closed'), shapes.length * VISEME_MS))
    }
  }

  // Stimmenliste lädt asynchron — einmal anstoßen, damit getVoices() gefüllt ist
  useEffect(() => {
    if (!supported) return
    const warm = () => speechSynthesis.getVoices()
    warm()
    speechSynthesis.addEventListener('voiceschanged', warm)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', warm)
      speechSynthesis.cancel()
    }
  }, [supported])

  function pickVoice(bcp: string): SpeechSynthesisVoice | null {
    const voices = speechSynthesis.getVoices()
    const exact = voices.find((v) => v.lang === bcp) ?? voices.find((v) => v.lang.startsWith(bcp.slice(0, 2)))
    if (exact) return exact
    // Serbisch: eng verwandte Stimmen klingen fast identisch (gleiche Phonetik)
    if (bcp.startsWith('sr')) {
      for (const near of ['hr', 'bs', 'sl']) {
        const v = voices.find((x) => x.lang.startsWith(near))
        if (v) return v
      }
    }
    return null
  }

  // Mobile Browser erlauben Sprachausgabe erst nach einem Sprechversuch INNERHALB
  // einer Nutzer-Geste. prime() wird beim ersten Tippen aufgerufen und entsperrt
  // die Engine mit einer unhörbaren Mini-Äußerung.
  const primedRef = useRef(false)
  function prime() {
    if (!supported || primedRef.current) return
    primedRef.current = true
    try {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      speechSynthesis.speak(u)
      speechSynthesis.resume()
    } catch {
      // egal — nächster speak()-Versuch zeigt, ob es klappt
    }
  }

  /**
   * Spricht den Text; false, wenn nichts gesprochen wird.
   * force=true (z. B. Wörterbuch-Lautsprecher): notfalls mit der Standardstimme
   * sprechen, statt still zu bleiben.
   */
  function speak(text: string, lang: Lang, opts?: { force?: boolean }): boolean {
    if (!supported || !enabled || !text.trim()) return false
    const voice = pickVoice(SPEECH_LANG[lang])
    if (!voice && lang === 'sr' && !opts?.force) return false // Chat: lieber still als falsch
    speechSynthesis.cancel()
    clearTimers()
    boundarySeenRef.current = false
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = SPEECH_LANG[lang]
    u.rate = 0.95 // leicht gedrosselt — Unterricht

    u.onstart = () => {
      setSpeaking(true)
      // Fallback-Rhythmus, falls die Stimme keine Wort-Grenz-Events liefert:
      // pseudozufällige Mundformen im Sprechtakt
      timersRef.current.push(
        window.setTimeout(function rhythm() {
          if (boundarySeenRef.current) return
          const cycle: MouthShape[] = ['open', 'small', 'round', 'small', 'closed']
          let i = 0
          const tick = () => {
            if (boundarySeenRef.current) return
            setMouth(cycle[i % cycle.length])
            i++
            timersRef.current.push(window.setTimeout(tick, VISEME_MS + ((i * 37) % 40)))
          }
          tick()
        }, 350),
      )
    }
    // Wort-Grenze: Mundformen aus den Vokalen des gerade gesprochenen Wortes
    u.onboundary = (e) => {
      if (typeof e.charIndex !== 'number') return
      boundarySeenRef.current = true
      clearTimers()
      const word = text.slice(e.charIndex).match(/^\S+/)?.[0] ?? ''
      scheduleShapes(visemesForWord(word), true)
    }
    const finish = () => {
      clearTimers()
      setMouth('rest')
      setSpeaking(false)
    }
    u.onend = finish
    u.onerror = finish
    speechSynthesis.resume() // Chrome kann in pausiertem Zustand hängen
    speechSynthesis.speak(u)
    return true
  }

  function cancel() {
    if (supported) speechSynthesis.cancel()
    clearTimers()
    setMouth('rest')
    setSpeaking(false)
  }

  function toggle() {
    setEnabled((e) => {
      const next = !e
      try {
        localStorage.setItem('lt-voice', next ? 'on' : 'off')
      } catch {
        // Speichern optional
      }
      if (!next) cancel()
      return next
    })
  }

  return { supported, enabled, speaking, mouth, speak, cancel, toggle, prime }
}

// ===== Spracheingabe (STT) — Chrome/Edge: webkitSpeechRecognition =====

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type RecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<RecognitionResult> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start(): void
  abort(): void
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => RecognitionLike) | null
}

/**
 * Einfache Diktat-Erkennung: start() hört EINEN Satz, liefert ihn an onFinal
 * und stoppt. Serbisch-Erkennung ist browserabhängig wackelig — Phase 3 (Whisper).
 */
export function useRecognition(onFinal: (text: string) => void) {
  const supported = typeof window !== 'undefined' && recognitionCtor() !== null
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recRef = useRef<RecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal

  function start(lang: Lang) {
    const Ctor = recognitionCtor()
    if (!Ctor || listening) return
    const rec = new Ctor()
    rec.lang = SPEECH_LANG[lang]
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1]
      if (!last) return
      const text = last[0].transcript.trim()
      if (last.isFinal) {
        setInterim('')
        if (text) onFinalRef.current(text)
      } else {
        setInterim(text)
      }
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
      recRef.current = null
    }
    rec.onerror = () => {
      setListening(false)
      setInterim('')
      recRef.current = null
    }
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  function stop() {
    recRef.current?.abort()
    recRef.current = null
    setListening(false)
    setInterim('')
  }

  useEffect(() => stop, [])

  return { supported, listening, interim, start, stop }
}
