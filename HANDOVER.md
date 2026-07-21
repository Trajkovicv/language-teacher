# HANDOVER — Projektstand & Session-Übergabe

> **Zweck:** Diese Datei zuerst lesen, wenn eine neue Claude-Session startet.
> Stand: 21. Juli 2026, Session 2 (M8: Anhänge + Tipp-zum-Anhören + Azure-TTS-Pfad).

## Status: Was fertig ist (alles reviewt + E2E-getestet)

| Meilenstein | Inhalt | Commits |
|---|---|---|
| M1 | Gerüst: Vite-React-TS `client/`, Express-TS `server/`, `npm run dev` startet beide | b0e524e |
| M2 | Chat E2E: `/api/chat` SSE-Streaming, Lehrer-System-Prompt (3 Charaktere), PREVOD-Untertitel | b0e524e |
| M3 | Mockup-UI 1:1: 3 Themes, Sidebar/Avatar-Bühne, Tabs, DE/EN/SR-i18n, Voice-Bar mit echtem Mikrofonpegel | 358d151 |
| M4 | Wörterbuch live: `/api/dictionary` (structured outputs), Deklination, klickbare Synonyme | 657ae0b |
| M5 | Übungen live: `/api/exercise` (mc/blank), eigene Übung per Prompt, Server-Validierung | 657ae0b |
| M6 | PWA (installierbar, Icons), GitHub-Pages-Workflow, Render-Blueprint, ACCESS_CODE-Schutz | b0e524e |
| M7 | Sprech-Schleife: Browser-TTS (Antworten werden vorgelesen, de/en), Diktat per Mikro, Fotos entfernt → SVG-Avatare | dd4b177 |
| M7b | Gratis-Lippensync (Visem-Mapping aus TTS-Wort-Grenz-Events) + Mobil-/Audio-Fixes | 4a2868f… |
| M8 | Foto-/PDF-Anhänge (Claude Vision), Tipp-zum-Anhören (PREVOD-Zeile + 🔊 pro Nachricht), `/api/tts` (Azure F0, optional) über `<audio>`-Element, Browser-TTS-Härtung (GC-Schutz, resume-Heartbeat, visibilitychange), Audio-Diagnose per Tap auf die Versionszeile, PWA skipWaiting | ae5cdc2 |

Jede Stufe durchlief eine adversariale Multi-Agent-Review. Session 2 hat die in
Session 1 übersprungene M7-Review zusammen mit M8 nachgeholt (125 Agenten,
5 Dimensionen × 3 Skeptiker pro Fund): ~20 bestätigte Findings, alle gefixt.
Highlights: Utterance-GC-Race (speaking hing fest), Vorlesen abgebrochener
Teilantworten nach Stopp/Charakterwechsel, Zugangscode brute-force-bar (Limiter
lief NACH der Code-Prüfung), gleitendes Verlaufsfenster entwertete den
Prompt-Cache, Wörterbuch-JSON kollidierte mit max_tokens 1024, iOS-Fokus-Zoom,
Audio-Unlock hing an pointerdown (zählt auf Touch nicht als Geste).

## Start & Test

```bash
npm run dev          # Root; Server :3001 (SERVER_PORT!), Client :5173
```
`.env` existiert lokal (ANTHROPIC_API_KEY gesetzt, Spend-Limit 30 $ in Console aktiv).
Health: http://localhost:3001/api/health

## Architektur-Kurzfassung

- **Browser → Express (`server/`) → Claude API.** Key NUR in `.env`/Render, nie im Client.
- `server/index.ts`: `/api/chat` (SSE; User-Turn darf 1 Bild-/PDF-Block tragen,
  streng validiert, express.json-Limit 10 MB), `/api/dictionary` + `/api/exercise`
  (structured outputs via `output_config.format`, 60-s-Timeout, Validierung),
  `/api/tts` (Azure-Proxy, eigenes Rate-Limit 40/min, 503 wenn kein Azure-Key),
  `requireAccessCode` (Header `X-Access-Code`, aktiv wenn env `ACCESS_CODE`),
  Rate-Limit 20/min gemeinsam (Chat/Dict/Übungen), `trust proxy=1` (Render).
