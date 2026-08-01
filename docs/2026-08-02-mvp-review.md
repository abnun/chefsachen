# MVP-Review Kleinunternehmer-Verwaltung

**Datum:** 2026-08-02
**Basis:** Ist-Stand `main` @ 898cb67, verglichen gegen `docs/superpowers/specs/2026-07-06-kleinunternehmer-tool-design.md`

## Gesamtbild

Der fachliche Kern ist überdurchschnittlich solide: 140 Rust-Tests und 139 Frontend-Tests laufen grün, `clippy` und `tsc` sind sauber, Geldbeträge sind durchgängig Integer-Cent, Storno/Snapshot/Soft-Delete sind sauber modelliert, der Capability-Zuschnitt ist bewusst minimal statt `fs:default`.

Die Lücken liegen in drei Zonen:

1. **Die Schicht zwischen Code und Nutzer** — Laufzeit-Berechtigungen, Datensicherung, Diagnose, Auslieferung.
2. **Die rechtliche Korrektheit der Ausgabeformate** — PDF, XRechnung und ZUGFeRD sind alle drei in ihrem juristischen Kern unvollständig.
3. **Zwei komplette Spec-Kapitel fehlen** — Dashboard mit Umsatzgrenzen-Überwachung und Offene-Posten-Sicht.

Die Tests bestätigen jeweils, dass der Code tut was er tut — nie, dass das Ergebnis normkonform ist.

---

## A. Blocker — vor jeder Weitergabe zu beheben

### A1. Alle Exporte sind im gebauten Programm funktionslos
`src-tauri/capabilities/default.json` enthält `fs:allow-read-file`, aber **nicht** `fs:allow-write-file`. Der Speichern-Dialog läuft durch, danach scheitert das Schreiben an der Tauri-ACL.

Betroffen: PDF-, XRechnung- und ZUGFeRD-Export (`src/pages/BelegEditor.tsx:157,171,185`), Original-Export (`src/pages/EingangsrechnungDetail.tsx:75`).

Kein Test hat das gefunden, weil `@tauri-apps/plugin-fs` in beiden Testdateien komplett gemockt wird und die ACL in keinem Test durchlaufen wird.

**Fix:** eine Zeile — `"fs:allow-write-file"` ergänzen. Nicht zu `fs:default` oder Scope-Wildcards greifen.

### A2. PDF-Rechnung erfüllt § 14 UStG nicht
`src-tauri/templates/rechnung.typ` druckt **weder Steuernummer noch USt-IdNr.** des Ausstellers. Das ist die zentrale Pflichtangabe nach § 14 Abs. 4 Nr. 2 UStG — jede erzeugte Rechnung ist formell fehlerhaft und vom Empfänger zurückweisbar.

Ironie: `xrechnung::pruefe_exportierbarkeit` erzwingt die Steuernummer für den XML-Export, das PDF aber nicht.

Ebenfalls fehlend in der Vorlage:
- **IBAN/BIC** — der Kunde kann die Rechnung nicht bezahlen (Daten sind gepflegt, gehen nur in die XRechnung)
- **`kopftext`** wird gar nicht an die Vorlage übergeben (`pdf.rs:100-119`) — der Nutzer pflegt ein Anschreiben, es verschwindet spurlos
- **Land** in beiden Adressblöcken
- **Seitenzahlen / Tabellenkopf-Wiederholung** — ab ~35 Positionen bricht Typst still um, Folgeseiten sind anonym
- **DIN-5008-Layout** — Adressblock passt in keinen Fensterumschlag

### A3. Kein Backup — Totalverlustrisiko für Buchhaltungsdaten
Spec Z. 89 fordert rotierendes Start-Backup (letzte 10) plus manuellen Export/Import. Grep über `src-tauri/src` und `src` nach `backup|sicherung`: **null Treffer**. Nicht angefangen.

Bei einer lokalen Einzelplatz-Buchhaltung mit gesetzlichen Aufbewahrungspflichten und ohne Cloud-Sync ist das der schwerste konzeptionelle Mangel. Verschärfend: Migrationen haben weder Pre-Migration-Backup noch Downgrade-Pfad.

### A4. Panic-Crash über ein Einstellungsfeld
`src-tauri/src/domain/nummernkreis.rs:5-13` paniced bei einem Nummernkreis-Format mit `{lfd` ohne schließende Klammer. **Empirisch verifiziert:** `format_nummer("RE-{lfd", …)` → `panicked: byte range starts at 7 but ends at 6`.

