import { getAllState } from './db.js';
import { isLearnerId, type LearnerId } from './prompts.js';

// Baut die tägliche Lern-Erinnerung als E-Mail-festen (tabellenbasierten) Report
// aus dem Konto-Stand (Nutzung + Lern-Gedächtnis aus Turso) plus einem festen
// Wochen-Themenplan mit eigenen Briefings/Tipps. Kein KI-Aufruf → keine Kosten.
// Alle Zahlen sind echt; Felder, die noch Tracking bräuchten, sind bewusst weg.

const APP_URL = process.env.APP_URL ?? 'https://trajkovicv.github.io/language-teacher/';
// Wöchentliches Ziel (aktive Lerntage pro Woche) für den Plan-Status.
const WEEKLY_GOAL = 5;

type LearnerInfo = { name: string; target: 'de' | 'en'; level: string };
const LEARNERS: Record<LearnerId, LearnerInfo> = {
  andrijana: { name: 'Andrijana', target: 'de', level: 'B2' },
  vuk: { name: 'Vuk', target: 'en', level: 'C1' },
};

// Wochen-Themenplan (Index 0 = Sonntag … 6 = Samstag).
const PLAN_DE = [
  'Wiederholung & leichte Aufgaben',
  'Konnektoren & Nebensätze (weil, obwohl, damit)',
  'Verben & Zeiten (Perfekt, Präteritum, Passiv)',
  'Fälle & Präpositionen (Dativ, Genitiv, Wechselpräpositionen)',
  'Wortschatz Alltag & Beruf (Pflege)',
  'Konjunktiv II & höfliche Redemittel',
  'Freie Wiederholung – Lieblingsthemen',
];
const PLAN_EN = [
  'Review & light practice',
  'Phrasal verbs & dependent prepositions',
  'Tenses & conditionals (mixed, inversion)',
  'Collocations & word choice',
  'Advanced structures (cleft, subjunctive)',
  'Idioms & register',
  'Free review – your choice',
];

