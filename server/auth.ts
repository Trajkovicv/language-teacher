import './env.js';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Minimale Auth für die festen Profile (Vuk/Andrijana): Passcode → scrypt-Hash,
// Sitzung → HMAC-signiertes Token (stateless, kein Session-Speicher nötig).
// Kein OAuth, keine Fremd-Dienste. Der App-weite ACCESS_CODE bleibt zusätzlich davor.

// Signaturschlüssel: stabil über Neustarts (sonst müssten sich alle nach jedem
// Render-Kaltstart neu anmelden). AUTH_SECRET bevorzugt; sonst ACCESS_CODE.
const SECRET = process.env.AUTH_SECRET ?? process.env.ACCESS_CODE ?? 'lt-dev-secret-nur-lokal';
// Token-Lebensdauer: 180 Tage (Lern-App, bequem lange angemeldet bleiben)
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

// ===== Passcode-Hashing (scrypt + Zufalls-Salt) =====

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(passcode, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPasscode(passcode: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let actual: Buffer;
  try {
    actual = scryptSync(passcode, salt, expected.length);
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ===== Sitzungs-Token (HMAC, JWT-ähnlich, ohne Abhängigkeit) =====

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payloadB64: string): string {
  return b64url(createHmac('sha256', SECRET).update(payloadB64).digest());
}

/** Token für ein Konto ausstellen. */
export function issueToken(learner: string): string {
  const payload = b64url(JSON.stringify({ learner, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

/** Token prüfen → learner-ID oder null (abgelaufen/manipuliert). */
export function verifyToken(token: string): string | null {
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // Signatur zeitkonstant vergleichen
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (typeof payload?.learner !== 'string' || typeof payload?.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return payload.learner;
  } catch {
    return null;
  }
}
