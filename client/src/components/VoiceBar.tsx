import type { MicZone } from '../lib/mic'

type Props = {
  characterName: string
  mode: 'teacher' | 'user' | 'idle'
  levels: number[]
  zone: MicZone
  micError: string | null
  listening: boolean
  interim: string
  voiceEnabled: boolean
  voiceSupported: boolean
  onVoiceToggle: () => void
}

const ZONE_HINT: Record<MicZone, string> = {
  quiet: '🎙 Zu leise · Pretiho',
  good: '🎙 Gut · Dobro',
  loud: '🎙 Übersteuert · Preglasno',
}

// Dezente Voice-Bar aus dem Mockup. Koralle = Lehrer:in spricht (Streaming/Stimme),
// Grün = Nutzer spricht (echter Mikrofonpegel + Spracherkennung).
export default function VoiceBar({
  characterName,
  mode,
  levels,
  zone,
  micError,
  listening,
  interim,
  voiceEnabled,
  voiceSupported,
  onVoiceToggle,
}: Props) {
  const state = mode === 'user' ? 'user' : mode === 'teacher' ? 'mila' : 'idle'

  const label =
    mode === 'user'
      ? listening && interim
        ? { lead: `»${interim}«`, t2: 'Du sprichst … · Ti govoriš …' }
        : { lead: 'Du sprichst …', t2: 'Ti govoriš …' }
      : mode === 'teacher'
        ? { lead: `${characterName} spricht …`, t2: `${characterName} govori …` }
        : { lead: `${characterName} hört dir zu …`, t2: `${characterName} sluša te …` }

  const hint =
    micError ??
    (listening
      ? '🎙 Sprich jetzt … · Govori sada'
      : mode === 'user'
        ? ZONE_HINT[zone]
        : voiceEnabled
          ? '🔊 Ton an'
          : '🔇 Ton aus')
  const hintClass = micError ? 'vhint zone-loud' : mode === 'user' ? `vhint zone-${listening ? 'good' : zone}` : 'vhint'

  // Echte Pegel-Balken nur im reinen Mikrofontest; während der Spracherkennung
  // (die das Mikro exklusiv hält) animierte Balken
  const liveBars = mode === 'user' && !listening

  return (
    <div className="voicebar" data-state={state}>
      <span className="vdot" />
      <div className={liveBars ? 'wave live' : 'wave'}>
        {Array.from({ length: 9 }, (_, i) => (
          <i
            key={i}
            style={
              liveBars
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
      {mode === 'user' || micError ? (
        <span className={hintClass}>{hint}</span>
      ) : (
        <button
          type="button"
          className={`${hintClass} vhint-btn`}
          onClick={onVoiceToggle}
          disabled={!voiceSupported}
          title={voiceSupported ? 'Stimme an/aus · Zvuk' : 'Keine Browser-Stimme verfügbar'}
        >
          {voiceSupported ? hint : '🔇 Keine Stimme'}
        </button>
      )}
    </div>
  )
}
