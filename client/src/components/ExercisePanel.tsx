import { useState } from 'react'
import Bilingual from './Bilingual'
import { Icon } from './Icons'
import MultipleChoice from './MultipleChoice'
import { postJson } from '../lib/api'
import type { Lang } from '../lib/i18n'

export type Exercise =
  | { type: 'mc'; question: string; options: string[]; correctIndex: number; feedbackCorrect: string; feedbackWrong: string }
  | { type: 'blank'; question: string; bank: string[]; correctWord: string; feedbackCorrect: string; feedbackWrong: string }

/** Lückentext mit Wortbank (Mockup-Komponente, generalisiert). */
function ClozeCard({ ex }: { ex: Extract<Exercise, { type: 'blank' }> }) {
  const [picked, setPicked] = useState<string | null>(null)
  const ok = picked !== null && picked === ex.correctWord
  const [before, ...rest] = ex.question.split('___')
  const after = rest.join('___')

  return (
    <>
      <div className="q">
        {before}
        <span className={`blank${picked ? (ok ? ' ok' : ' no') : ''}`}>{picked ?? '___'}</span>
        {after}
      </div>
      <div className="bank">
        {ex.bank.map((w) => (
          <button key={w} className="bk" type="button" onClick={() => setPicked(w)}>
            {w}
          </button>
        ))}
      </div>
      {picked && (
        <div className="mc-fb" style={{ display: 'block', color: ok ? 'var(--green)' : 'var(--brick)' }}>
          {ok ? ex.feedbackCorrect : ex.feedbackWrong}
        </div>
      )}
    </>
  )
}

type Props = {
  active: boolean
  lang: Lang
}

// M5: Übungen-Tab — Übungsarten + „Eigene Übung per Prompt" über /api/exercise.
export default function ExercisePanel({ active, lang }: Props) {
  const [prompt, setPrompt] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [exerciseKey, setExerciseKey] = useState(0)
  const [doneToday, setDoneToday] = useState(0)

  async function generate(type: 'mc' | 'blank', wish: { topic?: string; prompt?: string }) {
    if (loading) return
    setLoading(true)
    setError(null)
    setHint(null)
    try {
      const ex = await postJson<Exercise>('/api/exercise', { type, primaryLang: lang, ...wish })
      setExercise(ex)
      setExerciseKey((k) => k + 1)
      setDoneToday((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Übung ist nicht geglückt… Versuch es gleich noch einmal.')
    } finally {
      setLoading(false)
    }
  }

  const progress = Math.min(doneToday, 5)

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
          <b>
            {progress}/5 Übungen · vežbe
          </b>
          <div className="lp-bar">
            <span style={{ width: `${(progress / 5) * 100}%` }} />
          </div>
        </div>
        <div className="ex-types">
          <button type="button" className="ex-type" disabled={loading} onClick={() => void generate('blank', { topic: prompt || 'Alltag für Anfänger' })}>
            <div className="ic">
              <Icon id="i-doc" />
            </div>
            <div>
              <div className="t">Lückentext</div>
              <div className="d">Popuni prazninu</div>
            </div>
          </button>
          <button type="button" className="ex-type" disabled={loading} onClick={() => void generate('mc', { topic: prompt || 'Alltag für Anfänger' })}>
            <div className="ic">
              <Icon id="i-check" />
            </div>
            <div>
              <div className="t">Multiple Choice</div>
              <div className="d">Izaberi tačno</div>
            </div>
          </button>
          <button
            type="button"
            className="ex-type"
            disabled={loading}
            onClick={() => void generate('mc', { topic: `Übersetzung Deutsch→Serbisch: ${prompt || 'häufige Sätze für Anfänger'}` })}
          >
            <div className="ic">
              <Icon id="i-swap" />
            </div>
            <div>
              <div className="t">Übersetzen</div>
              <div className="d">Prevedi DE ⇄ SR</div>
            </div>
          </button>
          <button
            type="button"
            className="ex-type"
            onClick={() => {
              setError(null)
              setHint('Hör-Übungen brauchen die Stimme — die kommt in Phase 3 (Azure TTS).')
            }}
          >
            <div className="ic">
              <Icon id="i-phones" />
            </div>
            <div>
              <div className="t">Hören</div>
              <div className="d">Slušaj i piši</div>
            </div>
          </button>
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
              if (prompt.trim()) void generate(Math.random() < 0.5 ? 'mc' : 'blank', { prompt: prompt.trim() })
            }}
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={200}
              placeholder="z. B. „Übe den Dativ mit Familienwörtern…&quot;"
            />
            <button className="btn" type="submit" disabled={loading || !prompt.trim()}>
              <Icon id="i-sparkle" />
              {loading ? <span className="lead">erstellt…</span> : <Bilingual k="create" lang={lang} />}
            </button>
          </form>
          <div className="prompt-suggest">
            {['Zahlen 1–20 · Brojevi', 'Begrüßungen · Pozdravi', 'Akkusativ', 'Farben · Boje'].map((s) => (
              <span key={s} className="sg" onClick={() => setPrompt(s.split(' · ')[0])}>
                {s}
              </span>
            ))}
          </div>
          {(hint || error) && (
            <div
              className="mc-fb"
              style={{ display: 'block', position: 'relative', color: error ? 'var(--brick)' : 'var(--gold)' }}
            >
              {error ?? hint}
            </div>
          )}
        </div>

        {exercise && (
          <div className="live-ex" style={{ marginBottom: 14 }}>
            <span className="tag">
              <Icon id={exercise.type === 'blank' ? 'i-doc' : 'i-check'} className="tag-ico" />
              {exercise.type === 'blank' ? 'Lückentext · Popuni prazninu' : 'Multiple Choice'}
            </span>
            {exercise.type === 'blank' ? (
              <ClozeCard key={exerciseKey} ex={exercise} />
            ) : (
              <>
                <div className="q">{exercise.question}</div>
                <MultipleChoice
                  key={exerciseKey}
                  options={exercise.options}
                  correctIndex={exercise.correctIndex}
                  feedbackCorrect={exercise.feedbackCorrect}
                  feedbackWrong={exercise.feedbackWrong}
                />
              </>
            )}
          </div>
        )}

        {!exercise && (
          <div className="live-ex">
            <span className="tag">
              <Icon id="i-check" className="tag-ico" />
              Beispiel · Multiple Choice
            </span>
            <div className="q">
              Wie sagt man „<b>Guten Abend</b>"? ·{' '}
              <span style={{ color: 'var(--brand-ink)' }}>Kako se kaže „dobro veče"?</span>
            </div>
            <MultipleChoice options={['Dobro jutro', 'Dobro veče', 'Dobar dan']} correctIndex={1} />
          </div>
        )}
      </div>
    </div>
  )
}
