import { accessHeaders, apiUrl, setAccessCode } from './api'
import type { UserId } from './users'

// Client-seitige Konten-Session für die festen Profile (Vuk/Andrijana).
// Der Server (Turso) ist Quelle der Wahrheit; hier halten wir nur das
// Sitzungs-Token und die kleinen Login-Aufrufe. Login/Registrierung gehen
// bewusst NICHT über postJson (das würde ein 401 als „Zugangscode nötig"
// deuten) — ein 401 hier heißt „Passcode falsch".

export type Session = { learner: UserId; token: string }
export type AccountStatus = { enabled: boolean; registered: UserId[] }

const KEY = 'lt-session'

function isUserId(v: unknown): v is UserId {
  return v === 'vuk' || v === 'andrijana'
}

export function loadSession(): Session | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (raw && isUserId(raw.learner) && typeof raw.token === 'string' && raw.token) {
      return { learner: raw.learner, token: raw.token }
    }
  } catch {
    // kaputt/blockiert — als „nicht angemeldet" behandeln
  }
  return null
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // ohne persistente Session muss man sich beim Neuladen erneut anmelden
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // egal
  }
}

/**
 * Kontostatus holen (welche Profile haben schon einen Passcode). Hier — und nur
 * hier — wird bei 401 EINMALIG der App-Zugangscode erfragt und gesetzt, damit
 * spätere Login-401 eindeutig „Passcode falsch" bedeuten.
 */
export async function fetchStatus(retried = false): Promise<AccountStatus> {
  const res = await fetch(apiUrl('/api/account/status'), { headers: { ...accessHeaders() } })
  if (res.status === 401 && !retried) {
    const code = window.prompt('Diese App ist geschützt. Zugangscode eingeben:')
    if (code?.trim()) {
      setAccessCode(code.trim())
      return fetchStatus(true)
    }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as { enabled?: boolean; registered?: unknown }
  const registered = Array.isArray(j.registered) ? j.registered.filter(isUserId) : []
  return { enabled: Boolean(j.enabled), registered }
}

async function authPost(path: string, learner: UserId, passcode: string): Promise<Session> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...accessHeaders() },
    body: JSON.stringify({ learner, passcode }),
  })
  const j = (await res.json().catch(() => ({}))) as { token?: string; learner?: unknown; error?: string }
  if (!res.ok || !j.token) throw new Error(j.error ?? `HTTP ${res.status}`)
  return { learner: isUserId(j.learner) ? j.learner : learner, token: j.token }
}

/** Erstregistrierung (Passcode festlegen). */
export function registerAccount(learner: UserId, passcode: string): Promise<Session> {
  return authPost('/api/register', learner, passcode)
}

/** Anmeldung mit vorhandenem Passcode. */
export function loginAccount(learner: UserId, passcode: string): Promise<Session> {
  return authPost('/api/login', learner, passcode)
}
