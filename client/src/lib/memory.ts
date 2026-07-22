import { accessHeaders, apiUrl } from './api'
import type { UserId } from './users'

// Phase 2: Lern-Gedächtnis über Sitzungen.
// Bewusste Abweichung von „SQLite auf dem Server" (docs/recherche.md §5):
// Render-Free hat ein FLÜCHTIGES Dateisystem — eine Server-DB wäre nach jedem
// Deploy/Einschlafen (15 min!) leer. Das kompakte Profil lebt deshalb im
// localStorage des Geräts (pro Charakter) und wird alle paar Antworten vom
// Server per claude-haiku fortgeschrieben (Centbeträge). Der Chat schickt es
// als Kontext mit. Kompromiss: pro Gerät getrennt — für die Ein-Nutzer-
// Validierungsphase genau richtig; eine echte DB kann später denselben
// Endpunkt bedienen.

type TranscriptMsg = { role: 'user' | 'assistant'; content: string }

export type MemoryRecord = {
  profile: string
  // Noch nicht zusammengefasste Nachrichten — MIT persistiert, damit kurze
  // Sitzungen (unter der Update-Schwelle) beim nächsten App-Start nicht
  // verloren gehen, sondern in die nächste Zusammenfassung einfließen.
  pending: TranscriptMsg[]
  updatedAt: string
}

const EMPTY: MemoryRecord = { profile: '', pending: [], updatedAt: '' }
// Ab so vielen ungesicherten Nachrichten (User+Lehrer) wird zusammengefasst
const UPDATE_AT_MESSAGES = 10
// Obergrenze des mitgeschickten/persistierten Transkripts
const TRANSCRIPT_WINDOW = 16
const MSG_CHARS = 2000

// Pro LERNENDE:R und Charakter getrennt — Vuk und Andrijana vermischen nichts.
const key = (user: UserId, character: string) => `lt-memory-${user}-${character.toLowerCase()}`

export function loadMemory(user: UserId, character: string): MemoryRecord {
  try {
    const raw = JSON.parse(localStorage.getItem(key(user, character)) ?? 'null') as Partial<MemoryRecord> | null
    if (raw && typeof raw.profile === 'string') {
      return {
        profile: raw.profile,
        pending: Array.isArray(raw.pending)
          ? raw.pending.filter(
              (m): m is TranscriptMsg =>
                !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
            )
          : [],
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
      }
    }
  } catch {
    // kaputter Eintrag — neu beginnen
  }
  return { ...EMPTY, pending: [] }
}

function saveMemory(user: UserId, character: string, rec: MemoryRecord): void {
  try {
    localStorage.setItem(key(user, character), JSON.stringify(rec))
  } catch {
    // Speichern optional (Privatmodus) — dann eben ohne Langzeit-Gedächtnis
  }
}

/** Profil für den Chat-Request (undefined, solange noch keins existiert). */
export function getProfile(user: UserId, character: string): string | undefined {
  const p = loadMemory(user, character).profile.trim()
  return p || undefined
}

/** Gibt es überhaupt ein gespeichertes Gedächtnis für diese:n Lernende:n + Charakter? */
export function hasMemory(user: UserId, character: string): boolean {
  const rec = loadMemory(user, character)
  return rec.profile.trim().length > 0 || rec.pending.length > 0
}

/** Gedächtnis komplett löschen (Nutzer-Aktion, z. B. Neustart des Lernstands). */
export function clearMemory(user: UserId, character: string): void {
  try {
    localStorage.removeItem(key(user, character))
  } catch {
    // egal
  }
}

let inflight = false

/**
 * Nach jeder abgeschlossenen Lehrer-Antwort aufrufen: legt den Austausch in
 * den persistierten Puffer und stößt ab UPDATE_AT_MESSAGES die
 * Haiku-Fortschreibung an (fire-and-forget — Fehler sind egal, der nächste
 * Trigger versucht es erneut; der Puffer überlebt App-Neustarts).
 */
export function noteExchange(user: UserId, character: string, userText: string, assistantText: string): void {
  const rec = loadMemory(user, character)
  if (userText.trim()) rec.pending.push({ role: 'user', content: userText.slice(0, MSG_CHARS) })
  if (assistantText.trim()) rec.pending.push({ role: 'assistant', content: assistantText.slice(0, MSG_CHARS) })
  rec.pending = rec.pending.slice(-TRANSCRIPT_WINDOW)
  saveMemory(user, character, rec)
  if (rec.pending.length < UPDATE_AT_MESSAGES || inflight) return

  const messages = rec.pending
  inflight = true
  fetch(apiUrl('/api/memory'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...accessHeaders() },
    body: JSON.stringify({ character, learner: user, profile: rec.profile || undefined, messages }),
    // Render-Kaltstart kann ~1 min dauern — danach aufgeben statt ewig blockieren
    signal: AbortSignal.timeout(90_000),
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ profile?: string }>) : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((j) => {
      if (typeof j.profile === 'string' && j.profile.trim()) {
        // Nur die jetzt zusammengefassten Nachrichten aus dem Puffer nehmen —
        // was währenddessen dazukam, bleibt für die nächste Runde liegen.
        const fresh = loadMemory(user, character)
        saveMemory(user, character, {
          profile: j.profile.trim(),
          pending: fresh.pending.slice(messages.length),
          updatedAt: new Date().toISOString(),
        })
      }
    })
    .catch(() => {
      // still bleiben — Gedächtnis ist ein Bonus, kein Blocker
    })
    .finally(() => {
      inflight = false
    })
}
