import './env.js';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {
  CLAUDE_MODEL,
  createJson,
  createMemoryProfile,
  overDailyBudget,
  recordUsageFrom,
  streamChat,
  type ChatMessage,
  type ContentBlock,
} from './claude.js';
import { synthesize, ttsConfigured, type TtsGender, type TtsLang } from './tts.js';
import { createAccount, dbEnabled, getAccount, getAllState, putState, registeredLearners, upsertAccountPasscode } from './db.js';
import { hashPasscode, issueToken, verifyPasscode, verifyToken } from './auth.js';
import { mailConfigured, sendMail } from './mail.js';
import { buildAdminSummary, buildReminder } from './reminder.js';
import type { LearnerId } from './prompts.js';
import {
  dictionarySystemPrompt,
  exerciseSystemPrompt,
  isCharacterName,
  isLearnerId,
  languagePolicyInstruction,
  learnerInstruction,
  learnerMemoryLine,
  memorySystemPrompt,
  teacherSystemPrompt,
  type PrimaryLang,
} from './prompts.js';

const app = express();
// Hinter genau einem Reverse-Proxy (Render): sonst wäre req.ip für alle Nutzer
// die Proxy-Adresse und das Pro-IP-Rate-Limit ein globales Limit.
// Bewusst 1 statt true (true triggert die Permissiv-Warnung von express-rate-limit).
// NUR in Produktion: ohne Proxy davor (Dev/LAN) wäre X-Forwarded-For sonst frei
// fälschbar und das Pro-IP-Limit umgehbar.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// Body-Parser bewusst PRO ROUTE (nicht global) und erst NACH Limiter+Zugangscode:
// niemand soll ungeprüft Multi-MB-Bodies parsen lassen. Nur der Chat braucht
// die 10 MB (Foto-/PDF-Anhänge als Base64), alle anderen kommen mit KB aus.
const jsonBig = express.json({ limit: '10mb' });
const jsonSmall = express.json({ limit: '64kb' });

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
// Getrennter Einrichtungs-Code NUR fürs Anlegen/Zurücksetzen eines Passcodes.
// Ist er gesetzt, darf ausschließlich, wer ihn kennt (du + Andrijana), ein
// Passwort setzen — selbst mit dem App-Zugangscode geht es sonst nicht.
const REGISTER_CODE = process.env.REGISTER_CODE;
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

// Anmeldung/Registrierung: streng limitieren (Passcode-Brute-Force-Schutz),
// getrennt vom KI-Limit. Sync-Schreiben passiert häufiger → großzügiger.
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anmeldeversuche — bitte kurz warten.' },
});
const syncLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Sync-Anfragen — bitte kurz warten.' },
});

function parsePrimaryLang(value: unknown): PrimaryLang {
  return value === 'en' || value === 'sr' ? value : 'de';
}

// ===== Konten (Turso) — feste Profile Vuk/Andrijana mit Passcode =====
const MIN_PASSCODE = 4;
const MAX_PASSCODE = 64;
const MAX_STATE_VALUE = 60_000;
// Erlaubte KV-Schlüssel: Nutzungs-Statistik + Lern-Gedächtnis je Charakter.
const STATE_KEY_RE = /^(usage|memory:(mila|luka|ana))$/;

function parsePasscode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const p = value.trim();
  return p.length >= MIN_PASSCODE && p.length <= MAX_PASSCODE ? p : null;
}

function requireDb(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!dbEnabled()) {
    res.status(503).json({ error: 'Konten sind auf diesem Server nicht eingerichtet.' });
    return;
  }
  next();
}

// Sitzungs-Token aus dem Authorization-Header prüfen → req.learner
function requireAccount(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const learner = token ? verifyToken(token) : null;
  if (!learner) {
    res.status(401).json({ error: 'Bitte neu anmelden.' });
    return;
  }
  (req as express.Request & { learner?: string }).learner = learner;
  next();
}

