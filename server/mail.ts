import './env.js';
import nodemailer from 'nodemailer';

// Anbieter-unabhängiger SMTP-Versand (Gmail, Outlook, Brevo, …). Alle Zugangs-
// daten kommen aus Umgebungsvariablen — nie im Code, nie im Repo. Ist SMTP nicht
// konfiguriert, bleibt die Erinnerungs-Funktion einfach inaktiv (health: mail=false).

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
// Absender (z. B. "Mila – Sprachlehrerin <dein@mail.com>"); Fallback = SMTP_USER
const MAIL_FROM = process.env.MAIL_FROM ?? SMTP_USER;

export function mailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM);
}

// Bewusst KEIN gecachter Transport: Render-Free/Brevo mögen kurzlebige
// Verbindungen lieber; ein „wedged" Pool-Socket führte sonst zu Timeouts.
// Kurze, klare Timeouts (schnell scheitern statt 2 Min hängen).
function makeTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = implizites TLS, sonst STARTTLS auf 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!mailConfigured()) throw new Error('SMTP nicht konfiguriert.');
  // Bis zu 3 Versuche mit kurzem Backoff — fängt kurzzeitige SMTP-Aussetzer ab.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const transport = makeTransport();
    try {
      await transport.sendMail({ from: MAIL_FROM, to, subject, text, html });
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[mail] Versuch ${attempt}/3 fehlgeschlagen:`, err instanceof Error ? err.message : err);
    } finally {
      transport.close();
    }
    if (attempt < 3) await sleep(attempt * 2000);
  }
  throw lastErr instanceof Error ? lastErr : new Error('SMTP-Versand fehlgeschlagen.');
}
