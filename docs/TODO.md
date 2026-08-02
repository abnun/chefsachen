# TODO — Weg zum auslieferbaren MVP

Priorisierte Arbeitsliste, abgeleitet aus [MVP-Review vom 2026-08-02](2026-08-02-mvp-review.md).
Reihenfolge = Empfehlung. Jeder Punkt trägt die Referenz aus dem Review.

## Stand (2026-08-03)

| Stufe | Fortschritt |
|---|---|
| 1 — Kaputte Grundfunktionen | ✅ 8/8 |
| 2 — Rechtliche Korrektheit | ✅ 8/8, P2.9 teilweise |
| 3 — Fehlende Kernfunktionen | ⬜ 1/11 |
| 4 — Robustheit | ⬜ 0/13 |
| 5 — Produktreife | ⬜ 0/7, P5.2 angefangen |
| 6 — UX und Code-Qualität | ⬜ 0/11 |

**Nächster Schritt:** P3.2/P3.3 — Bezahlt-Status und Offene-Posten-Sicht. Die
Dashboard-Kacheln zeigen offene Rechnungen bereits; in der Rechnungsliste fehlt der
Status weiterhin.

## Entwicklungsumgebung einrichten

Die Tests prüfen XRechnung und ZUGFeRD gegen die amtlichen Regelwerke. Dafür
werden zwei externe Java-Werkzeuge benötigt, die **nicht** im Repository liegen:

```
brew install openjdk          # oder eine andere JVM
./scripts/kosit-vorbereiten.sh
```

Ohne JVM oder Cache **überspringen** sich die beiden Normprüfungen. Weil Cargo
die Ausgabe bestandener Tests verschluckt, sieht ein übersprungener Test dabei
aus wie ein bestandener — `KOSIT_PFLICHT=1 cargo test` lässt sie stattdessen
fehlschlagen. In der CI ist der Schalter gesetzt.

---

## Stufe 1 — Sofort: kaputte Grundfunktionen (Aufwand klein, Wirkung groß)

Ohne diese Punkte tut die App nicht, wofür sie gebaut wurde.

- [x] **P1.1 — `fs:allow-write-file` in Capabilities ergänzen** `[A1]` ✅ 2026-08-02
  Ohne diese eine Zeile schlägt jeder Export (PDF, XRechnung, ZUGFeRD, Original) im gebauten Programm fehl.
  → `src-tauri/capabilities/default.json`
  Nicht zu `fs:default` oder Scope-Wildcards greifen — die eine Command-Permission genügt.

- [x] **P1.2 — Panic in `format_nummer` beseitigen** `[A4]` ✅ 2026-08-02
  Ein Nummernkreis-Format wie `RE-{lfd` (ohne `}`) lässt jedes Beleg-Stellen, Kunde- und Artikel-Anlegen abstürzen.
  → `src-tauri/src/domain/nummernkreis.rs:5-13` (Panic entfernen)
  → `src-tauri/src/commands/einstellungen.rs:57` (Format serverseitig validieren statt nur `contains("{lfd")`)
  Beim Testschreiben zusätzlich gefunden: `{lfd:999999999}` paniced mit „Formatting argument out of range" —
  daher `MAX_BREITE = 20` als Obergrenze eingeführt und in der Validierung mitgeprüft.

- [x] **P1.3 — UNIQUE-Constraint auf `beleg.nummer`** `[A5]` ✅ 2026-08-02
  Aktuell sind doppelte Rechnungsnummern ohne Fehlermeldung möglich. GoBD-relevant.
  → Migration `0006_beleg_nummer_eindeutig.sql`, global (nicht je Belegart, weil der
  Export Dateien als `<Nummer>.pdf` ohne Typ ablegt) und ohne Filter auf `deleted_at`.
  Nebenbei behoben: `sqlx::migrate!` ist ein Proc-Macro und meldet Cargo auf stable
  keine Änderung am `migrations`-Verzeichnis — eine neue Migration wurde bei
  inkrementellen Builds stillschweigend ignoriert. `build.rs` gibt jetzt
  `cargo:rerun-if-changed=migrations` aus; Wirkung mit einer Wegwerf-Migration verifiziert.