// Tages-Ausgabenbremse (siehe claude.ts): freundlich pausieren statt Budget verbrennen
function requireDailyBudget(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (overDailyBudget()) {
    res.status(429).json({
      error: 'Das Tages-Kontingent ist aufgebraucht — morgen geht es weiter! (Schutz deines Kostenlimits)',
    });
    return;
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: CLAUDE_MODEL,
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    tts: ttsConfigured(),
    db: dbEnabled(),
    mail: mailConfigured(),
  });
});

// Eingabegrenzen (Kostenkontrolle: nie ungeprüft an die API durchreichen)
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 4000;
// Anhänge: Bilder werden client-seitig verkleinert (≤1024px JPEG); PDFs max. 4 MB.
// Base64 bläht ~4/3 auf — Grenzen in Base64-Zeichen.
const MAX_IMAGE_B64 = 3_000_000;
const MAX_PDF_B64 = 6_000_000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Ein Client-Anhang-Block {type, media_type, data} → Anthropic-ContentBlock.
 * Genau EIN Anhang pro Anfrage (Budget: Bilder/PDFs kosten deutlich Input-Tokens).
 */
function parseAttachment(entry: Record<string, unknown>): ContentBlock | null {
  const { type, media_type: mediaType, data } = entry;
  if (typeof data !== 'string' || data.length === 0 || !BASE64_RE.test(data)) return null;
  if (type === 'image') {
    if (!(IMAGE_TYPES as readonly string[]).includes(mediaType as string)) return null;
    if (data.length > MAX_IMAGE_B64) return null;
    return { type: 'image', source: { type: 'base64', media_type: mediaType as (typeof IMAGE_TYPES)[number], data } };
  }
  if (type === 'document') {
    if (mediaType !== 'application/pdf' || data.length > MAX_PDF_B64) return null;
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  return null;
}

function parseMessages(body: unknown): ChatMessage[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = (body as Record<string, unknown>).messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;

  let attachments = 0;
  const messages: ChatMessage[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { role, content } = entry as Record<string, unknown>;
    if (role !== 'user' && role !== 'assistant') return null;

    if (typeof content === 'string') {
      if (content.length === 0 || content.length > MAX_MESSAGE_CHARS) return null;
      messages.push({ role, content });
      continue;
    }

    // Block-Form: [Anhang][, Text] — nur im User-Turn erlaubt
    if (!Array.isArray(content) || content.length === 0 || content.length > 2 || role !== 'user') return null;
    const blocks: ContentBlock[] = [];
    for (const b of content) {
      if (typeof b !== 'object' || b === null) return null;
      const block = b as Record<string, unknown>;
      if (block.type === 'text') {
        if (typeof block.text !== 'string' || block.text.length === 0 || block.text.length > MAX_MESSAGE_CHARS)
          return null;
        blocks.push({ type: 'text', text: block.text });
      } else {
        const att = parseAttachment(block);
        if (!att) return null;
        if (++attachments > 1) return null;
        blocks.push(att);
      }
    }
    if (!blocks.some((b) => b.type !== 'text')) return null; // Block-Form nur mit Anhang sinnvoll
    messages.push({ role, content: blocks });
  }
  if (messages[0].role !== 'user') return null;
  return messages;
}

// Reihenfolge wichtig: Limiter zuerst (zählt auch falsche Zugangscodes —
// Brute-Force-Schutz), dann Zugangscode, dann erst der teure Body-Parser.
// Lern-Gedächtnis (Phase 2): kompaktes Profil kommt vom Client mit (dort
// persistiert — das Render-Free-Dateisystem ist flüchtig) und wird als eigener
// System-Block injiziert. Länge streng begrenzen: wandert in jeden Prompt.
const MAX_PROFILE_CHARS = 1600;
function parseProfile(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const p = value.trim();
  return p ? p.slice(0, MAX_PROFILE_CHARS) : undefined;
}

// Nutzungs-Zusammenfassung (Minuten/Sitzungen/…) vom Client — nur kurze Zahlen.
const MAX_USAGE_CHARS = 600;
function parseUsage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const p = value.trim();
  return p ? p.slice(0, MAX_USAGE_CHARS) : undefined;
}

