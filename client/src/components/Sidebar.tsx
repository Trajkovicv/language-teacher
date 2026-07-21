import { useState } from 'react'
import Bilingual from './Bilingual'
import type { Lang } from '../lib/i18n'

export type CharacterId = 'mila' | 'luka' | 'ana'
export type Character = { id: CharacterId; name: string; mark: string }

export const CHARACTERS: readonly Character[] = [
  { id: 'mila', name: 'Mila', mark: 'M' },
  { id: 'luka', name: 'Luka', mark: 'L' },
  { id: 'ana', name: 'Ana', mark: 'A' },
] as const

const BASE = import.meta.env.BASE_URL

export function photoPath(id: CharacterId): string {
  return `${BASE}characters/${id}.png`
}

type Props = {
  character: Character
  onSelect: (c: Character) => void
  voiceState: 'teacher' | 'user' | 'idle'
  lang: Lang
  stats: { minutes: number; words: number; streak: number }
}

export default function Sidebar({ character, onSelect, voiceState, lang, stats }: Props) {
  // Foto vorhanden? Sonst SVG-Illustration aus dem Sprite (wie im Mockup).
  // Wichtig fürs Deployment: mila.png ist privat und liegt online nicht vor.
  const [broken, setBroken] = useState<Partial<Record<CharacterId, boolean>>>({})
  const markBroken = (id: CharacterId) => setBroken((b) => (b[id] ? b : { ...b, [id]: true }))

  const ringClass =
    voiceState === 'teacher' ? 'stage-av speaking' : voiceState === 'user' ? 'stage-av user-speaking' : 'stage-av'

  return (
    <aside>
      <div className="hero">
        <div className={ringClass}>
          {broken[character.id] ? (
            <svg className="floaty" viewBox="0 0 300 360">
              <use href={`#sym-${character.id}`} />
            </svg>
          ) : (
            <img src={photoPath(character.id)} alt="" onError={() => markBroken(character.id)} />
          )}
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
                {broken[c.id] ? (
                  <svg viewBox="55 78 190 190">
                    <use href={`#sym-${c.id}`} />
                  </svg>
                ) : (
                  <img src={photoPath(c.id)} alt="" onError={() => markBroken(c.id)} />
                )}
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