// Kurz-Briefing „Warum das heute wichtig ist" (Alltag & Pflege-Bezug) + Tipp.
// Für Deutsch je Wochentag mit serbischer Übersetzung.
type Bi = { de: string; sr: string };
const BRIEF_DE: Bi[] = [
  {
    de: 'Wiederholen festigt, was du schon kannst — kurz und locker. Im Alltag hilft es, sichere Sätze parat zu haben, ohne nachzudenken.',
    sr: 'Ponavljanje učvršćuje ono što već znaš — kratko i opušteno. U svakodnevici pomaže da sigurne rečenice imaš spremne, bez razmišljanja.',
  },
  {
    de: 'Mit »weil« und »obwohl« erklärst du Gründe und Einwände — im Pflegealltag ständig gebraucht: „Ich messe jetzt Ihren Blutdruck, weil …". So wirst du sofort verstanden und wirkst professionell.',
    sr: 'Pomoću »weil« (jer) i »obwohl« (iako) objašnjavaš razloge i prigovore — u nezi to stalno treba: „Sada Vam merim krvni pritisak, jer …". Tako te odmah razumeju i deluješ profesionalno.',
  },
  {
    de: 'Perfekt und Präteritum brauchst du, um zu berichten, was war — bei der Übergabe oder in der Doku: „Der Patient hat gut geschlafen." Passiv zeigt Abläufe: „Die Wunde wurde versorgt."',
    sr: 'Perfekt i preterit trebaš da ispričaš šta je bilo — na primopredaji ili u dokumentaciji: „Der Patient hat gut geschlafen." Pasiv pokazuje radnje: „Die Wunde wurde versorgt."',
  },
  {
    de: 'Die richtige Präposition + Fall machen Ort und Richtung klar: „im Zimmer" (wo?) vs. „ins Zimmer" (wohin?). Im Job wichtig, damit keine Missverständnisse entstehen.',
    sr: 'Prava prepozicija + padež jasno pokazuju mesto i pravac: „im Zimmer" (gde?) naspram „ins Zimmer" (kuda?). Na poslu je važno da ne dođe do nesporazuma.',
  },
  {
    de: 'Fachwörter wie „verabreichen", „die Übergabe" oder „die Schweigepflicht" brauchst du täglich im Job. Wer die richtigen Wörter kennt, arbeitet sicherer und schneller im Team.',
    sr: 'Stručne reči kao „verabreichen" (dati lek), „die Übergabe" (primopredaja) ili „die Schweigepflicht" (obaveza ćutanja) trebaš svakodnevno na poslu. Ko zna prave reči, radi sigurnije i brže u timu.',
  },
  {
    de: 'Mit „Könnten Sie …?" oder „Ich würde …" klingst du höflich und respektvoll — wichtig mit Patient:innen, Angehörigen und Vorgesetzten: „Könnten Sie bitte kurz warten?"',
    sr: 'Sa „Könnten Sie …?" ili „Ich würde …" zvučiš ljubazno i s poštovanjem — važno sa pacijentima, rodbinom i nadređenima: „Könnten Sie bitte kurz warten?"',
  },
  {
    de: 'Heute übst du, was dir Spaß macht oder wo du dich unsicher fühlst. Selbst gewählt bleibt besser hängen — such dir ein Thema aus der Woche aus.',
    sr: 'Danas vežbaš ono što ti prija ili gde se osećaš nesigurno. Ono što sam biraš, bolje se pamti — izaberi temu iz ove nedelje.',
  },
];
const TIP_DE: Bi[] = [
  { de: 'Wiederhole laut — Sprechen speichert besser als nur Lesen.', sr: 'Ponavljaj naglas — govor pamtiš bolje nego samo čitanje.' },
  { de: 'Im Nebensatz mit »weil« steht das Verb am Ende: „…, weil ich müde bin."', sr: 'U zavisnoj rečenici sa »weil« glagol ide na kraj: „…, weil ich müde bin."' },
  { de: 'Perfekt mit haben oder sein: Bewegung → sein („ist gefahren"), sonst haben.', sr: 'Perfekt sa haben ili sein: kretanje → sein („ist gefahren"), inače haben.' },
  { de: 'Wechselpräposition: wo? → Dativ (dem/der), wohin? → Akkusativ (den/die).', sr: 'Promenljiva prepozicija: gde? → dativ (dem/der), kuda? → akuzativ (den/die).' },
  { de: 'Neue Wörter immer mit Artikel lernen: nicht „Übergabe", sondern „die Übergabe".', sr: 'Nove reči uči uvek sa članom: ne „Übergabe", nego „die Übergabe".' },
  { de: 'Höfliche Bitte: „Könnten Sie …?" statt „Können Sie …?" — Konjunktiv II wirkt freundlicher.', sr: 'Ljubazna molba: „Könnten Sie …?" umesto „Können Sie …?" — konjunktiv II deluje ljubaznije.' },
  { de: 'Kurz und regelmäßig schlägt lang und selten — schon 10 Minuten zählen.', sr: 'Kratko i redovno je bolje od dugo i retko — i 10 minuta se računa.' },
];
const BRIEF_EN: string[] = [
  'Review locks in what you know. Fluent, automatic phrases matter most in real conversations and meetings.',
  'Phrasal verbs and the right prepositions make you sound natural, not textbook: “deal with”, “follow up on”, “account for”.',
  'Mixed conditionals and inversion add precision and polish — useful in writing and formal speech: “Had I known, I would have …”.',
  'Strong collocations set advanced speakers apart: “make a decision”, “heavily reliant”, “raise concerns”. Word choice (affect/effect) signals care.',
  'Cleft sentences and the subjunctive give you nuance and formality: “What matters is …”, “I suggest that he be …”.',
  'Idioms and the right register make you sound native — and knowing when NOT to use them matters at work.',
  'Pick what you enjoy or where you feel unsure. Self-chosen practice sticks best.',
];
const TIP_EN: string[] = [
  'Review out loud — speaking fixes phrases better than reading.',
  'Learn verb + preposition together: “depend ON”, “result IN”, “focus ON”.',
  'Inversion for emphasis: “Not only did we finish, but we also …”.',
  'Say “do research” and “make a decision” — collocations, not word-by-word.',
  'Cleft for focus: “It was the deadline that caused the stress.”',
  'Match register to context: idioms for casual, plain English for formal.',
  'Short and regular beats long and rare — even 10 minutes counts.',
];

const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const SHORT_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_DE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

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

function activeThisWeek(days: string[], now: Date): number {
  const set = new Set(days);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    if (set.has(isoDay(d))) n++;
  }
  return n;
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

