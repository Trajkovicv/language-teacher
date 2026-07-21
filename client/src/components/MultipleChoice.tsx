import { useState, type ReactNode } from 'react'

type Props = {
  question?: ReactNode
  options: readonly string[]
  correctIndex: number
  feedbackCorrect?: string
  feedbackWrong?: string
}

// Multiple-Choice-Block aus dem Mockup (Chat + Übungen teilen dieselbe Komponente).
export default function MultipleChoice({
  question,
  options,
  correctIndex,
  feedbackCorrect = '✓ Tačno! Richtig!',
  feedbackWrong = 'Netačno – versuch es noch einmal.',
}: Props) {
  const [picked, setPicked] = useState<number | null>(null)
  const correct = picked !== null && picked === correctIndex

  return (
    <>
      {question && <div className="mc-q">{question}</div>}
      <div className="mc-opts">
        {options.map((opt, i) => {
          let cls = 'mc-opt'
          if (picked === i) cls += i === correctIndex ? ' correct' : ' wrong'
          return (
            <button key={i} type="button" className={cls} onClick={() => setPicked(i)}>
              <span className="key">{String.fromCharCode(65 + i)}</span> {opt}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <div className="mc-fb" style={{ display: 'block', color: correct ? 'var(--green)' : 'var(--brick)' }}>
          {correct ? feedbackCorrect : feedbackWrong}
        </div>
      )}
    </>
  )
}
