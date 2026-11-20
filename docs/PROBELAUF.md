# Probelauf vor dem Turnier

Zwei kurze Listen, die nur du auf echten Geräten und im echten Cloudflare machen kannst. Dauer je ca. 10 Minuten.

## A. Rauchtest nach dem Deployment (Browser am Laptop)
1. Startseite der veröffentlichten Adresse öffnen. Die Seite lädt, kein Fehlertext.
2. „Turnier anlegen“ mit dem Erstellungsschlüssel. Falscher Schlüssel muss eine Fehlermeldung zeigen, richtiger ein Turnier mit Code und Organisator-Link.
3. Organisator-Link in einem zweiten Tab öffnen: derselbe Warteraum.
4. Spieler-Link in einem privaten Fenster öffnen, Namen eintragen. Der Name erscheint im Warteraum des Organisators (nach wenigen Sekunden).
5. Einen Namen mit „<“ eintragen: wird abgelehnt.
6. Mit mindestens 4 Namen starten, ein Ergebnis eintragen, im Organisator-Tab eintreffen sehen.
7. „Sicherung“ herunterladen. Datei ist vorhanden.
8. Turnier beenden und löschen. Danach zeigt der alte Code „Dieses Turnier gibt es nicht (mehr)“.

Wenn ein Schritt scheitert: Schritt und Meldung notieren, nicht weiter versuchen.

## B. Handy-Probelauf (dein Handy)
1. QR-Code vom Laptop-Bildschirm mit der Handy-Kamera scannen. Der Beitritt öffnet sich. Zusätzlich den Link per Nachricht (z. B. WhatsApp) öffnen: Lässt sich der Name eintragen?
2. Namen mit Tastatur eintragen: Wird das Eingabefeld von der Tastatur verdeckt? Springt die Seite beim Antippen (Zoom)?
3. Handy quer drehen und wieder hoch.
4. Schriftgröße im Handy auf „groß“ stellen und die Spieleransicht ansehen: Texte abgeschnitten?
5. Nach dem Start: Ergebnis eintragen (Zahlenfeld muss ein Zahlenfeld zeigen), speichern.
6. Handy sperren, 1 Minute warten, entsperren: Stand ist sofort aktuell?
7. Flugmodus an, Ergebnis eintragen und speichern: Es erscheint ein Hinweis, die Zahlen bleiben stehen. Flugmodus aus, erneut speichern: Ergebnis ist da, nur einmal.
8. WLAN aus, Mobilfunk an (und umgekehrt) während die Seite offen ist: Bleibt sie benutzbar?
9. Dunkelmodus des Handys an: Alles lesbar?
10. Mit dem Handy im Dunkelmodus und im hellen Modus den QR-Code vom Bildschirm des Laptops erneut scannen (Kontrast).

## C. Anfragenbudget im Blick behalten
Während des Turniers im Cloudflare-Dashboard bei Worker und Durable Object die Anfragen des Tages ansehen (Bereich „Metrics“, die genaue Menüführung kann abweichen). Die Free-Grenze liegt laut Cloudflare-Doku bei 100.000 Anfragen pro Tag und Dienst. Erwartung bei 9 Spielern und 3 Stunden: ca. 36.000.
