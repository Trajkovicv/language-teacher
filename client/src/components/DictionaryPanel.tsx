import { useEffect, useState } from 'react'
import Bilingual from './Bilingual'
import { Icon } from './Icons'
import { postJson } from '../lib/api'
import type { Lang } from '../lib/i18n'
import { DICT_MODES, type DictLang, type DictMode, type UserId } from '../lib/users'

export type DictEntry = {
  word: string
  phonetic: string
  // Nur für serbische Wörter gefüllt; sonst leer (wird dann ausgeblendet).
  cyrillic: string
  partOfSpeech: string
  meaning: string
  synonyms: string[]
  usageNote: string
  // source = Satz in der Nachschlage-Sprache, target = Übersetzung in der Erklärsprache
  examples: { source: string; target: string; note: string }[]
  // Generische Formen-/Grammatiktabelle (Deklination, Konjugation, Plural …)
  forms: { label: string; form: string; example: string }[]
}

const LANG_ABBR: Record<DictLang, string> = { de: 'DE', en: 'EN', sr: 'SR' }

// Beispiel-Einträge je Sprachpaar — angezeigt, bis zum ersten Mal gesucht wurde.
const DEMO_ENTRIES: Record<string, DictEntry> = {
  // Vuk-Standard: Englisch nachschlagen, deutsche Erklärung
  'en>de': {
    word: 'resilience',
    phonetic: '[rɪ·ˈzɪl·jəns]',
    cyrillic: '',
    partOfSpeech: 'Substantiv · unzählbar',
    meaning: 'die Widerstandsfähigkeit, die Belastbarkeit',
    synonyms: ['toughness', 'endurance', 'hardiness', 'grit'],
    usageNote:
      'resilience betont das Zurückfedern nach Schwierigkeiten. toughness klingt robuster/körperlicher, grit meint eher Durchhaltewillen.',
    examples: [
      {
        source: 'She showed remarkable resilience after the setback.',
        target: 'Sie zeigte nach dem Rückschlag bemerkenswerte Widerstandsfähigkeit.',
        note: '',
      },
      {
        source: 'Building resilience takes time and practice.',
        target: 'Widerstandsfähigkeit aufzubauen braucht Zeit und Übung.',
        note: '',
      },
      {
        source: 'The material has great resilience.',
        target: 'Das Material ist sehr elastisch.',
        note: '',
      },
    ],
    forms: [],
  },
  // Andrijana-Standard: Deutsch nachschlagen, serbische Erklärung
  'de>sr': {
    word: 'die Familie',
    phonetic: '[fa·ˈmiː·li·ə]',
    cyrillic: '',
    partOfSpeech: 'imenica · ženski rod',
    meaning: 'porodica, familija',
    synonyms: ['die Angehörigen', 'die Verwandtschaft', 'der Haushalt'],
    usageNote:
      'Familie je najčešća reč i uvek odgovara. Verwandtschaft naglašava širu rodbinu, Haushalt zajedničko domaćinstvo.',
    examples: [
      { source: 'Meine Familie kommt aus Serbien.', target: 'Moja porodica dolazi iz Srbije.', note: 'Nominativ' },
      { source: 'Wir haben eine große Familie.', target: 'Imamo veliku porodicu.', note: 'Akkusativ' },
      { source: 'Ich verbringe Zeit mit der Familie.', target: 'Provodim vreme sa porodicom.', note: 'Dativ' },
    ],
    forms: [
      { label: 'Nominativ (Sg.)', form: 'die Familie', example: 'Die Familie ist groß.' },
      { label: 'Genitiv (Sg.)', form: 'der Familie', example: 'ein Mitglied der Familie' },
      { label: 'Plural', form: 'die Familien', example: 'zwei Familien' },
    ],
  },
  // Serbisch-Lookup (beide Profile): serbisches Wort, deutsche Erklärung
  'sr>de': {
    word: 'porodica',
    phonetic: '[pó·ro·di·tsa]',
    cyrillic: 'породица',
    partOfSpeech: 'Substantiv · weiblich',
    meaning: 'die Familie',
    synonyms: ['familija', 'rod', 'domaćinstvo', 'najbliži'],
    usageNote:
      'porodica ist das neutrale Standardwort – passt immer. familija klingt umgangssprachlicher. rod betont die Abstammung.',
    examples: [
      { source: 'Moja porodica dolazi iz Srbije.', target: 'Meine Familie kommt aus Serbien.', note: '' },
      { source: 'Imamo veliku porodicu.', target: 'Wir haben eine große Familie.', note: 'Akkusativ' },
      { source: 'Provodim vreme sa porodicom.', target: 'Ich verbringe Zeit mit der Familie.', note: 'Instrumental' },
    ],
    forms: [
      { label: 'Nominativ', form: 'porodica', example: 'To je moja porodica.' },
      { label: 'Genitiv', form: 'porodice', example: 'član porodice' },
      { label: 'Akkusativ', form: 'porodicu', example: 'volim svoju porodicu' },
      { label: 'Instrumental', form: 'porodicom', example: 'sa porodicom' },
    ],
  },
}

