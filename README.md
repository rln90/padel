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

## Härtung (Phase 4)
| Bereich | Maßnahme |
|---|---|
| Header Seite | `public/_headers`: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy no-referrer, Permissions-Policy, HSTS, noindex |
| Header API | CSP `default-src 'none'`, nosniff, no-referrer, noindex, no-store (`server/worker.mjs`) |
| Suchmaschinen | `public/robots.txt` sperrt alles, dazu `X-Robots-Tag` |
| Anlegen | `server/limiter.mjs` (Durable Object `LimiterDO`): pro IP 8 falsche Schlüssel in 15 min, dann 15 min Sperre (auch mit richtigem Schlüssel); höchstens 30 neue Turniere pro Stunde |
| Spielbetrieb | Bestehende Grenzen: 4 KB pro Anfrage, 600 Schreib-/6000 Lese-Anfragen pro Minute und Turnier, 30 Beitritte pro IP in 10 min, höchstens 24 Spieler |
| Aufräumen | Turnier wird 7 Tage nach der letzten Änderung gelöscht (Alarm im Durable Object) |
| Prüfung | `npm run test:csp` (Browser gegen `wrangler dev`): eigene Seite ohne CSP-Verstöße, fremde Skripte und Verbindungen blockiert |

Grenzen: Die CSP erlaubt `'unsafe-inline'` für Skripte, weil die Oberfläche Inline-Handler nutzt. Schutz gegen eingeschleusten Code bietet vor allem das durchgängige Escapen aller Namen. Der Limiter-Zustand liegt nur im Arbeitsspeicher und beginnt nach einem Neustart der Instanz von vorn. Teilen sich mehrere Personen eine IP (z. B. WLAN vor Ort), teilen sie sich auch die Grenzen beim Anlegen.

## QR-Code für den Spielerlink
Im Warteraum steht unter dem Spielerlink ein QR-Code, später im Organisator-Bereich unter „QR-Code für Spieler“. Er wird auf der Seite selbst erzeugt (Bibliothek `src/vendor/qrcode.min.js`, MIT, kein externer Dienst), immer schwarz auf weiß mit Ruhezone, auch im dunklen Modus. `npm run test:qr` liest den gerenderten Code mit einem Scanner (jsQR) aus und vergleicht ihn mit dem Spielerlink.

## Betrieb (Phase 5)
| Bereich | Umsetzung |
|---|---|
| Automatische Tests | `.github/workflows/ci.yml`: bei jedem Pull Request und auf `main`. Job `schnell` (Build-Prüfung, Server, Oberfläche), Job `browser` (echter Chromium gegen `wrangler dev`: e2e, Audit, CSP, QR, Sicherung, Generalprobe) |
| Fehlerprotokoll | `[observability]` in `wrangler.toml`: Logs im Cloudflare-Dashboard (Worker, Observability). Der Server schreibt nur technische Fehler (`intern`, `speichern`) und Sperren des Limiters. Nie Namen, Zugangsschlüssel oder IP-Adressen |
| Sicherung | Organisator-Bereich: „Sicherung herunterladen“ (JSON, ohne Zugangsdaten). Startseite, „Neues Turnier anlegen“, „Aus Sicherung wiederherstellen“: braucht den Schlüssel, ergibt ein neues Turnier mit neuem Code. Alle Spieler sind „frei“ und tragen ihren Namen wieder ein |
| Prüfung Sicherung | Simulation: bei jedem Lauf mehrfach sichern, wiederherstellen, Stand vergleichen (586 Rundläufe); `npm run test:backup` im Browser |

Grenzen der Sicherung: Das Protokoll der Änderungen und offene Ausscheiden-Anfragen werden nicht gesichert. Dateien über 400 KB werden abgelehnt. Das Wiederherstellen legt immer ein neues Turnier an, es überschreibt nichts.

## Komfort für Spieler (Phase 6)
| Funktion | Verhalten |
|---|---|
| Mein Stand | Im Feld „Dein Spiel“: Platz, Punkte, Siege/Niederlagen und Games aus der Tabelle. Auch für ausgeschiedene Spieler |
| Meine Spiele | Aufklappbare Liste aller eigenen Spiele mit Gegner und Ergebnis (Sieg/Niederlage), offene Spiele mit Platz. Bei Zusatzspielen der Hinweis, für wen sie zählen |
| Hinweis bei neuem Spiel | Wird ein eigenes Spiel angesetzt, erscheint oben „Dein nächstes Spiel steht“ mit Gegner und Platz, der Seitentitel bekommt „●“, und Android-Handys vibrieren. Beim Neuladen der Seite gibt es keinen Hinweis auf schon bekannte Spiele |
| Endstand teilen | Nach dem Turnier: „Endstand teilen“ nutzt die Teilen-Funktion des Geräts, sonst kopiert es den Text (Plätze, Punkte, Games, Link, 7 Tage abrufbar) |

Grenzen: Der Hinweis wirkt nur, solange die Seite geöffnet ist (auch im Hintergrund-Tab, dort wird alle 15 Sekunden geprüft). Echte Benachrichtigungen bei geschlossener Seite (Web-Push) gibt es nicht. Prüfung: `tests/online/ui-komfort.test.mjs` (Teil von `npm run test:online`).
