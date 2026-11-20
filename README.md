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

## Feinschliff (Phase 7)
| Bereich | Änderung |
|---|---|
| Platznamen | Ein Feld pro Platz statt Kommaliste. Nach dem Start im Organisator-Bereich unter „Platznamen ändern“ jederzeit anpassbar, gilt sofort für alle |
| Lange Namen | Ergebnisse auf dem Handy zweizeilig (jeder Spieler mit eigenem Feld), Tabelle mit umbrechendem Namen und sichtbaren Punkten, Spielplan-Zellen mit zwei Zeilen |
| Spieleransicht | Oben die blaue Karte „Dein nächstes Spiel“ (Gegner groß, Platz als gelbe Pille, Uhrzeit, Ergebniseingabe), darunter die gelbe Platzierungskarte, dann Tabelle, Runde, Spielplan; Regeln und Ausscheiden unten |
| Organisator | Spielerliste kompakt (Name lesbar, „Bearbeiten“ klappt Feld und Knöpfe auf); „Selbst mitspielen“ steht unter dem Organisator-Bereich |
| Test | `npm run test:layout`: lange Namen, vier Bildschirmbreiten, hell und dunkel, kein Seitenüberlauf |

## Einheitlichkeit und Geräte (Phase 8)
| Bereich | Regel |
|---|---|
| Schrift | Skala 12 / 14 / 16 px für Text, Überschriften 20 bis 34 px, große Zahlen 54/64 px. Gewichte 400, 500, 600. Eingaben immer mindestens 16 px, damit iOS nicht hineinzoomt |
| Abstände | Raster 4 / 8 / 12 / 16 / 24 px. Feld und Knopf darunter immer 16 px, in aufklappbaren Karten genauso (Ursache des früheren Fehlers: Abstände per `gap` an `<details>` greifen nicht in jedem Browser) |
| Knöpfe | Alle 44 px hoch, 16 px Schrift, auf dem Handy füllen sie die Zeile |
| Geräte | Standardmodus mit `lang="de"`, `viewport-fit=cover` (iPhone-Ränder), `color-scheme` und `theme-color` hell/dunkel, einheitliche Eingabefelder und Auswahllisten ohne Systemstil, Zoom-Sperre der Textgröße abgestellt |
| Test | `npm run test:konsistenz` (30 Prüfungen) |

Geprüft wurde in Chromium (Android-nah). WebKit (iOS Safari) und Firefox lassen sich in dieser Umgebung nicht starten; dort gilt nur der Schutz durch die obigen Regeln, ein Test auf echten Geräten steht aus.

## Störer und Betrieb (Phase 9)
| Thema | Stand |
|---|---|
| Kontingente | Jeder Absender hat eigene Grenzen je Minute (Spieler 120 Schreib-/600 Lese-Anfragen, Organisator 600/3000, Adresse ohne Zugang 90/600) plus eine Decke für alle (Organisator zählt dort nicht). Ein Störer bremst nur sich selbst. Vorher teilten sich alle ein Kontingent: ein Spieler konnte mit 600 Anfragen pro Minute alle und den Organisator aussperren |
| Beitritt | Zählt je Adresse nur Fehlversuche (60 je 10 Minuten). Ein Lokal mit gemeinsamem WLAN (eine Adresse) kann also 24 Spieler anmelden, auch mit Tippfehlern |
| Anmeldung schließen | Knopf im Warteraum. Danach tritt niemand mehr über den Link bei, der Organisator trägt weiter selbst ein. Gegen Fantasienamen von Störern: schließen, Störer entfernen |
| Test | `npm run test:angriff` (212 Prüfungen): kaputte Eingaben, gefälschte Zugänge, Ansturm auf 24 Plätze, Ergebnis-Manipulation, Überflutung, feindliche Namen im Browser, Laptop aus, schlechtes Netz |

Betrieb mit Laptop als Organisator: der Stand liegt auf dem Server (Cloudflare), nicht auf dem Laptop. Der Laptop kann ausgeschaltet werden; Ansetzen, Ergebnisse und Tabelle laufen weiter. Der Organisator-Zugang steckt im Organisator-Link und wird zusätzlich im Browser gemerkt. Link sichern (z. B. an sich selbst schicken): mit ihm gibt es den Zugang auf jedem Gerät zurück.

## Obskure Fälle (Phase 10)
`npm run test:obskur` (63 Prüfungen, echter Browser): gesperrter Browserspeicher, falsche Handy-Uhr, Serverfehler (502-HTML, leer, kein JSON, 429, Abbruch, hängend), 320 px / 150 % / 200 % / Querformat / Desktop, zwei Tabs, seltsame Ziffern, Kopieren gesperrt, Code-Eingabe, extreme Namen, Mitternacht, Größtturnier (24 Spieler, 20 Runden, 12 Plätze, Sicherung < 110 KB).
Gefunden und behoben: Das Code-Feld auf der Startseite akzeptierte nur 6 Zeichen; jetzt auch Leerzeichen, Bindestriche, Kleinschreibung und ein eingefügter ganzer Link.

## Feinschliff (Phase 11)
Gefunden bei einem Durchlauf mit 9 Spielern (Ausfall, Zurücknehmen, Entscheidungsspiele): Die Platzanzeige "Platz 2 von 9" zählte einen ausgeschiedenen Spieler mit, obwohl nur 8 in der Wertung stehen; jetzt zählt sie nur aktive Spieler. Die Tabellenlegende hatte "Games erzielte : kassierte Games", jetzt "Games erzielt:kassiert". Prüfung 11 in `test:obskur` (66 Prüfungen).

