# Padel-Turnier

Schweizer System für Einzel, 4 bis 24 Spieler, mit Platzplanung, Uhrzeiten und Live-Ansicht.

## Stand
- `dist/padel-turnier.html`: lauffähige Einzeldatei (V37, läuft auch lokal im Browser).
- Hosting-Plan (Phasen): 0 Engine auslagern, 1 Server mit Rollen und Ergebnis-Bestätigung, 2 Spieler-Oberfläche, 3 Einrichtung GitHub und Cloudflare, 4 Härtung.

## Tests
`npm install && npm test` (Testbatterie gegen `dist/padel-turnier.html`).

## Server (Phase 1)
Cloudflare Worker + SQLite-Durable-Object je Turnier (`server/`). Die Engine wird aus `src/engine.js` erzeugt (`npm run build:server`, Prüfung: `node tools/build-server.js --check`).
Die Kernlogik (`server/core.mjs`) ist rein synchron, damit sich gleichzeitige Anfragen nicht überholen können.

Schnittstelle (`/api/t` legt an, alles weitere unter `/api/t/<CODE>/…`; Token im Header `Authorization: Bearer …`):

| Route | Wer | Zweck |
|---|---|---|
| `POST /api/t` | Organisator (Header `x-create-key`) | Turnier anlegen, liefert Code und Admin-Schlüssel |
| `GET state[?since=ver]` | alle | Zustand (Zuschauer ohne Rechte, Spieler mit eigener Rolle) |
| `POST join` / `rename` / `leave` | Spieler | Beitritt vor dem Start, eigener Name |
| `POST result` / `confirm` / `dispute` | Spieler im Spiel | Ergebnis melden, Gegner bestätigt oder widerspricht |
| `POST drop-request` | Spieler | Ausscheiden beantragen |
| `POST admin/*` | Organisator | config, add, rename, kick, release, start, result (`force`), drop, dismiss, assign, undo, end |

Ergebnisfluss: Meldung durch einen Beteiligten, Bestätigung durch den anderen, identische Gegenmeldung zählt als Bestätigung. Gegenvorschlag überschreibt; ab der dritten Änderung gilt das Spiel als strittig. Modus `auto`: `confirmed` (Standard, neue Spiele erst wenn nichts offen oder strittig ist, Selbstbestätigung nach `grace` Sekunden), `reported` (sofort), `off` (Organisator setzt an). Gesperrte Spiele kann nur der Organisator mit `force` ändern.

Tests Server: `npm run test:server` (135 Funktionsprüfungen, Simulation mit 160 Turnieren mit und ohne Speicher-Neustart, Fuzz mit ~16 000 Aufrufen).
Nicht geprüft: echtes Cloudflare (`wrangler dev`), Firefox/Safari.

## Oberfläche online (Phase 2)
`public/index.html` wird vom Worker ausgeliefert und aus denselben Quellen gebaut wie die Offline-Datei (`npm run build` erzeugt beide; `npm run build:check` prüft, ob sie aktuell ist). Zusätzlich: `src/online.js`, `src/online.css`.

| Rolle | Weg | Was geht |
|---|---|---|
| Organisator | Startseite, „Neues Turnier anlegen“, Schlüssel (`CREATE_KEY`) | Einstellungen, Spieler verwalten, starten, jedes Ergebnis jederzeit ändern, ansetzen, zurücknehmen, ausscheiden lassen, Zugang freigeben, beenden; kann selbst mitspielen |
| Spieler | Link `…/#CODE` | Namen eintragen, im Warteraum ändern, „Dein Spiel“ mit Ergebnis-Eingabe, Ausscheiden anfragen |
| Zuschauer | Link `…/#CODE` nach dem Start | Tabelle, Spielplan, laufende Spiele (nur lesen) |

- Standard „Ein Spieler trägt ein, das gilt sofort“: einer der beiden Spieler oder der Organisator trägt ein, die nächsten Spiele werden automatisch angesetzt. Wählbar: „Der Gegner bestätigt“ oder „Nur ich“.
- Der Organisator-Link (`…/#CODE/a_…`) enthält den Schlüssel im Teil nach `#`, der nie an den Server geht. Beim Öffnen wird er im Browser gespeichert und aus der Adresszeile entfernt.
- Aktualisierung alle 3 Sekunden (15 Sekunden bei verdecktem Tab), Eingaben und Fokus bleiben beim Aktualisieren erhalten.
- Lokal ausprobieren: `npm run dev` (wrangler, Schlüssel `geheim`), dann `http://localhost:8787`.

Tests: `npm run test:online` (3 Modi, mehrere Seiten gegen den echten Server-Kern, 57 bis 60 Prüfungen je Modus), `npm run test:e2e` (echter Chromium gegen einen laufenden Server, z. B. `npm run dev`).
Geprüft in `wrangler dev` (workerd, lokal): vollständiges Turnier mit 8 Spielern über 8 Browser-Seiten.
