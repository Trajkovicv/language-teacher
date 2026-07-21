import { useEffect, useRef, useState } from 'react'

export type MicZone = 'quiet' | 'good' | 'loud'

const BAR_COUNT = 9

/**
 * Echter Mikrofonpegel für die Voice-Bar (Phase-1-Mikrofontest):
 * getUserMedia + Web-Audio-AnalyserNode. Liefert 9 Balken-Pegel (0..1)
 * fürs Wellen-Display und eine Zonen-Einstufung (zu leise / gut / übersteuert).
 */
export function useMicLevels() {
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0))
  const [zone, setZone] = useState<MicZone>('quiet')

  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)

  async function start() {
    if (active) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.55
      source.connect(analyser)

      streamRef.current = stream
      ctxRef.current = ctx

      const freq = new Uint8Array(analyser.frequencyBinCount)
      const time = new Uint8Array(analyser.fftSize)

      const tick = () => {
        analyser.getByteFrequencyData(freq)
        // Sprachrelevante untere Bins auf 9 Balken verteilen
        const usable = Math.floor(freq.length * 0.6)
        const group = Math.max(1, Math.floor(usable / BAR_COUNT))
        const bars: number[] = []
        for (let b = 0; b < BAR_COUNT; b++) {
          let sum = 0
          for (let i = 0; i < group; i++) sum += freq[b * group + i] ?? 0
          bars.push(Math.min(1, sum / group / 255 * 1.6))
        }
        setLevels(bars)

        // Lautstärke-Zone über RMS des Zeitsignals
        analyser.getByteTimeDomainData(time)
        let acc = 0
        for (let i = 0; i < time.length; i++) {
          const v = (time[i] - 128) / 128
          acc += v * v
        }
        const rms = Math.sqrt(acc / time.length)
        setZone(rms < 0.02 ? 'quiet' : rms > 0.25 ? 'loud' : 'good')

        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
      setActive(true)
    } catch {
      setError('Mikrofon nicht verfügbar — bitte Berechtigung im Browser erlauben.')
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    void ctxRef.current?.close().catch(() => {})
    streamRef.current = null
    ctxRef.current = null
    setActive(false)
    setLevels(Array(BAR_COUNT).fill(0))
    setZone('quiet')
  }

  function toggle() {
    if (active) stop()
    else void start()
  }

  // Beim Verlassen der App Mikro sicher freigeben
  useEffect(() => stop, [])

  return { active, error, levels, zone, toggle }
}
