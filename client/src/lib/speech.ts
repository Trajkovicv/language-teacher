import { useEffect, useRef, useState } from 'react'
import type { Lang } from './i18n'

// Phase-1-Zwischenlösung: Browser-Stimmen (Web Speech API) — 0 CHF.
// Deutsch/Englisch klingen gut; für Serbisch haben Browser meist keine Stimme
// (kommt in Phase 3 über Azure TTS, das auch Latinica+Ćirilica spricht).
const SPEECH_LANG: Record<Lang, string> = { de: 'de-DE', en: 'en-US', sr: 'sr-RS' }

export function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem('lt-voice') !== 'off'
    } catch {
      return true
    }
  })

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
    return voices.find((v) => v.lang === bcp) ?? voices.find((v) => v.lang.startsWith(bcp.slice(0, 2))) ?? null
  }

  /** Spricht den Text; false, wenn keine passende Stimme verfügbar ist. */
  function speak(text: string, lang: Lang): boolean {
    if (!supported || !enabled || !text.trim()) return false
    const voice = pickVoice(SPEECH_LANG[lang])
    if (!voice && lang === 'sr') return false // keine Serbisch-Stimme → still bleiben
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = SPEECH_LANG[lang]
    u.rate = 0.95 // leicht gedrosselt — Unterricht
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    speechSynthesis.speak(u)
    return true
  }

  function cancel() {
    if (supported) speechSynthesis.cancel()
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

  return { supported, enabled, speaking, speak, cancel, toggle }
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