- [x] **P1.4 — Stumme Formularfehler sichtbar machen** `[A14]` ✅ 2026-08-02
  Artikel ohne Einheit speichern → Button tut sichtbar nichts. Backend liefert Fehler für `einheit_id` und `standardpreis_cent`, das Formular rendert nur `bezeichnung`.
  → `src/pages/Artikel.tsx:159-162`
  Gleiches Muster prüfen in `Kunden.tsx`, `KundeDetail.tsx`, `Einstellungen.tsx`, `Einrichtung.tsx`
  Besser: gemeinsamen `feldFehler`-Helper extrahieren, der *alle* Validierungsfehler anzeigt (behebt zugleich `[C]` 5-fach-Duplizierung)

- [x] **P1.5 — Bestätigung vor irreversiblen Aktionen** `[A12]` ✅ 2026-08-02
  „Stellen", „Stornieren", „Abgelehnt", „Abgelaufen" sind Ein-Klick-Einbahnstraßen. `useLoeschBestaetigung` existiert bereits und wird anderswo genutzt.
  → `src/pages/BelegEditor.tsx:241-268`

- [x] **P1.6 — Storno eines Stornobelegs verhindern** `[A12]` ✅ 2026-08-02
  Weder Frontend noch Backend prüfen `storno_von_id` → Kaskade von Storno-auf-Storno, Nummernkreis-Verbrauch, verfälschte Summen.
  → `src/pages/BelegEditor.tsx:264` und `src-tauri/src/commands/belege.rs:452-459` (beide Ebenen)

- [x] **P1.7 — Doppelklick-Sperre für alle Submit-Aktionen** `[A13]` ✅ 2026-08-02
  Erzeugt sonst doppelte Zahlungen und Belege inkl. Nummernkreis-Verbrauch. Muster aus `Einrichtung.tsx:212` übernehmen.
  → alle Formulare, v. a. `BelegEditor.tsx` (Zahlung erfassen), `Angebote.tsx`, `Rechnungen.tsx`

- [x] **P1.8 — Import-Reihenfolge korrigieren** `[A15]` ✅ 2026-08-02
  `dateiBytes`/`dateiname` werden vor `importVorschau` gesetzt → bei Parse-Fehler wird die neue Datei unter den alten Metadaten gespeichert.
  → `src/pages/Eingangsrechnungen.tsx:44-55`

---

## Stufe 2 — Rechtliche Korrektheit der Ausgabeformate

Ohne diese Punkte erzeugt die App formell fehlerhafte Rechnungen.

- [x] **P2.1 — Steuernummer/USt-IdNr. auf die PDF-Rechnung** `[A2]` ✅ 2026-08-02
  Zentrale Pflichtangabe nach § 14 Abs. 4 Nr. 2 UStG. Fehlt komplett → jede Rechnung ist formell fehlerhaft und zurückweisbar.
  → `src-tauri/templates/rechnung.typ`, `src-tauri/src/dokument/pdf.rs:100-119`

- [x] **P2.2 — IBAN/BIC auf die PDF-Rechnung** `[A2]` ✅ 2026-08-02
  Daten sind gepflegt und gehen in die XRechnung, fehlen aber im PDF → der Kunde kann nicht bezahlen.
  → wie P2.1

- [x] **P2.3 — `kopftext` an die Vorlage übergeben** `[A2]` ✅ 2026-08-02
  Wird im Editor gepflegt, aus Textbausteinen vorbelegt und dann nie gedruckt. Aus Nutzersicht Datenverlust.
  → `src-tauri/src/dokument/pdf.rs:100-119`

- [x] **P2.4 — Rechnungsadresse beim Stellen erzwingen** `[B23]` ✅ 2026-08-02
  Fehlt sie, wird `"adresse": null` eingefroren und der Beleg ist unveränderbar gestellt. § 14 UStG verlangt die vollständige Anschrift.
  → `src-tauri/src/commands/belege.rs:340-353`
  Gilt nur für Rechnungen: Angebote unterliegen § 14 nicht und gehen oft an Interessenten,
  deren Anschrift noch nicht erfasst ist — dort wäre die Sperre Reibung ohne Grund.

- [x] **P2.5 — Archiv unveränderbar machen** `[A8]` ✅ 2026-08-02
  `std::fs::write` überschreibt still; zusätzlich kommen Firmendaten live aus der DB statt aus dem Snapshot → Re-Export nach Stammdatenänderung ersetzt die archivierte Rechnung durch eine inhaltlich andere.
  → `src-tauri/src/dokument/export.rs:16`, `src-tauri/src/dokument/kontext.rs:84`
  Gelöst: `ablegen` überschreibt eine vorhandene Archivdatei nicht mehr (die Nutzerkopie
  über den Speichern-Dialog ist davon unberührt), und die Firmendaten kommen aus dem
  beim Stellen eingefrorenen Snapshot.

