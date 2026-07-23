import { getAllState } from './db.js';
import { isLearnerId, type LearnerId } from './prompts.js';

// Baut die tägliche Lern-Erinnerung aus dem Konto-Stand (Nutzung + Lern-
// Gedächtnis liegen in Turso) plus einem festen Wochen-Themenplan. Kein
// KI-Aufruf → keine API-Kosten. Sprache: Deutsch für Deutsch-Lernende,
// Englisch für Vuk (Englisch verfeinern).

const APP_URL = process.env.APP_URL ?? 'https://trajkovicv.github.io/language-teacher/';

type LearnerInfo = { name: string; target: 'de' | 'en'; level: string };
const LEARNERS: Record<LearnerId, LearnerInfo> = {
  andrijana: { name: 'Andrijana', target: 'de', level: 'B1/B2' },
  vuk: { name: 'Vuk', target: 'en', level: 'B2/C1' },
};

// Wochen-Themenplan (0 = Sonntag … 6 = Samstag).
const PLAN_DE: string[] = [
  'Wiederholung & leichte Aufgaben',
  'Konnektoren & Nebensätze (weil, obwohl, damit …)',
  'Verben & Zeiten (Perfekt, Präteritum, Passiv)',
  'Fälle & Präpositionen (Dativ/Genitiv, Wechselpräpositionen)',
  'Wortschatz Alltag & Beruf (auch Pflege)',
  'Konjunktiv II & höfliche Redemittel',
  'Freie Wiederholung – Lieblingsthemen',
];
const PLAN_EN: string[] = [
  'Review & light practice',
  'Phrasal verbs & dependent prepositions',
  'Tenses & conditionals (mixed, inversion)',
  'Collocations & word choice (affect/effect …)',
  'Advanced structures (cleft, subjunctive)',
  'Idioms & register',
  'Free review – your choice',
];

const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Usage = {
  minutes?: number;
  sessions?: number;
  messages?: number;
  days?: string[];
  firstSeen?: string;
  lastSeen?: string;
};

