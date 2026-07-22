import { accessHeaders, apiUrl } from './api'
import { loadSession } from './session'
import type { UserId } from './users'

// Geräte-Sync für Konten (Turso): Lern-Gedächtnis + Nutzungs-Statistik.
// Write-Through — jeder lokale Schreibvorgang (memory.ts/usage.ts) schiebt den
// neuen Wert zusätzlich ans Konto; beim Login holt pullState den Serverstand in
// den lokalen Cache. Ohne aktive Session (kein Turso / nicht angemeldet)
// passiert nichts — die App bleibt voll offline-fähig.

// Server-KV-Schlüssel ↔ lokale localStorage-Schlüssel (müssen zu memory.ts /
// usage.ts passen: `lt-usage-<user>`, `lt-memory-<user>-<char>`).
function localKeyFor(learner: UserId, serverKey: string): string | null {
  if (serverKey === 'usage') return `lt-usage-${learner}`
  const m = /^memory:(mila|luka|ana)$/.exec(serverKey)
  return m ? `lt-memory-${learner}-${m[1]}` : null
}

/** Einen Wert ans Konto durchschreiben (fire-and-forget; Fehler sind egal). */
export function pushState(learner: UserId, key: string, value: string): void {
  const s = loadSession()
  if (!s || s.learner !== learner) return // nur das eingeloggte Konto synct
  try {
    fetch(apiUrl('/api/state'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}`, ...accessHeaders() },
      body: JSON.stringify({ key, value }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => {})
  } catch {
    // AbortSignal.timeout evtl. nicht verfügbar — Sync ist ein Bonus, kein Blocker
  }
}

/** Serverstand nach dem Login in den lokalen Cache schreiben. */
export async function pullState(learner: UserId, token: string): Promise<'ok' | 'unauthorized' | 'error'> {
  let res: Response
  try {
    res = await fetch(apiUrl('/api/state'), {
      headers: { Authorization: `Bearer ${token}`, ...accessHeaders() },
      signal: AbortSignal.timeout(90_000),
    })
  } catch {
    return 'error'
  }
  if (res.status === 401) return 'unauthorized'
  if (!res.ok) return 'error'
  try {
    const j = (await res.json()) as { state?: Record<string, string> }
    for (const [key, value] of Object.entries(j.state ?? {})) {
      const lk = localKeyFor(learner, key)
      if (lk && typeof value === 'string') {
        try {
          localStorage.setItem(lk, value)
        } catch {
          // Cache optional
        }
      }
    }
    return 'ok'
  } catch {
    return 'error'
  }
}