- [x] **P2.6 — XRechnung schemavalide machen** `[A6]` ✅ 2026-08-02
  Aktuell würde ein KoSIT-Validator die Datei ablehnen. Zu ergänzen bzw. zu korrigieren:
  - `rsm:ExchangedDocumentContext` mit BT-24 (Profilkennung) als erstes Kind
  - `ram:ApplicableHeaderTradeDelivery` inkl. BT-72 (Leistungsdatum)
  - Kopf-Steuerzeile `ram:ApplicableTradeTax` (BG-23) mit BT-118 `CategoryCode=E`, BT-120 `ExemptionReason` — **hiervon hängt die Kleinunternehmer-Kennzeichnung ab**
  - `currencyID="EUR"` auf allen Beträgen
  - `ram:LineTotalAmount` (BT-106) in der Kopf-Summation
  - `schemeID` auf `SpecifiedTaxRegistration/ram:ID` (`VA`/`FC`) und Fallback auf Steuernummer statt hart `ust_idnr`
  - BT-34/BT-49 (elektronische Adressen)
  - `unitCode` aus `einheit_kuerzel` statt hart `C62`
  → `src-tauri/src/dokument/xrechnung.rs`

  Bestätigt normkonform durch den amtlichen KoSIT-Validator (XRechnung 3.0.2).
  Zusätzlich gefunden, was im Review nicht stand und ohne Validator auch nicht
  auffindbar gewesen wäre:
  - Die Profilkennung wechselte mit XRechnung 3.0 von `xoev-de:kosit:standard`
    auf `xeinkauf.de:kosit` — mit der alten Kennung passte kein Prüfszenario.
  - `currencyID` gehört in CII **nur** an `TaxTotalAmount`; überall sonst ist es
    verboten (CII-DT-031). In UBL ist es genau umgekehrt.
  - `udt:DateTimeString` braucht `format="102"`, sonst wird das Datum nicht erkannt (BR-03).
  - Geschäftsprozess-Kennung BT-23 ist Pflicht (PEPPOL-EN16931-R001).
  - Elektronische Adresse (BT-34) und SELLER CONTACT (BG-6) fehlten im Datenmodell
    → Migration `0007_firma_kontakt.sql` mit E-Mail, Telefon und Ansprechpartner.
  - Korrekturrechnungen brauchen den Verweis auf die Vorrechnung (BG-3).

- [x] **P2.7 — Echtes PDF/A-3 erzeugen oder Konformitätsbehauptung entfernen** `[A7]` ✅ 2026-08-02
  `typst_pdf::PdfOptions::default()` erzeugt PDF 1.7, das XMP behauptet aber `pdfaid:part=3`. `typst-pdf 0.13` bietet `PdfStandards`/`PdfStandard`. Zusätzlich: `ConformanceLevel` steht auf `BASIC` statt EN 16931.
  → `src-tauri/src/dokument/pdf.rs:126`, `src-tauri/src/dokument/zugferd.rs:42-52`

  Bestätigt PDF/A-3b-konform durch veraPDF. Die Lage war weniger schlimm als
  angenommen: 144 Regeln bestanden bereits, gescheitert ist nur eine — die
  `fx:`-Metadaten waren nicht über ein PDF/A-Erweiterungsschema deklariert
  (ISO 19005-3, 6.6.2.3.1). Zusätzlich: `ConformanceLevel` auf „EN 16931"
  korrigiert, und `PdfStandard::A_3b` wird jetzt bei Typst angefordert, damit
  die Konformität nicht davon abhängt, dass die Vorlage zufällig nichts
  PDF/A-Widriges enthält.

- [x] **P2.8 — Formatvalidierung in die CI** `[B6]` ✅ 2026-08-02 (KoSIT für XRechnung, veraPDF für PDF/A)
  Für die PDF-Seite ist der Weg inzwischen frei: `pdf-extract` liest den Text der erzeugten
  Rechnung zuverlässig aus (anders als `lopdf`, siehe alter Hinweis im Testmodul). Damit prüfen
  die Tests jetzt, was tatsächlich auf der Rechnung steht. Für XRechnung und ZUGFeRD fehlt das
  Gegenstück noch: KoSIT-Schematron für XRechnung, veraPDF für ZUGFeRD. Ohne das wiederholt sich das Muster: Die Tests bestätigen nur, dass der Code tut was er tut, nie dass das Ergebnis normkonform ist.

