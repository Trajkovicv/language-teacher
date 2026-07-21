import { useState } from 'react'
import Bilingual from './Bilingual'
import { Icon } from './Icons'
import MultipleChoice from './MultipleChoice'
import type { Lang } from '../lib/i18n'

type Props = {
  active: boolean
  lang: Lang
}

const M5_HINT = 'Live-Übungen von deiner Lehrer:in kommen im nächsten Schritt (M5) — probiere solange die Beispiele unten.'

// M3: Übungen-Tab nach Mockup. Die Beispiel-Übungen (Lückentext, MC) funktionieren
// lokal; die KI-generierten Übungen über /api/exercise kommen in M5.
export default function ExercisePanel({ active, lang }: Props) {
  const [prompt, setPrompt] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [blank, setBlank] = useState<{ text: string; ok: boolean } | null>(null)

  function fillBlank(word: string, ok: boolean) {
    setBlank({ text: word, ok })
  }

  return (
    <div className={active ? 'panel active' : 'panel'} data-panel="ex">
      <div className="ex-scroll">
        <div className="ex-head">
          <Bilingual k="exhead" lang={lang} />
        </div>
        <div className="ex-sub">
          Wähle eine Übungsart – oder lass dir eine eigene erstellen. · <i>Izaberi vežbu ili napravi svoju.</i>
        </div>
        <div className="ex-prog">
          <span>Heute · Danas:</span>
          <b>2/5 Übungen · vežbe</b>
          <div className="lp-bar">
            <span style={{ width: '40%' }} />
          </div>
        </div>
        <div className="ex-types">
          {[
            { icon: 'i-doc', t: 'Lückentext', d: 'Popuni prazninu' },
            { icon: 'i-check', t: 'Multiple Choice', d: 'Izaberi tačno' },
            { icon: 'i-swap', t: 'Übersetzen', d: 'Prevedi DE ⇄ SR' },
            { icon: 'i-phones', t: 'Hören', d: 'Slušaj i piši' },
          ].map((x) => (
            <button key={x.t} type="button" className="ex-type" onClick={() => setHint(M5_HINT)}>
              <div className="ic">
                <Icon id={x.icon} />
              </div>
              <div>
                <div className="t">{x.t}</div>
                <div className="d">{x.d}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="prompt-box">
          <h4>
            ✨ Eigene Übung erstellen · <span style={{ color: 'var(--brand-ink)' }}>Napravi svoju vežbu</span>
          </h4>
          <p>Sag, was du üben möchtest – die Aufgaben entstehen sofort.</p>
          <form
            className="prompt-row"
            onSubmit={(e) => {
              e.preventDefault()
              setHint(M5_HINT)
            }}
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="z. B. „Übe den Dativ mit Familienwörtern…&quot;"
            />
            <button className="btn" type="submit">
              <Icon id="i-sparkle" />
              <Bilingual k="create" lang={lang} />
            </button>
          </form>
          <div className="prompt-suggest">
            {['Zahlen 1–20 · Brojevi', 'Begrüßungen · Pozdravi', 'Akkusativ', 'Farben · Boje'].map((s) => (
              <span key={s} className="sg" onClick={() => setPrompt(s.split(' · ')[0])}>
                {s}
              </span>
            ))}
          </div>
          {hint && (
            <div className="mc-fb" style={{ display: 'block', color: 'var(--gold)', position: 'relative' }}>
              {hint}
            </div>
          )}
        </div>
        <div className="live-ex" style={{ marginBottom: 14 }}>
          <span className="tag">
            <Icon id="i-doc" className="tag-ico" />
            Lückentext · Popuni prazninu
          </span>
          <div className="q">
            „Guten Tag" heißt „Dobar{' '}
            <span className={`blank${blank ? (blank.ok ? ' ok' : ' no') : ''}`}>{blank?.text ?? '___'}</span>
            ".{' '}
            <span style={{ color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
              · Klicke das richtige Wort · Klikni tačnu reč
            </span>
          </div>
          <div className="bank">
            <button className="bk" type="button" onClick={() => fillBlank('dan', true)}>
              dan
            </button>
            <button className="bk" type="button" onClick={() => fillBlank('veče', false)}>
              veče
            </button>
            <button className="bk" type="button" onClick={() => fillBlank('jutro', false)}>
              jutro
            </button>
          </div>
          {blank && (
            <div className="mc-fb" style={{ display: 'block', color: blank.ok ? 'var(--green)' : 'var(--brick)' }}>
              {blank.ok
                ? '✓ Tačno! „Dobar dan" = „Guten Tag".'
                : 'Netačno – probaj ponovo. · Nicht ganz, versuch es nochmal!'}
            </div>
          )}
        </div>

        <div className="live-ex">
          <span className="tag">
            <Icon id="i-check" className="tag-ico" />
            Multiple Choice · Pozdravi
          </span>
          <div className="q">
            Wie sagt man „<b>Guten Abend</b>"? ·{' '}
            <span style={{ color: 'var(--brand-ink)' }}>Kako se kaže „dobro veče"?</span>
          </div>
          <MultipleChoice options={['Dobro jutro', 'Dobro veče', 'Dobar dan']} correctIndex={1} />
        </div>
      </div>
    </div>
  )
}
