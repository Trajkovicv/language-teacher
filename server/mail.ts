import './env.js';
import nodemailer from 'nodemailer';

// E-Mail-Versand mit zwei Wegen:
//  1) Brevo-HTTP-API (empfohlen) — läuft über HTTPS/443, das Render-Free NICHT
//     blockiert. Aktiv, sobald BREVO_API_KEY gesetzt ist.
//  2) SMTP (Fallback) — nodemailer; auf manchen Hosts (Render-Free) klemmt der
//     SMTP-Port zeitweise, daher nur Fallback.
// Alle Zugangsdaten kommen aus Umgebungsvariablen — nie im Code/Repo.

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
// Absender (z. B. "Mila <dein@mail.com>"); Fallback = SMTP_USER
const MAIL_FROM = process.env.MAIL_FROM ?? SMTP_USER;

const hasApi = () => Boolean(BREVO_API_KEY && MAIL_FROM);
const hasSmtp = () => Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM);

export function mailConfigured(): boolean {
  return hasApi() || hasSmtp();
}

/** "Name <email>" → { name, email }. */
function parseFrom(): { name?: string; email: string } {
  const raw = (MAIL_FROM ?? '').trim();
  const m = /^(.*?)<([^>]+)>$/.exec(raw);
  if (m) {
    const name = m[1].trim().replace(/^"|"$/g, '');
    return name ? { name, email: m[2].trim() } : { email: m[2].trim() };
  }
  return { email: raw || (SMTP_USER ?? '') };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ===== Weg 1: Brevo HTTP-API =====
async function sendViaApi(to: string, subject: string, text: string, html?: string): Promise<void> {
  const from = parseFrom();
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY as string,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: from,
      to: [{ email: to }],
      subject,
      textContent: text,
      ...(html ? { htmlContent: html } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo-API ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ===== Weg 2: SMTP (Fallback) =====
function makeTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function sendViaSmtp(to: string, subject: string, text: string, html?: string): Promise<void> {
  const transport = makeTransport();
  try {
    await transport.sendMail({ from: MAIL_FROM, to, subject, text, html });
  } finally {
    transport.close();
  }
}

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!mailConfigured()) throw new Error('E-Mail nicht konfiguriert.');
  const via = hasApi() ? sendViaApi : sendViaSmtp;
  // Bis zu 3 Versuche mit kurzem Backoff — fängt kurzzeitige Aussetzer ab.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await via(to, subject, text, html);
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[mail] Versuch ${attempt}/3 (${hasApi() ? 'API' : 'SMTP'}) fehlgeschlagen:`, err instanceof Error ? err.message : err);
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('E-Mail-Versand fehlgeschlagen.');
}