- [~] **P2.9 — PDF-Vorlage produktionsreif machen** `[A2]` — teilweise erledigt 2026-08-02
  Erledigt: Seitenzahlen (erst ab Seite 2), Tabellenkopf-Wiederholung, Land im Empfängerblock
  (nur bei Auslandsrechnung), deutsches Datumsformat, IBAN in Viererblöcken.
  Offen: DIN-5008-Adressposition für Fensterumschläge, konkretes Fälligkeitsdatum statt „N Tage",
  Positions- und Artikelnummer in der Tabelle, Verweis auf die Ursprungsrechnung im Storno-PDF.
  → `src-tauri/templates/rechnung.typ`

---

## Stufe 3 — Fehlende Kernfunktionen

Ohne diese Punkte ist die App für die Zielgruppe nicht wertvoll.

- [x] **P3.1 — Dashboard mit Umsatzgrenzen-Überwachung** `[A9]` ✅ 2026-08-03
  Der eigentliche USP: 25.000-€-Vorjahres- und 100.000-€-Laufjahresgrenze nach § 19 UStG. Basis = vereinnahmte Zahlungen des Kalenderjahres, Storni negativ. Existiert weder im Backend noch im Frontend.
  Umfang laut Spec: Jahresumsatz mit Fortschrittsbalken und Warnstufen, offene Rechnungen mit Fälligkeit, zuletzt bearbeitete Belege, offene Angebote.

  Umgesetzt mit drei Balken statt einem: Derselbe laufende Umsatz wird an zwei Grenzen
  gemessen und betrifft dabei zwei verschiedene Jahre. Dazu Migration 0009 für das
  Gründungsjahr — ohne Vorjahr gilt die 25.000-€-Grenze bereits fürs laufende Jahr.
  Die Hinweise nennen die geschätzte Nachzahlung und raten zur Rücklage, weil die
  Steuer beim Kunden nachträglich meist nicht mehr einzutreiben ist.
  **Noch nicht mit eigenen Augen geprüft** — die Seite ist nur durch Tests abgesichert,
  ein Lauf der echten App steht aus.

- [ ] **P3.2 — Bezahlt-/Teilbezahlt-Status** `[A10]`
  Existiert nirgends in der Codebasis; vollständig bezahlte Rechnungen bleiben ewig „gestellt".
  → Statusübergänge im Backend, Statusanzeige in `Rechnungen.tsx`

- [ ] **P3.3 — Offene-Posten-Sicht** `[A10]`
  `api.belege.offenePosten()` ist implementiert und hat 0 Aufrufe. Dazu Fälligkeitsdatum aus `zahlungsziel_tage` berechnen.

- [ ] **P3.4 — Entwürfe löschbar machen** `[A11]`
  `api.belege.delete` hat 0 Aufrufe. Ein Entwurf mit falschem Kunden bleibt für immer **und** blockiert das Löschen des Kunden → Sackgasse.
  Zusätzlich: `beleg_delete` soft-löscht die Positionen nicht `[B24]`.

- [ ] **P3.5 — Zahlungen löschbar machen** `[A11]`
  `api.belege.zahlungDelete` hat 0 Aufrufe. Eine vertippte Zahlung ist derzeit irreversibel.

- [ ] **P3.6 — Kunde im Beleg-Editor änderbar** `[A11]`
  Backend unterstützt `BelegUpdate.kunde_id`, das Frontend rendert nur Text. Falscher Kunde beim Anlegen = unbrauchbarer Entwurf.

- [ ] **P3.7 — Automatisches Backup + manueller Export/Import** `[A3]`
  Spec: rotierendes Start-Backup (letzte 10) plus Export/Import in den Einstellungen. Aktuell null Treffer im Code.
  Zusätzlich Pre-Migration-Backup — Migrationen haben derzeit keine Rückfallebene.

- [ ] **P3.8 — Stornobelege in der Liste kennzeichnen** `[B22]`
  Tragen aktuell Status „Gestellt" → die Liste enthält scheinbar doppelte offene Rechnungen mit negativer Summe.

- [ ] **P3.9 — Reiter „Sonderpreise" beim Kunden umsetzen** `[B20]`
  Derzeit deaktivierter Platzhalter. „Welche Sonderpreise hat Kunde X?" ist nicht beantwortbar.

- [ ] **P3.10 — Logo in den Einstellungen änderbar** `[B21]`
  Der Einrichtungsassistent sagt es ausdrücklich zu, die Einstellungsseite bietet es nicht.

