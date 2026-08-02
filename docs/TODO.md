# TODO — Weg zum auslieferbaren MVP

Priorisierte Arbeitsliste, abgeleitet aus [MVP-Review vom 2026-08-02](2026-08-02-mvp-review.md).
Reihenfolge = Empfehlung. Jeder Punkt trägt die Referenz aus dem Review.

## Stand (2026-08-02)

| Stufe | Fortschritt |
|---|---|
| 1 — Kaputte Grundfunktionen | ✅ 8/8 |
| 2 — Rechtliche Korrektheit | ✅ 8/8, P2.9 teilweise |
| 3 — Fehlende Kernfunktionen | ✅ 10/11, P3.7 teilweise |
| 4 — Robustheit | ✅ 13/13 |
| 5 — Produktreife | ⬜ 5/7, P5.2 angefangen, P5.6 zurückgestellt |
| 6 — UX und Code-Qualität | ⬜ 9/11 |

**Nächster Schritt:** Stufe 6 (UX und Code-Qualität). Von Stufe 5 bleibt P5.2 offen —
die CI ist noch nie gelaufen und klärt sich beim ersten Push von selbst; P5.6 (Signierung)
ist bewusst zurückgestellt, die App geht vorerst nur an Family & Friends.

**P0 ist zweimal konkret aufgeschlagen** (2026-08-02): `npm ci` scheiterte an der
iCloud-Dublette `node_modules/esbuild 2/`, `tar` an Dateien, deren Inhalt iCloud ausgelagert
hatte („Resource deadlock avoided"). Das Projekt gehört von iCloud Drive weg.

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

- [x] **P3.2 — Bezahlt-/Teilbezahlt-Status** `[A10]` ✅ 2026-08-03
  Bewusst **abgeleitet** statt als Spalte geführt: Ein gespeicherter Status müsste bei
  jeder Zahlungserfassung, -korrektur und -löschung mitgezogen werden; jede vergessene
  Stelle erzeugte eine Rechnung, die als bezahlt gilt, ohne es zu sein.
  Existiert nirgends in der Codebasis; vollständig bezahlte Rechnungen bleiben ewig „gestellt".
  → Statusübergänge im Backend, Statusanzeige in `Rechnungen.tsx`

- [x] **P3.3 — Offene-Posten-Sicht** `[A10]` ✅ 2026-08-03 (Rechnungsliste mit Zahlung, Fälligkeit, offenem Betrag; Übersicht siehe P3.1)
  `api.belege.offenePosten()` ist implementiert und hat 0 Aufrufe. Dazu Fälligkeitsdatum aus `zahlungsziel_tage` berechnen.

- [x] **P3.4 — Entwürfe löschbar machen** `[A11]` ✅ 2026-08-03 (samt B24: Positionen werden mit soft-gelöscht)
  `api.belege.delete` hat 0 Aufrufe. Ein Entwurf mit falschem Kunden bleibt für immer **und** blockiert das Löschen des Kunden → Sackgasse.
  Zusätzlich: `beleg_delete` soft-löscht die Positionen nicht `[B24]`.

- [x] **P3.5 — Zahlungen löschbar machen** `[A11]` ✅ 2026-08-03
  `api.belege.zahlungDelete` hat 0 Aufrufe. Eine vertippte Zahlung ist derzeit irreversibel.

- [x] **P3.6 — Kunde im Beleg-Editor änderbar** `[A11]` ✅ 2026-08-03 (nur solange Entwurf)
  Backend unterstützt `BelegUpdate.kunde_id`, das Frontend rendert nur Text. Falscher Kunde beim Anlegen = unbrauchbarer Entwurf.

- [~] **P3.7 — Automatisches Backup + manueller Export/Import** `[A3]` — teilweise 2026-08-03
  Spec: rotierendes Start-Backup (letzte 10) plus Export/Import in den Einstellungen.
  Erledigt: Sicherung bei jedem Start **vor** den Migrationen, zehn jüngste bleiben erhalten,
  sichtbar in den Einstellungen samt Knopf für eine sofortige Sicherung. Ein Fehler beim
  Sichern verhindert den Start nicht — die App wäre sonst wegen einer Vorsichtsmaßnahme
  unbenutzbar.
  Offen: Wiederherstellung aus der App heraus (derzeit nur durch Ersetzen der Datei bei
  geschlossenem Programm) und Export an einen selbst gewählten Ort.

- [x] **P3.8 — Stornobelege in der Liste kennzeichnen** `[B22]` ✅ 2026-08-03
  Tragen aktuell Status „Gestellt" → die Liste enthält scheinbar doppelte offene Rechnungen mit negativer Summe.

- [x] **P3.9 — Reiter „Sonderpreise" beim Kunden umsetzen** `[B20]` ✅ 2026-08-03 (lesend; gepflegt wird weiter auf der Artikel-Seite)
  Derzeit deaktivierter Platzhalter. „Welche Sonderpreise hat Kunde X?" ist nicht beantwortbar.

- [x] **P3.10 — Logo in den Einstellungen änderbar** `[B21]` ✅ 2026-08-03
  Der Einrichtungsassistent sagt es ausdrücklich zu, die Einstellungsseite bietet es nicht.

- [x] **P3.11 — Kontaktfelder in den Einrichtungsassistenten** ✅ 2026-08-03 — neu aufgetaucht 2026-08-02
  E-Mail, Telefon und Ansprechpartner der Firma sind seit P2.6 Pflicht für eine gültige
  XRechnung (BT-34, BG-6), stehen aber nur in den Einstellungen. Wer die App neu aufsetzt,
  muss sie nachtragen, bevor ein XRechnung-Export gelingt — ohne dass ihn etwas darauf hinweist.
  → `src/pages/Einrichtung.tsx`
  Sinnvoll dazu: `xrechnung::pruefe_exportierbarkeit` um diese Felder erweitern, damit der
  Fehler beim Export benannt wird, statt erst beim Empfänger aufzufallen.

---

## Stufe 4 — Robustheit und Datenintegrität

- [x] **P4.1 — Nummernvergabe und Belegschreibung in eine Transaktion** `[B8]` ✅ 2026-08-03
  → Nummer und Beleg-UPDATE in einer Transaktion; die Vergabe läuft als atomares UPDATE … RETURNING
  Bei Abbruch entsteht eine Nummernlücke. Spec fordert ausdrücklich „keine Duplikate **oder Lücken**".
  → `belege.rs:355`, `belege.rs:467`

- [x] **P4.2 — Nebenläufigkeit absichern** `[B9]` ✅ 2026-08-03
  → WAL, busy_timeout und atomare Vergabe — max_connections(1) ist keine Voraussetzung für die Korrektheit mehr
  Schutz hängt tragend an `max_connections(1)` plus Kommentar. WAL-Modus, `busy_timeout` und ein atomares `UPDATE … SET zaehler = zaehler + 1 … RETURNING` würden die Kopplung auflösen.
  → `src-tauri/src/db.rs:8-13`

- [x] **P4.3 — Byte-Slicing-Panics im Fremddatei-Parser** `[B10]` ✅ 2026-08-03
  → Datum und Dezimalzahlen zeichenweise statt byteweise zerlegen
  Eine ungewöhnliche fremde Rechnung bringt den Import zum Absturz.
  → `eingangsrechnung_parse.rs:62,72`

- [x] **P4.4 — Echte Namespace-Auflösung im XML-Parser** `[B11]` ✅ 2026-08-03
  → Vergleiche laufen über den lokalen Elementnamen; Präfixe sind Konvention, nicht Vorschrift
  Präfixe werden wörtlich verglichen (`"ram:"`, `"cbc:"`) → eine valide Rechnung mit `<ns2:CrossIndustryInvoice>` wird komplett abgelehnt.

- [x] **P4.5 — `rows_affected` prüfen** `[B26]` ✅ 2026-08-03
  → adresse_speichern, ansprechpartner_speichern und kundenpreis_speichern prüfen rows_affected
  Unbekannte ID meldet aktuell Erfolg, gespeichert wurde nichts.
  → `kunden.rs:170,200`, `artikel.rs:146`

- [x] **P4.6 — Kundenpreis-Dublette über den Update-Pfad verhindern** `[B25]` ✅ 2026-08-03
  → Eindeutigkeitsprüfung jetzt in beiden Zweigen; Preisfindung zusätzlich mit deterministischem Tiebreaker
  Führt zu nicht-deterministischer Preisfindung (`LIMIT 1` ohne Tiebreaker). Ein Test zementiert das Verhalten derzeit sogar.

- [x] **P4.7 — Jahr aus Belegdatum statt `Utc::now()`, lokale Zeitzone** `[B28]` ✅ 2026-08-03
  → Jahr aus dem Belegdatum, sonst lokale Zeit statt UTC
  Eine am 01.01. gestellte Rechnung bekommt `RE-2027-…`; in DE-Sommerzeit liefert `jetzt()` ab 22:00 Uhr das Datum des Folgetages.

- [x] **P4.8 — Startfehler bedienbar machen** `[B3]` ✅ 2026-08-03
  → Startfehler erscheinen als Dialog mit Ablageort und Hinweis auf die Sicherungen, statt die App wortlos zu beenden
  `.expect("app_data_dir")` und `?` im `setup`-Hook → App startet bei DB-/Migrationsfehler wortlos nicht.

- [x] **P4.9 — IBAN-/BIC-Validierung** `[B14]` ✅ 2026-08-03
  → IBAN mit Prüfsumme nach ISO 13616, BIC nach Form (ISO 9362)
  Weder Frontend noch Backend. Tippfehler landen auf jeder Rechnung und in der XRechnung.
  Durch die Normprüfung bestätigt: Eine syntaktisch falsche IBAN löst BR-DE-19 aus, und die
  KoSIT-Konfiguration lehnt das Dokument schon bei dieser Warnung ab. Eine Prüfung der
  Prüfsumme beim Speichern verhindert das, bevor eine Rechnung hinausgeht.

- [x] **P4.10 — Clientseitige Pflichtfeld-Validierung** `[B15]` ✅ 2026-08-03
  → Pflichtfelder und Wertebereiche im Formular ausgezeichnet; die Backend-Prüfung bleibt maßgeblich
  Kein einziges `required`/`pattern`/`type="email"` im gesamten Frontend.

- [x] **P4.11 — Leistungszeitraum im Datenmodell** `[B27]` ✅ 2026-08-03
  → Migration 0009; PDF weist die Spanne aus, XRechnung nutzt BG-14 (BillingSpecifiedPeriod), vom KoSIT-Validator bestätigt
  Nur Einzeldatum vorhanden; bei Dauerleistungen ist die § 14-Angabe falsch.

- [x] **P4.12 — Import von PDF-Rechnungen ohne XML** `[B12]` ✅ 2026-08-03
  → Migration 0010 lässt das Format 'pdf' zu; die Datei wird archiviert, die Felder trägt der Nutzer nach
  Aufbewahrungspflichtig sind alle Eingangsrechnungen, nicht nur maschinenlesbare.

- [x] **P4.13 — Änderungshistorie für Eingangsrechnungen** `[B29]`
  Jede Korrektur an Rechnungssteller, Nummer, Datum, Betrag oder Währung wird mit
  altem und neuem Wert protokolliert (`eingangsrechnung_aenderung`), in derselben
  Transaktion wie die Änderung. Das Detail zeigt die Historie mit aufbereiteten
  Werten; ohne Korrekturen bleibt sie unsichtbar.

---

## Stufe 5 — Produktreife (Auslieferung an Dritte)

- [x] **P5.1 — Auto-Updater einrichten** `[B1]`
  `tauri-plugin-updater` + `tauri-plugin-process`, minisign-Schlüsselpaar erzeugt, öffentlicher
  Schlüssel in `tauri.conf.json`, `createUpdaterArtifacts: true`. Endpunkt ist
  `releases/latest/download/latest.json` auf GitHub.
  Oberfläche: Abschnitt „Programmversion" in den Einstellungen — zeigt die installierte Version,
  sucht beim Start still (offline gibt es keine Meldung), meldet Fehlschläge nur bei manueller
  Suche, und installiert erst auf Knopfdruck.
  **Noch zu tun, bevor das erste Update ankommt:**
  1. Repository-Secret `TAURI_SIGNING_PRIVATE_KEY` setzen (Inhalt von
     `~/.tauri/kleinunternehmer-verwaltung.key`, liegt bewusst außerhalb des Repos).
  2. Den vom Workflow erzeugten Release-**Entwurf** auf GitHub veröffentlichen —
     `releases/latest` zeigt nicht auf Entwürfe.
  3. Der Weg von Version A nach B ist noch nie durchlaufen worden; das geht erst mit
     zwei echten Releases.

- [~] **P5.2 — CI mit Tests, Clippy, Typecheck, PR-Trigger** `[B4]` — angefangen 2026-08-02
  `release.yml` war der einzige Workflow, Trigger nur auf Tags. Kein Commit wurde je maschinell geprüft.
  Erledigt: `.github/workflows/ci.yml` mit Push-/PR-Trigger, Frontend-Typprüfung und -Tests,
  Clippy mit `-D warnings`, Rust-Tests inklusive der beiden Normprüfungen (KOSIT_PFLICHT gesetzt).
  **Offen und wichtig: Der Workflow ist noch nie gelaufen.** Ungetestet sind vor allem die
  Ubuntu-Systempakete für den Tauri-Bau und die unbeaufsichtigte veraPDF-Installation.
  Beim ersten Push prüfen und nachbessern.
  Ebenfalls offen: ESLint ist weiterhin nicht eingerichtet.

- [x] **P5.3 — E2E-Durchstich via `tauri-driver`** `[B5]`
  Zwei Ebenen, weil eine allein nicht reicht:
  1. `src-tauri/src/ipc.rs` — geht über `on_message` des Webviews, mit den echten
     Berechtigungen und dem Ursprung `tauri://localhost`. Prüft Erreichbarkeit der Befehle,
     Umwandlung der Argumente, die auswertbare Form der Fehler und die Berechtigung jeder
     Plugin-Funktion, die das Frontend importiert. Läuft überall, auch auf macOS.
     Dafür mussten Befehls- und Plugin-Registrierung aus `run()` in `mit_befehlen`/`mit_plugins`.
  2. `e2e/` — WebdriverIO über `tauri-driver`, startet die gebaute Anwendung und bedient sie.
     Prüft, was nur im echten Fenster sichtbar wird: dass die Oberfläche überhaupt erscheint,
     auf Klicks reagiert und die Inhaltsrichtlinie (P5.7) nichts Eigenes blockiert.
  **Läuft nicht auf macOS.** `tauri-driver` braucht einen WebDriver zur System-Webview;
  für WKWebView gibt es keinen. Deshalb Linux: in der CI (neuer Job `e2e`) und lokal über
  `./e2e/docker-lauf.sh`.
  Dabei gelernt: Ein `cargo build` im Debug-Profil erzeugt einen Entwicklungsbau, der die
  Oberfläche vom Vite-Server lädt — das Fenster bleibt leer. `tauri build --debug --no-bundle`
  bettet sie ein. Und `fs:allow-write-file` erlaubt nur den Befehl; der Pfad muss zusätzlich im
  Geltungsbereich liegen, den erst der Speichern-Dialog öffnet.

- [x] **P5.4 — Logging und Versionsanzeige** `[B2]`
  `tauri-plugin-log` schreibt in den Protokollordner des Betriebssystems, Umbruch bei 2 MiB,
  eine ältere Fassung bleibt. Zeitstempel in UTC, damit sie sich mit denen in der Datenbank
  vergleichen lassen.
  Aufgezeichnet werden: Startzeile mit Version und Plattform, Sicherung, Migration,
  Programmabbrüche (Panic-Hook) und jeder technische Fehler — Letzteres in `Serialize for
  AppError`, dem einzigen Punkt, den jeder Fehler aus jedem Befehl durchläuft. Fehler in der
  Oberfläche werden über `window.onerror`/`unhandledrejection` weitergereicht.
  **Datenschutz:** `sqlx` protokolliert auf Info-Ebene jede Abfrage; das stünde voller Kunden-
  und Rechnungsdaten. Ein Filter lässt eigene Meldungen durch und fremde erst ab Warnung —
  mit eigenen Tests, weil die Datei im Zweifel per E-Mail verschickt wird.
  Die Versionsanzeige kam bereits mit P5.1; dort steht jetzt auch der Pfad zur Protokolldatei
  samt Knopf, der ihren Ordner öffnet.
  Nebenbei: der `greet`-Befehl aus dem Tauri-Template entfernt.

- [x] **P5.5 — README, Nutzerdoku, LICENSE, Bundle-Metadaten** `[B7]`
  `LICENSE` (MIT) ergänzt; `README.md` beschreibt Funktionsumfang, Einrichtung, Prüfwerkzeuge,
  Aufbau und Datenablage statt des Tauri-Templates. Bundle-Metadaten in `tauri.conf.json`
  (publisher, copyright, license, category, short-/longDescription) sowie `Cargo.toml`
  und `package.json` gesetzt — geprüft am gebauten `.app`-Bundle, nicht nur an der Konfiguration.
  `docs/installation-freunde.md` um Erste Schritte, Datenablage, Sicherung und Updates erweitert;
  der macOS-Weg führt jetzt über die Systemeinstellungen (Rechtsklick → Öffnen wirkt auf
  aktuellen macOS-Versionen nicht mehr).

- [–] **P5.6 — Code-Signing und Notarisierung** `[B1]` — **bewusst zurückgestellt (2026-08-02)**
  Die App geht vorerst nur an Family & Friends; Apple-Developer-Zertifikat (99 $/Jahr) und
  Windows-Zertifikat lohnen sich dafür nicht. Stattdessen ist der ungesignierte Erststart in
  `docs/installation-freunde.md` dokumentiert. Secrets sind in `release.yml` vorbereitet,
  falls die Entscheidung später anders ausfällt.

- [x] **P5.7 — CSP setzen** `[B13]`
  `csp` und `devCsp` in `tauri.conf.json`. Ausgeliefert gilt `default-src 'self'` ohne
  `unsafe-inline`/`unsafe-eval`, dazu `object-src 'none'`, `frame-ancestors 'none'`,
  `form-action 'none'` und `connect-src` nur für 'self' und die Tauri-IPC-Adressen.
  Der Entwicklungsmodus ist gesondert und lockerer, weil Vite Inline-Skripte und einen
  WebSocket für Hot Reload einspritzt.
  Nebenbei: `index.html` war noch Tauri-Template (`lang="en"`, Titel „Tauri + React +
  Typescript", vite.svg als Favicon) — auf die App umgestellt.

---

## Stufe 6 — UX und Code-Qualität

- [x] **P6.1 — Ladezustände** `[B16]`
  Komponente `Laden` mit `role="status"`, absichtlich erst nach 150 ms sichtbar — bei
  Millisekunden-Abrufen auf lokaler Datenbank würde ein sofortiger Hinweis nur aufblitzen.
  Eingebaut in App, Dashboard, die drei Detailseiten und alle Listen. Die Listen unterscheiden
  über ein `geladen`-Kennzeichen zwischen „noch nichts da" und „nichts vorhanden";
  Rechnungen und Angebote zusätzlich zwischen leerer Liste und leerem Filterergebnis.
  Beide hatten vorher gar keinen Leerzustand.
- [x] **P6.2 — Suche, Sortierung, Blättern** `[B17]`
  Suche im Backend (`beleg_list` hat jetzt einen `suche`-Parameter): Gesucht wird in der
  Belegnummer und im Kundennamen. Der Name steht in einer anderen Tabelle und ist bei
  gestellten Belegen im Snapshot eingefroren — beides lässt sich in der Oberfläche nicht
  nachbilden, ohne alle Belege und alle Kunden zu laden. Der Snapshot geht dem aktuellen
  Namen vor: Wer eine Rechnung sucht, hat den Namen vor Augen, der auf ihr steht.
  Sortierung und Blättern im Speicher — die Liste ist ohnehin vollständig da, und ein
  Rundweg zum Backend brächte nichts. Bei einigen hundert Belegen im Jahr trägt das;
  wird es je zu viel, ist die Grenze am langsamen Abruf spürbar.
  Neue Komponenten `SortierKopf` (mit `aria-sort`, sonst steckt die Sortierrichtung nur im
  Pfeil) und `Blaettern` (25 je Seite, blendet sich unter einer Seite aus).
  Anmerkung zum Review: Der `suche`-Parameter existierte für Kunden und Artikel, für Belege
  nicht — er musste erst gebaut werden.
- [x] **P6.3 — Tastaturbedienbarkeit** `[B18]`
  Neue Komponente `ZeilenKnopf`: ein echter Knopf in der ersten Zelle, statt `tabIndex` und
  `role="button"` an der Zeile — damit hörte eine Tabellenzeile auf, für Screenreader eine
  Zeile zu sein, und die Zuordnung von Spaltenkopf zu Zelle ginge verloren. Die Zeile bleibt
  für Mausnutzer klickbar; der Knopf unterbricht die Ereigniskette, sonst öffnete ein Klick
  zweimal. Eingebaut in alle vier Listen und die drei Dashboard-Tabellen (dort ersetzt er
  drei inline gebaute Tastaturzeilen).
  Dazu ein durchgängiger, sichtbarer Fokusring (`:focus-visible`, WCAG 2.4.7) und
  Zurück-Knöpfe in `BelegEditor` und `KundeDetail`.
- [x] **P6.4 — Warnung bei ungespeicherten Änderungen** `[B19]`
  `UngespeichertProvider` und die Hooks `useUngespeichert` / `useVerlassenPruefen`.
  Formulare melden an, wenn ihr Stand vom geladenen abweicht; `App.navigiere` fragt vor
  jedem Seitenwechsel nach. Die Anwendung wechselt Seiten über den Zustand, nicht über
  Adressen — es gibt also keinen Browser, der von sich aus nachfragte.
  Verglichen wird gegen den geladenen Stand statt über ein „berührt"-Merkmal: Wer einen
  Wert ändert und zurücksetzt, soll nicht gefragt werden. Ohne Provider (in Tests, die nur
  eine Seite rendern) ist die Antwort immer „weiter", sonst stünde dort jede Navigation still.
  Angemeldet sind Belegstammdaten, Kundenstammdaten und Firmendaten.
  **Offen:** Das Schließen des Programmfensters ist nicht abgedeckt — das läuft an der
  Webview vorbei und bräuchte `onCloseRequested` auf der Rust-Seite.
- [x] **P6.5 — Duplizierung auflösen**
  `src/belegStatus.ts` als einzige Quelle für Beschriftung und Einfärbung aller Statuswerte,
  dazu die Komponente `StatusMarke`. Gemeinsame Listenlogik in `useBelegListe`, das
  Anlegen-Formular in `BelegAnlegen`. Zusammen 390 → 248 Zeilen.
  Die Kopien hatten sich auseinandergelebt, und dabei kamen zwei echte Fehler zutage:
  Die Angebotsliste zeigte das ISO-Datum (`2026-07-10`), weil die Umstellung nur in der
  Rechnungsliste angekommen war, und der Belegeditor zeigte den Datenbankschlüssel
  (`abgelehnt`) statt der Beschriftung. Vier Tests hielten das falsche Verhalten fest und
  wurden mit korrigiert.
- [x] **P6.6 — Belegpositionen editierbar und sortierbar**
  Bearbeiten ging im Backend längst (`position_speichern` mit Id), es fehlte nur in der
  Oberfläche: Knopf „Bearbeiten" übernimmt die Zeile ins Formular darunter, die bearbeitete
  Zeile ist hervorgehoben.
  Neu im Backend: `belegposition_verschieben`. Getauscht wird mit dem Nachbarn statt alle
  Ränge neu zu vergeben — zwei geänderte Zeilen, und es braucht keine Annahme darüber, ob
  die Ränge lückenlos sind. Am Rand passiert nichts, ohne Fehler: Der Knopf ist dort ohnehin
  abgeblendet, eine Meldung hätte keinen Anlass. Nur im Entwurf (GoBD).
- [x] **P6.7 — Artikel-Auswahl mit Tipphilfe**
  Komponente `ArtikelAuswahl` auf Basis von `<datalist>` statt einer selbstgebauten
  Vorschlagsliste — Tastaturbedienung, Blättern durch die Vorschläge und die Ankündigung
  gegenüber Screenreadern bringt der Browser mit.
  Übernommen wird erst bei genauer Übereinstimmung: Auf Teiltreffer zu raten hieße, dem
  Nutzer einen Artikel unterzuschieben. Bei mehrfach vergebenen Bezeichnungen führt die
  Anzeige die Artikelnummer mit, sonst wäre die Auswahl mehrdeutig.
- [x] **P6.8 — Live-Summenvorschau**
  Die Positionssumme steht im Formular, bevor gespeichert wird. Für einen Artikel ohne
  überschriebenen Preis bleibt es bei „Preis wird beim Speichern ermittelt": Dort kann ein
  Kundenpreis gelten, den nur das Backend kennt — eine Zahl zu zeigen hieße, sie zu raten.
  Unlesbare Eingaben melden sich als solche, statt still auf null zu fallen.
- [ ] **P6.9 — Adress- und Ansprechpartner-Auswahl im Beleg**
- [x] **P6.10 — Barrierefreiheit**
  `Bestaetigungsdialog` hält den Fokus bei sich (Tab und Shift+Tab laufen im Kreis), gibt ihn
  beim Schließen dorthin zurück, wo er herkam, und benennt sich über `aria-labelledby`.
  Der Fokus wird programmatisch gesetzt statt über `autoFocus` — das Attribut greift *vor*
  dem Effekt, der Dialog merkte sich sonst seinen eigenen Knopf als Rücksprungziel.
  Kontrast: `src/styles/kontrast.test.ts` prüft die Token nach WCAG 2.1, hell und dunkel.
  Der Test fand drei Verstöße statt des einen aus dem Review — der Tabellenkopf lag bei
  2,94:1, und auch der Dunkelmodus war mit 4,48:1 knapp darunter. `--text-leiser` ist
  entfernt: Eine dritte, noch leisere Stufe kann auf dieser Palette nicht zugleich existieren
  und 4,5:1 erreichen. Die drei Verwendungen (Tabellenkopf, Belegnummer, Preisdatum) waren
  ohnehin Inhalt, kein Zierrat.
- [ ] **P6.11 — Aufräumen** — `greet`-Template-Command, ~60 `.unwrap()` im XRechnung-Produktivcode, fehlende Indizes auf Fremdschlüsseln, i18n nur 6 Nav-Keys

---

## Umgebung

- [ ] **P0 — Repo von iCloud Drive auf lokale Platte verschieben** `[B30]`
  `npm test` braucht 112 s statt ~5 s; zusätzlich Risiko der Git-Index-Korruption durch Eviction. Lädt nicht zum Testen vor dem Commit ein — was gut erklärt, wie P1.1 durchrutschen konnte.
