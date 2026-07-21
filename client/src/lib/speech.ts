import { useEffect, useRef, useState } from 'react'
import { accessHeaders, apiUrl } from './api'
import type { Lang } from './i18n'

// Sprachausgabe mit zwei Wegen:
// 1. Server-TTS (Azure über /api/tts, wenn eingerichtet): spielt über ein
//    <audio>-Element ab — routet zuverlässig zu Bluetooth-Kopfhörern und
//    funktioniert auch in der iOS-PWA. Echte serbische Stimmen.
// 2. Browser-Stimmen (Web Speech API) als Fallback — 0 CHF, aber auf Mobil-
//    geräten wackelig (Bluetooth-Routing, iOS-PWA-Bugs).
const SPEECH_LANG: Record<Lang, string> = { de: 'de-DE', en: 'en-US', sr: 'sr-RS' }

/** Mundformen für die Gratis-Lippensynchronisation (kein externes Konto nötig). */
export type MouthShape = 'rest' | 'closed' | 'small' | 'open' | 'round'
export type VoiceGender = 'female' | 'male'
/** explicit=true: der Nutzer hat GEZIELT aufs Anhören getippt — spricht auch bei „Ton aus". */
export type SpeakOpts = { force?: boolean; gender?: VoiceGender; explicit?: boolean }

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
const MAX_SPEAK_CHARS = 1900 // Server-Limit 2000; Antworten sind ohnehin kürzer

