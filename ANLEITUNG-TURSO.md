# Echte Konten mit Geräte-Sync einschalten (Turso-Datenbank, dauerhaft gratis)

Bisher liegen Lern-Gedächtnis und Nutzungs-Statistik **pro Gerät** im Browser
(localStorage). Wer am Laptop und am Handy lernt, hat zwei getrennte Stände.

Mit einer kostenlosen **Turso-Datenbank** bekommt jede Person ein echtes Konto
(Name + Passcode). Gedächtnis und Statistik liegen dann **auf dem Server** und
sind auf allen Geräten gleich. Vuk und Andrijana melden sich mit ihrem eigenen
Konto an — sauber getrennt, egal von welchem Gerät.

**Kosten: 0 CHF.** Der Free-Tarif von Turso ist riesig (500 Mio. gelesene
Zeilen/Monat, 10 Mio. geschriebene, 5 GB, bis zu 100 Datenbanken). Unsere App
schreibt pro Person nur ein paar Zeilen — das reicht praktisch für immer, ohne
je etwas zu bezahlen. Es ist **kein** kostenpflichtiges Upgrade nötig.

> **Wichtig — Sicherheit:** Der **Auth-Token** ist ein Geheimnis (wie der
> Azure-Schlüssel). Trage ihn **selbst** in Render und in deine lokale `.env`
> ein. Schick ihn **nicht** in den Chat und lade ihn **nie** ins Git-Repo.

## Schritt für Schritt (einmalig, ca. 10 Minuten)

1. **Turso-Konto anlegen:** https://turso.tech → **„Sign up"**.
   Am einfachsten mit GitHub oder Google anmelden (du hast GitHub schon).
   Keine Kreditkarte nötig.

2. **Datenbank erstellen:** Im Dashboard **„Create Database"** (bzw. „+ New").
   - Name: z. B. `language-teacher`
   - Gruppe/Region: eine Region **in Europa** wählen (z. B. Amsterdam `ams`
     oder Frankfurt `fra`) → kurze Wege, schnelle Antworten.
   - Plan: der **Free**-Tarif ist voreingestellt — so lassen.
   → **Create**. Warte, bis die Datenbank „ready" ist.

3. **Datenbank-URL kopieren:** Öffne die neue Datenbank. Oben steht die
   **URL** in der Form `libsql://language-teacher-DEINNAME.turso.io`
   (manchmal als „Connection URL" / „Database URL" beschriftet). Kopieren.

4. **Auth-Token erstellen:** Auf derselben Datenbank-Seite den Bereich
   **„Tokens"** / **„Create Token"** öffnen → Token mit **Lese- und
   Schreibrecht** (Full access, ohne Ablaufdatum) erzeugen → **einmalig**
   kopieren (er wird nur einmal angezeigt). Das ist eine lange Zeichenkette.

5. **In Render eintragen:** https://dashboard.render.com → Dienst
   **language-teacher-api** → **Environment** → zwei Variablen anlegen:
   - `TURSO_DATABASE_URL` = die URL aus Schritt 3 (`libsql://…turso.io`)
   - `TURSO_AUTH_TOKEN` = der Token aus Schritt 4
   → **Save** — Render startet den Server automatisch neu (~1 Minute).

6. **Lokal eintragen (für Tests):** In die `.env` im Projekt-Root zusätzlich:

   ```
   TURSO_DATABASE_URL=libsql://language-teacher-DEINNAME.turso.io
   TURSO_AUTH_TOKEN=dein-langer-token
   ```

7. **Prüfen:** Wenn der Server läuft, meldet `…/api/health` künftig
   `db: true`. Danach zeigt die App beim Start einen **Anmelde-Bildschirm**:
   Vuk und Andrijana legen je **einmal** Name + Passcode an — ab dann sind
   ihre Stände auf jedem Gerät gleich.

## Was in der Datenbank landet (und was nicht)

- **Konten:** Name + verschlüsselter Passcode (nie im Klartext).
- **Lern-Gedächtnis** und **Nutzungs-Statistik** pro Konto (dieselben Inhalte
  wie bisher im Browser — nur jetzt geräteübergreifend).
- **Kein** Chatverlauf im Klartext, keine privaten Fotos, keine Zahlungsdaten.

## Sicherheit

- Der Token bleibt auf dem Server (Render bzw. `.env`) — nie im Browser, nie im
  Repo (`.env*` ist in `.gitignore`).
- Alle Konten-Endpunkte sind zusätzlich durch deinen `ACCESS_CODE` geschützt.
- Passcodes werden nur als **scrypt-Hash mit Zufalls-Salt** gespeichert.

### Wichtig: Wer darf ein Passwort setzen? (`REGISTER_CODE`)

Der `ACCESS_CODE` ist der Schlüssel, um die App überhaupt zu benutzen — den kennt
also auch Andrijana. Damit **nur du und Andrijana** ein Passwort *anlegen oder
zurücksetzen* können (und niemand sonst, dem ihr die App mal gezeigt habt), gibt
es einen getrennten **Einrichtungs-Code**:

1. In Render eine Variable **`REGISTER_CODE`** = ein langes, geheimes Passwort setzen.
2. **Speichern** (Server startet neu).
3. Beim ersten Anlegen fragt der Anmelde-Bildschirm nach diesem Einrichtungs-Code.
   Gib ihn **einmal** an Andrijana weiter, damit sie ihren Passcode setzen kann —
   sonst behältst du ihn für dich.

Wirkung: Ohne den `REGISTER_CODE` kann **niemand** ein Passwort setzen oder
ändern — selbst wenn er den `ACCESS_CODE` kennt. Ein bereits gesetztes Passwort
lässt sich nur mit dem `REGISTER_CODE` zurücksetzen (praktisch, falls jemand
seinen Passcode vergisst). Ändern ohne den Code ist unmöglich.

> Tipp: Setz `REGISTER_CODE` am besten sofort und lege dann die Passcodes für
> Vuk und Andrijana einmal an — danach ist „wer darf Passwörter setzen" fest
> auf euch zwei begrenzt.

## Optional: per CLI statt Dashboard

Wer lieber die Kommandozeile nutzt:
```
# einmalig: Turso CLI installieren (siehe docs.turso.tech), dann
turso auth signup
turso db create language-teacher
turso db show language-teacher --url        # → TURSO_DATABASE_URL
turso db tokens create language-teacher     # → TURSO_AUTH_TOKEN
```
