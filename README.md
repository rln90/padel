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
