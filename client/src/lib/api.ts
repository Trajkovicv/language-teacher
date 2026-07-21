/**
 * API-Basis: leer im Dev-Betrieb (Vite-Proxy leitet /api an den lokalen Server).
 * Für die veröffentlichte App (GitHub Pages) zeigt VITE_API_BASE_URL auf den
 * gehosteten Server, z. B. https://language-teacher-api.onrender.com
 */
// Trailing Slashes entfernen: "https://x.onrender.com/" + "/api/chat" ergäbe
// sonst "//api/chat", was der Express-5-Router nicht matcht (404)
export const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

// Optionaler Zugangscode: schützt das API-Budget, wenn die App öffentlich erreichbar ist.
// Wird lokal gespeichert und als Header mitgeschickt; der Server prüft ihn nur,
// wenn dort ACCESS_CODE gesetzt ist.
const ACCESS_CODE_KEY = 'lt-access-code'

// In-Memory-Fallback: Wenn localStorage blockiert ist (z. B. strikter Privatmodus),
// gilt der eingegebene Code trotzdem für die laufende Sitzung — sonst würde die
// App nach jeder Eingabe erneut nach dem Code fragen.
let accessCodeInMemory: string | null = null

export function getAccessCode(): string | null {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) ?? accessCodeInMemory
  } catch {
    return accessCodeInMemory
  }
}

export function setAccessCode(code: string): void {
  accessCodeInMemory = code
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code)
  } catch {
    // localStorage nicht verfügbar — In-Memory-Fallback reicht für die Sitzung
  }
}

export function accessHeaders(): Record<string, string> {
  const code = getAccessCode()
  return code ? { 'X-Access-Code': code } : {}
}

/**
 * JSON-POST an die API (Wörterbuch/Übungen). Bei 401 wird einmalig der
 * Zugangscode erfragt und die Anfrage wiederholt (gleiches Verhalten wie im Chat).
 */
export async function postJson<T>(path: string, body: unknown, retried = false): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...accessHeaders() },
    body: JSON.stringify(body),
  })
  if (res.status === 401 && !retried) {
    const code = window.prompt('Diese App ist geschützt. Zugangscode eingeben:')
    if (code?.trim()) {
      setAccessCode(code.trim())
      return postJson<T>(path, body, true)
    }
  }
  if (!res.ok) {
    let message: string | undefined
    try {
      message = ((await res.json()) as { error?: string }).error
    } catch {
      // kein JSON-Body
    }
    throw new Error(message ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}
