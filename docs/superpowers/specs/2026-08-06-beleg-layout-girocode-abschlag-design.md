# Beleg-Layout überarbeiten, Girocode, einfache Abschlagsrechnung

## Kontext

Der Nutzer hat eine echte Rechnung eines Handwerksbetriebs als Vorbild
gezeigt und mit unserer aktuellen Rechnungsdarstellung verglichen. Zwei
Dinge gefallen ihm an der eigenen App noch nicht:

- **Kopfbereich:** Heute stehen Titel, Nummer, Datum und Leistungsdatum als
  lose Textzeilen untereinander. Die Referenzrechnung zeigt stattdessen
  eine klare Tabelle mit Rechnungsnummer, Kundennummer, Datum, Lieferdatum.
- **Fußbereich:** Heute stehen Bankverbindung, Kontaktdaten und
  Steuernummer/USt-IdNr. als loser Fließtext nach der Positionstabelle,
  wahlweise an unterschiedlichen Stellen konfigurierbar. Die Referenz zeigt
  einen festen, dreispaltigen Geschäfts-Footer (Anschrift/Kontakt,
  Steuerliches, Bankverbindung), der auf jeder Seite unten steht.

Zusätzlich zwei weitere, im selben Zug gewünschte Ergänzungen:

- Ein optionaler **Girocode** (SEPA-QR-Zahlungscode nach EPC069-12) auf der
  Rechnung, für den es bereits einen HTML-Prototyp gibt
  (`qr-code-generator/generator.html`), dessen Payload-Logik als Vorlage dient.
- Eine einfache **Abschlagsrechnung**: ein Hinweis auf den
  Gesamt-Auftragswert, ohne automatische Verrechnung mehrerer Abschläge.

Ziel dieser Version (0.10.1, noch unveröffentlicht) ist es, alle drei
Wünsche in einem Zug umzusetzen.

## Bereits geklärte Entscheidungen

- **Abschlagszahlungen bleiben bewusst einfach**: nur ein
  Hinweistext-/Zahlenfeld, keine Verkettung mehrerer Abschlagsrechnungen,
  keine automatisch berechnete Schlussrechnung, kein neuer Belegtyp.
- **Girocode nur auf Rechnung und Zahlungserinnerung**, nicht auf
  Angeboten (dort besteht noch keine Zahlungspflicht).
- **Girocode ist standardmäßig aktiviert** (anders als sonst in dieser App
  üblich, wo neue Einstellungen das bisherige Aussehen bewahren — hier
  ausdrücklicher Nutzerwunsch).
- **Die Bankverbindung zieht komplett in den neuen festen Footer.** Die
  bisherige Wahl "am Fuß" vs. "direkt unter der Summe" entfällt; das
  `BankPosition`-Enum wird aus `dokument/vorlage.rs` entfernt.
- **Die Logo-Optionen (Links/Rechts/Kein Logo) bleiben unverändert.**
- **Die Kopf-Tabelle bleibt im normalen Textfluss**, unterhalb des
  DIN-5008-Sichtfensters — nicht wie im Referenzbild absolut oben rechts
  neben dem Fenster platziert. Der Nutzer schaut sich nach der Umsetzung
  an, ob die Optik so reicht.

## Architektur-Entscheidung: Kopfbereich

Drei Optionen wurden abgewogen:

- **A (gewählt):** Die neue Kopf-Tabelle steht dort, wo heute die losen
  Zeilen "Rechnung ... / Datum: ... / Leistungsdatum: ..." stehen — also
  im normalen Fluss unterhalb des absolut positionierten DIN-5008-Fensters
  (`place(top+left, dy: 45mm-...)`, unverändert). Null Risiko für die
  Kuvertierbarkeit, aber geometrisch nicht identisch mit dem Referenzbild
  (dort sitzt die Tabelle ganz oben, neben dem Fenster).
- **B (verworfen):** Tabelle absolut oben rechts, auf Höhe von
  Logo/Firmenanschrift platzieren — optisch näher am Referenzbild, aber
  fragil: Kollisionsgefahr mit der Kopfzeile bei langer Firmenanschrift,
  hohem Logo oder variabler Logohöhen-Einstellung.
- **C (verworfen):** DIN 5008 aufgeben, freie Platzierung wie im
  Referenzbild — verliert die Kuvertierbarkeit im Fensterumschlag, was
  diese App bisher bewusst sicherstellt.

## Teil A — Kopf- und Fußbereich

### Kopf

