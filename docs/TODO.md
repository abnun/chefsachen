# TODO — Weg zum auslieferbaren MVP

Priorisierte Arbeitsliste, abgeleitet aus [MVP-Review vom 2026-08-02](2026-08-02-mvp-review.md).
Reihenfolge = Empfehlung. Jeder Punkt trägt die Referenz aus dem Review.

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

- [ ] **P1.3 — UNIQUE-Constraint auf `beleg.nummer`** `[A5]`
  Aktuell sind doppelte Rechnungsnummern ohne Fehlermeldung möglich. GoBD-relevant.
  → neue Migration; Constraint muss soft-gelöschte Zeilen einschließen (analog `kunde.kundennummer`)

- [ ] **P1.4 — Stumme Formularfehler sichtbar machen** `[A14]`
  Artikel ohne Einheit speichern → Button tut sichtbar nichts. Backend liefert Fehler für `einheit_id` und `standardpreis_cent`, das Formular rendert nur `bezeichnung`.
  → `src/pages/Artikel.tsx:159-162`
  Gleiches Muster prüfen in `Kunden.tsx`, `KundeDetail.tsx`, `Einstellungen.tsx`, `Einrichtung.tsx`
  Besser: gemeinsamen `feldFehler`-Helper extrahieren, der *alle* Validierungsfehler anzeigt (behebt zugleich `[C]` 5-fach-Duplizierung)

- [ ] **P1.5 — Bestätigung vor irreversiblen Aktionen** `[A12]`
  „Stellen", „Stornieren", „Abgelehnt", „Abgelaufen" sind Ein-Klick-Einbahnstraßen. `useLoeschBestaetigung` existiert bereits und wird anderswo genutzt.
  → `src/pages/BelegEditor.tsx:241-268`

- [ ] **P1.6 — Storno eines Stornobelegs verhindern** `[A12]`
  Weder Frontend noch Backend prüfen `storno_von_id` → Kaskade von Storno-auf-Storno, Nummernkreis-Verbrauch, verfälschte Summen.
  → `src/pages/BelegEditor.tsx:264` und `src-tauri/src/commands/belege.rs:452-459` (beide Ebenen)

- [ ] **P1.7 — Doppelklick-Sperre für alle Submit-Aktionen** `[A13]`
  Erzeugt sonst doppelte Zahlungen und Belege inkl. Nummernkreis-Verbrauch. Muster aus `Einrichtung.tsx:212` übernehmen.
  → alle Formulare, v. a. `BelegEditor.tsx` (Zahlung erfassen), `Angebote.tsx`, `Rechnungen.tsx`

- [ ] **P1.8 — Import-Reihenfolge korrigieren** `[A15]`
  `dateiBytes`/`dateiname` werden vor `importVorschau` gesetzt → bei Parse-Fehler wird die neue Datei unter den alten Metadaten gespeichert.
  → `src/pages/Eingangsrechnungen.tsx:44-55`

---

## Stufe 2 — Rechtliche Korrektheit der Ausgabeformate

Ohne diese Punkte erzeugt die App formell fehlerhafte Rechnungen.

- [ ] **P2.1 — Steuernummer/USt-IdNr. auf die PDF-Rechnung** `[A2]`
  Zentrale Pflichtangabe nach § 14 Abs. 4 Nr. 2 UStG. Fehlt komplett → jede Rechnung ist formell fehlerhaft und zurückweisbar.
  → `src-tauri/templates/rechnung.typ`, `src-tauri/src/dokument/pdf.rs:100-119`

- [ ] **P2.2 — IBAN/BIC auf die PDF-Rechnung** `[A2]`
  Daten sind gepflegt und gehen in die XRechnung, fehlen aber im PDF → der Kunde kann nicht bezahlen.
  → wie P2.1

- [ ] **P2.3 — `kopftext` an die Vorlage übergeben** `[A2]`
  Wird im Editor gepflegt, aus Textbausteinen vorbelegt und dann nie gedruckt. Aus Nutzersicht Datenverlust.
  → `src-tauri/src/dokument/pdf.rs:100-119`

- [ ] **P2.4 — Rechnungsadresse beim Stellen erzwingen** `[B23]`
  Fehlt sie, wird `"adresse": null` eingefroren und der Beleg ist unveränderbar gestellt. § 14 UStG verlangt die vollständige Anschrift.
  → `src-tauri/src/commands/belege.rs:340-353`

- [ ] **P2.5 — Archiv unveränderbar machen** `[A8]`
  `std::fs::write` überschreibt still; zusätzlich kommen Firmendaten live aus der DB statt aus dem Snapshot → Re-Export nach Stammdatenänderung ersetzt die archivierte Rechnung durch eine inhaltlich andere.
  → `src-tauri/src/dokument/export.rs:16`, `src-tauri/src/dokument/kontext.rs:84`

- [ ] **P2.6 — XRechnung schemavalide machen** `[A6]`
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

- [ ] **P2.7 — Echtes PDF/A-3 erzeugen oder Konformitätsbehauptung entfernen** `[A7]`
  `typst_pdf::PdfOptions::default()` erzeugt PDF 1.7, das XMP behauptet aber `pdfaid:part=3`. `typst-pdf 0.13` bietet `PdfStandards`/`PdfStandard`. Zusätzlich: `ConformanceLevel` steht auf `BASIC` statt EN 16931.
  → `src-tauri/src/dokument/pdf.rs:126`, `src-tauri/src/dokument/zugferd.rs:42-52`

- [ ] **P2.8 — Formatvalidierung in die CI** `[B6]`
  KoSIT-Schematron für XRechnung, veraPDF für ZUGFeRD. Ohne das wiederholt sich das Muster: Die Tests bestätigen nur, dass der Code tut was er tut, nie dass das Ergebnis normkonform ist.

- [ ] **P2.9 — PDF-Vorlage produktionsreif machen** `[A2]`
  Seitenzahlen, Tabellenkopf-Wiederholung (`table.header(repeat: true)`), Land in beiden Adressblöcken, DIN-5008-Adressposition für Fensterumschläge, Fälligkeitsdatum statt nur „N Tage".
  → `src-tauri/templates/rechnung.typ`

---

## Stufe 3 — Fehlende Kernfunktionen

Ohne diese Punkte ist die App für die Zielgruppe nicht wertvoll.

- [ ] **P3.1 — Dashboard mit Umsatzgrenzen-Überwachung** `[A9]`
  Der eigentliche USP: 25.000-€-Vorjahres- und 100.000-€-Laufjahresgrenze nach § 19 UStG. Basis = vereinnahmte Zahlungen des Kalenderjahres, Storni negativ. Existiert weder im Backend noch im Frontend.
  Umfang laut Spec: Jahresumsatz mit Fortschrittsbalken und Warnstufen, offene Rechnungen mit Fälligkeit, zuletzt bearbeitete Belege, offene Angebote.

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

- [ ] **P5.2 — CI mit Tests, Clippy, Typecheck, PR-Trigger** `[B4]`
  `release.yml` ist der einzige Workflow, Trigger nur auf Tags. Kein Commit wird je maschinell geprüft.

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
