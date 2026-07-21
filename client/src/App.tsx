import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import ChatPanel, { type UiMessage } from './components/ChatPanel'
import { apiUrl } from './lib/api'

type Health = {
  ok: boolean
  model: string
  apiKeyConfigured: boolean
}

// BASE_URL statt "/": die App läuft auf GitHub Pages unter einem Unterpfad (/<repo>/)
const BASE = import.meta.env.BASE_URL

const CHARACTERS = [
  { name: 'Mila', img: `${BASE}characters/mila.png` },
  { name: 'Luka', img: `${BASE}characters/luka.png` },
  { name: 'Ana', img: `${BASE}characters/ana.png` },
] as const

type CharacterName = (typeof CHARACTERS)[number]['name']

/**
 * Platzhalter-Porträt (Initial auf Brand-Gradient) für fehlende Bilder.
 * Wichtig für die veröffentlichte App: mila.png ist ein privates Foto, bleibt
 * lokal und wird nie mit deployt (siehe .gitignore) — dort greift dieser Fallback.
 */
function placeholderFor(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF6E97"/><stop offset="1" stop-color="#FFA36B"/>
    </linearGradient></defs>
    <rect width="100" height="120" fill="url(#g)"/>
    <text x="50" y="78" font-family="Segoe UI, sans-serif" font-size="52" font-weight="700" fill="#fff" text-anchor="middle">${name.charAt(0)}</text>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// M2/M6: funktionaler Chat mit Charakter-Umschalter, als PWA installierbar.
// Das Mockup-Design folgt in M3.
function App() {
  const [character, setCharacter] = useState<CharacterName>('Mila')
  // Jeder Charakter führt sein eigenes Gespräch — kein Vermischen der Verläufe
  const [histories, setHistories] = useState<Record<CharacterName, UiMessage[]>>({
    Mila: [],
    Luka: [],
    Ana: [],
  })
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    fetch(apiUrl('/api/health'))
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  function makeSetMessages(name: CharacterName): Dispatch<SetStateAction<UiMessage[]>> {
    return (update) =>
      setHistories((h) => ({
        ...h,
        [name]: typeof update === 'function' ? update(h[name]) : update,
      }))
  }

  return (
    <main className="shell">
      <header className="topbar">
        <h1>
          Language Teacher <span className="t2">· Učitelj jezika</span>
        </h1>
        <div className="switcher" role="group" aria-label="Lehrer wählen">
          {CHARACTERS.map((c) => (
            <button
              key={c.name}
              type="button"
              className={c.name === character ? 'char active' : 'char'}
              onClick={() => setCharacter(c.name)}
            >
              <img
                src={c.img}
                alt=""
                width={36}
                height={36}
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = placeholderFor(c.name)
                }}
              />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </header>

      {/* key={character}: Wechsel remountet das Panel — bricht einen laufenden
          Stream ab (Unmount-Cleanup) und setzt Eingabe/Streaming-Zustand zurück */}
      <ChatPanel
        key={character}
        characterName={character}
        messages={histories[character]}
        setMessages={makeSetMessages(character)}
      />

      <footer className="statusline">
        {health
          ? `Modell: ${health.model} · API-Key: ${health.apiKeyConfigured ? 'konfiguriert ✓' : 'fehlt — .env anlegen (siehe README)'}`
          : 'Server nicht erreichbar — läuft `npm run dev`?'}
      </footer>
    </main>
  )
}

export default App