Rechtsbündige zweispaltige Tabelle nach der Logo/Firmenzeile (gleiches
Muster wie die bestehende Zahlungserinnerungs-Tabelle:
`table(columns:(auto,1fr), align:(left,right), stroke:none)`):

- `Rechnungsnummer:` (bzw. `Angebotsnummer:`) → Belegnummer
- `Kundennummer:` → `kunde_kundennummer` (existiert bereits in
  `BelegKontext`, wurde aber nie an die Vorlage übergeben)
- `Datum:` → Belegdatum
- `Leistungsdatum:` (bzw. `Leistungszeitraum:` bei einer Spanne) → wie bisher

Die Überschrift (`= Rechnung`/`= Angebot`) bleibt bestehen, aber ohne die
Nummer — die steht jetzt in der Tabelle. Zahlungsbedingung,
Angebots-Gültigkeit und Storno-Bezug bleiben als Fließtext darunter, da sie
zu unterschiedlich lang für eine feste Tabellenspalte sind.

### Fuß

Der bisherige Seiten-Footer (heute nur "Seite X von Y" ab Seite 2) wird zu
einem festen Geschäfts-Footer auf **jeder** Seite:

1. Firmenname, Straße, PLZ/Ort, Telefon/Fax/E-Mail (bisherige
   `kontaktzeilen`-Logik)
2. Steuernummer, USt-IdNr. (bisheriger Schlussblock)
3. IBAN, BIC (bisheriger `bankverbindung`-Block, jetzt immer hier)

Die "Seite X von Y"-Zeile bleibt zusätzlich, nur wenn Gesamtseiten > 1.
Die bisherigen Fließtext-Blöcke für Bankverbindung, Kontaktzeilen und
Steuernummer/USt-IdNr. entfallen an ihrer alten Stelle; Kopftext/Fußtext
bleiben unverändert im Hauptfluss.

**Zu verifizieren bei der Umsetzung:**

- `pdf_extract` muss den Footer-Text mitliefern — sonst bricht der
  bestehende Pflichtangaben-Test
  (`rechnung_enthaelt_die_pflichtangaben_nach_paragraf_14_ustg`, prüft u. a.
  die Steuernummer).
- Der untere Seitenrand (`rand_unten_mm`, aktuell 15–40 mm) muss für drei
  Textspalten reichen; ggf. das zulässige Minimum leicht anheben.

### Backend-Änderungen

- `dokument/vorlage.rs`: `BankPosition`-Enum und `bankverbindung`-Feld
  vollständig entfernen (Default, `aus_paaren`, `als_eingaben`, Tests).
  `LogoPosition` unverändert.
- `dokument/pdf.rs`: `kunde_kundennummer` in beide Felderlisten aufnehmen
  (`rendern` und `rendern_zahlungserinnerung`).
- Keine neuen Datenfelder nötig — alle benötigten Werte existieren bereits.

### Frontend-Änderungen

- `Belegvorlage.tsx`: Eintrag `vorlage.bankverbindung` aus `SCHALTER`
  entfernen.
- `Belegvorlage.test.tsx`: entsprechende Erwartungen anpassen.

## Teil B — Girocode (SEPA-QR, EPC069-12)

### Technischer Ansatz

Neue Abhängigkeit `qrcode = { version = "0.14", default-features = false }`
— erzeugt nur die Hell/Dunkel-Matrix, ohne Bildbibliotheken. Die Matrix
geht als Daten an Typst, das sie als Gitter aus kleinen Rechtecken
zeichnet — kein PNG, keine Bild-Einbettung, konsistent mit dem
bestehenden Muster "Rust liefert Daten, Typst rendert"
(`positionen_json`, `steuerzeilen_json`).

### Neues Modul `domain/girocode.rs`

- `epc_payload(name, iban, bic, betrag_cent: Option<i64>, verwendungszweck) -> String`:
  baut die 11-zeilige EPC069-12-Nutzlast
  (`BCD/002/1/SCT/BIC/Name≤70/IBAN/EURx.xx oder leer/leer/leer/Verwendungszweck≤140`),
  nach dem Vorbild von `buildEpcPayload` in
  `qr-code-generator/generator.html`. Name/Zweck defensiv auf 70/140 Zeichen kappen.
- `qr_matrix(payload: &str) -> AppResult<Vec<Vec<bool>>>` über
  `qrcode::QrCode::new` + `.to_colors()`/`.width()`.

### Einstellung

- Neues Feld `zeigt_girocode: bool` in `dokument/vorlage.rs`,
  **Default `true`** (bewusste Ausnahme vom sonstigen
  "neue Einstellungen ändern nichts am bisherigen Aussehen"-Prinzip, auf
  ausdrücklichen Wunsch).
