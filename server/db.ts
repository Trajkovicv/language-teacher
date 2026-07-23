import './env.js';
import { createClient, type Client } from '@libsql/client';

// ===== Turso / libSQL: echte Konten mit Geräte-Sync =====
// Quelle der Wahrheit für Lern-Gedächtnis + Nutzungs-Statistik pro Konto.
// Lokal (Dev) fällt die URL auf eine SQLite-Datei zurück, damit die Konten-
// Logik ohne Turso-Konto testbar ist. In Produktion (Render) MUSS
// TURSO_DATABASE_URL gesetzt sein — sonst bleiben die Konten deaktiviert
// (die App läuft dann wie bisher rein lokal weiter), denn das Render-
// Dateisystem ist flüchtig und eine Datei-DB wäre nach jedem Neustart leer.

const isProd = process.env.NODE_ENV === 'production';
const DB_URL = process.env.TURSO_DATABASE_URL ?? (isProd ? '' : 'file:local-accounts.db');
const DB_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

/** Sind Konten aktiv? (URL vorhanden.) Steuert /api/health → `db` und die Routen. */
export function dbEnabled(): boolean {
  return Boolean(DB_URL);
}

let client: Client | null = null;
let ready: Promise<void> | null = null;

function getClient(): Client {
  if (!client) {
    if (!DB_URL) throw new Error('DB nicht konfiguriert (TURSO_DATABASE_URL fehlt).');
    client = createClient({ url: DB_URL, authToken: DB_AUTH_TOKEN });
  }
  return client;
}

/** Schema einmalig anlegen (idempotent). Wird vor jedem DB-Zugriff abgewartet. */
function ensureSchema(): Promise<void> {
  if (!ready) {
    const db = getClient();
    ready = (async () => {
      await db.execute(
        `CREATE TABLE IF NOT EXISTS accounts (
           learner       TEXT PRIMARY KEY,
           passcode_hash TEXT NOT NULL,
           created_at    TEXT NOT NULL
         )`,
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS state (
           learner    TEXT NOT NULL,
           key        TEXT NOT NULL,
           value      TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           PRIMARY KEY (learner, key)
         )`,
      );
    })().catch((err) => {
      // Bei Fehler zurücksetzen, damit der nächste Zugriff es erneut versucht
      ready = null;
      throw err;
    });
  }
  return ready;
}

export type AccountRow = { learner: string; passcode_hash: string; created_at: string };

export async function getAccount(learner: string): Promise<AccountRow | null> {
  await ensureSchema();
  const r = await getClient().execute({
    sql: 'SELECT learner, passcode_hash, created_at FROM accounts WHERE learner = ?',
    args: [learner],
  });
  const row = r.rows[0];
  if (!row) return null;
  return {
    learner: String(row.learner),
    passcode_hash: String(row.passcode_hash),
    created_at: String(row.created_at),
  };
}

/** Legt ein Konto an. Wirft, wenn es die/den Lernende:n schon gibt (UNIQUE). */
export async function createAccount(learner: string, passcodeHash: string, now: string): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: 'INSERT INTO accounts (learner, passcode_hash, created_at) VALUES (?, ?, ?)',
    args: [learner, passcodeHash, now],
  });
}

/**
 * Passcode setzen ODER zurücksetzen (Upsert). Nur für den admin-gesteuerten
 * Registrierungs-Pfad (Einrichtungs-Code) — erlaubt den Kontoinhabern einen
 * Reset, ohne einen offenen Reset-Endpunkt zu schaffen.
 */
export async function upsertAccountPasscode(learner: string, passcodeHash: string, now: string): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: `INSERT INTO accounts (learner, passcode_hash, created_at) VALUES (?, ?, ?)
          ON CONFLICT (learner) DO UPDATE SET passcode_hash = excluded.passcode_hash`,
    args: [learner, passcodeHash, now],
  });
}

/** Welche Profile haben schon einen Passcode? Für den Login-Screen. */
export async function registeredLearners(): Promise<string[]> {
  await ensureSchema();
  const r = await getClient().execute('SELECT learner FROM accounts');
  return r.rows.map((row) => String(row.learner));
}

/** Alle KV-Einträge eines Kontos als { key: value }. */
export async function getAllState(learner: string): Promise<Record<string, string>> {
  await ensureSchema();
  const r = await getClient().execute({
    sql: 'SELECT key, value FROM state WHERE learner = ?',
    args: [learner],
  });
  const out: Record<string, string> = {};
  for (const row of r.rows) out[String(row.key)] = String(row.value);
  return out;
}

/** Einen KV-Eintrag setzen (Upsert). */
export async function putState(learner: string, key: string, value: string, now: string): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: `INSERT INTO state (learner, key, value, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (learner, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [learner, key, value, now],
  });
}
