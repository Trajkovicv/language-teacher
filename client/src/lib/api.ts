/**
 * API-Basis: leer im Dev-Betrieb (Vite-Proxy leitet /api an den lokalen Server).
 * Für die veröffentlichte App (GitHub Pages) zeigt VITE_API_BASE_URL auf den
 * gehosteten Server, z. B. https://language-teacher-api.onrender.com
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

// Optionaler Zugangscode: schützt das API-Budget, wenn die App öffentlich erreichbar ist.
// Wird lokal gespeichert und als Header mitgeschickt; der Server prüft ihn nur,
// wenn dort ACCESS_CODE gesetzt ist.
const ACCESS_CODE_KEY = 'lt-access-code'

export function getAccessCode(): string | null {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY)
  } catch {
    return null
  }
}

export function setAccessCode(code: string): void {
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code)
  } catch {
    // localStorage nicht verfügbar (z. B. Privatmodus) — Code gilt dann nur für diese Anfrage nicht
  }
}

export function accessHeaders(): Record<string, string> {
  const code = getAccessCode()
  return code ? { 'X-Access-Code': code } : {}
}
