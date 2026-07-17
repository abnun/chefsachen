# Optische Trennung Standard-/Kundenpreise auf der Artikel-Seite — Design

## Problem

Auf der Artikel-Seite (`src/pages/Artikel.tsx`) zeigt die Hauptliste den Standardpreis je Artikel. Über einen „Kundenpreise"-Button lässt sich pro Zeile ein Bereich mit kundenspezifischen Sonderpreisen aufklappen (`KundenpreiseBereich`). Dieser Bereich ist aktuell eine eigene `.karte` mit `<h3>Kundenpreise</h3>` und einer `.tabelle` — optisch nahezu gleichrangig zur Hauptliste. Dadurch wirkt er wie eine zweite, gleichwertige Liste statt wie eine Ausnahme-/Abweichungsansicht vom Standardpreis. Es fehlt außerdem jede Möglichkeit, ohne Aufklappen zu erkennen, ob ein Artikel überhaupt Kundenpreise hat.

## Ziel

Der aufgeklappte Kundenpreise-Bereich soll auf den ersten Blick als **Ausnahme vom Standardpreis** erkennbar sein — durch reduzierte visuelle Eigenständigkeit (kein eigener Kartenrahmen, gedämpfter Hintergrund) und durch einen direkten Preisvergleich (prozentuale Abweichung je Kundenpreis). Zusätzlich soll die Anzahl vorhandener Kundenpreise bereits im geschlossenen Zustand sichtbar sein.

## Umfang

Nur Frontend (`Artikel.tsx`, `komponenten.css`, `tokens.css`) plus eine kleine Backend-Ergänzung (`kundenpreise_anzahl`-Feld am Artikel, analog zum `hat_adresse`-Muster aus dem Onboarding-Plan). Keine Änderung an Preisfindung, Beleg-Erstellung oder sonstiger Geschäftslogik.

## Verhalten

### Button in der Hauptliste

- Zeigt „Kundenpreise" bei 0 vorhandenen Kundenpreisen, sonst „Kundenpreise (N)".
- Auf-/Zuklapp-Verhalten unverändert (Klick toggelt den Bereich für genau diese Zeile).

### Aufgeklapptes Panel (ersetzt bisherige `.karte` + `<h3>` + `.tabelle`)

- Kein eigener Kartenrahmen mehr. Stattdessen: linker Akzentstreifen (`border-left`), gedämpfter Hintergrund (`--bg-gedaempft`), abgerundete Ecken nur rechts.
- Überschrift nennt den Standardpreis explizit: „Kundenpreise — Ausnahmen vom Standardpreis (80,00 €)".
- Je Kundenpreis eine Zeile (kein `<table>`, stattdessen flex-Zeilen mit Trennlinien):
  - Links: Kundenname, darunter — falls `gueltig_ab` gesetzt — klein und gedämpft „ab TT.MM.JJJJ".
  - Rechts: Preis (fett), daneben eine Abweichungs-Badge mit Vorzeichen und Prozentwert, gerundet auf ganze Zahl (z. B. „−19%", „+19%").
  - Ist der Standardpreis 0 Cent, wird keine Abweichung berechnet (Division durch 0 vermeiden) — die Badge entfällt in diesem Fall ersatzlos, nur Preis wird gezeigt.
- Das bestehende Formular zum Anlegen eines neuen Kundenpreises (Kunde-Auswahl, Preis, Gültig ab, Speichern) bleibt funktional unverändert, wird aber optisch in dasselbe Panel integriert (kein eigener Kartenrahmen mehr für das Formular), direkt unterhalb der Preisliste.
- Kein separates Fehler-Rendering nötig über das Bestehende hinaus — `Fehler`-Komponente bleibt wie bisher oberhalb der Preisliste im Panel.

### Berechnung der Abweichung

```
abweichung_prozent = round((kundenpreis_cent - standardpreis_cent) / standardpreis_cent * 100)
```

