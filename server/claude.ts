import './env.js';
import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';
// Budget-Regel: Antworten hart auf 1024 Output-Tokens begrenzen
export const MAX_TOKENS = 1024;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

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
      max_tokens: MAX_TOKENS,
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
  const last = opts.messages.length - 1;
  return getClient().messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'disabled' },
    system: [
      { type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } },
    ],
    messages: opts.messages.map((m, i) =>
      i === last
        ? {
            role: m.role,
            content: [
              { type: 'text' as const, text: m.content, cache_control: { type: 'ephemeral' as const } },
            ],
          }
        : { role: m.role, content: m.content },
    ),
  });
}
