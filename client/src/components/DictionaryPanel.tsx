import { useState } from 'react'
import Bilingual from './Bilingual'
import { Icon } from './Icons'
import { postJson } from '../lib/api'
import type { Lang } from '../lib/i18n'

export type DictEntry = {
  word: string
  phonetic: string
  cyrillic: string
  partOfSpeech: string
  meaning: string
  synonyms: string[]
  usageNote: string
  examples: { sr: string; de: string; note: string }[]
  declension: { case: string; form: string; example: string }[]
}

// Beispiel-Eintrag aus dem Mockup — wird angezeigt, bis zum ersten Mal gesucht wurde
const DEMO_ENTRY: DictEntry = {
  word: 'porodica',
  phonetic: '[pó·ro·di·tsa]',
  cyrillic: 'породица',
  partOfSpeech: 'Substantiv · weiblich',
  meaning: 'die Familie',
  synonyms: ['familija', 'rod', 'domaćinstvo', 'najbliži'],
  usageNote:
    'porodica ist das neutrale Standardwort – passt immer. familija klingt umgangssprachlicher. rod betont die Abstammung.',
  examples: [
    { sr: 'Moja porodica dolazi iz Srbije.', de: 'Meine Familie kommt aus Serbien.', note: '' },
    { sr: 'Imamo veliku porodicu.', de: 'Wir haben eine große Familie.', note: 'Akkusativ' },
    { sr: 'Provodim vreme sa porodicom.', de: 'Ich verbringe Zeit mit der Familie.', note: 'Instrumental' },
  ],
  declension: [
    { case: 'Nominativ', form: 'porodica', example: 'To je moja porodica.' },
    { case: 'Genitiv', form: 'porodice', example: 'član porodice' },
    { case: 'Akkusativ', form: 'porodicu', example: 'volim svoju porodicu' },
    { case: 'Instrumental', form: 'porodicom', example: 'sa porodicom' },
  ],
}

type Props = {
  active: boolean
  lang: Lang
  savedWords: readonly string[]
  onToggleSaved: (word: string) => void
}

// M4: Wörterbuch-Tab mit Live-Suche über /api/dictionary.
export default function DictionaryPanel({ active, lang, savedWords, onToggleSaved }: Props) {
  const [query, setQuery] = useState('')
  const [entry, setEntry] = useState<DictEntry>(DEMO_ENTRY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const starred = savedWords.includes(entry.word)

  async function search(word: string) {
    const w = word.trim()
    if (!w || loading) return
    setLoading(true)
    setError(null)
    try {
      const result = await postJson<DictEntry>('/api/dictionary', { word: w, primaryLang: lang })
      setEntry(result)
      setQuery(result.word)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das Wörterbuch macht kurz Pause… Versuch es gleich noch einmal.')
    } finally {
      setLoading(false)
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
      <div className="dict-scroll">
        {error && (
          <div className="mc-fb" style={{ display: 'block', color: 'var(--brick)', marginBottom: 10 }}>
            {error}
          </div>
        )}
        {loading && (
          <div className="mc-fb" style={{ display: 'block', color: 'var(--ink-soft)', marginBottom: 10 }}>
            Suche »{query.trim()}« … · Tražim …
          </div>
        )}
        <div className="entry-head">
          <span className="entry-word">{entry.word}</span>
          <span className="entry-phon">{entry.phonetic}</span>
          <span className="entry-pos">
            {entry.partOfSpeech} · ћир.: {entry.cyrillic}
          </span>
          <button className="speak-ic" title="Anhören · Poslušaj (Stimme kommt in Phase 3)" type="button">
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
                  <div className="sr">{ex.sr}</div>
                  <div className="de">
                    {ex.de}
                    {ex.note ? <i> ({ex.note})</i> : null}
                  </div>
                </div>
                <button className="ex-spk" type="button" title="Anhören (Stimme kommt in Phase 3)">
                  <Icon id="i-speaker" />
                </button>
              </div>
            ))}
          </div>
        )}
        {entry.declension.length > 0 && (
          <div className="sec">
            <h4>
              <Bilingual k="decl" lang={lang} />
            </h4>
            <table className="decl">
              <tbody>
                <tr>
                  <th>Fall · Padež</th>
                  <th>Form</th>
                  <th>Beispiel</th>
                </tr>
                {entry.declension.map((d, i) => (
                  <tr key={i}>
                    <td>{d.case}</td>
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
