# Tägliche Lern-Erinnerung per E-Mail einschalten

Andrijana (und optional Vuk) bekommt jede Morgen eine freundliche E-Mail von
„Mila": das heutige Thema, ihr Lernstand (echte Zahlen), Fokus und wie sie sich
vorbereitet. Der Versand läuft über deinen Server; ausgelöst wird er **gratis**
täglich über GitHub Actions.

**Kosten: 0 CHF** (kostenloser E-Mail-Tarif + GitHub Actions ist gratis).

> **Sicherheit:** Alle Zugangsdaten (SMTP-Passwort, Secret) trägst du **selbst**
> in Render bzw. in die GitHub-Secrets ein — **nie** in den Chat, **nie** ins Repo.

## Schritt 1: einen kostenlosen E-Mail-Versand einrichten

Du brauchst SMTP-Zugangsdaten. Zwei einfache Wege:

### Variante A (empfohlen): Brevo (gratis, 300 Mails/Tag)
1. Konto anlegen: https://www.brevo.com → **Sign up free**.
2. **Absender verifizieren:** Settings → **Senders** → deine eigene Adresse
   (z. B. deine Hotmail) hinzufügen und den Bestätigungslink anklicken.
3. **SMTP-Schlüssel holen:** Menü **SMTP & API** → **SMTP** → dort stehen:
   - **Server:** `smtp-relay.brevo.com`  · **Port:** `587`
   - **Login** (eine E-Mail/ID) und ein **SMTP-Key** (das „Passwort").

### Variante B: Gmail mit App-Passwort
1. Bei Google **2-Faktor-Anmeldung** aktivieren.
2. https://myaccount.google.com/apppasswords → App-Passwort erzeugen (16 Zeichen).
3. Server: `smtp.gmail.com` · Port: `587` · Login: deine Gmail · Passwort: das App-Passwort.

## Schritt 2: Werte in Render eintragen

https://dashboard.render.com → **language-teacher-api** → **Environment** → anlegen:

| Variable | Wert (Beispiel) |
|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | dein Brevo-Login (bzw. Gmail-Adresse) |
| `SMTP_PASS` | der SMTP-Key / das App-Passwort |
| `MAIL_FROM` | `Mila – Sprachlehrerin <deine-verifizierte@adresse>` |
| `REMINDER_ANDRIJANA_EMAIL` | Andrijanas E-Mail-Adresse |
| `REMINDER_VUK_EMAIL` | (optional) Vuks E-Mail-Adresse |
| `REMINDER_SECRET` | ein selbst ausgedachtes langes Passwort (z. B. 30 Zeichen) |
| `APP_URL` | (optional) `https://trajkovicv.github.io/language-teacher/` |

→ **Save** (Render startet neu). Danach meldet `…/api/health` künftig `mail: true`.

## Schritt 3: den täglichen Auslöser scharf schalten (GitHub)

GitHub → Repo **Trajkovicv/language-teacher** → **Settings** → **Secrets and
variables** → **Actions**:
- Reiter **Secrets** → **New repository secret**:
  `REMINDER_SECRET` = **exakt derselbe Wert** wie in Render.
- Reiter **Variables**: `API_BASE_URL` sollte schon existieren
  (`https://language-teacher-api.onrender.com`). Falls nicht, anlegen.

**Uhrzeit:** In `.github/workflows/daily-reminder.yml` steht `cron: '0 6 * * *'`
(= 06:00 UTC, ca. 07:00–08:00 in der Schweiz). Ändere die Zahl, wenn du eine
andere Zeit willst (die erste Zahl = Minute, die zweite = Stunde in UTC).

## Schritt 4: testen (ohne auf morgen zu warten)

GitHub → Reiter **Actions** → Workflow **„Daily learning reminder"** →
**Run workflow**. Danach zeigt der Lauf `HTTP 200` und `"status":"gesendet"` —
und Andrijana hat die Test-Mail im Postfach.

## Was in der Mail steht
- Heutiges Thema (rotiert nach Wochentag: Konnektoren, Zeiten/Passiv, Fälle,
  Wortschatz Beruf/Pflege, Konjunktiv II …).
- Echter Lernstand aus der App (Minuten, Sitzungen, aktive Tage, Serie).
- Kurzer Fokus aus dem Lern-Gedächtnis, Vorbereitungs-Tipp, Motivation.
- Ein Knopf „Zur App".

## Ohne Einrichtung
Solange die SMTP-Variablen fehlen, meldet der Server `mail: false` und der
Endpunkt antwortet höflich mit „nicht eingerichtet" — es passiert nichts
Ungewolltes, und die App läuft normal weiter.