Berechnung passiert vollständig im Frontend (`KundenpreiseBereich`) — keine Backend-Beteiligung nötig, da beide Werte zur Render-Zeit bereits vorliegen. **Voraussetzung, die im Implementierungsplan als eigener Schritt vorkommen muss:** `KundenpreiseBereich` kennt den Standardpreis aktuell NICHT — `KundenpreiseBereichProps` hat bisher nur `artikelId` und `kunden`. `Artikel.tsx` muss beim Rendern zusätzlich `standardpreisCent={a.standardpreis_cent}` als neue Prop übergeben (der Wert liegt im `artikel.map((a) => ...)`-Aufrufkontext ohnehin schon vor).

- Positiv → teurer als Standard → rote Badge.
- Negativ → günstiger als Standard → grüne Badge.
- `standardpreis_cent === 0` → keine Badge (s. o.).
- Formatierung: `Math.round(...)` (JS-Standardrundung), Anzeige mit explizitem Vorzeichen — `+` bei positiver Abweichung, echtes Minuszeichen „−" (U+2212, kein Bindestrich) bei negativer, gefolgt von `%` ohne Leerzeichen (z. B. „+19%", „−19%"). Bei 0% Abweichung (Kundenpreis exakt gleich Standardpreis) wird trotzdem eine Badge mit „+0%" gezeigt — kommt in der Praxis selten vor (dann wäre kein Kundenpreis nötig), aber es gibt keinen Grund für eine dritte Sonderregel.

## Styling / neue CSS-Tokens

Neue, dedizierte Tokens (bewusst NICHT die bestehenden `--st-bezahlt-*`/`--st-storniert-*` wiederverwendet, um Rechnungsstatus- und Preisvergleichs-Semantik nicht zu vermischen), analog zum bestehenden Muster (`--fehler-*`, `--hinweis-*`):

```css
/* in :root { ... } (Hell), nach den bestehenden --hinweis-*-Zeilen: */
--preis-guenstiger-bg: #e6f4ec;
--preis-guenstiger-text: #1f7a52;
--preis-teurer-bg: #fdecea;
--preis-teurer-text: #a3231f;

/* in @media (prefers-color-scheme: dark) { :root { ... } } (Dunkel), an derselben Stelle: */
--preis-guenstiger-bg: #163a2a;
--preis-guenstiger-text: #6ed3a0;
--preis-teurer-bg: #3a1e1c;
--preis-teurer-text: #ef8f8a;
```

(Werte identisch zu den bestehenden `--st-bezahlt-*`/`--st-storniert-*`-Farbtönen — nur die Token-Namen sind eigenständig, damit spätere Änderungen an Rechnungsstatus-Farben nicht versehentlich die Preisvergleichs-Badges mitverändern.)

Neue Klassen in `komponenten.css`: `.kundenpreis-panel` (Panel-Rahmen), `.kundenpreis-zeile` (einzelne Preiszeile), `.kundenpreis-badge` mit Modifikatoren `.guenstiger`/`.teurer`.

## Backend-Ergänzung: `kundenpreise_anzahl`

Analog zum `hat_adresse`-Muster: neues berechnetes Feld am `Artikel`-Struct (Rust) bzw. `Artikel`-Interface (TS), per `COUNT`-Subquery in `list()` mitgeliefert:

```sql
SELECT id, artikelnummer, bezeichnung, beschreibung, einheit_id, standardpreis_cent,
       (SELECT COUNT(*) FROM kundenpreis kp WHERE kp.artikel_id = a.id AND kp.deleted_at IS NULL) AS kundenpreise_anzahl
FROM artikel a WHERE a.deleted_at IS NULL AND (lower(a.bezeichnung) LIKE ? OR lower(a.artikelnummer) LIKE ?) ORDER BY a.bezeichnung
```

(Die bestehende Query verwendet aktuell keinen Tabellen-Alias — beim Einführen von `a` müssen alle Spaltenverweise im bestehenden `WHERE`/`ORDER BY` mit `a.` präfixiert werden, nicht nur die neue Subquery. Sonst schlägt SQLite mit einer mehrdeutigen oder unbekannten Spalte fehl.)

