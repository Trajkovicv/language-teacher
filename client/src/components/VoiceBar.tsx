import type { MicZone } from '../lib/mic'

type Props = {
  characterName: string
  mode: 'teacher' | 'user' | 'idle'
  levels: number[]
  zone: MicZone
  micError: string | null
}

const ZONE_HINT: Record<MicZone, string> = {
  quiet: '🎙 Zu leise · Pretiho',
  good: '🎙 Gut · Dobro',
  loud: '🎙 Übersteuert · Preglasno',
}

// Dezente Voice-Bar aus dem Mockup. Koralle = Lehrer:in spricht (Streaming),
// Grün = Nutzer spricht (echter Mikrofonpegel via AnalyserNode).
export default function VoiceBar({ characterName, mode, levels, zone, micError }: Props) {
  const state = mode === 'user' ? 'user' : mode === 'teacher' ? 'mila' : 'idle'

  const label =
    mode === 'user'
      ? { lead: 'Du sprichst …', t2: 'Ti govoriš …' }
      : mode === 'teacher'
        ? { lead: `${characterName} spricht …`, t2: `${characterName} govori …` }
        : { lead: `${characterName} hört dir zu …`, t2: `${characterName} sluša te …` }

  const hint = micError ?? (mode === 'user' ? ZONE_HINT[zone] : mode === 'teacher' ? '🔊 Ton an' : '🎙 Mikro testen')
  const hintClass = micError ? 'vhint zone-loud' : mode === 'user' ? `vhint zone-${zone}` : 'vhint'

  return (
    <div className="voicebar" data-state={state}>
      <span className="vdot" />
      <div className={mode === 'user' ? 'wave live' : 'wave'}>
        {Array.from({ length: 9 }, (_, i) => (
          <i
            key={i}
            style={
              mode === 'user'
                ? { transform: `scaleY(${Math.max(0.2, levels[i] ?? 0)})` }
                : { animationDelay: `${i * 0.08}s`, animationDuration: `${0.7 + ((i * 7) % 5) / 10}s` }
            }
          />
        ))}
      </div>
      <span className="vlabel">
        <span className="lead">{label.lead}</span>
        <span className="t2">{label.t2}</span>
      </span>
      <span className={hintClass}>{hint}</span>
    </div>
  )
}