app.post('/api/chat', apiLimiter, requireAccessCode, requireDailyBudget, jsonBig, (req, res) => {
  const messages = parseMessages(req.body);
  const character = isCharacterName(req.body?.character) ? req.body.character : 'Mila';
  const profile = parseProfile(req.body?.profile);
  const usage = parseUsage(req.body?.usage);
  const uiLang = parsePrimaryLang(req.body?.lang);
  const learner = isLearnerId(req.body?.learner) ? req.body.learner : undefined;
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
    stream = streamChat({
      system: teacherSystemPrompt(character, { serverTts: ttsConfigured() }),
      learnerInstruction: learner ? learnerInstruction(learner) : undefined,
      langInstruction: languagePolicyInstruction(uiLang),
      profile,
      usage,
      messages,
    });
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

  // Client hat Tab geschlossen / Anfrage abgebrochen → Claude-Stream stoppen
  // (Kostenkontrolle). WICHTIG: auf der ANTWORT lauschen, nicht auf req —
  // req emittiert 'close' schon, sobald der Body fertig gelesen ist (und das
  // passiert seit dem Umzug des JSON-Parsers in die Routen-Kette NACH der
  // Registrierung des Listeners → der Stream würde sofort abgebrochen).
  res.on('close', () => {
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
    recordUsageFrom(u);
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

// ============ Lern-Gedächtnis (Phase 2) ============

// Nimmt die jüngsten Nachrichten + bisheriges Profil, gibt das fortgeschriebene
// Profil zurück (claude-haiku, Centbeträge). Persistiert wird CLIENT-seitig.
const MEMORY_MAX_MESSAGES = 20;
const MEMORY_MSG_CHARS = 2200;

app.post('/api/memory', apiLimiter, requireAccessCode, requireDailyBudget, jsonSmall, async (req, res) => {
  const character = isCharacterName(req.body?.character) ? req.body.character : 'Mila';
  const learner = isLearnerId(req.body?.learner) ? req.body.learner : undefined;
  const oldProfile = parseProfile(req.body?.profile);
  const raw = req.body?.messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MEMORY_MAX_MESSAGES) {
    res.status(400).json({ error: 'Ungültige Anfrage: Nachrichtenliste fehlt oder ist zu lang.' });
    return;
  }
  const lines: string[] = [];
  for (const entry of raw) {
    const { role, content } = (entry ?? {}) as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Ungültige Anfrage: Nachricht hat ein falsches Format.' });
      return;
    }
    lines.push(`${role === 'user' ? 'SCHÜLER' : character.toUpperCase()}: ${content.slice(0, MEMORY_MSG_CHARS)}`);
  }
  try {
    const profil = await createMemoryProfile({
      system: memorySystemPrompt(character, learner ? learnerMemoryLine(learner) : undefined),
      user:
        `BISHERIGES PROFIL:\n${oldProfile ?? '(noch keins — erste Sitzung)'}\n\n` +
        `JÜNGSTE NACHRICHTEN:\n${lines.join('\n')}`,
    });
    res.json({ profile: profil });
  } catch (err) {
    console.error('[memory] Fehler:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Zusammenfassung gerade nicht möglich.' });
  }
});

// ============ Konten & Geräte-Sync (Turso) ============

// Welche Profile haben schon einen Passcode? Der Login-Screen zeigt danach
// „Passcode setzen" (neu) vs. „Passcode eingeben" (vorhanden).
app.get('/api/account/status', requireAccessCode, async (_req, res) => {
  if (!dbEnabled()) {
    res.json({ enabled: false, registered: [] });
    return;
  }
  try {
    res.json({ enabled: true, registered: await registeredLearners() });
  } catch (err) {
    console.error('[account] status:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Konten gerade nicht erreichbar.' });
  }
});