function parseUsage(raw: string | undefined): Usage {
  if (!raw) return {};
  try {
    const u = JSON.parse(raw);
    return typeof u === 'object' && u ? u : {};
  } catch {
    return {};
  }
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Aufeinanderfolgende aktive Tage bis heute. */
function streakOf(days: string[]): number {
  const set = new Set(days);
  let streak = 0;
  const cursor = new Date();
  while (set.has(isoDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export type ReminderMail = { subject: string; text: string; html: string };

/**
 * Erinnerung für ein Konto bauen. Liest Nutzung + Gedächtnis aus der DB.
 * `now` steuert den Wochentag (Standard: aktuelles Datum).
 */
export async function buildReminder(learner: LearnerId, now: Date = new Date()): Promise<ReminderMail> {
  const info = LEARNERS[learner];
  const de = info.target === 'de';
  const dow = now.getDay();
  const topic = (de ? PLAN_DE : PLAN_EN)[dow];
  const weekday = (de ? WEEKDAY_DE : WEEKDAY_EN)[dow];

  const state = await getAllState(learner).catch(() => ({}) as Record<string, string>);
  const usage = parseUsage(state['usage']);
  const minutes = Math.max(0, Math.round(usage.minutes ?? 0));
  const sessions = usage.sessions ?? 0;
  const streak = streakOf(Array.isArray(usage.days) ? usage.days : []);
  const activeDays = Array.isArray(usage.days) ? usage.days.length : 0;

  // Kurzer Lernstand aus dem Gedächtnis-Profil (erster Satz, gekürzt).
  const profile = (state[`memory:mila`] || state[`memory:ana`] || state[`memory:luka`] || '').trim();
  let focusLine = '';
  try {
    const p = JSON.parse(profile) as { profile?: string };
    const txt = typeof p?.profile === 'string' ? p.profile : profile;
    if (txt) focusLine = txt.replace(/\s+/g, ' ').slice(0, 180);
  } catch {
    if (profile) focusLine = profile.replace(/\s+/g, ' ').slice(0, 180);
  }

  if (de) {
    const subject = `Deine Deutsch-Session heute: ${topic}`;
    const lines = [
      `Hallo ${info.name}!`,
      ``,
      `Heute ist ${weekday}. Dein Fokus für die heutige Session (ca. 10–15 Minuten):`,
      `👉 ${topic}`,
      ``,
      `So machst du deine Session:`,
      `1) App öffnen: ${APP_URL}`,
      `2) Als „${info.name}" anmelden → Tab „Übungen"`,
      `3) Unten in der Übungsbibliothek Niveau ${info.level} wählen und ca. 10 Aufgaben zum heutigen Thema machen`,
      ``,
      `Dein Stand bisher: ~${minutes} Minuten geübt · ${sessions} Sitzung${sessions === 1 ? '' : 'en'} · an ${activeDays} Tag${activeDays === 1 ? '' : 'en'} aktiv${streak >= 2 ? ` · Serie: ${streak} Tage in Folge 🔥` : ''}.`,
      focusLine ? `\nWoran wir arbeiten: ${focusLine}` : '',
      ``,
      `Vorbereitung: Nimm dir einen ruhigen Moment, Kopfhörer bereit (Mila liest vor). Sprich die Beispielsätze einmal laut mit – das hilft der Aussprache.`,
      ``,
      `Du schaffst das! Kleine Schritte jeden Tag bringen dich sicher ans Ziel.`,
      `Samo napred – malim koracima do cilja! 💪`,
      ``,
      `— Mila, deine Sprachlehrerin`,
    ];
    const text = lines.filter((l) => l !== undefined).join('\n');
    const html = mailHtml(info.name, weekday, topic, info.level, minutes, sessions, activeDays, streak, focusLine, true);
    return { subject, text, html };
  }

  const subject = `Your English session today: ${topic}`;
  const lines = [
    `Hi ${info.name}!`,
    ``,
    `Today is ${weekday}. Your focus for today’s session (about 10–15 minutes):`,
    `👉 ${topic}`,
    ``,
    `How to do your session:`,
    `1) Open the app: ${APP_URL}`,
    `2) Sign in as “${info.name}” → “Übungen” (Exercises) tab`,
    `3) In the library, switch to EN, pick level ${info.level}, and do ~10 exercises on today’s topic`,
    ``,
    `Your progress so far: ~${minutes} minutes practised · ${sessions} session${sessions === 1 ? '' : 's'} · active on ${activeDays} day${activeDays === 1 ? '' : 's'}${streak >= 2 ? ` · streak: ${streak} days 🔥` : ''}.`,
    focusLine ? `\nWhat we’re working on: ${focusLine}` : '',
    ``,
    `Prep: find a quiet moment, headphones ready. Read the example sentences out loud once — great for fluency.`,
    ``,
    `Keep it up — small daily steps make the difference!`,
    ``,
    `— Mila, your language teacher`,
  ];
  const text = lines.filter((l) => l !== undefined).join('\n');
  const html = mailHtml(info.name, weekday, topic, info.level, minutes, sessions, activeDays, streak, focusLine, false);
  return { subject, text, html };
}

/** Kurzer Lernstand aus dem Gedächtnis-Profil (erster Teil, gekürzt). */
function focusOf(state: Record<string, string>): string {
  const profile = (state['memory:mila'] || state['memory:ana'] || state['memory:luka'] || '').trim();
  if (!profile) return '';
  try {
    const p = JSON.parse(profile) as { profile?: string };
    const txt = typeof p?.profile === 'string' ? p.profile : profile;
    return txt.replace(/\s+/g, ' ').slice(0, 220);
  } catch {
    return profile.replace(/\s+/g, ' ').slice(0, 220);
  }
}

/** Anzahl aktiver Tage innerhalb der letzten 7 Kalendertage. */
function activeThisWeek(days: string[], now: Date): number {
  const recent = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    recent.add(isoDay(d));
  }
  return days.filter((d) => recent.has(d)).length;
}

/**
 * Wochen-Überblick für die Eltern/Admin (alle Profile) — auf Deutsch.
 * Geht an REMINDER_ADMIN_EMAIL, damit du den Stand bekommst, ohne online zu sein.
 */
export async function buildAdminSummary(now: Date = new Date()): Promise<ReminderMail> {
  const textBlocks: string[] = [];
  const htmlBlocks: string[] = [];

  for (const learner of ['andrijana', 'vuk'] as LearnerId[]) {
    const info = LEARNERS[learner];
    const state = await getAllState(learner).catch(() => ({}) as Record<string, string>);
    const usage = parseUsage(state['usage']);
    const minutes = Math.max(0, Math.round(usage.minutes ?? 0));
    const sessions = usage.sessions ?? 0;
    const messages = usage.messages ?? 0;
    const days = Array.isArray(usage.days) ? usage.days : [];
    const streak = streakOf(days);
    const week = activeThisWeek(days, now);
    const lastSeen = usage.lastSeen || '—';
    const focus = focusOf(state);
    const registered = Boolean(state['usage'] || focus);

    const heading = `${info.name} (${info.target === 'de' ? 'Deutsch' : 'Englisch'} ${info.level})`;
    const line = registered
      ? `~${minutes} Min gesamt · ${sessions} Sitzungen · ${messages} Nachrichten · diese Woche an ${week} Tag${week === 1 ? '' : 'en'} aktiv · Serie ${streak} · zuletzt aktiv: ${lastSeen}`
      : 'Noch kein Konto / keine Aktivität — evtl. Anmeldung/Passcode noch offen.';
    const hint = registered && week === 0 ? '  ⚠️ Diese Woche noch nicht geübt — vielleicht kurz erinnern.' : '';

    textBlocks.push(`• ${heading}\n  ${line}${hint}${focus ? `\n  Lernstand: ${focus}` : ''}`);
    htmlBlocks.push(
      `<div style="background:#F7F1F5;border-radius:12px;padding:12px 14px;margin-bottom:10px">
        <div style="font-weight:800">${esc(heading)}</div>
        <div style="font-size:14px;margin-top:4px">${esc(line)}</div>
        ${hint ? `<div style="font-size:14px;color:#E0575F;margin-top:4px">${esc(hint.trim())}</div>` : ''}
        ${focus ? `<div style="font-size:13px;color:#8A8398;margin-top:6px">Lernstand: ${esc(focus)}</div>` : ''}
      </div>`,
    );
  }

  const subject = 'Wochenüberblick: Andrijana & Vuk (Lernstand)';
  const text = [
    'Hallo!',
    '',
    'Kurzer Wochenüberblick zum Lernstand:',
    '',
    ...textBlocks,
    '',
    'Diese Mail kommt automatisch — du musst dafür nicht online sein.',
    '— Language-Teacher-App',
  ].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#241F2E">
    <div style="background:linear-gradient(135deg,#FF6E97,#FFA36B);border-radius:20px 20px 0 0;padding:20px 24px;color:#fff">
      <div style="font-size:20px;font-weight:800">Wochenüberblick 📊</div>
      <div style="opacity:.92;margin-top:2px">Lernstand von Andrijana & Vuk</div>
    </div>
    <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 20px 20px;padding:20px 24px">
      ${htmlBlocks.join('')}
      <div style="margin-top:8px;color:#8A8398;font-size:13px">Diese Mail kommt automatisch — du musst dafür nicht online sein.</div>
    </div>
  </div>`;
  return { subject, text, html };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mailHtml(
  name: string,
  weekday: string,
  topic: string,
  level: string,
  minutes: number,
  sessions: number,
  activeDays: number,
  streak: number,
  focusLine: string,
  de: boolean,
): string {
  const t = de
    ? {
        intro: `Heute ist ${esc(weekday)}. Dein Fokus für heute (ca. 10–15 Min):`,
        how: 'So machst du deine Session:',
        s1: `App öffnen und als „${esc(name)}" anmelden`,
        s2: 'Tab „Übungen" → Übungsbibliothek',
        s3: `Niveau ${esc(level)} wählen, ~10 Aufgaben zum Thema`,
        status: `Dein Stand: ~${minutes} Min · ${sessions} Sitzung${sessions === 1 ? '' : 'en'} · ${activeDays} aktive Tage${streak >= 2 ? ` · Serie ${streak} 🔥` : ''}`,
        focus: focusLine ? `Woran wir arbeiten: ${esc(focusLine)}` : '',
        cta: 'Zur App',
        sign: '— Mila, deine Sprachlehrerin',
        motiv: 'Kleine Schritte jeden Tag – du schaffst das! 💪',
      }
    : {
        intro: `Today is ${esc(weekday)}. Your focus for today (about 10–15 min):`,
        how: 'How to do your session:',
        s1: `Open the app and sign in as “${esc(name)}”`,
        s2: '“Übungen” (Exercises) tab → library',
        s3: `Switch to EN, level ${esc(level)}, ~10 exercises on the topic`,
        status: `Progress: ~${minutes} min · ${sessions} session${sessions === 1 ? '' : 's'} · ${activeDays} active days${streak >= 2 ? ` · streak ${streak} 🔥` : ''}`,
        focus: focusLine ? `What we’re working on: ${esc(focusLine)}` : '',
        cta: 'Open the app',
        sign: '— Mila, your language teacher',
        motiv: 'Small steps every day — you’ve got this! 💪',
      };
  return `<!-- Lern-Erinnerung -->
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#241F2E">
  <div style="background:linear-gradient(135deg,#FF6E97,#FFA36B);border-radius:20px 20px 0 0;padding:22px 24px;color:#fff">
    <div style="font-size:22px;font-weight:800">Hallo ${esc(name)}! 👋</div>
    <div style="opacity:.92;margin-top:4px">${esc(t.intro)}</div>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 20px 20px;padding:22px 24px">
    <div style="font-size:18px;font-weight:800;color:#E8477A;margin-bottom:14px">👉 ${esc(topic)}</div>
    <div style="font-weight:700;margin-bottom:6px">${esc(t.how)}</div>
    <ol style="margin:0 0 14px 18px;padding:0;line-height:1.7">
      <li>${t.s1}</li><li>${t.s2}</li><li>${t.s3}</li>
    </ol>
    <div style="background:#F7F1F5;border-radius:12px;padding:12px 14px;font-size:14px">${esc(t.status)}</div>
    ${t.focus ? `<div style="margin-top:10px;font-size:14px;color:#8A8398">${t.focus}</div>` : ''}
    <a href="${esc(APP_URL)}" style="display:inline-block;margin-top:18px;background:#E8477A;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:12px">${esc(t.cta)}</a>
    <div style="margin-top:18px;color:#8A8398;font-size:14px">${esc(t.motiv)}</div>
    <div style="margin-top:12px;font-weight:700">${esc(t.sign)}</div>
  </div>
</div>`;
}
