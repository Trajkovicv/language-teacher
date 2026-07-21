import './env.js';

/**
 * Azure AI Speech TTS als Server-Proxy (Phase 3b, vorgezogen wegen Mobil-Audio).
 * Warum Server-seitig: Der Client spielt die Antwort über ein <audio>-Element ab —
 * das routet zuverlässig zu Bluetooth-Kopfhörern und funktioniert auch in der
 * iOS-PWA, wo window.speechSynthesis notorisch unzuverlässig ist. Außerdem gibt
 * es echte serbische Stimmen (Latinica UND Ćirilica), die Browser nicht haben.
 *
 * Kostenlos: F0-Tarif = 500'000 Zeichen/Monat dauerhaft gratis (docs/recherche.md §5).
 * Ohne AZURE_SPEECH_KEY/REGION bleibt der Endpunkt aus und der Client nutzt
 * weiterhin die Browser-Stimmen (Fallback).
 */

export type TtsLang = 'de' | 'en' | 'sr';
export type TtsGender = 'female' | 'male';
export type TtsSpeed = 1 | 1.5 | 2;

const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION; // z. B. "westeurope"

export function ttsConfigured(): boolean {
  return Boolean(AZURE_KEY && AZURE_REGION);
}

// Stimmen: weiblich für Mila/Ana, männlich für Luka. Serbisch je nach Schrift.
const VOICES: Record<'de' | 'en' | 'srLatn' | 'srCyrl', Record<TtsGender, string>> = {
  de: { female: 'de-DE-KatjaNeural', male: 'de-DE-ConradNeural' },
  en: { female: 'en-US-JennyNeural', male: 'en-US-GuyNeural' },
  srLatn: { female: 'sr-Latn-RS-SophieNeural', male: 'sr-Latn-RS-NicholasNeural' },
  srCyrl: { female: 'sr-RS-SophieNeural', male: 'sr-RS-NicholasNeural' },
};

function pickVoice(text: string, lang: TtsLang, gender: TtsGender): string {
  if (lang === 'sr') {
    const cyrillic = /[Ѐ-ӿ]/.test(text);
    return VOICES[cyrillic ? 'srCyrl' : 'srLatn'][gender];
  }
  return VOICES[lang][gender];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Wiederholtes Anhören (Tipp-zum-Anhören!) soll das Gratis-Kontingent nicht
// mehrfach kosten: kleiner In-Memory-LRU-Cache. Neben der Eintragszahl ist
// auch die Byte-Summe gedeckelt — 2000-Zeichen-Texte ergeben ~1 MB MP3, und
// der Render-Free-Container hat nur 512 MB RAM.
const cache = new Map<string, Buffer>();
const CACHE_MAX_ENTRIES = 150;
const CACHE_MAX_BYTES = 24 * 1024 * 1024;
let cacheBytes = 0;

function cacheGet(key: string): Buffer | undefined {
  const hit = cache.get(key);
  if (hit) {
    // LRU: Treffer nach hinten schieben, damit häufig Gehörtes drinbleibt
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, buf: Buffer): void {
  cache.set(key, buf);
  cacheBytes += buf.length;
  while (cache.size > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cacheBytes -= cache.get(oldest)?.length ?? 0;
    cache.delete(oldest);
  }
}

export async function synthesize(text: string, lang: TtsLang, gender: TtsGender, speed: TtsSpeed = 1): Promise<Buffer> {
  if (!ttsConfigured()) throw new Error('TTS nicht konfiguriert');

  const voice = pickVoice(text, lang, gender);
  const key = `${voice}|${speed}|${text}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const locale = voice.split('-').slice(0, -1).join('-');
  // Grundtempo leicht gedrosselt (Unterricht) × Nutzer-Tempo 1/1.5/2:
  // 1 → -8 %, 1.5 → +38 %, 2 → +84 % (SSML-prosody, relativ zur Normalrate)
  const percent = Math.round(92 * speed) - 100;
  const rate = `${percent >= 0 ? '+' : ''}${percent}%`;
  const ssml =
    `<speak version='1.0' xml:lang='${locale}'>` +
    `<voice name='${voice}'><prosody rate='${rate}'>${escapeXml(text)}</prosody></voice></speak>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY as string,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'language-teacher-app',
      },
      body: ssml,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Azure TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('Azure TTS: leere Audio-Antwort');
    cacheSet(key, buf);
    return buf;
  } finally {
    clearTimeout(timeout);
  }
}