// ===== Übungs-Fortschritt (Phase 2) =====
type Stat = { a: number; c: number };
type Prog = { answered: number; correct: number; doneKeys: string[]; topics: Record<string, Stat>; week: Stat; lastWeek: Stat };

const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

function parseProgress(raw: string | undefined): Prog {
  const empty: Prog = { answered: 0, correct: 0, doneKeys: [], topics: {}, week: { a: 0, c: 0 }, lastWeek: { a: 0, c: 0 } };
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const topics: Record<string, Stat> = {};
    if (p.topics && typeof p.topics === 'object') {
      for (const [k, v] of Object.entries(p.topics as Record<string, Stat>)) topics[k] = { a: n0(v?.a), c: n0(v?.c) };
    }
    const w = p.week as Stat | undefined;
    const lw = p.lastWeek as Stat | undefined;
    return {
      answered: n0(p.answered),
      correct: n0(p.correct),
      doneKeys: Array.isArray(p.doneKeys) ? (p.doneKeys as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      topics,
      week: { a: n0(w?.a), c: n0(w?.c) },
      lastWeek: { a: n0(lw?.a), c: n0(lw?.c) },
    };
  } catch {
    return empty;
  }
}

// Gesamtzahl der Bibliotheks-Übungen je Sprach-/Level-Paar (für „X/N").
const TOTALS: Record<string, number> = { 'de:B1': 14, 'de:B2': 90, 'en:B2': 15, 'en:C1': 27 };

function doneCount(prog: Prog, target: string, level: string): number {
  const prefix = `${target}:${level}:`;
  return prog.doneKeys.reduce((s, k) => (k.startsWith(prefix) ? s + 1 : s), 0);
}

function fmtDuration(min: number, de: boolean): string {
  const m = Math.max(0, Math.round(min));
  const std = de ? 'Std' : 'h';
  const mn = de ? 'Min' : 'min';
  if (m < 60) return `${m} ${mn}`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} ${std} ${String(r).padStart(2, '0')} ${mn}` : `${h} ${std}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== E-Mail-feste Bausteine (tabellenbasiert, Inline-Styles, kein SVG/Flex) =====

function progressBar(pct: number, color: string): string {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const left =
    p > 0
      ? `<td bgcolor="${color}" width="${p}%" style="height:9px;line-height:9px;font-size:0;">&nbsp;</td>`
      : '';
  const right = p < 100 ? `<td bgcolor="#EDE7EC" style="height:9px;line-height:9px;font-size:0;">&nbsp;</td>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:99px;overflow:hidden;"><tr>${left}${right}</tr></table>`;
}

function kpiCell(value: string, label: string): string {
  return `<td width="25%" valign="top" style="padding:0 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ECE7ED;border-radius:11px;"><tr><td align="center" style="padding:12px 4px;">
      <div style="font-size:21px;font-weight:800;color:#201C28;">${value}</div>
      <div style="font-size:9.5px;font-weight:800;color:#8A8398;letter-spacing:.4px;padding-top:2px;">${label}</div>
    </td></tr></table>
  </td>`;
}

