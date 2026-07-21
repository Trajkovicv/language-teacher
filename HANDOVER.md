# HANDOVER — Projektstand & Session-Übergabe

> **Zweck:** Diese Datei zuerst lesen, wenn eine neue Claude-Session startet.
> Stand: 21. Juli 2026, Ende Session 1 (Phase 1 komplett + Sprech-Schleife).

## Status: Was fertig ist (alles reviewt + E2E-getestet)

| Meilenstein | Inhalt | Commits |
|---|---|---|
| M1 | Gerüst: Vite-React-TS `client/`, Express-TS `server/`, `npm run dev` startet beide | b0e524e |
| M2 | Chat E2E: `/api/chat` SSE-Streaming, Lehrer-System-Prompt (3 Charaktere), PREVOD-Untertitel | b0e524e |
| M3 | Mockup-UI 1:1: 3 Themes, Sidebar/Avatar-Bühne, Tabs, DE/EN/SR-i18n, Voice-Bar mit echtem Mikrofonpegel | 358d151 |
| M4 | Wörterbuch live: `/api/dictionary` (structured outputs), Deklination, klickbare Synonyme | 657ae0b |
| M5 | Übungen live: `/api/exercise` (mc/blank), eigene Übung per Prompt, Server-Validierung | 657ae0b |
| M6 | PWA (installierbar, Icons), GitHub-Pages-Workflow, Render-Blueprint, ACCESS_CODE-Schutz | b0e524e |
| M7 | Sprech-Schleife: Browser-TTS (Antworten werden vorgelesen, de/en), Diktat per Mikro, Fotos entfernt → SVG-Avatare | (letzter Commit) |

Jede Stufe durchlief eine adversariale Multi-Agent-Review; insgesamt 17 bestätigte
Bugs gefunden und gefixt (u. a. Server-Crash bei Stream-Abbruch, Sonnet-5-Thinking
frisst Token-Budget, trust proxy für Render, Mikrofon-Doppelstart-Leck).

## Start & Test

```bash
npm run dev          # Root; Server :3001 (SERVER_PORT!), Client :5173
```
`.env` existiert lokal (ANTHROPIC_API_KEY gesetzt, Spend-Limit 30 $ in Console aktiv).
Health: http://localhost:3001/api/health

## Architektur-Kurzfassung

- **Browser → Express (`server/`) → Claude API.** Key NUR in `.env`/Render, nie im Client.
- `server/index.ts`: `/api/chat` (SSE), `/api/dictionary` + `/api/exercise`
  (structured outputs via `output_config.format`, 60-s-Timeout, Validierung),
  `requireAccessCode` (Header `X-Access-Code`, aktiv wenn env `ACCESS_CODE`),
  Rate-Limit 20/min gemeinsam, `trust proxy=1` (Render).
- `server/claude.ts`: Modell `CLAUDE_MODEL` (Default **claude-sonnet-5**),
  `max_tokens: 1024`, **thinking explizit disabled** (sonst frisst Sonnet 5 das
  Budget unsichtbar), Prompt Caching (System + letzte Nachricht).
  WICHTIG: SDK-`stream.abort()` feuert das **'abort'-Event** — der Listener
  plus `stream.done().catch()` verhindern einen Prozess-Crash. Nicht entfernen!
- `client/src/theme.css`: komplettes Design-System aus `docs/mockup.html`
  (Klassennamen 1:1). `docs/` ist die unantastbare Referenz (gitignored).
- Zweisprachigkeit: Labels via `lib/i18n.ts` (lead + t2-Untertitel);
  Chat-Antworten enden mit `PREVOD:`-Zeile → `.tl`-Untertitel (Split: LETZTE
  zeilenverankerte Fundstelle).
- Sprache: `lib/speech.ts` (Browser-TTS + webkitSpeechRecognition),
  `lib/mic.ts` (Pegel via AnalyserNode, reentranzfest).

## Regeln (nicht verhandelbar)

1. **mila.png ist ein privates Foto** (`docs/assets/characters/`): nie in Repo,
   nie zu Dritt-Diensten (auch nicht Simli!), Kinderfigur → illustriert statt
   fotoreal. Fotos wurden auf Nutzerwunsch komplett aus der App entfernt (SVG-Avatare).
2. **Budget:** max. 30 CHF Validierungsphase; einziger Kostenposten Claude API.
3. **`SERVER_PORT` statt `PORT`** im Dev (Launcher injiziert PORT=5173);
   `PORT` nur bei `NODE_ENV=production`.
4. `docs/`, Screenshots, Projekt-Prompts, `.env*`, `backup/` sind gitignored —
   vor jedem Commit prüfen, dass nichts Privates hineinrutscht.

## Nächste Schritte (in Reihenfolge)

1. **Review der M7-Sprach-Features** (adversarialer Workflow wie bei M2–M5 —
   in Session 1 aus Kontext-Gründen übersprungen).
2. **Nutzer-Schritte Veröffentlichung** (Anleitung im Chat + README):
   GitHub-Konto → Repo `language-teacher` (public) → push → Render-Blueprint
   (Key + ACCESS_CODE + CLIENT_ORIGINS) → Pages aktivieren + Repo-Variable
   `API_BASE_URL` → am Handy installieren.
3. **Avatar: Gratis-Lippensync ist GEBAUT (M7b, Nutzer-Entscheid).**
   `AvatarStage.tsx` + `lib/speech.ts`: Mundformen aus Wort-Grenz-Events der
   Browser-TTS (Visem-Mapping a→offen, o/u→rund, e/i→schmal, m/b/p→zu;
   Fallback-Rhythmus ohne Boundary-Events), Blinzeln, Kopfbewegung. E2E-getestet.
   **Simli ist nur noch OPTIONAL** („Wow-Upgrade"): falls der Nutzer später die
   Gratis-Minuten testen will → Konto + `SIMLI_API_KEY`, `<video>` ersetzt die
   Bühne. Kunstgesichter für Luka/Ana; Mila bleibt illustriert (Regel 1).
4. **Phase 3b — Azure TTS F0** (gratis 500k Zeichen/Monat): echte Serbisch-Stimmen
   (Latinica+Ćirilica), ersetzt Browser-TTS in `lib/speech.ts` (Provider-Abstraktion),
   liefert Visem-Events. Nutzer braucht Azure-Konto.
5. **Phase 2 — SQLite-Memory** (Lernstand über Sitzungen, Fehlerprofil).

## Wissensquellen

- `docs/mockup.html` = Design-Wahrheit; `docs/recherche.md` §5 = Stack/Budget;
  `docs/charakter-portraits-anleitung.md` = Bild-/Kinderschutz-Regeln.
- Claude-Memory-Verzeichnis der Session enthält `language-teacher-projekt.md`
  (Kurzfassung dieser Datei).
- Backup: `backup/language-teacher-backup-<datum>.zip` (ohne node_modules/.git/.env).
