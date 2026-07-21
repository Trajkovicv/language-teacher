import './env.js';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { CLAUDE_MODEL, createJson, streamChat, type ChatMessage } from './claude.js';
import {
  dictionarySystemPrompt,
  exerciseSystemPrompt,
  isCharacterName,
  teacherSystemPrompt,
  type PrimaryLang,
} from './prompts.js';

const app = express();
// Hinter genau einem Reverse-Proxy (Render): sonst wäre req.ip für alle Nutzer
// die Proxy-Adresse und das Pro-IP-Rate-Limit ein globales Limit.
// Bewusst 1 statt true (true triggert die Permissiv-Warnung von express-rate-limit).
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// Zusätzliche erlaubte Origins fürs Hosting (z. B. https://<name>.github.io), kommagetrennt
const extraOrigins = (process.env.CLIENT_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173', ...extraOrigins] }));

// Dev: bewusst SERVER_PORT statt PORT (Dev-Launcher injizieren PORT teils mit dem
// Client-Port). Produktion (z. B. Render): der Host gibt den Port über PORT vor.
const PORT = Number(
  process.env.SERVER_PORT ?? (process.env.NODE_ENV === 'production' ? process.env.PORT : undefined) ?? 3001,
);

// Optionaler Schutz der öffentlichen Instanz: Ist ACCESS_CODE gesetzt, brauchen
// API-Anfragen (außer /api/health) den passenden X-Access-Code-Header.
const ACCESS_CODE = process.env.ACCESS_CODE;
function requireAccessCode(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!ACCESS_CODE || req.get('X-Access-Code') === ACCESS_CODE) {
    next();
    return;
  }
  res.status(401).json({ error: 'Zugangscode fehlt oder ist falsch.' });
}

// Kostenkontrolle: pro IP höchstens 20 KI-Anfragen pro Minute (Chat + Wörterbuch + Übungen gemeinsam)
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen — bitte kurz warten und dann erneut senden.' },
});

function parsePrimaryLang(value: unknown): PrimaryLang {
  return value === 'en' || value === 'sr' ? value : 'de';
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: CLAUDE_MODEL,
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

// Eingabegrenzen (Kostenkontrolle: nie ungeprüft an die API durchreichen)
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 4000;

function parseMessages(body: unknown): ChatMessage[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = (body as Record<string, unknown>).messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;

  const messages: ChatMessage[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { role, content } = entry as Record<string, unknown>;
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string' || content.length === 0 || content.length > MAX_MESSAGE_CHARS) return null;
    messages.push({ role, content });
  }
  if (messages[0].role !== 'user') return null;
  return messages;
}

app.post('/api/chat', requireAccessCode, apiLimiter, (req, res) => {
  const messages = parseMessages(req.body);
  const character = isCharacterName(req.body?.character) ? req.body.character : 'Mila';
  const pauseMessage = `${character} macht kurz Pause… Versuch es gleich noch einmal.`;

  if (!messages) {
    res.status(400).json({ error: 'Ungültige Anfrage: Verlauf fehlt, ist zu lang oder enthält zu lange Nachrichten.' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (payload: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const finish = () => {
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  };

  // Fast-Fail: ohne Key würde der Fehler erst asynchron aus dem Stream kommen
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[chat] ANTHROPIC_API_KEY fehlt — .env anlegen (siehe README)');
    send({ type: 'error', message: pauseMessage });
    finish();
    return;
  }

  let stream: ReturnType<typeof streamChat>;
  try {
    stream = streamChat({ system: teacherSystemPrompt(character), messages });
  } catch (err) {
    // Unerwarteter synchroner Fehler beim Aufbau (Auth-Fehler kämen asynchron über 'error')
    console.error('[chat] Start fehlgeschlagen:', err instanceof Error ? err.message : err);
    send({ type: 'error', message: pauseMessage });
    finish();
    return;
  }

  // Beobachtet den Stream zusätzlich als Promise — verhindert, dass eine
  // Event-Lücke jemals als unhandled rejection den Prozess beendet.
  stream.done().catch(() => {});

  // Client hat Tab geschlossen / Anfrage abgebrochen → Claude-Stream stoppen (Kostenkontrolle)
  req.on('close', () => {
    if (!res.writableEnded) stream.abort();
  });

  // WICHTIG: abort() feuert im SDK das 'abort'-Event (nicht 'error').
  // Ohne diesen Listener erzeugt das SDK absichtlich eine unhandled rejection,
  // die den ganzen Server-Prozess beenden würde.
  stream.on('abort', () => {
    if (!res.writableEnded) res.end();
  });

  stream.on('text', (text) => send({ type: 'text', text }));

  stream.on('message', (message) => {
    const u = message.usage;
    console.log(
      `[chat] ${character} · stop=${message.stop_reason} · in=${u.input_tokens} out=${u.output_tokens} cacheRead=${u.cache_read_input_tokens ?? 0} cacheWrite=${u.cache_creation_input_tokens ?? 0}`,
    );
    if (message.stop_reason === 'refusal') {
      send({ type: 'error', message: pauseMessage });
    } else if (message.stop_reason === 'max_tokens') {
      // Token-Budget erreicht — Client soll die Kürzung sichtbar machen
      send({ type: 'truncated' });
    }
  });

  stream.on('error', (err) => {
    console.error('[chat] Stream-Fehler:', err instanceof Error ? err.message : err);
    send({ type: 'error', message: pauseMessage });
    finish();
  });

  stream.on('end', finish);
});

// ============ Wörterbuch (M4) ============

const DICTIONARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'phonetic', 'cyrillic', 'partOfSpeech', 'meaning', 'synonyms', 'usageNote', 'examples', 'declension'],
  properties: {
    word: { type: 'string' },
    phonetic: { type: 'string' },
    cyrillic: { type: 'string' },
    partOfSpeech: { type: 'string' },
    meaning: { type: 'string' },
    synonyms: { type: 'array', items: { type: 'string' } },
    usageNote: { type: 'string' },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sr', 'de', 'note'],
        properties: { sr: { type: 'string' }, de: { type: 'string' }, note: { type: 'string' } },
      },
    },
    declension: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['case', 'form', 'example'],
        properties: { case: { type: 'string' }, form: { type: 'string' }, example: { type: 'string' } },
      },
    },
  },
} as const;

