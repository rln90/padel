# Einrichtung auf Cloudflare (einmalig, ca. 10 Minuten)

Voraussetzung: Cloudflare-Konto und GitHub-Konto (beides vorhanden). Kein Programm auf dem eigenen Rechner nötig, alles im Browser.

## A. Turnier-App veröffentlichen
1. Cloudflare-Dashboard: **Workers & Pages**, **Create application**, **Import a repository** (Git verbinden), GitHub freigeben, Repository `rln90/padel` wählen.
2. Projektname **`padel-turnier`** (muss mit `name` in `wrangler.toml` übereinstimmen). Produktions-Branch `main`. Build-Befehl leer lassen. Deploy-Befehl `npx wrangler deploy` (Standard).
3. Ersten Build abwarten (grüner Haken unter **Deployments**).
4. Beim Worker: **Settings**, **Variables and Secrets**, **Add**: Typ **Secret** (nicht „Text“), Name `CREATE_KEY`, Wert ein langes Passwort (nur du kennst es). Speichern und deployen. Ein Secret übersteht jeden Build; auch normale Variablen bleiben durch `keep_vars = true` in `wrangler.toml` erhalten.
5. Adresse öffnen (`padel-turnier.<dein-name>.workers.dev`, siehe **Settings**, **Domains & Routes**). **Neues Turnier anlegen**, Schlüssel eingeben.

## B. Vorschau pro Pull Request (optional)
Die üblichen Vorschau-Links gibt es für Worker mit Durable Objects nicht. Stattdessen nutzt der Workflow `.github/workflows/preview.yml` die „Worker Previews“ von Cloudflare. Jede Vorschau hat eigenen Speicher.
1. Cloudflare: **My Profile**, **API Tokens**, **Create Token**, Vorlage **Edit Cloudflare Workers**, Konto auswählen, erstellen, Token kopieren (wird nur einmal angezeigt).
2. Account-ID: Cloudflare-Dashboard, **Workers & Pages**, rechte Spalte **Account ID**.
3. GitHub: Repository **Settings**, **Secrets and variables**, **Actions**, **New repository secret**: `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`.
4. Beim nächsten Pull Request erscheint die Vorschau als Kommentar. Zum Anlegen eines Test-Turniers in der Vorschau gilt der Schlüssel `vorschau`.

Hinweis: Dieser Weg ist bisher nur gegen die Dokumentation geschrieben, nicht gegen echtes Cloudflare getestet.
