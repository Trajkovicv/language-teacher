# Echte Stimmen einschalten (Azure AI Speech, dauerhaft gratis)

Die App liest Antworten aktuell mit den **Browser-Stimmen** vor. Das ist gratis,
aber auf Handys unzuverlässig (Bluetooth-Kopfhörer, installierte App/PWA) und
für **Serbisch gibt es meist gar keine Stimme**.

Mit einem kostenlosen Azure-Konto bekommt die App **echte neuronale Stimmen**
für Deutsch, Englisch und Serbisch (Latinica **und** Ćirilica). Der Ton läuft
dann über eine normale Audio-Datei vom eigenen Server — das funktioniert auch
mit AirPods & Co. und in der installierten App zuverlässig.

**Kosten: 0 CHF.** Der Gratis-Tarif „F0" enthält dauerhaft 500'000 Zeichen
Sprachausgabe pro Monat (das sind grob 10–15 Stunden Vorlesen — mehr als genug;
die App cached wiederholte Sätze zusätzlich). Es ist **kein** bezahltes
Upgrade nötig, und ohne Upgrade kann auch nichts kosten.

## Schritt für Schritt (einmalig, ca. 10 Minuten)

1. **Azure-Konto anlegen:** https://azure.microsoft.com/free
   → „Kostenlos starten" → mit Microsoft-Konto anmelden (oder eines erstellen).
   Azure verlangt zur Identitätsprüfung eine Kreditkarte — für den F0-Tarif
   wird nichts abgebucht.
2. **Speech-Ressource erstellen:** https://portal.azure.com
   → oben suchen: **„Speech Dienste"** (Speech services) → **Erstellen**.
   - Abonnement: dein neues Abo
   - Ressourcengruppe: „Neu erstellen" → z. B. `language-teacher`
   - Region: **West Europe** (`westeurope`)
   - Name: z. B. `language-teacher-speech`
   - Tarif: **Free F0** ← wichtig!
   → „Überprüfen + erstellen" → „Erstellen" → warten → „Zu Ressource wechseln".
3. **Schlüssel kopieren:** In der Ressource links **„Schlüssel und Endpunkt"**
   (Keys and Endpoint) → **SCHLÜSSEL 1** kopieren. Die **Region** steht direkt
   darunter (z. B. `westeurope`).
4. **In Render eintragen:** https://dashboard.render.com
   → Dienst **language-teacher-api** → **Environment** → zwei Variablen anlegen:
   - `AZURE_SPEECH_KEY` = (der kopierte Schlüssel)
   - `AZURE_SPEECH_REGION` = `westeurope`
   → Speichern — Render startet den Server automatisch neu (~1 Minute).
5. **Prüfen:** App öffnen → oben auf die Versionszeile („v…") tippen.
   In der Diagnose muss stehen: **„Server-Stimmen (Azure): AN"**.
   Dann unten „🔊 Ton an" antippen — der Testsatz kommt jetzt von Azure.

## Lokal entwickeln (optional)

In die `.env` im Projekt-Root zusätzlich eintragen:

```
AZURE_SPEECH_KEY=dein-schlüssel
AZURE_SPEECH_REGION=westeurope
```

## Sicherheit

- Der Schlüssel bleibt auf dem Server (Render bzw. `.env`) — er landet **nie**
  im Browser oder im Git-Repo.
- Der `/api/tts`-Endpunkt ist wie der Chat durch deinen `ACCESS_CODE` geschützt
  und zusätzlich ratenbegrenzt.