- Neuer Schalter in `Belegvorlage.tsx`: "Girocode (QR-Zahlungscode)
  anzeigen".

### Wann der Code erscheint

Nur wenn `zeigt_girocode` aktiv, eine IBAN hinterlegt ist, und der Beleg
eine Rechnung ist (nicht Angebot). Betrag: bei der Rechnung die
Gesamtsumme, bei der Zahlungserinnerung der offene Betrag.
Verwendungszweck: `"Rechnung " + Nummer` (gleicher Stil wie
`zahlungsbedingung`). Schlägt die Erzeugung fehl (z. B. kaputte IBAN), wird
der Code stillschweigend weggelassen statt den Export abzubrechen —
gleiches Prinzip wie beim Logo.

### Darstellung

Neuer Block "Bezahlen Sie jetzt mit GiroCode" mit der Matrix als Gitter aus
gefüllten/leeren Quadraten, in einem Rahmen, in der Nähe von
Summe/Bankverbindung platziert (genaue Position beim Bauen festlegen).

### Verifikation

Kein QR-Scanner in der CI verfügbar — stattdessen ein Rundtrip-Test auf
Payload-Ebene (eigene Erzeugung → eigenes Zerlegen in Felder → Vergleich)
plus ein Fixtur-Payload nach dem dokumentierten EPC069-12-Beispiel.
Zusätzliche `pdf.rs`-Tests: Code erscheint nur bei aktivierter Einstellung
und vorhandener IBAN; fehlt bei einem Angebot auch wenn aktiviert; fehlt
ohne IBAN.

## Teil C — Einfache Abschlagsrechnung

### Schema

Ein einziges neues, optionales Feld: `gesamtauftragswert_cent` (nullable)
auf dem Beleg. Ein eigener Titel ("1. Abschlagsrechnung") oder ein
erläuternder Satz lassen sich bereits über das bestehende Kopftext-Feld
abbilden — dafür ist keine weitere Struktur nötig.

### Validierung

Ist der Wert gesetzt, muss er mindestens der Belegsumme entsprechen — eine
Teilrechnung kann rechnerisch nicht mehr abrechnen, als der Gesamtauftrag
wert ist.

### Darstellung

Neue Zeile nach der Positionstabelle, nur wenn gesetzt:
`Gesamt-Auftragswert: 1.470,00 € (zzgl. USt)`.

### Backend-Änderungen

- Migration `0021_abschlagszahlung.sql`:
  `ALTER TABLE beleg ADD COLUMN gesamtauftragswert_cent INTEGER;`
- `Beleg`/`BelegNeu`/`BelegUpdate` (`commands/belege.rs`) und
  `BelegKontext` (`dokument/kontext.rs`) bekommen
  `gesamtauftragswert_cent: Option<i64>` — kommt direkt aus der
  `beleg`-Zeile, kein Snapshot nötig (wie `summe_cent`).
- Neue Prüfung im Stil von `pruefe_beleg_neu`: Wert ≥ `summe_cent`, falls
  gesetzt.

### Frontend-Änderungen

- `StammdatenAbschnitt.tsx`: neues optionales Feld "Gesamt-Auftragswert
  (€)" neben Kopftext/Fußtext, gleiches Muster wie andere Geldfelder
  (`parseEuro`/`formatCent`).
- `api.ts`: `gesamtauftragswert_cent: number | null` an
  `Beleg`/`BelegNeu`/`BelegUpdate` ergänzen.

### Bewusste Grenze

Der Gesamt-Auftragswert fließt nicht in die XRechnung — es gibt in
EN 16931 kein Feld dafür, er ist rein informativ auf dem PDF. Als bekannte
Einschränkung in CHANGELOG/TODO dokumentieren.

## Verifikation (gesamt)

1. `npx tsc --noEmit`, `npx eslint .`, `npm test -- --run`
2. `cargo test`, `cargo clippy --all-targets -- -D warnings`
3. Manuell: Vorschau in den Einstellungen für alle drei Teile ansehen
   (Kopf/Footer-Layout, Girocode an/aus, Gesamtauftragswert gesetzt/leer),
   dabei besonders auf den unteren Seitenrand und mehrseitige Belege achten.
4. `./e2e/docker-lauf.sh`
5. CHANGELOG (neuer Abschnitt unter dem bestehenden `0.10.1`), README,
   TODO.md ergänzen; committen (kein Tag/Release ohne Rückfrage).
