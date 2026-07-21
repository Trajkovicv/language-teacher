# Language Teacher APP

KI-Sprachlehrer für Deutsch / Englisch / Serbisch (Latinica + Ćirilica) mit drei
Lehrer-Charakteren (Mila, Luka, Ana), Wörterbuch und Übungen.
Design-Referenz: `docs/mockup.html` · Stack-Entscheidungen: `docs/recherche.md` (Abschnitt 5).

## Struktur

```
client/   Vite + React + TypeScript (UI)
server/   Node + Express + TypeScript (Claude-API, SSE) — API-Key NUR hier
docs/     Planung, Mockup, Recherche (Referenz, bleibt unangetastet)
```

## Setup

Voraussetzung: Node.js ≥ 20.

```bash
# 1. Abhängigkeiten installieren (Root = concurrently, dann client + server)
npm install
npm install --prefix client
npm install --prefix server

# 2. Umgebungsvariablen
#    .env.example nach .env kopieren und ANTHROPIC_API_KEY eintragen.
#    Modell-Default: claude-sonnet-5 (Budget-Regel, siehe docs/business-kosten.md)

# 3. Entwicklung starten (Server auf :3001 + Client auf :5173)
npm run dev
```

Dann http://localhost:5173 öffnen. Der Client spricht den Server über den
Vite-Proxy an (`/api` → `localhost:3001`), Health-Check: http://localhost:3001/api/health

## Budget-Regeln (Validierungsphase)

- Einziger Kostenposten: Claude-API. Gesamtbudget **max. 30 CHF** — Spend-Limit
  in der Claude Console setzen.
- Default-Modell `claude-sonnet-5`, `max_tokens: 1024`, Prompt Caching,
  Rate-Limiting, Stream-Abbruch bei Verbindungsabbruch.

## Als App installieren (PWA)

Die App ist eine installierbare Web-App: Seite im Browser öffnen →
„Zum Startbildschirm hinzufügen" (Handy) bzw. Installations-Symbol in der
Adressleiste (Desktop). Danach startet sie mit eigenem App-Icon im
Vollbild — ganz ohne App-Store.

## Veröffentlichen ohne Domain (GitHub Pages + Render)

Die App besteht aus zwei Teilen, die getrennt gehostet werden:

1. **Client → GitHub Pages** (kostenlos, Link: `https://<name>.github.io/<repo>/`):
   Der Workflow [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)
   baut und veröffentlicht bei jedem Push auf `main` automatisch.
   Einmalig: Repo-Settings → Pages → Source „GitHub Actions", und unter
   Settings → Secrets and variables → Actions → Variables die Variable
   `API_BASE_URL` auf die Server-URL setzen.
2. **Server → Render** (Gratis-Tarif): [render.yaml](render.yaml) als Blueprint
   deployen und dort `ANTHROPIC_API_KEY`, `ACCESS_CODE` und `CLIENT_ORIGINS`
   setzen. Der API-Key bleibt so ausschließlich auf dem Server.

**Budget-Schutz:** Öffentliche Instanz immer mit `ACCESS_CODE` betreiben —
die App fragt den Code einmalig ab und merkt ihn sich. Zusätzlich Spend-Limit
in der Claude Console setzen.

## Echte Stimmen (optional, gratis)

Standardmäßig liest die App mit Browser-Stimmen vor. Mit einem kostenlosen
Azure-Konto gibt es echte neuronale Stimmen für Deutsch, Englisch und
**Serbisch** (Latinica + Ćirilica), zuverlässig auch mit Bluetooth-Kopfhörern
und in der installierten App: Schritt-für-Schritt-Anleitung in
[ANLEITUNG-AZURE.md](ANLEITUNG-AZURE.md) (Azure AI Speech F0, 500k Zeichen/Monat
dauerhaft gratis; `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` in Render setzen).

## Hinweis zu den Charakterbildern

`client/public/characters/mila.png` ist ein **privates Foto** und bleibt
ausschließlich im lokalen Gebrauch — kein Upload in fremde Dienste (auch nicht
zu Avatar-Anbietern), kein öffentliches Deployment. Die Datei steht dafür in
der `.gitignore`; die veröffentlichte App zeigt automatisch einen neutralen
Platzhalter, bis eine generische Figur eingesetzt wird
(siehe `docs/charakter-portraits-anleitung.md`, lokal).

## Meilensteine

- **M1** Gerüst (client/server, Dev-Skripte, Health-Check) ✅
- **M2** Chat E2E: `/api/chat` mit SSE-Streaming + Chat-UI
- **M3** UI nach Mockup (Sidebar, Themes, Voice-Bar mit Mikrofonpegel, Chat-Komponenten)
- **M4** Wörterbuch-Tab (`/api/dictionary`)
- **M5** Übungen-Tab (`/api/exercise` + eigene Übung per Prompt)
- **M6** PWA + Veröffentlichung (GitHub Pages + Render, `ACCESS_CODE`)
- **M7/M7b** Sprech-Schleife: Vorlesen, Diktat, animierte Avatare mit Lippensynchronisation
- **M8** Foto-/PDF-Anhänge im Chat (Claude Vision), Tipp-zum-Anhören,
  `/api/tts` (Azure, optional) + Mobil-Audio-Härtung und Audio-Diagnose

Danach (nach Freigabe): Phase 2 = SQLite-Lern-Gedächtnis.
