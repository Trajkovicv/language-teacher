import type { MouthShape } from '../lib/speech'
import type { CharacterId } from './Sidebar'

/**
 * Avatar-Bühne mit Gratis-Lippensynchronisation (komplett lokal, keine Konten):
 * Basis ist die illustrierte SVG-Figur; während des Sprechens überdeckt ein
 * hautfarbener Patch den gemalten Mund und eine animierte Mundform (aus den
 * Vokalen des gesprochenen Wortes) wird darübergelegt. Dazu Blinzeln und
 * leichte Kopfbewegung. In Phase 3 kann ein Simli-<video> die Bühne ersetzen.
 */

type FaceConfig = {
  mouth: { x: number; y: number }
  skin: string
  lipDark: string
  eyes: [{ x: number; y: number }, { x: number; y: number }]
}

const FACES: Record<CharacterId, FaceConfig> = {
  mila: { mouth: { x: 150, y: 213 }, skin: '#F6D0B0', lipDark: '#8E3B47', eyes: [{ x: 126, y: 164 }, { x: 176, y: 163 }] },
  luka: { mouth: { x: 150, y: 216 }, skin: '#EBBE93', lipDark: '#7C3A2F', eyes: [{ x: 127, y: 166 }, { x: 174, y: 165 }] },
  ana: { mouth: { x: 150, y: 213 }, skin: '#EEC6A0', lipDark: '#83303C', eyes: [{ x: 126, y: 164 }, { x: 176, y: 163 }] },
}

function Mouth({ shape, lipDark }: { shape: MouthShape; lipDark: string }) {
  switch (shape) {
    case 'open':
      return (
        <>
          <ellipse cx="0" cy="1" rx="10.5" ry="8" fill={lipDark} />
          <ellipse cx="0" cy="4.5" rx="6" ry="3" fill="#D97878" />
        </>
      )
    case 'round':
      return <circle cx="0" cy="1" r="6.5" fill={lipDark} />
    case 'small':
      return <ellipse cx="0" cy="1" rx="7.5" ry="4" fill={lipDark} />
    case 'closed':
    case 'rest':
    default:
      return <path d="M-13 0 Q0 6 13 0" stroke={lipDark} strokeWidth="2.6" fill="none" strokeLinecap="round" />
  }
}

type Props = {
  characterId: CharacterId
  mouth: MouthShape
  voiceState: 'teacher' | 'user' | 'idle'
}

export default function AvatarStage({ characterId, mouth, voiceState }: Props) {
  const face = FACES[characterId]
  const talking = mouth !== 'rest'
  const ringClass =
    voiceState === 'teacher' ? 'stage-av speaking' : voiceState === 'user' ? 'stage-av user-speaking' : 'stage-av'

  return (
    <div className={ringClass}>
      <svg className={talking ? 'talking' : 'floaty'} viewBox="0 0 300 360">
        <use href={`#sym-${characterId}`} />
      </svg>
      <svg className="av-overlay" viewBox="0 0 300 360" aria-hidden="true">
        {/* Blinzeln: hautfarbene Lider, per CSS-Animation kurz sichtbar */}
        <g className="lids">
          {face.eyes.map((e, i) => (
            <ellipse key={i} cx={e.x} cy={e.y} rx="11" ry="10" fill={face.skin} />
          ))}
        </g>
        {talking && (
          <g transform={`translate(${face.mouth.x} ${face.mouth.y})`}>
            {/* Patch über dem gemalten Mund, dann die animierte Mundform */}
            <ellipse cx="0" cy="1" rx="23" ry="13" fill={face.skin} />
            <Mouth shape={mouth} lipDark={face.lipDark} />
          </g>
        )}
      </svg>
      <div className="spk-ring" />
    </div>
  )
}
