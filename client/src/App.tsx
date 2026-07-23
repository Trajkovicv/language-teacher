import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import Icons, { Icon } from './components/Icons'
import Bilingual from './components/Bilingual'
import Sidebar, { CHARACTERS, type Character, type CharacterId } from './components/Sidebar'
import ChatPanel, { type Draft, type UiMessage } from './components/ChatPanel'
import DictionaryPanel from './components/DictionaryPanel'
import ExercisePanel from './components/ExercisePanel'
import LoginScreen from './components/LoginScreen'
import { apiUrl } from './lib/api'
import { useMicLevels } from './lib/mic'
import { useSpeech, type SpeakOpts } from './lib/speech'
import { loadUser, saveUser, type UserId } from './lib/users'
import { addMinutes, loadUsage, startSession, streakOf } from './lib/usage'
import {
  clearSession,
  fetchStatus,
  loadSession,
  saveSession,
  type AccountStatus,
  type Session,
} from './lib/session'
import { pullState } from './lib/sync'
import type { Lang } from './lib/i18n'

type Theme = 'light' | 'dusk' | 'midnight'
type Tab = 'chat' | 'dict' | 'ex'
// boot = warten auf /api/health; login = Konten aktiv, nicht angemeldet; app = normal
type Phase = 'boot' | 'login' | 'app'

type Health = { ok: boolean; model: string; apiKeyConfigured: boolean; tts?: boolean; db?: boolean }

const THEMES: readonly Theme[] = ['light', 'dusk', 'midnight'] as const
const THEME_TITLES: Record<Theme, string> = { light: 'Hell', dusk: 'Dämmerung', midnight: 'Mitternacht' }

function loadTheme(): Theme {
  const t = localStorage.getItem('lt-theme')
  return t === 'dusk' || t === 'midnight' ? t : 'light'
}

function emptyDraft(): Draft {
  return { input: '', attachment: null }
}