// Erstregistrierung eines Profils (setzt den Passcode). 409, wenn schon vergeben.
app.post('/api/register', authLimiter, requireAccessCode, requireDb, jsonSmall, async (req, res) => {
  const learner = isLearnerId(req.body?.learner) ? req.body.learner : null;
  const passcode = parsePasscode(req.body?.passcode);
  if (!learner || !passcode) {
    res.status(400).json({ error: `Profil wählen und einen Passcode mit ${MIN_PASSCODE}–${MAX_PASSCODE} Zeichen setzen.` });
    return;
  }

  // Ist der Einrichtungs-Code gesetzt, ist er PFLICHT — nur Kontoinhaber (du +
  // Andrijana) dürfen ein Passwort setzen/zurücksetzen. Mit gültigem Code ist
  // auch ein Reset erlaubt (Upsert), ohne einen offenen Reset-Endpunkt.
  if (REGISTER_CODE) {
    if (req.get('X-Register-Code') !== REGISTER_CODE) {
      res.status(403).json({ error: 'Einrichtungs-Code fehlt oder ist falsch. Nur die Kontoinhaber dürfen ein Passwort setzen.' });
      return;
    }
    try {
      await upsertAccountPasscode(learner, hashPasscode(passcode), new Date().toISOString());
      res.json({ token: issueToken(learner), learner });
    } catch (err) {
      console.error('[account] register(code):', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Registrierung gerade nicht möglich.' });
    }
    return;
  }

  // Ohne Einrichtungs-Code: nur Erstanlage (bestehendes Profil ist gesperrt).
  try {
    if (await getAccount(learner)) {
      res.status(409).json({ error: 'Für dieses Profil gibt es schon einen Passcode. Bitte anmelden.' });
      return;
    }
    await createAccount(learner, hashPasscode(passcode), new Date().toISOString());
    res.json({ token: issueToken(learner), learner });
  } catch (err) {
    console.error('[account] register:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Registrierung gerade nicht möglich.' });
  }
});

// Anmeldung mit vorhandenem Passcode.
app.post('/api/login', authLimiter, requireAccessCode, requireDb, jsonSmall, async (req, res) => {
  const learner = isLearnerId(req.body?.learner) ? req.body.learner : null;
  const passcode = parsePasscode(req.body?.passcode);
  if (!learner || !passcode) {
    res.status(400).json({ error: 'Profil und Passcode eingeben.' });
    return;
  }
  try {
    const account = await getAccount(learner);
    // Gleiche Antwort für „kein Konto" und „falscher Passcode" (kein Nutzer-Enum)
    if (!account || !verifyPasscode(passcode, account.passcode_hash)) {
      res.status(401).json({ error: 'Passcode stimmt nicht.' });
      return;
    }
    res.json({ token: issueToken(learner), learner });
  } catch (err) {
    console.error('[account] login:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Anmeldung gerade nicht möglich.' });
  }
});

// Gesamten Konto-Stand laden (Gedächtnis + Nutzung) — nach der Anmeldung.
app.get('/api/state', syncLimiter, requireAccessCode, requireDb, requireAccount, async (req, res) => {
  const learner = (req as express.Request & { learner: string }).learner;
  try {
    res.json({ state: await getAllState(learner) });
  } catch (err) {
    console.error('[state] get:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Stand gerade nicht ladbar.' });
  }
});

// Einen KV-Eintrag durchschreiben (Write-Through vom Client).
app.put('/api/state', syncLimiter, requireAccessCode, requireDb, requireAccount, jsonSmall, async (req, res) => {
  const learner = (req as express.Request & { learner: string }).learner;
  const key = typeof req.body?.key === 'string' ? req.body.key : '';
  const value = typeof req.body?.value === 'string' ? req.body.value : '';
  if (!STATE_KEY_RE.test(key) || value.length > MAX_STATE_VALUE) {
    res.status(400).json({ error: 'Ungültiger Sync-Eintrag.' });
    return;
  }
  try {
    await putState(learner, key, value, new Date().toISOString());
    res.json({ ok: true });
  } catch (err) {
    console.error('[state] put:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Sync gerade nicht möglich.' });
  }
});

