import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import Icons, { Icon } from './components/Icons'
import Bilingual from './components/Bilingual'
import Sidebar, { CHARACTERS, type Character, type CharacterId } from './components/Sidebar'
import ChatPanel, { type UiMessage } from './components/ChatPanel'
import DictionaryPanel from './components/DictionaryPanel'
import ExercisePanel from './components/ExercisePanel'
import { apiUrl } from './lib/api'
import { useMicLevels } from './lib/mic'
import type { Lang } from './lib/i18n'

type Theme = 'light' | 'dusk' | 'midnight'
type Tab = 'chat' | 'dict' | 'ex'

type Health = { ok: boolean; model: string; apiKeyConfigured: boolean }

const THEMES: readonly Theme[] = ['light', 'dusk', 'midnight'] as const
const THEME_TITLES: Record<Theme, string> = { light: 'Hell', dusk: 'Dämmerung', midnight: 'Mitternacht' }

function loadTheme(): Theme {
  const t = localStorage.getItem('lt-theme')
  return t === 'dusk' || t === 'midnight' ? t : 'light'
}

function loadSavedWords(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem('lt-saved-words') ?? '[]')
    return Array.isArray(raw) ? raw.filter((w): w is string => typeof w === 'string') : []
  } catch {
    return []
  }
}

/** Serien-Zähler: aufeinanderfolgende Besuchstage (lokal gespeichert). */
function trackStreak(): number {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  let days: string[] = []
  try {
    const raw = JSON.parse(localStorage.getItem('lt-visit-days') ?? '[]')
    if (Array.isArray(raw)) days = raw.filter((d): d is string => typeof d === 'string')
  } catch {
    // kaputter Eintrag — neu beginnen
  }
  const today = iso(new Date())
  if (!days.includes(today)) days.push(today)
  try {
    localStorage.setItem('lt-visit-days', JSON.stringify(days.slice(-60)))
  } catch {
    // Speichern optional
  }
  let streak = 0
  const cursor = new Date()
  while (days.includes(iso(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return Math.max(1, streak)
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [lang, setLang] = useState<Lang>('de')
  const [tab, setTab] = useState<Tab>('chat')
  const [character, setCharacter] = useState<Character>(CHARACTERS[0])
  const [histories, setHistories] = useState<Record<CharacterId, UiMessage[]>>({ mila: [], luka: [], ana: [] })
  const [teacherBusy, setTeacherBusy] = useState(false)
  const [savedWords, setSavedWords] = useState<string[]>(loadSavedWords)
  const [minutes, setMinutes] = useState(0)
  const [health, setHealth] = useState<Health | null>(null)
  const streak = useMemo(trackStreak, [])
  const mic = useMicLevels()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('lt-theme', theme)
  }, [theme])

  useEffect(() => {
    fetch(apiUrl('/api/health'))
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  // Sitzungs-Minuten für die Stats-Karte
  useEffect(() => {
    const start = Date.now()
    const t = setInterval(() => setMinutes(Math.floor((Date.now() - start) / 60000)), 30_000)
    return () => clearInterval(t)
  }, [])

  const setMessagesFor = useCallback(
    (id: CharacterId): Dispatch<SetStateAction<UiMessage[]>> =>
      (update) =>
        setHistories((h) => ({
          ...h,
          [id]: typeof update === 'function' ? update(h[id]) : update,
        })),
    [],
  )

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

  const voiceState: 'teacher' | 'user' | 'idle' = mic.active ? 'user' : teacherBusy ? 'teacher' : 'idle'

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
              <p>Sprachlern-App · Serbisch</p>
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
            voiceState={voiceState}
            lang={lang}
            stats={{ minutes, words: savedWords.length, streak }}
          />

          <section className="stage">
            <ChatPanel
              key={character.id}
              active={tab === 'chat'}
              lang={lang}
              characterName={character.name}
              messages={histories[character.id]}
              setMessages={setMessagesFor(character.id)}
              onBusyChange={setTeacherBusy}
              warning={warning}
              mic={{ active: mic.active, levels: mic.levels, zone: mic.zone, error: mic.error, onToggle: mic.toggle }}
            />
            <DictionaryPanel active={tab === 'dict'} lang={lang} savedWords={savedWords} onToggleSaved={toggleSaved} />
            <ExercisePanel active={tab === 'ex'} lang={lang} />
          </section>
        </main>
      </div>
    </>
  )
}