function loadSavedWords(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem('lt-saved-words') ?? '[]')
    return Array.isArray(raw) ? raw.filter((w): w is string => typeof w === 'string') : []
  } catch {
    return []
  }
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [lang, setLang] = useState<Lang>('de')
  const [tab, setTab] = useState<Tab>('chat')
  const [character, setCharacter] = useState<Character>(CHARACTERS[0])
  // Lernprofil (Vuk/Andrijana): bestimmt Gedächtnis, Chat-Verlauf und Zielsprache.
  // Im Konto-Modus = das angemeldete Konto; sonst der zuletzt lokal gewählte.
  const [user, setUser] = useState<UserId>(() => loadSession()?.learner ?? loadUser())
  // Konten (Turso): Login-Phase + Status fürs Login-UI. Quelle der Wahrheit fürs
  // Token ist localStorage (loadSession); ohne Turso bleibt phase schlicht 'app'.
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null)
  const [phase, setPhase] = useState<Phase>('boot')
  // Erst wenn der Konto-Stand geladen ist (oder es keinen gibt), darf die
  // Nutzungs-Zählung starten — sonst überschriebe ein spät eintreffender
  // pullState die frisch gezählte Sitzung.
  const [hydrated, setHydrated] = useState(false)
  // Verläufe & Entwürfe pro LERNENDE:R und Charakter — nichts vermischt sich,
  // und der key-Remount des ChatPanels stellt beim Wechsel den richtigen wieder her.
  const [histories, setHistories] = useState<Record<UserId, Record<CharacterId, UiMessage[]>>>(() => ({
    vuk: { mila: [], luka: [], ana: [] },
    andrijana: { mila: [], luka: [], ana: [] },
  }))
  const [drafts, setDrafts] = useState<Record<UserId, Record<CharacterId, Draft>>>(() => ({
    vuk: { mila: emptyDraft(), luka: emptyDraft(), ana: emptyDraft() },
    andrijana: { mila: emptyDraft(), luka: emptyDraft(), ana: emptyDraft() },
  }))
  const [teacherBusy, setTeacherBusy] = useState(false)
  const [savedWords, setSavedWords] = useState<string[]>(loadSavedWords)
  const [health, setHealth] = useState<Health | null>(null)
  // Nutzungs-Statistik pro Profil: alle paar Sekunden neu aus localStorage lesen
  const [usageTick, setUsageTick] = useState(0)
  const userRef = useRef(user)
  userRef.current = user
  const lastTickRef = useRef(Date.now())
  const mic = useMicLevels()
  const voice = useSpeech(health?.tts === true)

  // Kernzahlen fürs UI (Minuten/Nachrichten/Serie) — pro Profil, live nachgezogen
  const usage = useMemo(() => loadUsage(user), [user, usageTick])

  // Stimm-Geschlecht passend zum Charakter (Azure-Stimmen): Luka männlich
  const speakAs = useCallback(
    (text: string, lang: Lang, opts?: SpeakOpts) =>
      voice.speak(text, lang, { gender: character.id === 'luka' ? 'male' : 'female', ...opts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [character.id, voice.speak],
  )
  const speakStreamAs = useCallback(
    (text: string, lang: Lang, opts?: SpeakOpts) =>
      voice.speakStream(text, lang, { gender: character.id === 'luka' ? 'male' : 'female', ...opts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [character.id, voice.speakStream],
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('lt-theme', theme)
  }, [theme])

  // Mobile Autoplay-Sperre: beim allerersten Tippen die Sprach-Engine entsperren.
  // WICHTIG 'click', nicht 'pointerdown': auf Touch-Geräten erzeugt erst
  // pointerup/click eine User-Activation — pointerdown würde den Unlock verwerfen.
  useEffect(() => {
    const prime = () => voice.prime()
    window.addEventListener('click', prime, { once: true, capture: true })
    return () => window.removeEventListener('click', prime, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetch(apiUrl('/api/health'))
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  // Login-Gate: Sobald /api/health da ist, entscheiden, ob Konten aktiv sind.
  // Kein Turso (health.db falsch/unbekannt) → wie bisher lokal weiter (phase 'app').
  // Turso + gültige Session → optimistisch rein, Serverstand im Hintergrund holen.
  // Turso ohne Session → Login zeigen.
  // Ref-Guard: dieser Boot-Resolver löst genau EINMAL aus — auch unter Reacts
  // StrictMode-Doppelaufruf (er schreibt/pullt, ist also bewusst nicht wiederholbar).
  const bootResolvedRef = useRef(false)
  useEffect(() => {
    if (health === null || bootResolvedRef.current) return
    bootResolvedRef.current = true
    void (async () => {
      if (!health.db) {
        setPhase('app')
        setHydrated(true) // kein Konto-Stand zu laden → sofort zählen
        return
      }
      const existing = loadSession()
      if (existing) {
        setUser(existing.learner)
        setPhase('app')
        const r = await pullState(existing.learner, existing.token)
        if (r === 'unauthorized') {
          // Token abgelaufen/ungültig → sauber abmelden und Login zeigen
          clearSession()
          const st = await fetchStatus().catch(() => ({ enabled: true, registered: [] as UserId[], registerCodeRequired: false }))
          setAccountStatus(st)
          setPhase('login')
        } else {
          setHydrated(true) // Stand geladen (oder Server kurz weg) → jetzt zählen
        }
        return
      }
      const st = await fetchStatus().catch(() => ({ enabled: true, registered: [] as UserId[], registerCodeRequired: false }))
      setAccountStatus(st)
      setPhase('login')
    })()
  }, [health])

  const onLogin = useCallback((s: Session) => {
    saveSession(s)
    setUser(s.learner)
    saveUser(s.learner)
    setPhase('app') // sofort in die App (pullState kann bei Kaltstart dauern)
    // Zählung erst NACH dem Laden freigeben — so überschreibt der Serverstand
    // die frisch gezählte Sitzung nicht.
    void pullState(s.learner, s.token).finally(() => setHydrated(true))
  }, [])

  const onLogout = useCallback(() => {
    voice.cancel()
    clearSession()
    setHydrated(false) // Zählung stoppen, bis wieder angemeldet
    void fetchStatus()
      .then((st) => {
        setAccountStatus(st)
        setPhase('login')
      })
      .catch(() => {
        setAccountStatus({ enabled: true, registered: [], registerCodeRequired: false })
        setPhase('login')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nutzungs-Statistik: erst ab Phase 'app' (nicht im Login/Boot). App-Start bzw.
  // erfolgreicher Login zählt als Sitzung, dann sichtbare Übungszeit dem
  // aktuellen Profil gutschreiben (versteckte Tabs zählen nicht).
  useEffect(() => {
    if (!hydrated) return
    lastTickRef.current = Date.now()
    startSession(userRef.current)
    setUsageTick((v) => v + 1)
    const t = setInterval(() => {
      const now = Date.now()
      if (document.visibilityState === 'visible') {
        addMinutes(userRef.current, (now - lastTickRef.current) / 60000)
      }
      lastTickRef.current = now
      setUsageTick((v) => v + 1)
    }, 15_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const setMessagesFor = useCallback(
    (u: UserId, id: CharacterId): Dispatch<SetStateAction<UiMessage[]>> =>
      (update) =>
        setHistories((h) => ({
          ...h,
          [u]: { ...h[u], [id]: typeof update === 'function' ? update(h[u][id]) : update },
        })),
    [],
  )

  const selectUser = useCallback((u: UserId) => {
    if (u === userRef.current) return
    // bisher gesammelte Zeit noch dem ALTEN Profil gutschreiben, dann wechseln
    const now = Date.now()
    if (document.visibilityState === 'visible') {
      addMinutes(userRef.current, (now - lastTickRef.current) / 60000)
    }
    lastTickRef.current = now
    voice.cancel() // laufende Vorlesung des anderen Profils stoppen
    setUser(u)
    saveUser(u)
    startSession(u) // Profilwechsel zählt als neue Sitzung
    setUsageTick((v) => v + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleSaved = useCallback((word: string) => {
    setSavedWords((words) => {
      const next = words.includes(word) ? words.filter((w) => w !== word) : [...words, word]
      try {
        localStorage.setItem('lt-saved-words', JSON.stringify(next))
      } catch {
        // Speichern optional
      }
      return next
    })
  }, [])

  const warning =
    health && !health.apiKeyConfigured
      ? 'API-Key fehlt — .env anlegen (siehe README), dann Server neu starten.'
      : health === null
        ? null
        : null

  const voiceState: 'teacher' | 'user' | 'idle' = mic.active
    ? 'user'
    : teacherBusy || voice.speaking
      ? 'teacher'
      : 'idle'

  // Konto-Modus aktiv, sobald der Server Turso-Konten meldet.
  const accountMode = health?.db === true

  // Vor der App: kurzer Boot-Zustand bzw. Login-Screen (nur wenn Konten aktiv).
  if (phase !== 'app') {
    return (
      <>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        {phase === 'login' && accountStatus ? (
          <LoginScreen status={accountStatus} lang={lang} onLogin={onLogin} />
        ) : (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-soft)',
              fontWeight: 700,
            }}
          >
            {lang === 'en' ? 'Loading…' : 'Lädt…'}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <Icons />
      <div className="app">
        <header>
          <div className="brand">
            <div className="mark">{character.mark}</div>
            <div>
              <h1>{character.name}</h1>
              {/* Tap auf die Version: Audio-Diagnose (hilft bei „ich höre nichts") */}
              <p
                style={{ cursor: 'pointer' }}
                title="Antippen: Audio-Diagnose"
                role="button"
                tabIndex={0}
                aria-label="Audio-Diagnose anzeigen"
                onClick={() => window.alert(`Language Teacher v${__BUILD_ID__}\n\n${voice.diagnostics()}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    window.alert(`Language Teacher v${__BUILD_ID__}\n\n${voice.diagnostics()}`)
                  }
                }}
              >
                Sprachlern-App · Serbisch · v{__BUILD_ID__}
              </p>
            </div>
          </div>
          <div className="spacer" />
          <div className="tabs">
            {(
              [
                { id: 'chat', icon: 'i-chat', key: 'chat' },
                { id: 'dict', icon: 'i-book', key: 'dict' },
                { id: 'ex', icon: 'i-pencil', key: 'ex' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'tab active' : 'tab'}
                onClick={() => setTab(t.id)}
              >
                <Icon id={t.icon} />
                <Bilingual k={t.key} lang={lang} />
              </button>
            ))}
          </div>
          <div className="spacer" />
          <div className="chips">
            {(['de', 'en', 'sr'] as const).map((l) => (
              <button
                key={l}
                type="button"
                className={lang === l ? 'chip active' : 'chip'}
                onClick={() => setLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="themes">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                className={theme === t ? 'theme-b active' : 'theme-b'}
                data-t={t}
                title={THEME_TITLES[t]}
                onClick={() => setTheme(t)}
              />
            ))}
          </div>
        </header>

        <main>
          <Sidebar
            character={character}
            onSelect={setCharacter}
            userId={user}
            onSelectUser={selectUser}
            voiceState={voiceState}
            mouth={voice.mouth}
            lang={lang}
            stats={{ minutes: Math.round(usage.minutes), messages: usage.messages, streak: streakOf(usage) }}
            accountMode={accountMode}
            onLogout={onLogout}
          />

          <section className="stage">
            <ChatPanel
              key={`${user}-${character.id}`}
              active={tab === 'chat'}
              lang={lang}
              characterName={character.name}
              userId={user}
              messages={histories[user][character.id]}
              setMessages={setMessagesFor(user, character.id)}
              draft={drafts[user][character.id]}
              onDraftChange={(update) =>
                setDrafts((d) => ({
                  ...d,
                  [user]: { ...d[user], [character.id]: update(d[user][character.id]) },
                }))
              }
              onBusyChange={setTeacherBusy}
              warning={warning}
              mic={{
                active: mic.active,
                levels: mic.levels,
                zone: mic.zone,
                error: mic.error,
                onToggle: mic.toggle,
                onStop: mic.stop,
              }}
              voice={{
                enabled: voice.enabled,
                // Mit Server-Stimmen funktioniert Ton auch ohne Browser-TTS
                supported: voice.supported || health?.tts === true,
                srVoiceMissing: voice.srVoiceMissing,
                speed: voice.speed,
                cycleSpeed: voice.cycleSpeed,
                pauseResume: voice.pauseResume,
                replay: voice.replay,
                speaking: voice.speaking,
                paused: voice.paused,
                toggle: voice.toggle,
                speak: speakAs,
                speakStream: speakStreamAs,
                endSpeakStream: voice.endSpeakStream,
                cancel: voice.cancel,
                prime: voice.prime,
              }}
            />
            <DictionaryPanel
              active={tab === 'dict'}
              lang={lang}
              user={user}
              savedWords={savedWords}
              onToggleSaved={toggleSaved}
              onSpeak={(text, spokenLang) => {
                voice.prime()
                // explicit: gezielter Tap aufs Lautsprecher-Symbol spricht auch bei „Ton aus".
                // Sprache = die des nachgeschlagenen Worts (Wort & Beispiele in source).
                speakAs(text, spokenLang, { force: true, explicit: true })
              }}
            />
            <ExercisePanel active={tab === 'ex'} lang={lang} user={user} />
          </section>
        </main>
      </div>
    </>
  )
}
