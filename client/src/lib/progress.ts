import { pushState } from './sync'
import type { DictLang, UserId } from './users'

// Performance-Tracking (Phase 2): zählt beantwortete/richtige Übungen, erledigte
// Aufgaben (für Kursfortschritt), Themen-Beherrschung und Wochen-Aggregate.
// Pro Lernprofil, synchron über Turso (state-Key `progress`), damit der
// tägliche E-Mail-Report echte Zahlen zeigt. Alles lokal + write-through.

type Stat = { a: number; c: number } // a = beantwortet, c = richtig

export type ProgressRecord = {
  answered: number
  correct: number
  // eindeutige erledigte Bibliotheks-Übungen: Schlüssel `${target}:${level}:${index}`
  doneKeys: string[]
  // Themen-Beherrschung: Themen-Label → {a, c}
  topics: Record<string, Stat>
  // aktuelle Woche (ISO) + Vorwoche für den Trend
  weekKey: string
  week: Stat
  lastWeek: Stat
}

const EMPTY: ProgressRecord = {
  answered: 0,
  correct: 0,
  doneKeys: [],
  topics: {},
  weekKey: '',
  week: { a: 0, c: 0 },
  lastWeek: { a: 0, c: 0 },
}

const storeKey = (u: UserId) => `lt-progress-${u}`
const MAX_DONE = 2000
const MAX_TOPICS = 80

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
const toStat = (v: unknown): Stat => ({ a: num((v as Stat)?.a), c: num((v as Stat)?.c) })

function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week =
    1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function loadProgress(u: UserId): ProgressRecord {
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey(u)) ?? 'null') as Partial<ProgressRecord> | null
    if (raw && typeof raw === 'object') {
      const topics: Record<string, Stat> = {}
      if (raw.topics && typeof raw.topics === 'object') {
        for (const k of Object.keys(raw.topics)) topics[k.slice(0, 60)] = toStat((raw.topics as Record<string, Stat>)[k])
      }
      return {
        answered: num(raw.answered),
        correct: num(raw.correct),
        doneKeys: Array.isArray(raw.doneKeys) ? raw.doneKeys.filter((k): k is string => typeof k === 'string') : [],
        topics,
        weekKey: typeof raw.weekKey === 'string' ? raw.weekKey : '',
        week: toStat(raw.week),
        lastWeek: toStat(raw.lastWeek),
      }
    }
  } catch {
    // kaputt — neu beginnen
  }
  return JSON.parse(JSON.stringify(EMPTY)) as ProgressRecord
}

function save(u: UserId, rec: ProgressRecord): void {
  const json = JSON.stringify(rec)
  try {
    localStorage.setItem(storeKey(u), json)
  } catch {
    // Speichern optional
  }
  pushState(u, 'progress', json) // write-through ans Konto (No-Op wenn nicht angemeldet)
}

/** Grobes Themen-Label aus dem Übungs-Topic (erster Teil vor „ · " / Klammer). */
function topicKey(topic: string): string {
  return topic.split(' · ')[0].split(' (')[0].trim().slice(0, 60) || '–'
}

type AnswerInfo = {
  target: DictLang
  level: string
  index?: number
  topic: string
  correct: boolean
}

/** Eine (erste) Antwort verbuchen. */
export function recordAnswer(u: UserId, info: AnswerInfo): void {
  const rec = loadProgress(u)
  const wk = isoWeek()
  if (rec.weekKey !== wk) {
    rec.lastWeek = rec.weekKey ? rec.week : { a: 0, c: 0 }
    rec.week = { a: 0, c: 0 }
    rec.weekKey = wk
  }

  const inc = info.correct ? 1 : 0
  rec.answered += 1
  rec.correct += inc
  rec.week.a += 1
  rec.week.c += inc

  const tk = topicKey(info.topic)
  const t = rec.topics[tk] ?? { a: 0, c: 0 }
  t.a += 1
  t.c += inc
  rec.topics[tk] = t
  // Themen kappen (die kleinsten zuerst weg), damit der Datensatz nicht wuchert
  const keys = Object.keys(rec.topics)
  if (keys.length > MAX_TOPICS) {
    keys.sort((x, y) => rec.topics[x].a - rec.topics[y].a)
    for (const k of keys.slice(0, keys.length - MAX_TOPICS)) delete rec.topics[k]
  }

  if (typeof info.index === 'number' && info.index >= 0) {
    const dk = `${info.target}:${info.level}:${info.index}`
    if (!rec.doneKeys.includes(dk)) {
      rec.doneKeys.push(dk)
      if (rec.doneKeys.length > MAX_DONE) rec.doneKeys = rec.doneKeys.slice(-MAX_DONE)
    }
  }

  save(u, rec)
}

/** Anzahl erledigter Bibliotheks-Übungen für ein Sprach-/Level-Paar (Kursfortschritt). */
export function doneCount(rec: ProgressRecord, target: DictLang, level: string): number {
  const prefix = `${target}:${level}:`
  return rec.doneKeys.reduce((n, k) => (k.startsWith(prefix) ? n + 1 : n), 0)
}
