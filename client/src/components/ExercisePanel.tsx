import { useEffect, useState } from 'react'
import Bilingual from './Bilingual'
import { Icon } from './Icons'
import MultipleChoice from './MultipleChoice'
import { postJson } from '../lib/api'
import { availableLevels, countByLevel, exercisesForLevel, type ExLevel, type ExTarget, type LibraryExercise } from '../data/exercises'
import type { UserId } from '../lib/users'
import type { Lang } from '../lib/i18n'

// Verfügbare Zielsprachen je Profil (erste = Standard). Vuk verfeinert Englisch
// und übt zusätzlich Deutsch; Andrijana lernt Deutsch. Serbisch wird aktuell
// keinem Profil angeboten. Fortschritt wird pro Zielsprache getrennt gespeichert
// (lt-exlib-<target>), damit sich die Sprachen nicht vermischen.
const TARGETS_FOR_USER: Record<UserId, ExTarget[]> = {
  vuk: ['en', 'de'],
  andrijana: ['de'],
}
const TARGET_LABEL: Record<ExTarget, string> = { de: 'DE', en: 'EN', sr: 'SR' }

function loadLibTarget(user: UserId, targets: ExTarget[]): ExTarget {
  try {
    const t = localStorage.getItem(`lt-exlib-target-${user}`)
    return t && targets.includes(t as ExTarget) ? (t as ExTarget) : targets[0]
  } catch {
    return targets[0]
  }
}

function loadLibProgress(target: ExTarget): Record<ExLevel, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(`lt-exlib-${target}`) ?? '{}') as Partial<Record<ExLevel, number>>
    return { B1: raw.B1 || 0, B2: raw.B2 || 0, C1: raw.C1 || 0 }
  } catch {
    return { B1: 0, B2: 0, C1: 0 }
  }
}

function loadLibLevel(target: ExTarget, fallback: ExLevel): ExLevel {
  try {
    const l = localStorage.getItem(`lt-exlib-level-${target}`)
    return l === 'B1' || l === 'B2' || l === 'C1' ? l : fallback
  } catch {
    return fallback
  }
}

/** Bibliotheks-Übung → Anzeige-Übung in der gewünschten Sprache (de/en). */
function localize(ex: LibraryExercise, ui: 'de' | 'en'): Exercise {
  const base = { question: ex.q[ui], feedbackCorrect: ex.fbOk[ui], feedbackWrong: ex.fbNo[ui] }
  return ex.type === 'mc'
    ? { type: 'mc', options: ex.options, correctIndex: ex.correctIndex, ...base }
    : { type: 'blank', bank: ex.bank, correctWord: ex.correctWord, ...base }
}

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
  /** Aktives Lernprofil — bestimmt die Zielsprache der Übungsbibliothek. */
  user: UserId
}