- [ ] **P3.11 — Kontaktfelder in den Einrichtungsassistenten** — neu aufgetaucht 2026-08-02
  E-Mail, Telefon und Ansprechpartner der Firma sind seit P2.6 Pflicht für eine gültige
  XRechnung (BT-34, BG-6), stehen aber nur in den Einstellungen. Wer die App neu aufsetzt,
  muss sie nachtragen, bevor ein XRechnung-Export gelingt — ohne dass ihn etwas darauf hinweist.
  → `src/pages/Einrichtung.tsx`
  Sinnvoll dazu: `xrechnung::pruefe_exportierbarkeit` um diese Felder erweitern, damit der
  Fehler beim Export benannt wird, statt erst beim Empfänger aufzufallen.

---

## Stufe 4 — Robustheit und Datenintegrität

- [ ] **P4.1 — Nummernvergabe und Belegschreibung in eine Transaktion** `[B8]`
  Bei Abbruch entsteht eine Nummernlücke. Spec fordert ausdrücklich „keine Duplikate **oder Lücken**".
  → `belege.rs:355`, `belege.rs:467`

- [ ] **P4.2 — Nebenläufigkeit absichern** `[B9]`
  Schutz hängt tragend an `max_connections(1)` plus Kommentar. WAL-Modus, `busy_timeout` und ein atomares `UPDATE … SET zaehler = zaehler + 1 … RETURNING` würden die Kopplung auflösen.
  → `src-tauri/src/db.rs:8-13`

- [ ] **P4.3 — Byte-Slicing-Panics im Fremddatei-Parser** `[B10]`
  Eine ungewöhnliche fremde Rechnung bringt den Import zum Absturz.
  → `eingangsrechnung_parse.rs:62,72`

- [ ] **P4.4 — Echte Namespace-Auflösung im XML-Parser** `[B11]`
  Präfixe werden wörtlich verglichen (`"ram:"`, `"cbc:"`) → eine valide Rechnung mit `<ns2:CrossIndustryInvoice>` wird komplett abgelehnt.

- [ ] **P4.5 — `rows_affected` prüfen** `[B26]`
  Unbekannte ID meldet aktuell Erfolg, gespeichert wurde nichts.
  → `kunden.rs:170,200`, `artikel.rs:146`

- [ ] **P4.6 — Kundenpreis-Dublette über den Update-Pfad verhindern** `[B25]`
  Führt zu nicht-deterministischer Preisfindung (`LIMIT 1` ohne Tiebreaker). Ein Test zementiert das Verhalten derzeit sogar.

- [ ] **P4.7 — Jahr aus Belegdatum statt `Utc::now()`, lokale Zeitzone** `[B28]`
  Eine am 01.01. gestellte Rechnung bekommt `RE-2027-…`; in DE-Sommerzeit liefert `jetzt()` ab 22:00 Uhr das Datum des Folgetages.

- [ ] **P4.8 — Startfehler bedienbar machen** `[B3]`
  `.expect("app_data_dir")` und `?` im `setup`-Hook → App startet bei DB-/Migrationsfehler wortlos nicht.

- [ ] **P4.9 — IBAN-/BIC-Validierung** `[B14]`
  Weder Frontend noch Backend. Tippfehler landen auf jeder Rechnung und in der XRechnung.
  Durch die Normprüfung bestätigt: Eine syntaktisch falsche IBAN löst BR-DE-19 aus, und die
  KoSIT-Konfiguration lehnt das Dokument schon bei dieser Warnung ab. Eine Prüfung der
  Prüfsumme beim Speichern verhindert das, bevor eine Rechnung hinausgeht.

- [ ] **P4.10 — Clientseitige Pflichtfeld-Validierung** `[B15]`
  Kein einziges `required`/`pattern`/`type="email"` im gesamten Frontend.

- [ ] **P4.11 — Leistungszeitraum im Datenmodell** `[B27]`
  Nur Einzeldatum vorhanden; bei Dauerleistungen ist die § 14-Angabe falsch.

- [ ] **P4.12 — Import von PDF-Rechnungen ohne XML** `[B12]`
  Aufbewahrungspflichtig sind alle Eingangsrechnungen, nicht nur maschinenlesbare.

- [ ] **P4.13 — Änderungshistorie für Eingangsrechnungen** `[B29]`
  Rohdatei bleibt, auswertbare Felder sind spurlos änderbar. GoBD verlangt Nachvollziehbarkeit.

---

## Stufe 5 — Produktreife (Auslieferung an Dritte)

