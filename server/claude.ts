import './env.js';
import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';
// Budget-Regel: Chat-Antworten hart auf 1024 Output-Tokens begrenzen
export const MAX_TOKENS = 1024;
// Strukturierte JSON-Antworten (Wörterbuch!) brauchen mehr Luft: das Schema
// begrenzt den Inhalt ohnehin, aber ein bei 1024 abgeschnittenes JSON wäre
// Totalverlust (Input bezahlt, Nutzer bekommt nur einen Fehler).
export const MAX_TOKENS_JSON = 2000;

// ===== Einfache Tages-Ausgabenbremse (Kostenkontrolle, in-memory) =====
// Schützt das 30-CHF-Budget vor Retry-Schleifen, geleaktem Zugangscode oder
// Dauernutzung: Überschreitet die Tagessumme das Limit, pausieren die
// KI-Endpunkte freundlich bis zum nächsten Tag (UTC). Neustart setzt zurück —
// als grobe Bremse genau richtig, kein Abrechnungssystem.
const DAILY_TOKEN_LIMIT = Number(process.env.DAILY_TOKEN_LIMIT ?? 400_000);
let usageDay = '';
let usageTokens = 0;

export function recordUsage(inputTokens: number, outputTokens: number): void {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== usageDay) {
    usageDay = day;
    usageTokens = 0;
  }
  usageTokens += inputTokens + outputTokens;
}

export function overDailyBudget(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  return day === usageDay && usageTokens >= DAILY_TOKEN_LIMIT;
}

// Anhänge (M8): der aktuelle User-Turn darf Bild-/PDF-Blöcke enthalten.
// Ältere Verlaufs-Nachrichten werden client-seitig zu Text-Markern reduziert,
// damit ein Anhang nur EINMAL Input-Tokens kostet (Budget-Regel).
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

export type ChatMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

// Der Client wird beim ersten Request erstellt. Ein fehlender API-Key wirft hier
// NICHT — der Auth-Fehler entsteht erst beim Request und kommt über das
// 'error'-Event des Streams an.
let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic(); // liest ANTHROPIC_API_KEY
  }
  return client;
}

/**
 * Startet einen Claude-Stream für den Lehrer-Chat.
 * - Thinking ist bewusst AUS: auf Sonnet 5 wäre adaptives Thinking sonst per
 *   Default aktiv und würde das knappe 1024-Token-Budget unsichtbar aufzehren.
 * - Prompt Caching: Breakpoint auf dem System-Prompt und auf der letzten
 *   Nachricht — so wird der Verlauf bei jedem Turn aus dem Cache gelesen.
 */
/**
 * Einzelne strukturierte JSON-Antwort (Wörterbuch/Übungen).
 * output_config.format erzwingt das Schema — kein Prompt-Basteln, kein Parsen-Raten.
 */
export async function createJson(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
}): Promise<unknown> {
  const res = await getClient().messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS_JSON,
      thinking: { type: 'disabled' },
      system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: opts.user }],
      output_config: { format: { type: 'json_schema', schema: opts.schema } },
    },
    // Interaktive Suche: lieber nach 60 s freundlich scheitern als am
    // SDK-Default (10 min × 3 Versuche) hängen
    { timeout: 60_000, maxRetries: 1 },
  );
  const u = res.usage;
  recordUsage(u.input_tokens, u.output_tokens);
  console.log(
    `[json] stop=${res.stop_reason} · in=${u.input_tokens} out=${u.output_tokens} cacheRead=${u.cache_read_input_tokens ?? 0} cacheWrite=${u.cache_creation_input_tokens ?? 0}`,
  );
  if (res.stop_reason === 'refusal') throw new Error('Anfrage wurde abgelehnt (refusal)');
  if (res.stop_reason === 'max_tokens') throw new Error('Antwort am Token-Limit abgeschnitten');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Leere Antwort');
  return JSON.parse(text);
}

export function streamChat(opts: { system: string; messages: ChatMessage[] }) {
  // Cache-Breakpoint auf die LETZTE Nachricht OHNE Anhang setzen: ein Anhang-Turn
  // wird im Folge-Turn client-seitig durch einen Text-Marker ersetzt — ein
  // Breakpoint hinter den Bild-/PDF-Tokens würde also einen Cache-Eintrag
  // schreiben (1.25x-Aufpreis), den nie wieder jemand liest.
  const hasAttachment = (m: ChatMessage) =>
    typeof m.content !== 'string' && m.content.some((b) => b.type !== 'text');
  let bp = opts.messages.length - 1;
  while (bp >= 0 && hasAttachment(opts.messages[bp])) bp--;

  return getClient().messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'disabled' },
    system: [
      { type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } },
    ],
    messages: opts.messages.map((m, i) => {
      if (i !== bp) return { role: m.role, content: m.content };
      const blocks: Array<ContentBlock & { cache_control?: { type: 'ephemeral' } }> =
        typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : [...m.content];
      const tail = blocks[blocks.length - 1];
      blocks[blocks.length - 1] = { ...tail, cache_control: { type: 'ephemeral' as const } };
      return { role: m.role, content: blocks };
    }),
  });
}