/**
 * Text fürs Vorlesen säubern: Emojis, Markdown-Reste und Aufzählungszeichen
 * würden sonst mitgesprochen („Sternchen", „lachendes Gesicht") — der größte
 * einzelne Qualitätskiller bei Browser-Stimmen.
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, ' ')
    .replace(/[*_#`~]/g, '')
    .replace(/^[-•>]\s+/gm, '')
    .replace(/[„“”«»"]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ===== Stimmen-Qualitäts-Ranking =====
// Browser liefern oft mehrere Stimmen pro Sprache — von uralten Roboter-
// Stimmen bis zu neuronalen Cloud-Stimmen (Edge „Online (Natural)", Chrome
// „Google …", iOS „Enhanced/Premium"). Immer die beste nehmen!
function voiceQuality(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase()
  let q = 0
  if (n.includes('natural')) q += 10
  if (n.includes('neural')) q += 8
  if (n.includes('premium')) q += 7
  if (n.includes('enhanced')) q += 6
  if (n.includes('google')) q += 6
  if (n.includes('siri')) q += 5
  if (!v.localService) q += 2 // Cloud-Stimmen klingen meist deutlich besser
  if (n.includes('espeak')) q -= 8
  if (n.includes('compact')) q -= 4
  return q
}

// Passendes Stimm-Geschlecht zum Charakter (best effort über bekannte Namen)
const FEMALE_NAMES = /katja|hedda|anna|petra|vicki|marlene|zira|jenny|aria|michelle|samantha|karen|moira|sophie|gabrijela|lana|elvira|amala|seraphina|louisa/
const MALE_NAMES = /conrad|stefan|klaus|guy|david|mark|ryan|daniel|alex|fred|nicholas|srecko|srećko|florian|killian/

// ===== Diagnose-Protokoll (Tap auf die Versionsnummer zeigt es an) =====

const diagLog: string[] = []
function logDiag(msg: string) {
  diagLog.push(`${new Date().toISOString().slice(11, 19)} ${msg}`)
  if (diagLog.length > 10) diagLog.shift()
}

// ===== Geteilte Audio-Ressourcen (Modul-Ebene, überleben Re-Renders) =====

// Bekannter Browser-Bug: wird eine Utterance vom GC eingesammelt, feuert
// onend nie und die Sprachausgabe bricht mitten im Satz ab. Referenzen halten!
// Set statt Einzel-Ref: beim satzweisen Mitsprechen sind mehrere eingereiht.
const liveUtterances = new Set<SpeechSynthesisUtterance>()

// EIN wiederverwendetes <audio>-Element: einmal in einer Nutzer-Geste
// „gesegnet" (prime), darf es danach programmatisch abspielen (iOS-Regel).
let sharedAudio: HTMLAudioElement | null = null
let lastObjectUrl: string | null = null
function getAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio()
    sharedAudio.preload = 'auto'
  }
  return sharedAudio
}

// 4 Samples Stille — reicht, um das Audio-Element in der Geste zu entsperren
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQQAAAAAAAAA'

export function useSpeech(serverTts: boolean) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const [mouth, setMouth] = useState<MouthShape>('rest')
  const timersRef = useRef<number[]>([])
  const heartbeatRef = useRef(0)
  const boundarySeenRef = useRef(false)
  const genRef = useRef(0) // entwertet veraltete Fetches/Timer/Audio-Events
  const fetchAbortRef = useRef<AbortController | null>(null)
  const serverTtsRef = useRef(serverTts)
  serverTtsRef.current = serverTts
  // Satzweises Mitsprechen während des Streamings: Warteschlangen-Zustand
  const streamActiveRef = useRef(false) // Stream-Modus läuft (Chunks kommen noch)
  const streamEndedRef = useRef(false) // Chat hat endSpeakStream() signalisiert
  const unfinishedRef = useRef(0) // eingereihte, noch nicht fertig gespielte Chunks
  const firstChunkRef = useRef(true) // erster Chunk braucht die 60-ms-Cancel-Entkopplung
  const serverQueueRef = useRef<Array<{ text: string; lang: Lang; gender: VoiceGender; url: Promise<string | null> }>>([])
  const serverPlayingRef = useRef(false)
  const chunkAbortsRef = useRef<AbortController[]>([])
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem('lt-voice') !== 'off'
    } catch {
      return true
    }
  })

  /** Nur die Mundform-Timer — der resume-Heartbeat lebt weiter (Chrome-15-s-Bug). */
  function clearMouthTimers() {
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current = []
  }

  function clearTimers() {
    clearMouthTimers()
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = 0
    }
  }

  function scheduleShapes(shapes: MouthShape[], closeAfter: boolean) {
    shapes.forEach((s, i) => {
      timersRef.current.push(window.setTimeout(() => setMouth(s), i * VISEME_MS))
    })
    if (closeAfter) {
      timersRef.current.push(window.setTimeout(() => setMouth('closed'), shapes.length * VISEME_MS))
    }
  }

  /** Pseudozufälliger Mundrhythmus, solange die Generation gültig ist. */
  function startMouthRhythm(gen: number) {
    const cycle: MouthShape[] = ['open', 'small', 'round', 'small', 'closed']
    let i = 0
    const tick = () => {
      if (gen !== genRef.current || boundarySeenRef.current) return
      setMouth(cycle[i % cycle.length])
      i++
      timersRef.current.push(window.setTimeout(tick, VISEME_MS + ((i * 37) % 40)))
    }
    tick()
  }

  // Stimmenliste lädt asynchron — einmal anstoßen, damit getVoices() gefüllt ist.
  // Zusätzlich: Rückkehr in die App (PWA!) weckt eine hängende Engine per resume().
  useEffect(() => {
    if (!supported) return
    const warm = () => speechSynthesis.getVoices()
    warm()
    speechSynthesis.addEventListener('voiceschanged', warm)
    const wake = () => {
      if (document.visibilityState === 'visible') {
        try {
          speechSynthesis.resume()
        } catch {
          // egal
        }
      }
    }
    document.addEventListener('visibilitychange', wake)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', warm)
      document.removeEventListener('visibilitychange', wake)
      speechSynthesis.cancel()
    }
  }, [supported])

  function pickVoice(bcp: string, gender: VoiceGender = 'female'): SpeechSynthesisVoice | null {
    const all = speechSynthesis.getVoices()
    const family = bcp.slice(0, 2).toLowerCase()
    let candidates = all.filter((v) => v.lang.toLowerCase().startsWith(family))
    // Serbisch: eng verwandte Stimmen klingen fast identisch (gleiche Phonetik)
    if (candidates.length === 0 && bcp.startsWith('sr')) {
      for (const near of ['hr', 'bs', 'sl']) {
        candidates = all.filter((v) => v.lang.toLowerCase().startsWith(near))
        if (candidates.length > 0) break
      }
    }
    if (candidates.length === 0) return null
    const score = (v: SpeechSynthesisVoice) => {
      let s = voiceQuality(v)
      if (v.lang.toLowerCase() === bcp.toLowerCase()) s += 3 // exakte Region
      const n = v.name.toLowerCase()
      if (gender === 'female' ? FEMALE_NAMES.test(n) : MALE_NAMES.test(n)) s += 2
      return s
    }
    return [...candidates].sort((a, b) => score(b) - score(a))[0]
  }

  // Mobile Browser erlauben Audio erst nach einer Nutzer-Geste. prime() wird beim
  // ersten Tippen aufgerufen und entsperrt BEIDE Wege: die Sprach-Engine (leere
  // Mini-Äußerung) und das <audio>-Element (stumme Mini-WAV) für Server-TTS.
  const primedRef = useRef(false)
  function prime() {
    if (primedRef.current) return
    primedRef.current = true
    try {
      const a = getAudio()
      a.muted = true
      a.src = SILENT_WAV
      const p = a.play()
      p?.then(() => {
        a.muted = false
        logDiag('Audio-Element entsperrt')
      }).catch((e: unknown) => {
        a.muted = false
        // Versuch NICHT verbrennen: die nächste echte Nutzer-Geste probiert es
        // erneut (z. B. wenn diese Geste keine User-Activation hatte)
        primedRef.current = false
        logDiag(`Audio-Unlock abgelehnt: ${e instanceof Error ? e.name : e}`)
      })
    } catch {
      primedRef.current = false
    }
    if (supported) {
      try {
        const u = new SpeechSynthesisUtterance(' ')
        u.volume = 0
        speechSynthesis.speak(u)
        speechSynthesis.resume()
        logDiag('Sprach-Engine geprimt')
      } catch {
        // egal — nächster speak()-Versuch zeigt, ob es klappt
      }
    }
  }

  function finish(gen: number) {
    if (gen !== genRef.current) return
    clearTimers()
    setMouth('rest')
    setSpeaking(false)
  }

  /** Weg 1: Azure-Audio vom eigenen Server über das entsperrte <audio>-Element. */
  async function speakViaServer(text: string, lang: Lang, gender: VoiceGender, gen: number): Promise<void> {
    const controller = new AbortController()
    fetchAbortRef.current = controller
    try {
      const res = await fetch(apiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...accessHeaders() },
        body: JSON.stringify({ text, lang, gender }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      if (gen !== genRef.current) return
      const audio = getAudio()
      if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl)
      lastObjectUrl = URL.createObjectURL(blob)
      audio.onplaying = () => {
        if (gen !== genRef.current) return
        logDiag('Server-Stimme spielt')
        startMouthRhythm(gen)
      }
      audio.onended = () => finish(gen)
      // OS-Pause (Sperrbildschirm, Anruf, App-Wechsel auf iOS): weder ended noch
      // error feuern — ohne diesen Handler bliebe speaking/Mundrhythmus hängen
      audio.onpause = () => {
        if (!audio.ended && gen === genRef.current) {
          logDiag('Audio pausiert (System) — Wiedergabe beendet')
          finish(gen)
        }
      }
      audio.onerror = () => {
        logDiag('Audio-Element-Fehler')
        finish(gen)
      }
      audio.src = lastObjectUrl
      await audio.play()
    } catch (err) {
      if (controller.signal.aborted || gen !== genRef.current) return
      logDiag(`Server-Stimme fehlgeschlagen (${err instanceof Error ? err.message : err}) → Browser-Stimme`)
      // Ton nicht einfach verschlucken: Browser-Stimme als Notnagel
      if (!speakViaBrowser(text, lang, true, gen, gender)) finish(gen)
    }
  }

  /** Weg 2: Browser-Stimme (Web Speech API) mit iOS/Chrome-Härtung. */
  function speakViaBrowser(text: string, lang: Lang, force: boolean, gen: number, gender: VoiceGender = 'female'): boolean {
    if (!supported) return false
    const voice = pickVoice(SPEECH_LANG[lang], gender)
    if (!voice && lang === 'sr' && !force) {
      finish(gen)
      return false // Chat: lieber still als falsch
    }
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = SPEECH_LANG[lang]
    u.rate = 0.95 // leicht gedrosselt — Unterricht

    u.onstart = () => {
      if (gen !== genRef.current) return
      logDiag(`Browser-Stimme spricht (${voice?.name ?? 'Standard'})`)
      setSpeaking(true)
      // Chrome-Bug: lange Äußerungen verstummen nach ~15 s, wenn nicht
      // regelmäßig resume() gerufen wird — harmlos auf anderen Plattformen.
      heartbeatRef.current = window.setInterval(() => speechSynthesis.resume(), 10_000)
      // Fallback-Rhythmus, falls die Stimme keine Wort-Grenz-Events liefert
      timersRef.current.push(
        window.setTimeout(() => {
          if (!boundarySeenRef.current) startMouthRhythm(gen)
        }, 350),
      )
    }
    // Wort-Grenze: Mundformen aus den Vokalen des gerade gesprochenen Wortes
    u.onboundary = (e) => {
      if (gen !== genRef.current || typeof e.charIndex !== 'number') return
      boundarySeenRef.current = true
      clearMouthTimers() // Heartbeat NICHT löschen — der schützt lange Antworten
      const word = text.slice(e.charIndex).match(/^\S+/)?.[0] ?? ''
      scheduleShapes(visemesForWord(word), true)
    }
    // WICHTIG: nur die EIGENE Referenz löschen. Das 'interrupted'-Event einer
    // gecancelten Utterance kommt asynchron — NACHDEM die nächste Utterance
    // schon eingereiht ist; sonst verlöre sie den GC-Schutz.
    u.onend = () => {
      liveUtterances.delete(u)
      finish(gen)
    }
    u.onerror = (e) => {
      liveUtterances.delete(u)
      if ((e as SpeechSynthesisErrorEvent).error !== 'interrupted') {
        logDiag(`Browser-Stimme Fehler: ${(e as SpeechSynthesisErrorEvent).error ?? '?'}`)
      }
      finish(gen)
    }
    liveUtterances.add(u) // GC-Schutz — nicht entfernen!
    // iOS-Eigenheit: speak() direkt nach cancel() bleibt oft stumm —
    // kurze Verzögerung entkoppelt beides zuverlässig
    timersRef.current.push(
      window.setTimeout(() => {
        if (gen !== genRef.current) return
        speechSynthesis.resume() // Chrome kann in pausiertem Zustand hängen
        speechSynthesis.speak(u)
      }, 60),
    )
    return true
  }

  // ===== Satzweises Mitsprechen (Streaming) =====

  function maybeFinishStream(gen: number) {
    if (gen !== genRef.current) return
    if (
      streamEndedRef.current &&
      unfinishedRef.current <= 0 &&
      serverQueueRef.current.length === 0 &&
      !serverPlayingRef.current
    ) {
      streamActiveRef.current = false
      finish(gen)
    }
  }

  /** Ein Satz-Chunk über die Browser-Stimme — reiht ein, statt zu canceln. */
  function speakChunkBrowser(text: string, lang: Lang, force: boolean, gen: number, gender: VoiceGender = 'female'): boolean {
    if (!supported) return false
    const voice = pickVoice(SPEECH_LANG[lang], gender)
    if (!voice && lang === 'sr' && !force) return false // lieber still als falsch
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = SPEECH_LANG[lang]
    u.rate = 0.95
    u.onstart = () => {
      if (gen !== genRef.current) return
      boundarySeenRef.current = false
      if (!heartbeatRef.current) {
        heartbeatRef.current = window.setInterval(() => speechSynthesis.resume(), 10_000)
      }
      timersRef.current.push(
        window.setTimeout(() => {
          if (!boundarySeenRef.current) startMouthRhythm(gen)
        }, 350),
      )
    }
    u.onboundary = (e) => {
      if (gen !== genRef.current || typeof e.charIndex !== 'number') return
      boundarySeenRef.current = true
      clearMouthTimers()
      const word = text.slice(e.charIndex).match(/^\S+/)?.[0] ?? ''
      scheduleShapes(visemesForWord(word), true)
    }
    const done = () => {
      liveUtterances.delete(u)
      if (gen !== genRef.current) return
      clearMouthTimers()
      setMouth('closed')
      unfinishedRef.current--
      maybeFinishStream(gen)
    }
    u.onend = done
    u.onerror = (e) => {
      if ((e as SpeechSynthesisErrorEvent).error !== 'interrupted') {
        logDiag(`Browser-Stimme Fehler: ${(e as SpeechSynthesisErrorEvent).error ?? '?'}`)
      }
      done()
    }
    liveUtterances.add(u) // GC-Schutz
    if (firstChunkRef.current) {
      // iOS: speak() direkt nach cancel() bleibt oft stumm — einmal entkoppeln
      firstChunkRef.current = false
      timersRef.current.push(
        window.setTimeout(() => {
          if (gen !== genRef.current) return
          speechSynthesis.resume()
          speechSynthesis.speak(u)
        }, 60),
      )
    } else {
      speechSynthesis.speak(u) // Engine reiht selbst ein
    }
    return true
  }

  /** Ein Satz-Chunk über Azure: Audio sofort laden, in Reihenfolge abspielen. */
  function enqueueServerChunk(text: string, lang: Lang, gender: VoiceGender, gen: number) {
    const ctl = new AbortController()
    chunkAbortsRef.current.push(ctl)
    const url = fetch(apiUrl('/api/tts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...accessHeaders() },
      body: JSON.stringify({ text, lang, gender }),
      signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => URL.createObjectURL(b))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) logDiag(`TTS-Chunk fehlgeschlagen (${e instanceof Error ? e.message : e})`)
        return null
      })
    serverQueueRef.current.push({ text, lang, gender, url })
    pumpServerQueue(gen)
  }

  function pumpServerQueue(gen: number) {
    if (gen !== genRef.current || serverPlayingRef.current) return
    const item = serverQueueRef.current.shift()
    if (!item) {
      maybeFinishStream(gen)
      return
    }
    serverPlayingRef.current = true
    void item.url.then(async (url) => {
      if (gen !== genRef.current) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      const skip = () => {
        if (url) URL.revokeObjectURL(url)
        serverPlayingRef.current = false
        unfinishedRef.current--
        clearMouthTimers()
        setMouth('rest')
        pumpServerQueue(gen)
        maybeFinishStream(gen)
      }
      if (!url) {
        skip() // Satz überspringen — besser als überlappende Fallback-Stimmen
        return
      }
      const audio = getAudio()
      audio.onplaying = () => {
        if (gen !== genRef.current) return
        startMouthRhythm(gen)
      }
      audio.onended = skip
      audio.onerror = skip
      // OS-Pause (Anruf/Sperrbildschirm): kompletten Sprech-Stream beenden
      audio.onpause = () => {
        if (!audio.ended && gen === genRef.current) {
          logDiag('Audio pausiert (System) — Mitsprechen beendet')
          serverQueueRef.current = []
          unfinishedRef.current = 0
          streamEndedRef.current = true
          serverPlayingRef.current = false
          maybeFinishStream(gen)
        }
      }
      audio.src = url
      try {
        await audio.play()
      } catch {
        skip()
      }
    })
  }

  /**
   * Satz-Chunk während des Streamings sprechen (reiht ein, cancelt nicht).
   * Erster Chunk einer Antwort beendet die vorherige Wiedergabe.
   */
  function speakStream(text: string, lang: Lang, opts?: SpeakOpts): boolean {
    if (!enabled && !opts?.explicit) return false
    const t = cleanForSpeech(text).slice(0, MAX_SPEAK_CHARS)
    if (!t) return false
    if (!streamActiveRef.current) {
      stopPlayback()
      streamActiveRef.current = true
      streamEndedRef.current = false
      setSpeaking(true)
    }
    const gen = genRef.current
    unfinishedRef.current++
    if (serverTtsRef.current) {
      enqueueServerChunk(t, lang, opts?.gender ?? 'female', gen)
      return true
    }
    if (!speakChunkBrowser(t, lang, opts?.force ?? false, gen, opts?.gender ?? 'female')) {
      unfinishedRef.current--
      maybeFinishStream(gen)
      return false
    }
    return true
  }

  /** Vom Chat gerufen, wenn keine weiteren Chunks mehr kommen. */
  function endSpeakStream() {
    if (!streamActiveRef.current) return
    streamEndedRef.current = true
    maybeFinishStream(genRef.current)
  }

  function stopPlayback() {
    genRef.current++
    fetchAbortRef.current?.abort()
    fetchAbortRef.current = null
    chunkAbortsRef.current.forEach((c) => c.abort())
    chunkAbortsRef.current = []
    serverQueueRef.current = []
    serverPlayingRef.current = false
    streamActiveRef.current = false
    streamEndedRef.current = false
    unfinishedRef.current = 0
    firstChunkRef.current = true
    if (sharedAudio && !sharedAudio.paused) sharedAudio.pause()
    if (supported) speechSynthesis.cancel()
    liveUtterances.clear()
    clearTimers()
    boundarySeenRef.current = false
  }

  /** Kern: spricht Text; explicit übergeht den Ton-Schalter (gezielter Tap/Selbsttest). */
  function speakInternal(text: string, lang: Lang, opts: SpeakOpts): boolean {
    if (!enabled && !opts.explicit) return false
    const trimmed = cleanForSpeech(text).slice(0, MAX_SPEAK_CHARS)
    if (!trimmed) return false
    stopPlayback()
    const gen = genRef.current
    if (serverTtsRef.current) {
      setSpeaking(true) // sofortiges Feedback, während das Audio lädt
      void speakViaServer(trimmed, lang, opts.gender ?? 'female', gen)
      return true
    }
    return speakViaBrowser(trimmed, lang, opts.force ?? false, gen, opts.gender ?? 'female')
  }

  /**
   * Spricht den Text; false, wenn nichts gesprochen wird.
   * force=true (z. B. Wörterbuch-Lautsprecher): notfalls mit der Standardstimme
   * sprechen, statt still zu bleiben.
   */
  function speak(text: string, lang: Lang, opts?: SpeakOpts): boolean {
    return speakInternal(text, lang, opts ?? {})
  }

  function cancel() {
    stopPlayback()
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
      if (!next) {
        cancel()
      } else {
        // Hörbarer Selbsttest direkt in der Klick-Geste: entsperrt Mobil-Audio
        // UND zeigt sofort, ob die Umgebung (Lautstärke/Stummschalter/Kopfhörer)
        // passt — über denselben Weg wie echte Antworten (Server oder Browser).
        prime()
        speakInternal('Ton ist an! Zvuk je uključen!', 'de', { force: true, explicit: true })
      }
      return next
    })
  }

  /** Diagnose-Text für den Versions-Tap in der Kopfzeile. */
  function diagnostics(): string {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    const lines: string[] = []
    lines.push(`Modus: ${standalone ? 'installierte App (PWA)' : 'Browser-Tab'}`)
    lines.push(`Server-Stimmen (Azure): ${serverTtsRef.current ? 'AN' : 'aus — Browser-Stimmen aktiv'}`)
    lines.push(`Ton-Schalter: ${enabled ? 'an' : 'aus'} · entsperrt: ${primedRef.current ? 'ja' : 'noch nicht'}`)
    if (supported) {
      const voices = speechSynthesis.getVoices()
      const de = pickVoice('de-DE')
      const sr = pickVoice('sr-RS')
      lines.push(`Browser-Stimmen: ${voices.length} · DE: ${de?.name ?? 'KEINE'} · SR-nah: ${sr?.name ?? 'keine'}`)
      lines.push(
        `Engine: speaking=${speechSynthesis.speaking} pending=${speechSynthesis.pending} paused=${speechSynthesis.paused} utterances=${liveUtterances.size}`,
      )
    } else {
      lines.push('Browser-Stimmen: NICHT unterstützt')
    }
    lines.push('', 'Letzte Audio-Ereignisse:')
    lines.push(...(diagLog.length ? diagLog : ['(noch keine)']))
    return lines.join('\n')
  }

  return { supported, enabled, speaking, mouth, speak, speakStream, endSpeakStream, cancel, toggle, prime, diagnostics }
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
export function useRecognition(onFinal: (text: string) => void, onError?: (code: string) => void) {
  const supported = typeof window !== 'undefined' && recognitionCtor() !== null
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const recRef = useRef<RecognitionLike | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

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
    rec.onerror = (e) => {
      setListening(false)
      setInterim('')
      recRef.current = null
      onErrorRef.current?.(e.error ?? 'unknown')
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