## Reihenuntersuchung (Phase 12)
- `SIM_WIDE=1 node tests/server/sim.test.mjs 300`: Simulation über 4–24 Spieler, 3–10 Runden, 1–12 Plätze (auch mehr als nötig), alle Zeiten (Dauer, Pause, Aufwärmen, Vorsprung, Startzeit), mit und ohne Unentschieden. 600 Läufe ohne Verstoß (Spielzahl am Ende gleich, keine Doppelbelegung, Neustart-Test, Sicherung/Wiederherstellung).
- `npm run test:reihe` (455 Prüfungen, echter Browser): 21 Konstellationen (4–24 Spieler, alle drei Modi, 1–12 Plätze, mit Ausfällen, Start kurz vor Mitternacht), jeweils Halbzeit und Ende als Admin, Spieler, Ausgeschiedener, Handy und Desktop.
- Ausfälle unter 4 aktive Spieler lehnt der Server mit klarer Meldung ab (kein Absturz).

## Betrieb (Phase 13)
**Abfragetakt und Anfragenbudget.** Jedes geöffnete Handy fragt den Stand ab. Takt: bis 10 Spieler 3 s, bis 16 Spieler 4 s, darüber 6 s; nach 60 s ohne Änderung doppelt so langsam (höchstens 12 s); versteckter Tab 15 s; beim Zurückkehren in die App sofort. Cloudflare Free: je 100.000 Anfragen pro Tag für Worker und Durable Object (Doku, abgerufen am 20.11.2026).

| Spieler | Takt | Abfragen je Spieler und Stunde | 3 Stunden, alle sichtbar | Anteil der Tagesgrenze |
|---|---|---|---|---|
| 9 (+ Laptop) | 3 s | 1.200 | ca. 36.000 | 36 % |
| 16 | 4 s | 900 | ca. 43.000 | 43 % |
| 24 | 6 s | 600 | ca. 43.000 | 43 % |

Rechnung ohne Ruhephasen (ungünstigster Fall); Seitenaufrufe sind nicht eingerechnet. Die SQLite-Grenzen (5 Mio. gelesene, 100.000 geschriebene Zeilen pro Tag) sind unkritisch: Gelesen wird nur beim Aufwachen, geschrieben nur bei Änderungen.

`npm run test:netz` (32 Prüfungen): Takt je Spielerzahl, Abfragen in 20 s gezählt, Offline mit Doppeltippen, 4 s Verzögerung, verlorene Antwort, Rückkehr aus dem Hintergrund, angefangene Eingabe bleibt erhalten.
Texte: Meldung „Der Organisator beitritt …“ korrigiert; zwei Ablehnungen nennen jetzt den nächsten Schritt.
Probelauf auf echten Geräten und im echten Cloudflare: siehe `docs/PROBELAUF.md`.

## Übersicht der offenen Turniere und Spielplan-Vorschau (Phase 14)
- **Übersicht:** Startseite, „Neues Turnier anlegen (Organisator)“, Schlüssel eingeben, „Offene Turniere anzeigen“. Die Liste zeigt Code, Status (Warteraum, Läuft, Beendet), Spielerzahl, letzte Änderung und den Tag der automatischen Löschung. „Öffnen“ zeigt das Turnier wie für einen Spieler, „Löschen“ fragt nach und löscht dann Turnier und Eintrag. Ein Organisator-Link lässt sich daraus nicht wiederherstellen (der Server kennt nur einen Hash).
- **Technik:** Eigenes Durable Object `DirectoryDO` (Binding `VERZEICHNIS`, Migration v3, wird beim Deployment automatisch angelegt). Jedes Turnier meldet sich bei Statuswechsel und geänderter Spielerzahl, sonst höchstens alle 5 Minuten, und wird beim Beenden, Löschen und Ablauf abgemeldet. Nur Code, Status, Zahlen und Zeiten, keine Namen. Zusätzliche Last: ca. 40 interne Anfragen je Turnier. Ohne Verzeichnis (Binding fehlt) laufen Turniere unverändert, die Übersicht meldet „nicht eingerichtet“. Schutz: gleicher Schlüssel und gleiche Sperre bei falschen Schlüsseln wie beim Anlegen (8 Fehlversuche, 15 Minuten); Abrufe und Löschen zählen nicht als neues Turnier. Turniere, die vor diesem Deployment angelegt wurden, erscheinen erst nach ihrer nächsten Änderung.
- **Automatisches Löschen:** 7 Tage nach der letzten Änderung (jede Änderung verschiebt die Frist). „Turnier beenden“ löscht sofort.
- **Spielplan-Vorschau:** Im Warteraum (Organisator) steht unter den Einstellungen wieder der „Spielplan“ mit Plätzen und Zeitblöcken. Er folgt den Einstellungen sofort, auch vor dem Speichern (Platzzahl, Modus, Zeiten, Startzeit).
- Tests: `tests/server/uebersicht.test.mjs` (57), `npm run test:uebersicht` (26, echter Browser).

## Phase 15: Abwarten – „Trotzdem jetzt ansetzen“, Zeilen im Spielplan
- Modus „Platzierung abwarten“ bleibt unverändert. Neu: Ist ein Platz frei, Abwarten setzt aber nichts an, erscheint beim Organisator der Knopf „Trotzdem jetzt ansetzen“ (zweistufig). Er setzt nur diese eine Ansetzung ohne Abwarten an, der Modus bleibt. Offline in den Aktionen, online unter Werkzeuge (`admin/assign` mit `force`).
- Spielplan: Spiele, die zusammen angesetzt wurden, stehen in derselben Zeile (`rollRows`, auch für „nächstes Spiel“-Zeiten der Spieler).
- Tests: `tests/phase15.js` (Engine, 400 Zufallsläufe), `tests/server/functional.test.mjs` (force), `tests/online/abwarten.mjs` (Browser).
