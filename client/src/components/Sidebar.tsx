import Bilingual from './Bilingual'
import AvatarStage from './AvatarStage'
import { USERS, type UserId } from '../lib/users'
import type { Lang } from '../lib/i18n'
import type { MouthShape } from '../lib/speech'

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
  userId: UserId
  onSelectUser: (u: UserId) => void
  voiceState: 'teacher' | 'user' | 'idle'
  mouth: MouthShape
  lang: Lang
  stats: { minutes: number; messages: number; streak: number }
}

/**
 * Sidebar mit Avatar-Bühne. Die Bühne zeigt die animierten Charakter-
 * Illustrationen (Sprech-Ring koralle = Lehrer:in spricht, grün = du sprichst).
 * Fotos werden bewusst nicht mehr verwendet; in Phase 3 wird die Bühne durch
 * den Simli-Live-Video-Avatar ersetzt (<video> an gleicher Stelle).
 */
export default function Sidebar({ character, onSelect, userId, onSelectUser, voiceState, mouth, lang, stats }: Props) {
  const ui = lang === 'en' ? 'en' : 'de'
  return (
    <aside>
      {/* Lernprofil: Vuk (Englisch) / Andrijana (Deutsch) — getrenntes Gedächtnis */}
      <div className="userpick">
        <div className="userpick-lbl">{ui === 'en' ? 'Who is learning?' : 'Wer lernt?'}</div>
        <div className="userpick-row">
          {USERS.map((u) => (
            <button
              key={u.id}
              type="button"
              className={u.id === userId ? 'userbtn active' : 'userbtn'}
              onClick={() => onSelectUser(u.id)}
              title={u.focus[ui]}
            >
              <span className="ub-name">{u.name}</span>
              <span className="ub-focus">{u.focus[ui]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="hero">
        <AvatarStage characterId={character.id} mouth={mouth} voiceState={voiceState} />
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
          <div className="k">MINUTEN</div>
        </div>
        <div className="stat">
          <div className="v">{stats.messages}</div>
          <div className="k">{ui === 'en' ? 'MESSAGES' : 'NACHRICHTEN'}</div>
        </div>
        <div className="stat">
          <div className="v fire">{stats.streak}🔥</div>
          <div className="k">{ui === 'en' ? 'STREAK' : 'SERIE'}</div>
        </div>
      </div>
    </aside>
  )
}
