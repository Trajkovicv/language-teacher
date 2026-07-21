import type { Lang } from './i18n'

// Grobe, schnelle Spracherkennung (de/en/sr) für die Vorlese-Stimme:
// Der Lehrer antwortet in der Sprache der Nutzer-Nachricht — die Stimme muss
// dazu passen, sonst liest z. B. eine deutsche Stimme englischen Text vor.
// Heuristik: Sonderzeichen-Bonus + Häufigkeit typischer Funktionswörter.

const WORDS: Record<Lang, ReadonlySet<string>> = {
  de: new Set([
    'der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'du', 'wir', 'ihr', 'ein', 'eine', 'mit',
    'auf', 'für', 'was', 'wie', 'gut', 'sehr', 'auch', 'dein', 'deine', 'heißt', 'oder', 'ja',
    'nein', 'bitte', 'danke', 'jetzt', 'heute', 'uns', 'mal', 'schon', 'noch', 'kannst', 'dann',
    'wenn', 'aber', 'zum', 'zur', 'bedeutet', 'wort', 'satz', 'richtig', 'genau', 'übung',
  ]),
  en: new Set([
    'the', 'you', 'is', 'are', 'and', 'to', 'of', 'in', 'it', 'what', 'how', 'your', 'that',
    'this', 'let', 'we', 'great', 'say', 'means', 'word', 'sentence', 'practice', 'correct',
    'right', 'now', 'today', 'well', 'very', 'also', 'please', 'thanks', 'yes', 'can', 'would',
    'try', 'again', 'good', 'with', 'have', 'want', 'learn',
  ]),
  sr: new Set([
    'je', 'da', 'na', 'za', 'sam', 'si', 'smo', 'su', 'se', 'kako', 'šta', 'dobro', 'hvala',
    'ovo', 'ono', 'reč', 'znači', 'sada', 'danas', 'imaš', 'može', 'odlično', 'tačno', 'vrlo',
    'ali', 'ili', 'ne', 'sad', 'hajde', 'probaj', 'ponovi', 'rečenica', 'vežba', 'bravo',
    'molim', 'tebi', 'tvoj', 'tvoja', 'učimo', 'kažeš', 'pitanje', 'odgovor',
  ]),
}

/** Erkennt die Sprache eines Textes; bei zu wenig Signal gewinnt der Fallback. */
export function detectLang(text: string, fallback: Lang): Lang {
  const sample = text.slice(0, 400)
  const scores: Record<Lang, number> = { de: 0, en: 0, sr: 0 }
  if (/[äöüß]/i.test(sample)) scores.de += 3
  if (/[čćđšž]/i.test(sample) || /[Ѐ-ӿ]/.test(sample)) scores.sr += 3
  const tokens = sample.toLowerCase().match(/[a-zäöüßčćđšž]+/g) ?? []
  for (const tok of tokens) {
    if (WORDS.de.has(tok)) scores.de++
    if (WORDS.en.has(tok)) scores.en++
    if (WORDS.sr.has(tok)) scores.sr++
  }
  let best: Lang = fallback
  let bestScore = 0
  for (const l of ['de', 'en', 'sr'] as const) {
    if (scores[l] > bestScore) {
      best = l
      bestScore = scores[l]
    }
  }
  // Zu wenig Signal oder Gleichstand mit dem Fallback → Fallback behalten
  if (bestScore < 2 || scores[fallback] === bestScore) return fallback
  return best
}