- `create()`: neuer Artikel hat 0 Kundenpreise → `kundenpreise_anzahl: 0` im Rust-Struct-Literal.
- `update()`: echot den Input unverändert zurück wie bisher (schreibt `kundenpreise_anzahl` nicht in die DB) — **Frontend-Falle, die vermieden werden muss:** `Artikel.tsx`s `speichern()`-Funktion baut beim Bearbeiten den `update()`-Payload aktuell als Literal von Hand zusammen (nicht durch Spreaden des bestehenden Objekts), genau wie bei `artikelnummer` schon gehandhabt:
  ```ts
  await api.artikel.update({
    id: bearbeiteId,
    artikelnummer: artikel.find((a) => a.id === bearbeiteId)?.artikelnummer ?? "",
    kundenpreise_anzahl: artikel.find((a) => a.id === bearbeiteId)?.kundenpreise_anzahl ?? 0,
    // ... restliche Felder wie bisher
  });
  ```
  Wird `kundenpreise_anzahl` als Pflichtfeld zum `Artikel`-Interface hinzugefügt, OHNE diese Stelle anzupassen, bricht `tsc` (Teil von `npm run build`) an dieser Literal-Konstruktion — exakt dasselbe Muster, das beim `hat_adresse`-Feld im Onboarding-Plan bereits einmal auftrat. Muss im Implementierungsplan explizit als eigener Schritt vorkommen.
- `ArtikelNeu` (Erstellungs-Typ, Frontend) bleibt unverändert — `kundenpreise_anzahl` gehört nicht zur Neuanlage, genau wie `hat_adresse` nicht zu `KundeNeu` gehört.
- `KundenpreiseBereich` selbst lädt seine Preisliste weiterhin unverändert per `api.artikel.kundenpreise(artikelId)` beim Aufklappen — `kundenpreise_anzahl` dient ausschließlich der Button-Beschriftung im geschlossenen Zustand, nicht als Ersatz für die Detail-Abfrage.
- **Synchronisationslücke, die zu beheben ist:** Wird innerhalb von `KundenpreiseBereich` ein Kundenpreis hinzugefügt oder entfernt, ruft die Komponente aktuell nur ihr eigenes `laden()` auf — der `artikel`-State der Elternkomponente (`Artikel.tsx`), aus dem die Button-Beschriftung `kundenpreise_anzahl` liest, bleibt unverändert und zeigt danach eine veraltete Zahl. Lösung: `KundenpreiseBereich` bekommt eine neue Prop `onAenderung: () => void`, die nach erfolgreichem Speichern/Löschen eines Kundenpreises aufgerufen wird; `Artikel.tsx` übergibt dafür `ladeArtikel` (bereits vorhanden, lädt die Liste inkl. aktueller `kundenpreise_anzahl` neu).

## Tests

- Bestehende Tests in `Artikel.test.tsx`, die auf `<h3>Kundenpreise</h3>` oder die alte Tabellenstruktur prüfen, müssen an die neue Panel-Struktur angepasst werden.
- Backend (`artikel.rs`): neuer Test analog zu `list_liefert_hat_adresse_korrekt` aus dem Onboarding-Plan — prüft, dass `list()` die korrekte `kundenpreise_anzahl` liefert (0 bei keinem, N bei N vorhandenen, nur nicht-gelöschte zählen).
- Frontend: neue Tests für
  - Button-Beschriftung „Kundenpreise" vs. „Kundenpreise (N)".
  - Abweichungs-Badge korrekt grün/rot bei günstigerem/teurerem Kundenpreis, mit korrektem gerundetem Prozentwert.
  - Keine Badge bei Standardpreis 0.
  - „ab TT.MM.JJJJ"-Zusatz erscheint nur bei gesetztem `gueltig_ab`.

## Nicht im Umfang

- Keine Änderung an der Kunden-Seite oder an `hat_adresse`.
- Keine Änderung an der Preisfindung (`preisfindung.rs`) — die zeigt weiterhin nur den tatsächlich effektiven Preis für einen Beleg, unabhängig von dieser rein listenseitigen Darstellung.
- Kein Hell-/Dunkelmodus-spezifisches Sonderverhalten über die neuen Tokens hinaus.