const modeKey = (m: DictMode) => `${m.source}>${m.explain}`
const demoFor = (m: DictMode): DictEntry => DEMO_ENTRIES[modeKey(m)] ?? DEMO_ENTRIES['sr>de']

type Props = {
  active: boolean
  lang: Lang
  /** Aktives Lernprofil — bestimmt das Standard-Sprachpaar des Wörterbuchs. */
  user: UserId
  savedWords: readonly string[]
  onToggleSaved: (word: string) => void
  onSpeak: (text: string, lang: Lang) => void
}

// M4 + Mehrsprachigkeit: Wörterbuch-Tab mit Live-Suche über /api/dictionary.
// Das Sprachpaar (source→explain) richtet sich automatisch nach dem Profil;
// ein sr-Modus bleibt für beide zusätzlich wählbar.
export default function DictionaryPanel({ active, lang, user, savedWords, onToggleSaved, onSpeak }: Props) {
  const modes = DICT_MODES[user]
  const [modeIdx, setModeIdx] = useState(0)
  const mode = modes[modeIdx] ?? modes[0]
  const [query, setQuery] = useState('')
  const [entry, setEntry] = useState<DictEntry>(() => demoFor(modes[0]))
  // Während der Suche angezeigtes Wort — unabhängig vom Eingabefeld,
  // damit Weitertippen die Lade-Anzeige nicht verändert
  const [searchingWord, setSearchingWord] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = searchingWord !== null
  const starred = savedWords.includes(entry.word)

  // Profilwechsel: auf den Standard-Modus zurück und den Demo-Eintrag zeigen.
  useEffect(() => {
    setModeIdx(0)
    setEntry(demoFor(modes[0]))
    setQuery('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  function selectMode(i: number) {
    if (i === modeIdx || loading) return
    setModeIdx(i)
    setEntry(demoFor(modes[i]))
    setQuery('')
    setError(null)
  }

  async function search(word: string) {
    const w = word.trim()
    if (!w || loading) return
    setSearchingWord(w)
    setError(null)
    try {
      const result = await postJson<DictEntry>('/api/dictionary', {
        word: w,
        sourceLang: mode.source,
        explainLang: mode.explain,
      })
      setEntry(result)
      // Nur normalisieren, wenn der Nutzer nicht längst weitergetippt hat
      setQuery((q) => (q.trim() === w ? result.word : q))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das Wörterbuch macht kurz Pause… Versuch es gleich noch einmal.')
    } finally {
      setSearchingWord(null)
    }
  }

  return (
    <div className={active ? 'panel active' : 'panel'} data-panel="dict">
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault()
          void search(query)
        }}
      >
        <div className="field">
          <Icon id="i-search" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={60}
            placeholder="Wort suchen… / Traži reč…"
          />
        </div>
        <button className="btn" type="submit" disabled={loading || !query.trim()}>
          {loading ? '…' : <Bilingual k="search" lang={lang} />}
        </button>
      </form>
      {modes.length > 1 && (
        <div className="chips" role="tablist" aria-label="Sprachrichtung" style={{ margin: '0 0 10px' }}>
          {modes.map((m, i) => (
            <button
              key={modeKey(m)}
              type="button"
              className={i === modeIdx ? 'chip active' : 'chip'}
              aria-pressed={i === modeIdx}
              onClick={() => selectMode(i)}
            >
              {LANG_ABBR[m.source]} → {LANG_ABBR[m.explain]}
            </button>
          ))}
        </div>
      )}
      <div className="dict-scroll">
        {error && (
          <div className="mc-fb" style={{ display: 'block', color: 'var(--brick)', marginBottom: 10 }}>
            {error}
          </div>
        )}
        {loading && (
          <div className="mc-fb" style={{ display: 'block', color: 'var(--ink-soft)', marginBottom: 10 }}>
            Suche »{searchingWord}« … · Tražim …
          </div>
        )}
        <div className="entry-head">
          <span className="entry-word">{entry.word}</span>
          <span className="entry-phon">{entry.phonetic}</span>
          <span className="entry-pos">
            {entry.partOfSpeech}
            {entry.cyrillic ? ` · ћир.: ${entry.cyrillic}` : ''}
          </span>
          <button
            className="speak-ic"
            title="Anhören · Poslušaj"
            type="button"
            onClick={() => onSpeak(entry.word, mode.source)}
          >
            <Icon id="i-speaker" />
          </button>
          <button
            className={starred ? 'star-ic saved' : 'star-ic'}
            title="Merken · Zapamti"
            type="button"
            onClick={() => onToggleSaved(entry.word)}
          >
            <Icon id="i-star" />
          </button>
        </div>
        <div className="sec">
          <h4>
            <Bilingual k="meaning" lang={lang} />
          </h4>
          <div className="trans">
            {entry.meaning} · <span style={{ color: 'var(--brand-ink)' }}>{entry.word}</span>
          </div>
        </div>
        {entry.synonyms.length > 0 && (
          <div className="sec">
            <h4>
              <Bilingual k="syn" lang={lang} />
            </h4>
            <div className="syn-chips">
              {entry.synonyms.map((s) => (
                <span key={s} className="syn" title="Nachschlagen" onClick={() => void search(s)}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {entry.usageNote && (
          <div className="sec">
            <h4>
              <Bilingual k="usage" lang={lang} />
            </h4>
            <div className="usage">{entry.usageNote}</div>
          </div>
        )}
        {entry.examples.length > 0 && (
          <div className="sec">
            <h4>
              <Bilingual k="ex2" lang={lang} />
            </h4>
            {entry.examples.map((ex, i) => (
              <div key={i} className="example">
                <div className="ex-txt">
                  <div className="sr">{ex.source}</div>
                  <div className="de">
                    {ex.target}
                    {ex.note ? <i> ({ex.note})</i> : null}
                  </div>
                </div>
                <button
                  className="ex-spk"
                  type="button"
                  title="Anhören · Poslušaj"
                  onClick={() => onSpeak(ex.source, mode.source)}
                >
                  <Icon id="i-speaker" />
                </button>
              </div>
            ))}
          </div>
        )}
        {entry.forms.length > 0 && (
          <div className="sec">
            <h4>
              <Bilingual k="forms" lang={lang} />
            </h4>
            <table className="decl">
              <tbody>
                <tr>
                  <th>&nbsp;</th>
                  <th>Form · Oblik</th>
                  <th>Beispiel · Primer</th>
                </tr>
                {entry.forms.map((d, i) => (
                  <tr key={i}>
                    <td>{d.label}</td>
                    <td>{d.form}</td>
                    <td>{d.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