// ============ Tägliche Lern-Erinnerung (E-Mail) ============
// Wird von einem externen Cron (GitHub Actions) täglich aufgerufen. Schutz per
// Secret-Header (NICHT ACCESS_CODE — der Cron kennt ihn nicht). Empfänger je
// Lernprofil aus der Umgebung; fehlt einer, wird er übersprungen.
const reminderLimiter = rateLimit({
  windowMs: 60_000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen.' },
});

const REMINDER_RECIPIENTS: Record<LearnerId, string | undefined> = {
  andrijana: process.env.REMINDER_ANDRIJANA_EMAIL,
  vuk: process.env.REMINDER_VUK_EMAIL,
};

app.post('/api/reminder/run', reminderLimiter, jsonSmall, async (req, res) => {
  const secret = process.env.REMINDER_SECRET;
  if (!secret || req.get('X-Reminder-Secret') !== secret) {
    res.status(401).json({ error: 'Nicht autorisiert.' });
    return;
  }
  if (!dbEnabled() || !mailConfigured()) {
    res.status(503).json({ error: 'E-Mail-Erinnerung ist nicht eingerichtet (DB oder SMTP fehlt).' });
    return;
  }

  // Admin-Modus: Wochen-Überblick an dich (REMINDER_ADMIN_EMAIL).
  if (req.body?.mode === 'admin') {
    const to = process.env.REMINDER_ADMIN_EMAIL;
    if (!to) {
      res.json({ ok: true, results: [{ status: 'übersprungen (keine Admin-Adresse)' }] });
      return;
    }
    try {
      const mail = await buildAdminSummary();
      await sendMail(to, mail.subject, mail.text, mail.html);
      res.json({ ok: true, results: [{ mode: 'admin', status: 'gesendet', to }] });
    } catch (err) {
      console.error('[reminder] admin:', err instanceof Error ? err.message : err);
      res.status(200).json({ ok: false, results: [{ mode: 'admin', status: 'Fehler', error: err instanceof Error ? err.message : String(err) }] });
    }
    return;
  }

  const only = isLearnerId(req.body?.learner) ? [req.body.learner as LearnerId] : (['andrijana', 'vuk'] as LearnerId[]);
  const results: Array<Record<string, string>> = [];
  for (const learner of only) {
    const to = REMINDER_RECIPIENTS[learner];
    if (!to) {
      results.push({ learner, status: 'übersprungen (keine Adresse)' });
      continue;
    }
    try {
      const mail = await buildReminder(learner);
      await sendMail(to, mail.subject, mail.text, mail.html);
      results.push({ learner, status: 'gesendet', to });
    } catch (err) {
      console.error(`[reminder] ${learner}:`, err instanceof Error ? err.message : err);
      results.push({ learner, status: 'Fehler', error: err instanceof Error ? err.message : String(err) });
    }
  }
  res.json({ ok: true, results });
});

// ============ Sprachausgabe (Azure TTS, Phase 3b vorgezogen) ============

// Eigenes Limit statt apiLimiter: Tipp-zum-Anhören darf das Chat-Kontingent
// nicht aufbrauchen; Azure F0 ist gratis (500k Zeichen/Monat), Cache in tts.ts.
const ttsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Hör-Anfragen — bitte kurz warten.' },
});

const MAX_TTS_CHARS = 2000;