- [ ] **P5.1 — Auto-Updater einrichten** `[B1]`
  Ohne ihn erreicht kein Bugfix je einen Bestandsnutzer. Lässt sich nicht folgenlos nachrüsten, da Signaturschlüssel vorausgesetzt werden — daher **vor** der ersten echten Verteilung.

- [~] **P5.2 — CI mit Tests, Clippy, Typecheck, PR-Trigger** `[B4]` — angefangen 2026-08-02
  `release.yml` war der einzige Workflow, Trigger nur auf Tags. Kein Commit wurde je maschinell geprüft.
  Erledigt: `.github/workflows/ci.yml` mit Push-/PR-Trigger, Frontend-Typprüfung und -Tests,
  Clippy mit `-D warnings`, Rust-Tests inklusive der beiden Normprüfungen (KOSIT_PFLICHT gesetzt).
  **Offen und wichtig: Der Workflow ist noch nie gelaufen.** Ungetestet sind vor allem die
  Ubuntu-Systempakete für den Tauri-Bau und die unbeaufsichtigte veraPDF-Installation.
  Beim ersten Push prüfen und nachbessern.
  Ebenfalls offen: ESLint ist weiterhin nicht eingerichtet.

- [ ] **P5.3 — E2E-Durchstich via `tauri-driver`** `[B5]`
  Die IPC-Grenze ist komplett ungetestet — genau die Zone, in der P1.1 lag.

- [ ] **P5.4 — Logging und Versionsanzeige** `[B2]`
  Bei einem Fehler beim Endnutzer existiert keine Spur; Ferndiagnose unmöglich.

- [ ] **P5.5 — README, Nutzerdoku, LICENSE, Bundle-Metadaten** `[B7]`
  README ist unverändertes Tauri-Template, `Cargo.toml` steht auf `description = "A Tauri App"` / `authors = ["you"]`. Diese Felder erscheinen im Windows-Installer und in den macOS-Infos.

- [ ] **P5.6 — Code-Signing und Notarisierung** `[B1]`
  Secrets sind in `release.yml` bereits vorbereitet. Benötigt Apple-Developer- und Windows-Zertifikat.

- [ ] **P5.7 — CSP setzen** `[B13]`
  Aktuell `null` bei gleichzeitiger Verarbeitung fremder XML-Dateien. Für eine Offline-App praktisch kostenlos.

---

## Stufe 6 — UX und Code-Qualität

- [ ] **P6.1 — Ladezustände** `[B16]` — aktuell `return null` → weißer Bildschirm, nicht von „kaputt" unterscheidbar
- [ ] **P6.2 — Suche, Sortierung, Paginierung** `[B17]` — Rechnungen sind nicht nach Nummer oder Kunde auffindbar, obwohl das Backend den Parameter unterstützt
- [ ] **P6.3 — Tastaturbedienbarkeit** `[B18]` — Tabellenzeilen nur per Maus (WCAG 2.1.1), kein Zurück-Button in `BelegEditor`/`KundeDetail`
- [ ] **P6.4 — Warnung bei ungespeicherten Änderungen** `[B19]`
- [ ] **P6.5 — Duplizierung auflösen** — `Angebote.tsx` ≡ `Rechnungen.tsx` zu ~95 %, `STATUS_KLASSE` in 4 divergierenden Kopien
- [ ] **P6.6 — Belegpositionen editierbar und sortierbar** — derzeit nur löschen und neu anlegen
- [ ] **P6.7 — Artikel-Autocomplete statt `<select>`** — ab ~50 Artikeln unbenutzbar
- [ ] **P6.8 — Live-Summenvorschau** — Spec-Anforderung, aktuell erst nach Server-Roundtrip
- [ ] **P6.9 — Adress- und Ansprechpartner-Auswahl im Beleg**
- [ ] **P6.10 — Barrierefreiheit** — Dialog ohne Fokusfalle, Kontrast `--text-leiser` bei ~3,2:1 unter WCAG AA
- [ ] **P6.11 — Aufräumen** — `greet`-Template-Command, ~60 `.unwrap()` im XRechnung-Produktivcode, fehlende Indizes auf Fremdschlüsseln, i18n nur 6 Nav-Keys

---

## Umgebung

- [ ] **P0 — Repo von iCloud Drive auf lokale Platte verschieben** `[B30]`
  `npm test` braucht 112 s statt ~5 s; zusätzlich Risiko der Git-Index-Korruption durch Eviction. Lädt nicht zum Testen vor dem Commit ein — was gut erklärt, wie P1.1 durchrutschen konnte.
