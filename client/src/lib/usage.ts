import { pushState } from './sync'
import type { UserId } from './users'

// Nutzungs-Statistik pro Lernprofil (Vuk/Andrijana): Übungszeit, Sitzungen,
// Nachrichten, aktive Tage, Serie. Damit kann der Avatar auf Nachfrage einen
// kleinen Report geben („wie lange/oft haben wir geübt?"), und die Sidebar
// zeigt die Kernzahlen. Alles lokal (localStorage), pro Gerät.

export type UsageStats = {
  firstSeen: string // ISO-Tag der ersten Sitzung
  lastSeen: string
  days: string[] // verschiedene aktive Tage (gekappt)
  sessions: number // App-Starts / Profilwechsel
  minutes: number // kumulierte Übungsminuten (nur sichtbare Zeit)
  messages: number // gesendete Schüler-Nachrichten
}

const EMPTY: UsageStats = { firstSeen: '', lastSeen: '', days: [], sessions: 0, minutes: 0, messages: 0 }
const key = (u: UserId) => `lt-usage-${u}`

function isoDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function loadUsage(u: UserId): UsageStats {
  try {
    const raw = JSON.parse(localStorage.getItem(key(u)) ?? 'null') as Partial<UsageStats> | null
    if (raw && typeof raw === 'object') {
      return {
        firstSeen: typeof raw.firstSeen === 'string' ? raw.firstSeen : '',
        lastSeen: typeof raw.lastSeen === 'string' ? raw.lastSeen : '',
        days: Array.isArray(raw.days) ? raw.days.filter((d): d is string => typeof d === 'string') : [],
        sessions: Number.isFinite(raw.sessions) ? (raw.sessions as number) : 0,
        minutes: Number.isFinite(raw.minutes) ? (raw.minutes as number) : 0,
        messages: Number.isFinite(raw.messages) ? (raw.messages as number) : 0,
      }
    }
  } catch {
    // kaputter Eintrag — neu beginnen
  }
  return { ...EMPTY, days: [] }
}

function save(u: UserId, s: UsageStats): void {
  const json = JSON.stringify(s)
  try {
    localStorage.setItem(key(u), json)
  } catch {
    // Speichern optional
  }
  // Write-Through ans Konto (nur wenn angemeldet; sonst No-Op)
  pushState(u, 'usage', json)
}

/** App-Start bzw. Profilwechsel: als Sitzung zählen, heutigen Tag markieren. */
export function startSession(u: UserId): void {
  const s = loadUsage(u)
  const today = isoDay()
  if (!s.firstSeen) s.firstSeen = today
  s.lastSeen = today
  if (!s.days.includes(today)) s.days.push(today)
  s.days = s.days.slice(-400)
  s.sessions += 1
  save(u, s)
}

/** Übungszeit gutschreiben (nur sichtbare Zeit; kleine Deltas erlaubt). */
export function addMinutes(u: UserId, mins: number): void {
  if (!(mins > 0)) return
  const s = loadUsage(u)
  s.minutes += mins
  s.lastSeen = isoDay()
  save(u, s)
}

/** Eine gesendete Schüler-Nachricht zählen. */
export function noteMessage(u: UserId): void {
  const s = loadUsage(u)
  s.messages += 1
  s.lastSeen = isoDay()
  save(u, s)
}

/** Aufeinanderfolgende aktive Tage bis heute. */
export function streakOf(s: UsageStats): number {
  let streak = 0
  const cursor = new Date()
  while (s.days.includes(isoDay(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** Kompakte, menschenlesbare Nutzungs-Zusammenfassung für den Avatar (Kontext). */
export function usageSummary(u: UserId): string {
  const s = loadUsage(u)
  if (s.sessions === 0 && s.minutes === 0 && s.messages === 0) return ''
  const mins = Math.max(1, Math.round(s.minutes))
  const parts = [
    `insgesamt etwa ${mins} Minuten geübt`,
    `${s.sessions} Sitzung${s.sessions === 1 ? '' : 'en'}`,
    `${s.messages} Nachricht${s.messages === 1 ? '' : 'en'} geschrieben`,
    `an ${s.days.length} verschiedenen Tag${s.days.length === 1 ? '' : 'en'} aktiv`,
  ]
  if (s.firstSeen) parts.push(`erste Sitzung am ${s.firstSeen}`)
  const streak = streakOf(s)
  if (streak >= 2) parts.push(`aktuelle Serie: ${streak} Tage in Folge`)
  return parts.join(', ') + '.'
}