function activityStrip(days: string[], now: Date, short: string[], todayLabel: string): string {
  const set = new Set(days);
  const cells: string[] = [];
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const active = set.has(isoDay(d));
    const isToday = i === 0;
    const barColor = active ? (isToday ? '#E8477A' : '#F1B9CD') : '#EDE7EC';
    const h = active ? 34 : 5;
    cells.push(
      `<td valign="bottom" align="center" height="40" style="padding:0 3px;"><div style="height:${h}px;background:${barColor};border-radius:4px 4px 0 0;font-size:0;line-height:0;">&nbsp;</div></td>`,
    );
    labels.push(
      `<td align="center" style="font-size:9.5px;padding-top:5px;color:${isToday ? '#E8477A' : '#8A8398'};font-weight:${isToday ? 800 : 400};">${isToday ? todayLabel : short[d.getDay()]}</td>`,
    );
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells.join('')}</tr><tr>${labels.join('')}</tr></table>`;
}

export type ReminderMail = { subject: string; text: string; html: string };

/** Tägliche Report-Mail für ein Konto. `now` steuert Wochentag/Thema. */
export async function buildReminder(learner: LearnerId, now: Date = new Date()): Promise<ReminderMail> {
  const info = LEARNERS[learner];
  const de = info.target === 'de';
  const dow = now.getDay();
  const topic = (de ? PLAN_DE : PLAN_EN)[dow];
  const weekday = (de ? WEEKDAY_DE : WEEKDAY_EN)[dow];
  const dateStr = de
    ? `${weekday}, ${now.getDate()}. ${MONTH_DE[now.getMonth()]} ${now.getFullYear()}`
    : `${weekday}, ${now.getDate()} ${MONTH_DE[now.getMonth()].replace('.', '')}`;

  const state = await getAllState(learner).catch(() => ({}) as Record<string, string>);
  const usage = parseUsage(state['usage']);
  const totalMin = Math.max(0, Math.round(usage.minutes ?? 0));
  const sessions = usage.sessions ?? 0;
  const messages = usage.messages ?? 0;
  const days = Array.isArray(usage.days) ? usage.days : [];
  const activeDays = days.length;
  const streak = streakOf(days);
  const week = activeThisWeek(days, now);
  const goalPct = Math.min(100, (week / WEEKLY_GOAL) * 100);
  // Plan-Status: Soll-Tempo bis heute (Mo=1 … So=7)
  const elapsed = dow === 0 ? 7 : dow;
  const expected = Math.round((elapsed * WEEKLY_GOAL) / 7);
  const onTrack = week >= expected;
  const brief = de ? BRIEF_DE[dow] : { de: BRIEF_EN[dow], sr: '' };
  const tip = de ? TIP_DE[dow] : { de: TIP_EN[dow], sr: '' };
  const focus = focusOf(state);

  // Übungs-Leistung (Phase 2) — nur echt, wenn schon Aufgaben beantwortet wurden.
  const prog = parseProgress(state['progress']);
  const acc = prog.answered > 0 ? Math.round((prog.correct / prog.answered) * 100) : 0;
  const wAcc = prog.week.a > 0 ? Math.round((prog.week.c / prog.week.a) * 100) : null;
  const lwAcc = prog.lastWeek.a > 0 ? Math.round((prog.lastWeek.c / prog.lastWeek.a) * 100) : null;
  const courseDone = doneCount(prog, info.target, info.level);
  const courseTotal = TOTALS[`${info.target}:${info.level}`] ?? 0;
  const accColor = (p: number) => (p >= 75 ? '#12A06B' : p >= 50 ? '#E8871E' : '#E8477A');
  const mastery = Object.entries(prog.topics)
    .map(([k, s]) => ({ k, a: s.a, pct: s.a > 0 ? Math.round((s.c / s.a) * 100) : 0 }))
    .filter((t) => t.a >= 3)
    .sort((x, y) => y.a - x.a)
    .slice(0, 4);

  const perfBlock =
    prog.answered > 0
      ? `<tr><td style="padding:14px 26px 4px;">
      <div style="font-size:10.5px;font-weight:800;letter-spacing:1px;color:#8A8398;padding-bottom:9px;">${de ? 'ÜBUNGS-LEISTUNG' : 'EXERCISE PERFORMANCE'}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${kpiCell(`${acc}%`, de ? 'RICHTIG' : 'CORRECT')}
        ${kpiCell(String(prog.answered), de ? 'BEANTWORTET' : 'ANSWERED')}
        ${kpiCell(courseTotal ? `${courseDone}<span style="font-size:12px;color:#8A8398;">/${courseTotal}</span>` : String(courseDone), de ? 'KURS' : 'COURSE')}
        ${kpiCell(wAcc === null ? '–' : `${wAcc}%`, de ? 'DIESE WOCHE' : 'THIS WEEK')}
      </tr></table>
      ${
        wAcc !== null && lwAcc !== null
          ? `<div style="font-size:12px;color:#8A8398;padding-top:8px;">${de ? 'Diese Woche' : 'This week'} ${wAcc}% · ${wAcc - lwAcc >= 0 ? '▲ +' + (wAcc - lwAcc) : '▼ ' + (wAcc - lwAcc)}% ${de ? 'ggü. Vorwoche' : 'vs last week'}</div>`
          : ''
      }
      ${
        mastery.length
          ? `<div style="font-size:10.5px;font-weight:800;letter-spacing:1px;color:#8A8398;padding:12px 0 8px;">${de ? 'THEMEN-BEHERRSCHUNG' : 'TOPIC MASTERY'}</div>` +
            mastery
              .map(
                (t) => `<div style="padding-bottom:8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:12.5px;font-weight:700;color:#3C3646;">${esc(t.k)}</td>
            <td align="right" style="font-size:12px;font-weight:800;color:${accColor(t.pct)};">${t.pct}%</td>
          </tr></table>
          <div style="padding-top:4px;">${progressBar(t.pct, accColor(t.pct))}</div>
        </div>`,
              )
              .join('')
          : ''
      }
    </td></tr>`
      : '';

  const L = de
    ? {
        greet: `Guten Morgen, ${info.name}.`,
        sub: `${week} ${week === 1 ? 'Tag' : 'Tage'} aktiv diese Woche · Serie ${streak}`,
        subSr: `${week} ${week === 1 ? 'dan' : 'dana'} aktivno ove nedelje · niz ${streak}`,
        total: 'INSGESAMT GEÜBT',
        goal: 'WOCHENZIEL',
        status: onTrack ? '● Auf Kurs' : '● Etwas im Rückstand',
        kpi: ['SITZUNGEN', 'AKTIVE TAGE', 'SERIE', 'NACHRICHTEN'],
        activity: 'AKTIVITÄT · LETZTE 7 TAGE',
        today: 'Heute',
        next: '▶ HEUTE DRAN',
        nextMeta: `Niveau ${info.level} · ca. 10 Aufgaben · ~12 Min`,
        why: '🧭 WARUM DAS HEUTE WICHTIG IST',
        tipL: '💡 TIPP DES TAGES',
        focusL: 'WORAN WIR GERADE ARBEITEN',
        cta: 'Session starten →',
        motiv: 'Kleine Schritte jeden Tag bringen dich sicher ans Ziel.',
        motivSr: 'Malim koracima do cilja — na super si putu!',
        sign: '— Mila, deine Sprachlehrerin',
        sessH: 'So läuft deine Session',
      }
    : {
        greet: `Good morning, ${info.name}.`,
        sub: `${week} ${week === 1 ? 'day' : 'days'} active this week · streak ${streak}`,
        subSr: '',
        total: 'TOTAL PRACTISED',
        goal: 'WEEKLY GOAL',
        status: onTrack ? '● On track' : '● Slightly behind',
        kpi: ['SESSIONS', 'ACTIVE DAYS', 'STREAK', 'MESSAGES'],
        activity: 'ACTIVITY · LAST 7 DAYS',
        today: 'Today',
        next: '▶ TODAY',
        nextMeta: `Level ${info.level} · ~10 exercises · ~12 min`,
        why: '🧭 WHY THIS MATTERS TODAY',
        tipL: '💡 TIP OF THE DAY',
        focusL: 'WHAT WE ARE WORKING ON',
        cta: 'Start session →',
        motiv: 'Small steps every day get you there.',
        motivSr: '',
        sign: '— Mila, your language teacher',
        sessH: 'Your session',
      };

  const subject = de ? `Dein Lern-Report: ${topic}` : `Your learning report: ${topic}`;

  // ---- Plain-Text-Fallback ----
  const text = [
    L.greet,
    L.sub,
    '',
    `${de ? 'INSGESAMT GEÜBT' : 'TOTAL'}: ${fmtDuration(totalMin, de)} (${sessions} ${de ? 'Sitzungen' : 'sessions'})`,
    `${de ? 'WOCHENZIEL' : 'WEEKLY GOAL'}: ${week}/${WEEKLY_GOAL} — ${L.status.replace('● ', '')}`,
    prog.answered > 0
      ? `${de ? 'RICHTIG-QUOTE' : 'ACCURACY'}: ${acc}% (${prog.answered} ${de ? 'beantwortet' : 'answered'}${courseTotal ? `, ${de ? 'Kurs' : 'course'} ${courseDone}/${courseTotal}` : ''})`
      : '',
    '',
    `${L.next}: ${topic}`,
    `${L.nextMeta}`,
    '',
    `${de ? 'WARUM WICHTIG' : 'WHY IT MATTERS'}: ${brief.de}`,
    brief.sr ? `(SR) ${brief.sr}` : '',
    '',
    `${de ? 'TIPP' : 'TIP'}: ${tip.de}`,
    tip.sr ? `(SR) ${tip.sr}` : '',
    focus ? `\n${de ? 'LERNSTAND' : 'FOCUS'}: ${focus}` : '',
    '',
    `${de ? 'Zur App' : 'Open the app'}: ${APP_URL}`,
    L.sign,
  ]
    .filter((l) => l !== '')
    .join('\n');

  // ---- HTML (E-Mail-fest) ----
  const briefSr = brief.sr
    ? `<div style="font-size:12px;color:#8A7FA0;line-height:1.5;font-style:italic;border-top:1px solid #EADFF0;padding-top:9px;margin-top:9px;">${esc(brief.sr)}</div>`
    : '';
  const tipSr = tip.sr
    ? `<div style="font-size:12px;color:#9A8A6A;line-height:1.45;font-style:italic;border-top:1px solid #F1E4CC;padding-top:7px;margin-top:7px;">${esc(tip.sr)}</div>`
    : '';
  const subSr = L.subSr
    ? `<div style="font-size:12px;color:#8E82A0;font-style:italic;padding-top:2px;">${esc(L.subSr)}</div>`
    : '';
  const focusBlock = focus
    ? `<tr><td style="padding:12px 26px 4px;">
        <div style="font-size:10.5px;font-weight:800;letter-spacing:1px;color:#8A8398;padding-bottom:6px;">${L.focusL}</div>
        <div style="font-size:13px;color:#3C3646;line-height:1.55;">${esc(focus)}</div>
      </td></tr>`
    : '';
  const statusColor = onTrack ? '#0E8A5C' : '#C9821A';
  const statusBg = onTrack ? '#E1F5EC' : '#FBEFD9';
  const barColor = onTrack ? '#12A06B' : '#E8871E';

  const html = `<div style="background:#E7E3E9;padding:20px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #E3DEE6;border-radius:16px;overflow:hidden;">
    <tr><td bgcolor="#E8477A" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>

    <!-- Header -->
    <tr><td bgcolor="#211C29" style="padding:22px 26px;color:#ffffff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#F4C6D5;">MILA · LERN-REPORT</td>
        <td align="right" style="font-size:11.5px;color:#9C90A8;">${esc(dateStr)}</td>
      </tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>
        <td valign="middle">
          <div style="font-size:21px;font-weight:800;color:#ffffff;">${esc(L.greet)}</div>
          <div style="font-size:12.5px;color:#AA9EB6;padding-top:3px;">${esc(L.sub)}</div>
          ${subSr}
        </td>
        <td align="right" valign="middle" width="90">
          <span style="background:#332A3B;border:1px solid #45394F;border-radius:99px;padding:6px 12px;font-size:12px;font-weight:800;color:#FFB784;white-space:nowrap;">🔥 ${streak}</span>
        </td>
      </tr></table>
    </td></tr>

    <!-- Hero: Gesamtzeit + Wochenziel -->
    <tr><td style="padding:20px 26px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top">
          <div style="font-size:10.5px;font-weight:800;letter-spacing:1px;color:#8A8398;">${L.total}</div>
          <div style="font-size:32px;font-weight:800;color:#201C28;letter-spacing:-.5px;padding-top:5px;">${fmtDuration(totalMin, de)}</div>
          <div style="font-size:12px;color:#8A8398;padding-top:4px;">${sessions} ${de ? 'Sitzungen' : 'sessions'} · ${activeDays} ${de ? 'aktive Tage' : 'active days'}</div>
        </td>
        <td valign="top" width="190" style="padding-left:14px;">
          <div style="border:1px solid #ECE7ED;border-radius:12px;padding:12px 13px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size:10.5px;font-weight:800;letter-spacing:.5px;color:#8A8398;">${L.goal}</td>
              <td align="right" style="font-size:13px;font-weight:800;color:#201C28;">${week}/${WEEKLY_GOAL}</td>
            </tr></table>
            <div style="padding:8px 0 6px;">${progressBar(goalPct, barColor)}</div>
            <div style="text-align:center;"><span style="background:${statusBg};color:${statusColor};font-size:11px;font-weight:800;padding:4px 10px;border-radius:99px;">${L.status}</span></div>
          </div>
        </td>
      </tr></table>
    </td></tr>

    <!-- KPI -->
    <tr><td style="padding:14px 22px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${kpiCell(String(sessions), L.kpi[0])}
        ${kpiCell(String(activeDays), L.kpi[1])}
        ${kpiCell(String(streak), L.kpi[2])}
        ${kpiCell(String(messages), L.kpi[3])}
      </tr></table>
    </td></tr>

    <!-- Aktivität -->
    <tr><td style="padding:14px 26px 4px;">
      <div style="font-size:10.5px;font-weight:800;letter-spacing:1px;color:#8A8398;padding-bottom:9px;">${L.activity}</div>
      ${activityStrip(days, now, de ? SHORT_DE : SHORT_EN, L.today)}
    </td></tr>

    ${perfBlock}

    <!-- Heute dran -->
    <tr><td style="padding:14px 26px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EEE9EF;border-radius:13px;overflow:hidden;">
        <tr><td bgcolor="#201C28" style="padding:9px 16px;font-size:10.5px;font-weight:800;letter-spacing:1.2px;color:#FFB784;">${L.next}</td></tr>
        <tr><td style="padding:14px 16px;">
          <div style="font-size:16px;font-weight:800;color:#201C28;">${esc(topic)}</div>
          <div style="font-size:12px;color:#6E6579;padding-top:3px;">${esc(L.nextMeta)}</div>
        </td></tr>
      </table>
    </td></tr>

    <!-- Warum wichtig + Serbisch -->
    <tr><td style="padding:10px 26px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E1D8EC;border-radius:12px;background:#FAF6FC;"><tr><td style="padding:14px 15px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:.6px;color:#7A5AA6;">${L.why}</div>
        <div style="font-size:13px;color:#3C3646;line-height:1.55;padding-top:6px;">${esc(brief.de)}</div>
        ${briefSr}
      </td></tr></table>
    </td></tr>

    <!-- Tipp + Serbisch -->
    <tr><td style="padding:10px 26px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #F5E3C4;border-radius:12px;background:#FFF6E9;"><tr><td style="padding:13px 15px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:.6px;color:#B9822A;">${L.tipL}</div>
        <div style="font-size:13px;color:#5A4B2E;line-height:1.5;padding-top:5px;">${esc(tip.de)}</div>
        ${tipSr}
      </td></tr></table>
    </td></tr>

    ${focusBlock}

    <!-- CTA -->
    <tr><td style="padding:18px 26px 26px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${APP_URL}" style="display:inline-block;background:#E8477A;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 32px;border-radius:11px;">${esc(L.cta)}</a>
      </td></tr></table>
      <div style="text-align:center;font-size:12.5px;color:#8A8398;padding-top:15px;line-height:1.5;">
        ${esc(L.motiv)}${L.motivSr ? `<br><span style="font-style:italic;">${esc(L.motivSr)}</span>` : ''}<br>
        <span style="font-weight:800;color:#201C28;">${esc(L.sign)}</span>
      </div>
    </td></tr>
  </table>