- `server/tts.ts`: Azure AI Speech F0 (env `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`,
  Anleitung für den Nutzer: `ANLEITUNG-AZURE.md`). Stimmen de/en/sr (Latinica UND
  Ćirilica, weiblich/männlich je Charakter), SSML rate -8 %, In-Memory-Cache.
- **Anhänge & Budget:** Ein Anhang geht nur im EIGENEN Turn als echter Block an die
  API; im späteren Verlauf wird er zum Text-Marker `[Bild: name]` (ChatPanel
  `windowForApi`). Bilder client-seitig auf ≤1024 px JPEG verkleinert, PDF ≤ 4 MB.
- **Kostenbremsen:** Tages-Token-Limit im Server (env `DAILY_TOKEN_LIMIT`,
  Default 400k Tokens/Tag, in-memory) — KI-Routen antworten 429, wenn erreicht.
  Verlaufsfenster wird in stabilen 20er-Blöcken beschnitten (41–60 Nachrichten),
  damit der Prompt-Cache-Präfix erhalten bleibt. Cache-Breakpoint überspringt
  Anhang-Turns (deren Cache würde nie gelesen).
- **Middleware-Reihenfolge (nicht umstellen!):** Limiter → Zugangscode →
  Body-Parser (pro Route: 10 MB nur Chat, sonst 64 kb). ⚠️ SSE-Abbruch-Erkennung
  hängt an `res.on('close')` — `req.on('close')` feuert seit dem Parser-Umzug
  sofort nach dem Body-Einlesen und würde jeden Stream sofort abbrechen.
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
- Sprache: `lib/speech.ts` — zwei Wege: Server-TTS (Azure, `<audio>`-Element,
  fixt Bluetooth/iOS-PWA; aktiv wenn `/api/health` `tts:true` meldet) mit
  automatischem Fallback auf Browser-TTS. Härtungen: Utterance-GC-Schutz,
  resume-Heartbeat (Chrome-15-s-Bug), visibilitychange-Wake, Audio-Element-
  Unlock in der ersten Nutzer-Geste (`prime()`). Diagnose: Tap auf „v…" in der
  Kopfzeile zeigt Modus/Stimmen/Ereignis-Log. `lib/mic.ts` (Pegel, reentranzfest).
- Dev-Zweitinstanz: `npm run dev:alt` (Server :3101, Client :5273) — für
  Worktrees/Parallel-Sessions, `SERVER_PORT` steuert auch den Vite-Proxy.

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

1. **NUTZER-SCHRITT — Handy-Audio bestätigen:** Am Handy die App neu öffnen
   (ggf. 2× schließen/öffnen, damit die PWA den neuen Build zieht), auf die
   Versionszeile tippen (Audio-Diagnose) und den 🔊-Selbsttest machen.
   Bleibt es mit AirPods Max stumm → **Azure einrichten** (`ANLEITUNG-AZURE.md`,
   0 CHF): löst Bluetooth-Routing + iOS-PWA grundsätzlich und bringt echte
   serbische Stimmen. Code-Seite ist fertig — es fehlen nur Key + Region in Render.
2. **Phase 2 — SQLite-Lern-Gedächtnis:** Lernstand/Fehlerprofil pro Charakter
   über Sitzungen, Zusammenfassungen via `claude-haiku-4-5` (docs/recherche.md §5).
3. **Optional — Simli** („Wow-Upgrade", Nutzer-Entscheid nötig): `<video>` ersetzt
   die Bühne; Kunstgesichter für Luka/Ana; Mila bleibt illustriert (Regel 1).
   Gratis-Lippensync (M7b) ist gebaut und Standard.
4. **Optional — Whisper-STT** für zuverlässiges serbisches Diktat (Phase 3).

## Wissensquellen

- `docs/mockup.html` = Design-Wahrheit; `docs/recherche.md` §5 = Stack/Budget;
  `docs/charakter-portraits-anleitung.md` = Bild-/Kinderschutz-Regeln.
- Claude-Memory-Verzeichnis der Session enthält `language-teacher-projekt.md`
  (Kurzfassung dieser Datei).
- Backup: `backup/language-teacher-backup-<datum>.zip` (ohne node_modules/.git/.env).