`einstellungen.rs:57` lässt genau das durch, weil nur `format.contains("{lfd")` geprüft wird. Ein Nutzer, der `RE-{lfd` eintippt, bringt danach jedes `beleg_stellen`, `kunde_create` und `artikel_create` zum Absturz — die App ist unbenutzbar und der Zähler ggf. schon hochgezählt.

### A5. Doppelte Rechnungsnummern sind möglich
`migrations/0002_belege.sql:4` — `nummer TEXT` **ohne UNIQUE-Constraint**, während `kunde.kundennummer` und `artikel.artikelnummer` ihn haben. Spec Z. 35 verlangt Eindeutigkeit ausdrücklich auch für Belegnummern.

Bei Jahres-Reset mit verstellter Systemuhr, Format-Wechsel auf ein bereits verwendetes Schema oder zweiter Prozessinstanz entstehen doppelte Rechnungsnummern **ohne jede Fehlermeldung**. GoBD-relevant.

### A6. XRechnung ist nicht schemavalide
Der Code kommentiert es selbst weg (`xrechnung.rs:148-150`: „bewusst linear statt exakt nach CII-Elementreihenfolge"). Ein KoSIT-Validator würde die Datei ablehnen:

- `rsm:ExchangedDocumentContext` **fehlt vollständig** → BT-24 (Profilkennung) fehlt, XSD-invalid
- `ram:ApplicableHeaderTradeDelivery` **fehlt komplett** → minOccurs=1 verletzt, zugleich fehlt BT-72 (Leistungsdatum)
- **Kopf-Steuerzeile `ram:ApplicableTradeTax` (BG-23) fehlt** → BT-118 `CategoryCode=E`, BT-120 `ExemptionReason` stehen nur auf Positionsebene. **Die Kleinunternehmer-Kennzeichnung ist damit faktisch nicht korrekt**, denn Empfängersysteme werten die Kopfebene aus
- `ram:TaxTotalAmount` ohne Pflichtattribut `currencyID="EUR"`
- `ram:LineTotalAmount` (BT-106) fehlt → BR-CO-10 verletzt
- `SpecifiedTaxRegistration/ram:ID` ohne `schemeID` und **hardcodiert auf `ust_idnr`** → ein Kleinunternehmer ohne USt-IdNr. (der typische Zielgruppenfall) besteht die Pflichtfeldprüfung und bekommt ein **leeres `<ram:ID></ram:ID>`**
- BT-34/BT-49 (elektronische Adressen) fehlen → BR-DE-5/BR-DE-6 verletzt
- `unitCode` hart auf `C62` (Stück) → 8 Stunden werden als 8 Stück übertragen

Die vorhandenen Tests sind reine `contains`-Substring-Checks; sie hätten keinen dieser Punkte gefunden.

### A7. ZUGFeRD behauptet PDF/A-3, ohne es zu erzeugen
Die XML-Einbettung ist echt und funktioniert (Round-Trip getestet). Aber `pdf.rs:126` nutzt `typst_pdf::PdfOptions::default()` → normales PDF 1.7, **kein PDF/A**. Gleichzeitig behauptet das XMP `pdfaid:part=3, conformance=B` (`zugferd.rs:42-43`).

Eine falsche Konformitätsbehauptung ist schlimmer als gar keine. `typst-pdf 0.13` bietet `PdfStandards`/`PdfStandard` an — genau der in der Spec als „zuerst prüfen" markierte Schritt wurde nie umgesetzt. Zusätzlich steht `ConformanceLevel` auf `BASIC`, obwohl auf EN 16931 (Comfort) gezielt wird.

### A8. Archivierte Rechnungen sind überschreibbar (GoBD)
`export.rs:16` nutzt `std::fs::write` — überschreibt eine bereits abgelegte Datei kommentarlos. Verschärfend: `kontext.rs:84` liest die Firmendaten **live** aus der DB statt aus dem Snapshot. Wird eine Rechnung nach einer Stammdatenänderung erneut exportiert, wird die archivierte PDF **durch eine inhaltlich andere ersetzt**. Die Unveränderbarkeit des Archivs ist damit nicht gegeben.

### A9. Dashboard und Umsatzgrenzen-Überwachung fehlen komplett
Spec-Punkt 6 der sechs UI-Bereiche. Grep nach `umsatz|grenze|25000|100000` über `src-tauri/src`: **null Treffer**. Keine Seite, kein Command, keine Domänenfunktion.

Das ist der eigentliche USP für die Zielgruppe — die 25.000-€-/100.000-€-Überwachung ist der Grund, warum ein Kleinunternehmer so ein Werkzeug überhaupt braucht. Startseite ist stattdessen „Kunden".

### A10. Offene Posten und Bezahlt-Status fehlen
- `api.belege.offenePosten()` ist definiert, wird von **keiner** Komponente aufgerufen
- Es gibt in der gesamten Codebasis **keinen Status `bezahlt`/`teilbezahlt`**; vollständig bezahlte Rechnungen bleiben ewig „gestellt"
- Rechnungsliste hat keine Spalte „offen/bezahlt", keine Fälligkeitsanzeige

Man sieht nirgends, welche Rechnung noch aussteht — für ein Rechnungsprogramm existenziell.

### A11. Sackgassen: Entwürfe und Zahlungen nicht löschbar
- `api.belege.delete` — **0 Aufrufe**. Ein Entwurf mit falschem Kunden bleibt für immer und blockiert zusätzlich das Löschen des Kunden (`hat_offene_entwuerfe`)
- `api.belege.zahlungDelete` — **0 Aufrufe**. Eine vertippte Zahlung (1.000 € statt 100 €) ist irreversibel
- Der Kunde ist im Beleg-Editor nicht änderbar, obwohl das Backend es unterstützt

### A12. Irreversible Aktionen ohne Rückfrage
„Stellen" (friert ein, vergibt Nummer) und „Stornieren" (erzeugt Stornobeleg) sind Ein-Klick-Aktionen ohne Bestätigung — obwohl `useLoeschBestaetigung` existiert und anderswo genutzt wird. Ebenso „Abgelehnt"/„Abgelaufen" beim Angebot, was eine Einbahnstraße ist.

**Zusätzlicher Bug:** Ein Stornobeleg kann selbst storniert werden — weder Frontend (`BelegEditor.tsx:264`) noch Backend (`belege.rs:452-459`) prüfen `storno_von_id`.

### A13. Doppelklick erzeugt Dubletten
Keine Submit-Sperre außer in `Einrichtung.tsx:212`. Ein Doppelklick auf „Zahlung erfassen" oder „Anlegen" erzeugt doppelte Zahlungen bzw. Belege inklusive Nummernkreis-Verbrauch.

### A14. Artikel-Formular scheitert stumm
`Artikel.tsx:159-162` rendert nur den Feldfehler für `bezeichnung`. Das Backend liefert aber auch Fehler für `einheit_id` und `standardpreis_cent`. **Ein Artikel ohne Einheit gespeichert → Klick auf „Speichern" tut sichtbar nichts.** Kein Fehler, kein Erfolg. Reproduzierbarer Totalausfall des Formulars.

### A15. Import speichert neue Datei unter alten Metadaten
`Eingangsrechnungen.tsx:44-55` setzt `dateiBytes`/`dateiname` **vor** `importVorschau`. Schlägt das Parsen fehl, bleibt die alte Vorschau stehen, die neuen Bytes sind schon übernommen → „Speichern" legt die neue Datei mit den alten Metadaten ab.

---

## B. Wichtig — vor einer echten Produktveröffentlichung

| # | Befund | Ort |
|---|---|---|
| B1 | **Kein Auto-Updater.** Weder Plugin noch Konfiguration. Ohne ihn erreicht kein Bugfix je einen Bestandsnutzer — jeder Fix erfordert manuelle Neuinstallation samt Gatekeeper-/SmartScreen-Hürde. Lässt sich nicht folgenlos nachrüsten, da Signaturschlüssel vorausgesetzt werden | `tauri.conf.json` |
| B2 | **Kein Logging, kein Crash-Reporting, keine Versionsanzeige.** Bei einem Fehler beim Endnutzer existiert keine Spur; Ferndiagnose unmöglich | global |
| B3 | **Startfehler = stiller Crash.** `.expect("app_data_dir")` und `?` im `setup`-Hook: Bei DB-/Migrationsfehler startet die App wortlos nicht | `lib.rs:19-25` |
| B4 | **CI führt keinerlei Tests aus.** `release.yml` ist der einzige Workflow, Trigger nur auf Tags. Kein `cargo test`, kein `npm test`, kein clippy, kein ESLint (nicht mal installiert), kein PR-Trigger | `.github/workflows/` |
| B5 | **Kein E2E-Durchstich** (Spec Z. 94, `tauri-driver`). Die IPC-Grenze ist komplett ungetestet — genau die Zone, in der A1 liegt | – |
| B6 | **Keine KoSIT-Schematron- und keine veraPDF-Validierung** (Spec Z. 82, 93). Die Korrektheit der rechtlich relevanten Formate ruht allein auf selbstgeschriebenen Substring-Assertions | – |
| B7 | **README ist unverändertes Tauri-Template.** Keine Nutzerdoku über Installation hinaus; `installation-freunde.md` ist gut, adressiert aber Freunde, nicht Kunden. Keine LICENSE, Bundle-Metadaten auf Platzhalter (`description = "A Tauri App"`, `authors = ["you"]`) | `README.md`, `Cargo.toml` |
| B8 | **Nummernvergabe nicht in derselben Transaktion** wie der Beleg (`belege.rs:355`, `:467`). Bei Abbruch entsteht eine Nummernlücke — Spec Z. 88 fordert ausdrücklich „keine Duplikate **oder Lücken**" | `belege.rs` |
| B9 | **Kein Schutz gegen zweite Prozessinstanz.** Nebenläufigkeit hängt tragend an `max_connections(1)` plus einem Kommentar; kein WAL, kein `busy_timeout` | `db.rs:8-13` |
| B10 | **Byte-Slicing-Panics im Fremddatei-Parser** (`eingangsrechnung_parse.rs:62,72`). Eine präparierte oder schlicht ungewöhnliche fremde Rechnung bringt den Import zum Absturz | `eingangsrechnung_parse.rs` |
| B11 | **Namespace-Präfixe werden wörtlich verglichen** (`"ram:"`, `"cbc:"`). Eine valide E-Rechnung mit `<ns2:CrossIndustryInvoice>` wird komplett abgelehnt | `eingangsrechnung_parse.rs:375` |
| B12 | **Kein Import von PDF-Rechnungen ohne XML.** Aufbewahrungspflichtig sind aber alle Eingangsrechnungen | `eingangsrechnung_parse.rs:360` |
| B13 | **CSP ist `null`** bei gleichzeitiger Verarbeitung fremder XML-Dateien. Aktuell kein akuter Vektor (kein `innerHTML`), aber für eine Offline-App praktisch kostenlos zu setzen | `tauri.conf.json` |
| B14 | **Keine IBAN-/BIC-Validierung**, weder Frontend noch Backend. Tippfehler landen ungeprüft auf jeder Rechnung und in der XRechnung | `firma.rs`, `Einstellungen.tsx` |
| B15 | **Keine clientseitige Pflichtfeld-Validierung** — kein einziges `required`/`pattern`/`type="email"` im gesamten Frontend | alle Formulare |
| B16 | **Keine Ladezustände in der gesamten App.** Vor dem Laden: `return null` → weißer Bildschirm, nicht von „kaputt" unterscheidbar | `App.tsx:38`, u. a. |
| B17 | **Keine Suche** außer bei Kunden — Rechnungen sind nicht nach Nummer oder Kunde auffindbar, obwohl das Backend den Parameter unterstützt. Keine Sortierung, keine Paginierung | `Rechnungen.tsx` u. a. |
| B18 | **Tabellenzeilen sind ausschließlich per Maus bedienbar** (`onClick` auf `<tr>`, kein `tabIndex`). Detailansichten per Tastatur nicht erreichbar → WCAG 2.1.1 verletzt. Kein Zurück-Button in `BelegEditor`/`KundeDetail` | mehrere |
| B19 | **Keine Warnung bei ungespeicherten Änderungen.** Nav-Klick verwirft Formularinhalte kommentarlos | global |
| B20 | **Reiter „Sonderpreise" beim Kunden ist deaktivierter Platzhalter.** „Welche Sonderpreise hat Kunde X?" ist nicht beantwortbar | `KundeDetail.tsx:113` |
| B21 | **Logo nach der Ersteinrichtung nie mehr änderbar**, obwohl der Assistent das ausdrücklich zusagt | `Einstellungen.tsx` |
| B22 | **Storno-Belege sind in der Liste nicht erkennbar** und tragen den Status „Gestellt" → die Liste enthält scheinbar doppelte offene Rechnungen mit negativer Summe | `Rechnungen.tsx` |
| B23 | **`stellen()` erzwingt keine Rechnungsadresse.** Fehlt sie, wird `"adresse": null` eingefroren und der Beleg ist unveränderbar gestellt — § 14 UStG verlangt die vollständige Anschrift | `belege.rs:340` |
| B24 | **`beleg_delete` soft-löscht Positionen nicht** — dieselbe Bug-Klasse, die Migration 0005 für Kundenpreise nachträglich reparieren musste | `belege.rs:197` |
| B25 | **Kundenpreis-Dublette über den Update-Pfad möglich** → `effektiver_preis` (`LIMIT 1` ohne Tiebreaker) liefert dann einen **nicht-deterministischen Preis**. Ein Test zementiert das Verhalten sogar | `artikel.rs:146,304` |
| B26 | **`rows_affected` in mehreren Update-Zweigen ungeprüft** → unbekannte ID meldet Erfolg, nichts wurde gespeichert | `kunden.rs:170,200`, `artikel.rs:146` |
| B27 | **Leistungs*zeitraum* nicht abbildbar** — Datenmodell hat nur ein Einzeldatum. Bei Dauerleistungen ist die § 14-Angabe falsch | Datenmodell |
| B28 | **Jahr aus `Utc::now()` statt Belegdatum.** Eine am 01.01. gestellte Rechnung bekommt `RE-2027-…`; in DE-Sommerzeit ab 22:00 Uhr liefert `jetzt()` das Datum des Folgetages | `nummernkreis.rs:25` |
| B29 | **Eingangsrechnung-`update` ohne Änderungshistorie.** Rohdatei bleibt, aber die auswertbaren Felder sind spurlos änderbar — GoBD verlangt Nachvollziehbarkeit | `eingangsrechnungen.rs:273` |
| B30 | **Repo liegt in iCloud Drive.** `npm test` läuft grün, braucht aber 112 s statt ~5 s auf lokaler Platte. Zusätzlich Risiko der Git-Index-Korruption durch Eviction. Die Spec fordert Datenablage außerhalb Cloud-Sync — das gilt für das Repo selbst genauso | Ablageort |

---

## C. Nice-to-have

Code-Duplizierung (`Angebote.tsx` ≡ `Rechnungen.tsx` zu ~95 %; `STATUS_KLASSE` in 4 divergierenden Kopien; `feldFehler`-Helper 5-fach), kein Artikel-Autocomplete (einfaches `<select>`, ab ~50 Artikeln unbenutzbar), keine Live-Summenvorschau, Belegpositionen nicht editierbar (nur löschen und neu anlegen), keine Adress-/Ansprechpartner-Auswahl im Beleg, i18n-Struktur enthält nur 6 Nav-Keys (Rest hartkodiert), fehlende Indizes auf Fremdschlüsseln, `greet`-Template-Command noch registriert, ~60 `.unwrap()` im XRechnung-Produktivcode, Dialog ohne Fokusfalle, Kontrast `--text-leiser` bei ~3,2:1 unter WCAG AA.

---

## Empfohlene Reihenfolge

**Stufe 1 — Sofort (klein, hohe Wirkung):**
A1 (eine Zeile), A4, A5, A14, A15, A12, A13

**Stufe 2 — Rechtliche Korrektheit:**
A2 (Steuernummer + IBAN ins PDF), A8, A6, A7 — begleitet von echter Validierung (B6), sonst wiederholt sich das Muster

**Stufe 3 — Fehlende Kernfunktion:**
A9 (Dashboard/Umsatzgrenzen), A10 (Offene Posten + Bezahlt-Status), A11, A3 (Backup)

**Stufe 4 — Produktreife:**
B1–B7 (Updater, Logging, CI mit Tests, Doku, Lizenz, Metadaten)

Stufe 1+2 sind die Voraussetzung dafür, dass die App überhaupt tut, wofür sie gebaut wurde. Stufe 3 ist das, was sie für die Zielgruppe wertvoll macht. Stufe 4 entscheidet, ob sie ein Produkt oder ein Werkzeug für Freunde ist.