</div>`;

  return { subject, text, html };
}

// ===== Wochen-Überblick für die Eltern/Admin (an REMINDER_ADMIN_EMAIL) =====

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
      `<div style="background:#F7F1F5;border-radius:12px;padding:12px 14px;margin-bottom:10px;">
        <div style="font-weight:800;">${esc(heading)}</div>
        <div style="font-size:14px;margin-top:4px;">${esc(line)}</div>
        ${hint ? `<div style="font-size:14px;color:#E0575F;margin-top:4px;">${esc(hint.trim())}</div>` : ''}
        ${focus ? `<div style="font-size:13px;color:#8A8398;margin-top:6px;">Lernstand: ${esc(focus)}</div>` : ''}
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
  const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#241F2E;">
    <div style="background:#211C29;border-radius:16px 16px 0 0;padding:20px 24px;color:#fff;">
      <div style="font-size:20px;font-weight:800;">Wochenüberblick 📊</div>
      <div style="opacity:.85;margin-top:2px;font-size:13px;">Lernstand von Andrijana & Vuk</div>
    </div>
    <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 16px 16px;padding:20px 24px;">
      ${htmlBlocks.join('')}
      <div style="margin-top:8px;color:#8A8398;font-size:13px;">Diese Mail kommt automatisch — du musst dafür nicht online sein.</div>
    </div>
  </div>`;
  return { subject, text, html };
}