app.post('/api/dictionary', requireAccessCode, apiLimiter, async (req, res) => {
  const word = typeof req.body?.word === 'string' ? req.body.word.trim() : '';
  const primaryLang = parsePrimaryLang(req.body?.primaryLang);
  if (!word || word.length > 60) {
    res.status(400).json({ error: 'Bitte ein Suchwort mit höchstens 60 Zeichen eingeben.' });
    return;
  }
  try {
    const entry = await createJson({
      system: dictionarySystemPrompt(primaryLang),
      user: `Suchwort: ${word}`,
      schema: DICTIONARY_SCHEMA as unknown as Record<string, unknown>,
    });
    res.json(entry);
  } catch (err) {
    console.error('[dictionary] Fehler:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Das Wörterbuch macht kurz Pause… Versuch es gleich noch einmal.' });
  }
});

// ============ Übungen (M5) ============

const EXERCISE_SCHEMA = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'question', 'options', 'correctIndex', 'feedbackCorrect', 'feedbackWrong'],
      properties: {
        type: { const: 'mc' },
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        correctIndex: { type: 'integer' },
        feedbackCorrect: { type: 'string' },
        feedbackWrong: { type: 'string' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'question', 'bank', 'correctWord', 'feedbackCorrect', 'feedbackWrong'],
      properties: {
        type: { const: 'blank' },
        question: { type: 'string' },
        bank: { type: 'array', items: { type: 'string' } },
        correctWord: { type: 'string' },
        feedbackCorrect: { type: 'string' },
        feedbackWrong: { type: 'string' },
      },
    },
  ],
} as const;

type Exercise =
  | { type: 'mc'; question: string; options: string[]; correctIndex: number; feedbackCorrect: string; feedbackWrong: string }
  | { type: 'blank'; question: string; bank: string[]; correctWord: string; feedbackCorrect: string; feedbackWrong: string };

/** Schema garantiert die Form — hier nur noch die inhaltliche Konsistenz prüfen. */
function validateExercise(raw: unknown): Exercise | null {
  const ex = raw as Exercise;
  if (ex.type === 'mc') {
    if (ex.options.length < 2 || ex.options.length > 5) return null;
    if (!Number.isInteger(ex.correctIndex) || ex.correctIndex < 0 || ex.correctIndex >= ex.options.length) return null;
    return ex;
  }
  if (ex.type === 'blank') {
    if (ex.bank.length < 2 || ex.bank.length > 6) return null;
    if (!ex.bank.includes(ex.correctWord)) return null;
    if (!ex.question.includes('___')) return null;
    return ex;
  }
  return null;
}

app.post('/api/exercise', requireAccessCode, apiLimiter, async (req, res) => {
  const type = req.body?.type === 'blank' ? 'blank' : 'mc';
  const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim().slice(0, 200) : '';
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 200) : '';
  const primaryLang = parsePrimaryLang(req.body?.primaryLang);

  const wish = prompt || topic || 'Alltags-Grundwortschatz für Anfänger';
  try {
    const raw = await createJson({
      system: exerciseSystemPrompt(primaryLang),
      user: `Übungstyp: ${type}\nThema/Wunsch: ${wish}`,
      schema: EXERCISE_SCHEMA as unknown as Record<string, unknown>,
    });
    const exercise = validateExercise(raw);
    if (!exercise || exercise.type !== type) {
      console.error('[exercise] inkonsistente Modell-Antwort:', JSON.stringify(raw).slice(0, 300));
      res.status(502).json({ error: 'Die Übung ist nicht geglückt… Versuch es gleich noch einmal.' });
      return;
    }
    res.json(exercise);
  } catch (err) {
    console.error('[exercise] Fehler:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Die Übung ist nicht geglückt… Versuch es gleich noch einmal.' });
  }
});

app.listen(PORT, () => {
  console.log(`[server] läuft auf http://localhost:${PORT} (Modell: ${CLAUDE_MODEL})`);
});