app.post('/api/tts', ttsLimiter, requireAccessCode, jsonSmall, async (req, res) => {
  if (!ttsConfigured()) {
    // Client fällt dann auf die Browser-Stimmen zurück
    res.status(503).json({ error: 'Server-Stimmen sind nicht eingerichtet.' });
    return;
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const lang: TtsLang = req.body?.lang === 'en' || req.body?.lang === 'sr' ? req.body.lang : 'de';
  const gender: TtsGender = req.body?.gender === 'male' ? 'male' : 'female';
  if (!text || text.length > MAX_TTS_CHARS) {
    res.status(400).json({ error: `Text fehlt oder ist länger als ${MAX_TTS_CHARS} Zeichen.` });
    return;
  }
  try {
    const audio = await synthesize(text, lang, gender);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (err) {
    console.error('[tts] Fehler:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Die Stimme macht kurz Pause… Versuch es gleich noch einmal.' });
  }
});

// ============ Wörterbuch (M4) ============

const DICTIONARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'phonetic', 'cyrillic', 'partOfSpeech', 'meaning', 'synonyms', 'usageNote', 'examples', 'forms'],
  properties: {
    word: { type: 'string' },
    phonetic: { type: 'string' },
    // Nur für serbische Wörter gefüllt; sonst leerer String (Client blendet es aus).
    cyrillic: { type: 'string' },
    partOfSpeech: { type: 'string' },
    meaning: { type: 'string' },
    synonyms: { type: 'array', items: { type: 'string' } },
    usageNote: { type: 'string' },
    // source = Satz in der Nachschlage-Sprache, target = Übersetzung in der Erklärsprache
    examples: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'target', 'note'],
        properties: { source: { type: 'string' }, target: { type: 'string' }, note: { type: 'string' } },
      },
    },
    // Generische Formen-/Grammatiktabelle (Deklination, Konjugation, Plural …); leer, wenn unveränderlich
    forms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'form', 'example'],
        properties: { label: { type: 'string' }, form: { type: 'string' }, example: { type: 'string' } },
      },
    },
  },
} as const;

app.post('/api/dictionary', apiLimiter, requireAccessCode, requireDailyBudget, jsonSmall, async (req, res) => {
  const word = typeof req.body?.word === 'string' ? req.body.word.trim() : '';
  // Sprachpaar (Profil-abhängig): sourceLang = nachgeschlagene Sprache, explainLang = Erklärsprache.
  // Fallback auf die alte Serbisch→Deutsch-Semantik, falls Felder fehlen.
  const sourceLang = parsePrimaryLang(req.body?.sourceLang ?? 'sr');
  const explainLang = parsePrimaryLang(req.body?.explainLang ?? req.body?.primaryLang);
  if (!word || word.length > 60) {
    res.status(400).json({ error: 'Bitte ein Suchwort mit höchstens 60 Zeichen eingeben.' });
    return;
  }
  try {
    const entry = await createJson({
      system: dictionarySystemPrompt(sourceLang, explainLang),
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
function allUniqueAndNonEmpty(items: string[]): boolean {
  return new Set(items).size === items.length && items.every((s) => s.trim().length > 0);
}

function validateExercise(raw: unknown): Exercise | null {
  const ex = raw as Exercise;
  if (!ex.question?.trim() || !ex.feedbackCorrect?.trim() || !ex.feedbackWrong?.trim()) return null;
  if (ex.type === 'mc') {
    if (ex.options.length < 2 || ex.options.length > 5) return null;
    // Duplikate wären per Index-Vergleich im Client unfair bewertbar
    if (!allUniqueAndNonEmpty(ex.options)) return null;
    if (!Number.isInteger(ex.correctIndex) || ex.correctIndex < 0 || ex.correctIndex >= ex.options.length) return null;
    return ex;
  }
  if (ex.type === 'blank') {
    if (ex.bank.length < 2 || ex.bank.length > 6) return null;
    if (!allUniqueAndNonEmpty(ex.bank)) return null;
    if (!ex.bank.includes(ex.correctWord)) return null;
    if (!ex.question.includes('___')) return null;
    return ex;
  }
  return null;
}

app.post('/api/exercise', apiLimiter, requireAccessCode, requireDailyBudget, jsonSmall, async (req, res) => {
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
