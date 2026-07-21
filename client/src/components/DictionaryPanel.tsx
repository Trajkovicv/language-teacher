import { useState } from 'react'
import Bilingual from './Bilingual'
import { Icon } from './Icons'
import type { Lang } from '../lib/i18n'

type Props = {
  active: boolean
  lang: Lang
  savedWords: readonly string[]
  onToggleSaved: (word: string) => void
}

// M3: Wörterbuch-Tab exakt nach Mockup mit dem Beispiel-Eintrag »porodica«.
// Die Live-Suche über /api/dictionary kommt in M4 — der Suchen-Button sagt das ehrlich.
export default function DictionaryPanel({ active, lang, savedWords, onToggleSaved }: Props) {
  const [query, setQuery] = useState('porodica')
  const [hint, setHint] = useState<string | null>(null)
  const starred = savedWords.includes('porodica')

  return (
    <div className={active ? 'panel active' : 'panel'} data-panel="dict">
      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault()
          setHint('Die Live-Suche kommt im nächsten Schritt (M4) — hier siehst du schon das fertige Layout.')
        }}
      >
        <div className="field">
          <Icon id="i-search" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Wort suchen… / Traži reč…"
          />
        </div>
        <button className="btn" type="submit">
          <Bilingual k="search" lang={lang} />
        </button>
      </form>
      <div className="dict-scroll">
        {hint && (
          <div className="mc-fb" style={{ display: 'block', color: 'var(--gold)', marginBottom: 10 }}>
            {hint}
          </div>
        )}
        <div className="entry-head">
          <span className="entry-word">porodica</span>
          <span className="entry-phon">[pó·ro·di·tsa]</span>
          <span className="entry-pos">Substantiv · weiblich · ћир.: породица</span>
          <button className="speak-ic" title="Anhören · Poslušaj (Stimme kommt in Phase 3)" type="button">
            <Icon id="i-speaker" />
          </button>
          <button
            className={starred ? 'star-ic saved' : 'star-ic'}
            title="Merken · Zapamti"
            type="button"
            onClick={() => onToggleSaved('porodica')}
          >
            <Icon id="i-star" />
          </button>
        </div>
        <div className="sec">
          <h4>
            <Bilingual k="meaning" lang={lang} />
          </h4>
          <div className="trans">
            die Familie · <span style={{ color: 'var(--brand-ink)' }}>porodica</span>
          </div>
        </div>
        <div className="sec">
          <h4>
            <Bilingual k="syn" lang={lang} />
          </h4>
          <div className="syn-chips">
            {['familija', 'rod', 'domaćinstvo', 'najbliži'].map((s) => (
              <span key={s} className="syn" onClick={() => setQuery(s)}>
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="sec">
          <h4>
            <Bilingual k="usage" lang={lang} />
          </h4>
          <div className="usage">
            <b>porodica</b> ist das neutrale Standardwort – passt immer. <b>familija</b> klingt umgangssprachlicher.{' '}
            <b>rod</b> betont die Abstammung.
          </div>
        </div>
        <div className="sec">
          <h4>
            <Bilingual k="ex2" lang={lang} />
          </h4>
          {[
            { sr: <>Moja <b>porodica</b> dolazi iz Srbije.</>, de: 'Meine Familie kommt aus Serbien.' },
            { sr: <>Imamo veliku <b>porodicu</b>.</>, de: 'Wir haben eine große Familie. (Akkusativ)' },
            { sr: <>Provodim vreme sa <b>porodicom</b>.</>, de: 'Ich verbringe Zeit mit der Familie. (Instrumental)' },
          ].map((ex, i) => (
            <div key={i} className="example">
              <div className="ex-txt">
                <div className="sr">{ex.sr}</div>
                <div className="de">{ex.de}</div>
              </div>
              <button className="ex-spk" type="button" title="Anhören (Stimme kommt in Phase 3)">
                <Icon id="i-speaker" />
              </button>
            </div>
          ))}
        </div>
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
              <tr>
                <td>Nominativ</td>
                <td>porodica</td>
                <td>To je moja porodica.</td>
              </tr>
              <tr>
                <td>Genitiv</td>
                <td>porodice</td>
                <td>član porodice</td>
              </tr>
              <tr>
                <td>Akkusativ</td>
                <td>porodicu</td>
                <td>volim svoju porodicu</td>
              </tr>
              <tr>
                <td>Instrumental</td>
                <td>porodicom</td>
                <td>sa porodicom</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