// M5: Übungen-Tab — Übungsarten + „Eigene Übung per Prompt" über /api/exercise.
export default function ExercisePanel({ active, lang, user }: Props) {
  const [prompt, setPrompt] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [exerciseKey, setExerciseKey] = useState(0)
  const [doneToday, setDoneToday] = useState(0)

  // Übungsbibliothek (kuratiert, keine API-Kosten) — Zielsprache je Profil.
  // Vuk kann zwischen EN/DE umschalten; Andrijana hat nur DE.
  const targets = TARGETS_FOR_USER[user]
  const [libTarget, setLibTarget] = useState<ExTarget>(() => loadLibTarget(user, targets))
  const levels = availableLevels(libTarget)
  const levelCounts = countByLevel(libTarget)
  const [libLevel, setLibLevel] = useState<ExLevel>(() => loadLibLevel(libTarget, availableLevels(libTarget)[0] ?? 'B1'))
  const [libIdx, setLibIdx] = useState<Record<ExLevel, number>>(() => loadLibProgress(libTarget))
  const [libKey, setLibKey] = useState(0) // remountet die Antwort-Ansicht beim Blättern
  const uiLang: 'de' | 'en' = lang === 'en' ? 'en' : 'de'
  const libList = exercisesForLevel(libLevel, libTarget)
  const libPos = Math.min(libIdx[libLevel], Math.max(libList.length - 1, 0))
  const libEx = libList[libPos]

  // Profilwechsel → Zielsprache des neuen Profils (gemerkte oder Standard) laden.
  useEffect(() => {
    setLibTarget(loadLibTarget(user, targets))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Zielsprache gewechselt: gültiges Level + Fortschritt neu laden.
  useEffect(() => {
    const valid = availableLevels(libTarget)
    const lv = loadLibLevel(libTarget, valid[0] ?? 'B1')
    setLibLevel(valid.includes(lv) ? lv : valid[0] ?? 'B1')
    setLibIdx(loadLibProgress(libTarget))
    setLibKey((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libTarget])

  function saveLibIdx(next: Record<ExLevel, number>) {
    setLibIdx(next)
    try {
      localStorage.setItem(`lt-exlib-${libTarget}`, JSON.stringify(next))
    } catch {
      // Speichern optional
    }
  }

  function libGo(delta: number) {
    const next = Math.min(Math.max(libPos + delta, 0), libList.length - 1)
    saveLibIdx({ ...libIdx, [libLevel]: next })
    setLibKey((k) => k + 1)
  }

  function pickLevel(l: ExLevel) {
    setLibLevel(l)
    setLibKey((k) => k + 1)
    try {
      localStorage.setItem(`lt-exlib-level-${libTarget}`, l)
    } catch {
      // Speichern optional
    }
  }

  function pickTarget(t: ExTarget) {
    if (t === libTarget) return
    setLibTarget(t)
    try {
      localStorage.setItem(`lt-exlib-target-${user}`, t)
    } catch {
      // Speichern optional
    }
  }

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

        {/* ===== Übungsbibliothek: 100 kuratierte Übungen B1–C1 ===== */}
        <div className="exlib">
          <div className="exlib-head">
            <h4>
              📚 Übungsbibliothek · <span style={{ color: 'var(--brand-ink)' }}>Zbirka vežbi</span>
            </h4>
            {targets.length > 1 && (
              <div className="exlib-levels" style={{ marginRight: 8 }}>
                {targets.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={libTarget === t ? 'lvl active' : 'lvl'}
                    onClick={() => pickTarget(t)}
                    title={t === 'en' ? 'Englisch · English' : t === 'de' ? 'Deutsch' : 'Serbisch'}
                  >
                    {TARGET_LABEL[t]}
                  </button>
                ))}
              </div>
            )}
            <div className="exlib-levels">
              {levels.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={libLevel === l ? 'lvl active' : 'lvl'}
                  onClick={() => pickLevel(l)}
                  title={`${levelCounts[l]} Übungen · vežbi`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {libEx && (
            <div className="live-ex" style={{ marginBottom: 0 }}>
              <div className="exlib-meta">
                <span className="tag">
                  <Icon id={libEx.type === 'blank' ? 'i-doc' : 'i-check'} className="tag-ico" />
                  {libEx.topic[uiLang]}
                </span>
                <span className="exlib-count">
                  {uiLang === 'en' ? 'Exercise' : 'Übung'} {libPos + 1}/{libList.length} · {libLevel}
                </span>
              </div>
              {libEx.type === 'blank' ? (
                <ClozeCard key={`${libLevel}-${libPos}-${libKey}`} ex={localize(libEx, uiLang) as Extract<Exercise, { type: 'blank' }>} />
              ) : (
                <>
                  <div className="q">{libEx.q[uiLang]}</div>
                  <MultipleChoice
                    key={`${libLevel}-${libPos}-${libKey}`}
                    options={libEx.options}
                    correctIndex={libEx.correctIndex}
                    feedbackCorrect={libEx.fbOk[uiLang]}
                    feedbackWrong={libEx.fbNo[uiLang]}
                  />
                </>
              )}
              <div className="exlib-nav">
                <button type="button" className="dict-btn" onClick={() => libGo(-1)} disabled={libPos === 0}>
                  ← {uiLang === 'en' ? 'Back' : 'Zurück'}
                </button>
                {libPos < libList.length - 1 ? (
                  <button type="button" className="btn" onClick={() => libGo(1)}>
                    {uiLang === 'en' ? 'Next' : 'Weiter'} →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      saveLibIdx({ ...libIdx, [libLevel]: 0 })
                      setLibKey((k) => k + 1)
                    }}
                  >
                    {uiLang === 'en' ? 'Start over' : 'Von vorn'} ↻
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
