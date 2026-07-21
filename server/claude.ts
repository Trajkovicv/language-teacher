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
