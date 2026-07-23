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

let transport: nodemailer.Transporter | null = null;
function getTransport(): nodemailer.Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      // 465 = implizites TLS, sonst STARTTLS auf 587
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transport;
}

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!mailConfigured()) throw new Error('SMTP nicht konfiguriert.');
  await getTransport().sendMail({ from: MAIL_FROM, to, subject, text, html });
}
