// Struktur-Prüfung der Übungsbibliothek (npm run check:exercises).
// Fängt Tippfehler ab, die Übungen unlösbar machen würden: correctWord fehlt
// in der Bank, correctIndex außerhalb, doppelte Optionen, fehlende ___ usw.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(here, '../src/data/exercises.ts'), 'utf8')
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const EXERCISES = mod.EXERCISES

const errors = []
const counts = { B1: 0, B2: 0, C1: 0 }

EXERCISES.forEach((e, i) => {
  const where = `#${i + 1} [${e.level}] ${e.topic?.de ?? '?'}`
  if (!['B1', 'B2', 'C1'].includes(e.level)) errors.push(`${where}: unbekanntes Level`)
  else counts[e.level]++
  for (const f of ['topic', 'q', 'fbOk', 'fbNo']) {
    if (!e[f]?.de?.trim() || !e[f]?.en?.trim()) errors.push(`${where}: ${f}.de/en fehlt`)
  }
  if (e.type === 'mc') {
    if (!Array.isArray(e.options) || e.options.length < 3) errors.push(`${where}: <3 Optionen`)
    if (new Set(e.options).size !== e.options.length) errors.push(`${where}: doppelte Optionen`)
    if (!Number.isInteger(e.correctIndex) || e.correctIndex < 0 || e.correctIndex >= e.options.length)
      errors.push(`${where}: correctIndex ungültig`)
    if (e.options.some((o) => !o.trim())) errors.push(`${where}: leere Option`)
  } else if (e.type === 'blank') {
    if (!Array.isArray(e.bank) || e.bank.length < 3) errors.push(`${where}: <3 Bank-Wörter`)
    if (new Set(e.bank).size !== e.bank.length) errors.push(`${where}: doppelte Bank-Wörter`)
    if (!e.bank.includes(e.correctWord)) errors.push(`${where}: correctWord nicht in der Bank`)
    if (!e.q.de.includes('___') || !e.q.en.includes('___')) errors.push(`${where}: ___ fehlt in q.de/en`)
  } else {
    errors.push(`${where}: unbekannter Typ`)
  }
})

console.log(`Übungen gesamt: ${EXERCISES.length} (B1: ${counts.B1}, B2: ${counts.B2}, C1: ${counts.C1})`)
if (EXERCISES.length < 100) errors.push(`Nur ${EXERCISES.length} Übungen — Ziel ist 100.`)
if (errors.length) {
  console.error(`FEHLER (${errors.length}):`)
  for (const e of errors) console.error(' - ' + e)
  process.exit(1)
}
console.log('Alle Struktur-Prüfungen bestanden ✓')
