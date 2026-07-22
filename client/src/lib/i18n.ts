// i18n-Wörterbuch aus docs/mockup.html (Zeilen 685–695).
// Prinzip: Hauptsprache als .lead, Zielsprache Serbisch als .t2-Untertitel;
// ist Serbisch die Hauptsprache, wird Deutsch zum Untertitel.
export type Lang = 'de' | 'en' | 'sr'

export const dict = {
  chat: { de: 'Chat', en: 'Chat', sr: 'Ćaskanje' },
  dict: { de: 'Wörterbuch', en: 'Dictionary', sr: 'Rečnik' },
  ex: { de: 'Übungen', en: 'Exercises', sr: 'Vežbe' },
  listen: { de: 'hört dir zu …', en: 'is listening …', sr: 'sluša te …' },
  teacher: { de: 'Wähle deine Lehrer:in', en: 'Choose your teacher', sr: 'Izaberi nastavnika' },
  // Abweichung vom Mockup („Lektion 1 — Begrüßungen"): die echte App hat noch
  // keine Lektions-Engine, daher ehrlich „Freies Gespräch".
  lesson: { de: 'Heute · Freies Gespräch', en: 'Today · Free conversation', sr: 'Danas · Slobodan razgovor' },
  send: { de: 'Senden', en: 'Send', sr: 'Pošalji' },
  search: { de: 'Suchen', en: 'Search', sr: 'Traži' },
  meaning: { de: 'Bedeutung', en: 'Meaning', sr: 'Značenje' },
  syn: { de: 'Synonyme', en: 'Synonyms', sr: 'Sinonimi' },
  usage: { de: 'Wann benutzt man was?', en: 'When to use', sr: 'Kada se šta koristi?' },
  ex2: { de: 'Beispielsätze', en: 'Examples', sr: 'Primeri' },
  decl: { de: 'Deklination (Singular)', en: 'Declension', sr: 'Deklinacija' },
  forms: { de: 'Formen', en: 'Forms', sr: 'Oblici' },
  exhead: { de: 'Übungen', en: 'Exercises', sr: 'Vežbe' },
  create: { de: 'Erstellen', en: 'Create', sr: 'Napravi' },
} as const

export type DictKey = keyof typeof dict

export function helperLang(lang: Lang): Lang {
  return lang === 'sr' ? 'de' : 'sr'
}
