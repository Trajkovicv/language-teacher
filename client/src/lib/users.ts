// Feste Lernprofile (Nutzer-Wunsch): Vuk & Andrijana.
// Der Umschalter bestimmt, WESSEN Gedächtnis/Chat greift (nichts vermischen)
// und welche Zielsprache der Lehrer fördert. Die eigentlichen Prompt-Texte
// liegen serverseitig (prompts.ts) — hier nur das, was die Oberfläche braucht.

export type UserId = 'vuk' | 'andrijana'

export type UserProfile = {
  id: UserId
  name: string
  /** Kurzbeschreibung fürs UI (zweisprachig). */
  focus: { de: string; en: string }
}

export const USERS: readonly UserProfile[] = [
  {
    id: 'vuk',
    name: 'Vuk',
    focus: { de: 'Englisch verfeinern', en: 'refine English' },
  },
  {
    id: 'andrijana',
    name: 'Andrijana',
    focus: { de: 'Deutsch lernen', en: 'learning German' },
  },
] as const

// Wörterbuch-Modi pro Profil (Nutzer-Wunsch: automatisch nach Profil).
// source = nachgeschlagene Sprache (Zielsprache der/des Lernenden),
// explain = Sprache der Erklärungen (Muttersprache). Erster Eintrag = Standard.
// „Serbisch bleibt zusätzlich möglich" → jeweils ein sr-Modus dabei.
export type DictLang = 'de' | 'en' | 'sr'
export type DictMode = { source: DictLang; explain: DictLang }

export const DICT_MODES: Record<UserId, readonly DictMode[]> = {
  // Vuk verfeinert Englisch → englische Wörter, deutsche Erklärung
  vuk: [
    { source: 'en', explain: 'de' },
    { source: 'sr', explain: 'de' },
  ],
  // Andrijana lernt Deutsch → deutsche Wörter, serbische Erklärung
  andrijana: [
    { source: 'de', explain: 'sr' },
    { source: 'sr', explain: 'de' },
  ],
} as const

const STORAGE_KEY = 'lt-user'

export function loadUser(): UserId {
  try {
    const u = localStorage.getItem(STORAGE_KEY)
    return u === 'andrijana' ? 'andrijana' : 'vuk'
  } catch {
    return 'vuk'
  }
}

export function saveUser(id: UserId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Speichern optional
  }
}
