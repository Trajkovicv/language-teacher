import Bilingual from './Bilingual'
import type { Lang } from '../lib/i18n'

export type CharacterId = 'mila' | 'luka' | 'ana'
export type Character = { id: CharacterId; name: string; mark: string }

export const CHARACTERS: readonly Character[] = [
  { id: 'mila', name: 'Mila', mark: 'M' },
  { id: 'luka', name: 'Luka', mark: 'L' },
  { id: 'ana', name: 'Ana', mark: 'A' },
] as const

type Props = {
  character: Character
  onSelect: (c: Character) => void
  voiceState: 'teacher' | 'user' | 'idle'
  lang: Lang
  stats: { minutes: number; words: number; streak: number }
}

/**
 * Sidebar mit Avatar-Bühne. Die Bühne zeigt die animierten Charakter-
 * Illustrationen (Sprech-Ring koralle = Lehrer:in spricht, grün = du sprichst).
 * Fotos werden bewusst nicht mehr verwendet; in Phase 3 wird die Bühne durch
 * den Simli-Live-Video-Avatar ersetzt (<video> an gleicher Stelle).
 */
export default function Sidebar({ character, onSelect, voiceState, lang, stats }: Props) {
  const ringClass =
    voiceState === 'teacher' ? 'stage-av speaking' : voiceState === 'user' ? 'stage-av user-speaking' : 'stage-av'

  return (
    <aside>
      <div className="hero">
        <div className={ringClass}>
          <svg className="floaty" viewBox="0 0 300 360">
            <use href={`#sym-${character.id}`} />
          </svg>
          <div className="spk-ring" />
        </div>
        <div className="hero-info">
          <div className="hero-name">{character.name}</div>
          <div className="status">
            <span className="dot" />
            <Bilingual k="listen" lang={lang} />
          </div>
          <div className="hero-sub">DE · EN · Srpski (lat + ћир)</div>
        </div>
      </div>

      <div className="switcher">
        <div className="lbl">
          <Bilingual k="teacher" lang={lang} t2={false} />
        </div>
        <div className="char-row">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === character.id ? 'char active' : 'char'}
              onClick={() => onSelect(c)}
            >
              <div className="ring">
                <svg viewBox="55 78 190 190">
                  <use href={`#sym-${c.id}`} />
                </svg>
              </div>
              <div className="nm">{c.name}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="v">
            {stats.minutes}
            <span style={{ fontSize: 11 }}>m</span>
          </div>
          <div className="k">HEUTE</div>
        </div>
        <div className="stat">
          <div className="v">{stats.words}</div>
          <div className="k">WÖRTER</div>
        </div>
        <div className="stat">
          <div className="v fire">{stats.streak}🔥</div>
          <div className="k">SERIE</div>
        </div>
      </div>
    </aside>
  )
}
