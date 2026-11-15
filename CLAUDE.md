# Padel-Turnier

Einzel-Turnier im Schweizer System (4 bis 24 Spieler, Plätze 60/90/120 min buchbar), Besitzer: Robin. Sprache der Oberfläche und der Antworten: Deutsch.

## Feste Regeln (vom Besitzer vorgegeben)
- Am Ende haben alle Spieler gleich viele Spiele. Bei Ausfall oder ungerader Zahl gibt es Ausgleichs- bzw. Zusatzspiele (Zusatzspiel zählt nur für den Bedürftigen, nicht für den Gegner).
- Mindestens 3 Runden, höchstens 24 Spieler.
- Stil: schlicht und edel. Antworten knapp, Vergleiche als Tabelle. Ehrlich prüfen und berichten, nichts annehmen, im Zweifel nachfragen.
- Fehlerfreiheit vor Funktionsumfang: jede Änderung wird mit der Testbatterie geprüft.
- Namen erscheinen nie als HTML (immer escapen).

## Aufbau
- `legacy/`: eingefrorene Stände (V35 = Merker 1, V37 = Stand in Claude veröffentlicht). Nicht ändern.
- `src/`: Quellcode (Engine ohne Oberfläche, Oberfläche, Vorlage).
- `tools/build.js`: baut `dist/padel-turnier.html` (eine Datei, Engine + Oberfläche eingebettet).
- `tests/`: Testbatterie, läuft gegen `dist/padel-turnier.html` (oder `PADEL_HTML=…`). `npm test`.
- Ziel: Hosting auf Cloudflare (Worker + Durable Object), Spieler treten bei, tragen eigene Ergebnisse ein, Gegner bestätigt, Server setzt Spiele automatisch an. Plan siehe README.

## Arbeitsweise
- Pro Phase ein Branch und ein Pull Request mit Testergebnissen. Nie direkt auf `main` ändern (außer Ausgangslage).
- Die Entwicklungs-Umgebung hat kein Cloudflare-Zugriff; Deployment macht der Besitzer im Browser.
