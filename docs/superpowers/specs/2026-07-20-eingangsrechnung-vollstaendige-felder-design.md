# Eingangsrechnung: Vollständige Felderfassung

## Kontext

Der E-Rechnungs-Empfang (Plan 8) erfasst bisher nur eine Teilmenge der in
einer XRechnung/ZUGFeRD-Rechnung vorhandenen Pflicht- und Zusatzangaben
(Rechnungssteller-Name, Rechnungsnummer, Datum, Währung, Gesamtbetrag,
Positionen). Bei der manuellen Abnahme wurde festgestellt, dass eine
vollständige E-Rechnung noch deutlich mehr enthält — vollständige
Anschriften, Steuernummer/USt-IdNr., Netto/USt-Aufschlüsselung,
Zahlungsbedingungen, Bankverbindung, Kontakt-E-Mail, Bestellnummer,
Leitweg-ID und Lieferantennummer (öffentliche Auftraggeber) sowie das
Liefer-/Leistungsdatum. Diese Angaben sind in der Original-Datei (bereits
unveränderbar archiviert) vorhanden, werden aber bisher nicht geparst und
nicht angezeigt.

## Ziel

Alle diese Felder werden beim Import zusätzlich geparst, gespeichert und in
der App angezeigt — sowohl in der Import-Vorschau als auch in der
Detailansicht. Die bisherigen 4 Kernfelder (Rechnungssteller, Nummer,
Datum, Betrag) bleiben wie bisher die einzigen editierbaren Felder; alle
neuen Felder sind reine Anzeige.

## Design

### Warum nur die 4 Kernfelder editierbar bleiben

Nur diese vier steuern App-Logik (Duplikaterkennung, Sortierung, Betrags-
Übersicht). Bei allen anderen Feldern bleibt im Zweifel die archivierte
Originaldatei die maßgebliche Quelle — eine Korrekturmöglichkeit in der App
ist dafür rechtlich nicht erforderlich (GoBD verlangt Unveränderbarkeit des
Ursprungsbelegs, nicht der davon abgeleiteten Anzeige-Metadaten) und würde
den Bearbeiten-Modus unverhältnismäßig vergrößern (15+ statt 4 Felder,
inkl. Validierung für IBAN/E-Mail/Steuersätze). Das gilt explizit auch für
die Steuerzeilen: auch bei Vorsteuerabzug-berechtigten Nutzern (die App
unterstützt neben Kleinunternehmern auch regelbesteuerte Firmen) bleibt die
Originaldatei die verlässliche Quelle für eine eventuelle Korrektur vor der
USt-Voranmeldung.

### Datenmodell

Neue Migration `0004_eingangsrechnung_erweitert.sql`, zwei Teile:

**Neue Spalten auf `eingangsrechnung`** (alle `TEXT NOT NULL DEFAULT ''`,
konsistent mit dem bestehenden Muster leerer Strings statt `NULL`):

```sql
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_strasse TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_plz TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_ort TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN kaeufer_land TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_strasse TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_plz TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_ort TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_land TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_steuernummer TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN verkaeufer_email TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN zahlungsbedingungen TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN faelligkeitsdatum TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN iban TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN bic TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN bankname TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN bestellnummer TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN leitweg_id TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN lieferantennummer TEXT NOT NULL DEFAULT '';
ALTER TABLE eingangsrechnung ADD COLUMN leistungsdatum TEXT NOT NULL DEFAULT '';
```

Keine dieser Spalten wird von `eingangsrechnung_update` angefasst.

**Neue Tabelle für Steuerzeilen** (mehrere Steuersätze pro Rechnung möglich,
z. B. 19 % und 7 % gemischt):

```sql
CREATE TABLE eingangsrechnungsteuer (
  id TEXT PRIMARY KEY,
  eingangsrechnung_id TEXT NOT NULL REFERENCES eingangsrechnung(id),
  nettobetrag_cent INTEGER NOT NULL DEFAULT 0,
  steuersatz_promille INTEGER NOT NULL DEFAULT 0,
  steuerbetrag_cent INTEGER NOT NULL DEFAULT 0,
  reihenfolge INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

`steuersatz_promille`: Festkomma-Ganzzahl, Faktor 10 (19 % → 190, 7,7 % →
77) — vermeidet Float-Rundungsprobleme, analog zur bereits etablierten
Festkomma-Konvention im Projekt (`menge` Faktor 1000, Cent-Beträge Faktor
100).

### Backend — Parser-Erweiterung (`eingangsrechnung_parse.rs`)

`GeparsteRechnung` wächst um die 19 neuen Felder (`String`/`i64`) plus
`steuerzeilen: Vec<GeparsteSteuerzeile>` (`nettobetrag_cent`,
`steuersatz_promille`, `steuerbetrag_cent`). `parse_cii` und `parse_ubl`
bekommen die zusätzlichen Ziel-Pfade in ihren bestehenden Match-Armen
ergänzt — keine Änderung an der Architektur (Pfad-Tracking-Zustandsautomat,
siehe Task 2–4 des Ursprungsplans), nur mehr Ziele.

Für die Steuerzeilen wird ein zweites Wiederholungs-Paar analog zu den
Positionen ergänzt: `in_steuerzeile: bool`, `steuerzeilen_pfad: Vec<String>`,
`aktuelle_steuerzeile: GeparsteSteuerzeile`. **Wichtig:** `ram:ApplicableTradeTax`
(CII) kommt in der Datei ZWEIMAL in unterschiedlicher Bedeutung vor — einmal
pro Position (`ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax`,
Steuersatz der einzelnen Position, bereits über `in_zeile`/`zeilen_pfad`
erfasst) und einmal auf Kopfebene
(`ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax`, die neuen
Steuerzeilen). Die Unterscheidung erfolgt über die sich gegenseitig
ausschließenden Flags `in_zeile` und `in_steuerzeile` — der Kopfebenen-Fall
tritt nur auf, wenn `in_zeile == false` ist (Positionen und
Kopf-Steuerzeilen liegen nie ineinander verschachtelt).

**Feld-Zuordnung CII / UBL:**

| Feld | CII-Pfad (ab `rsm:CrossIndustryInvoice/rsm:SupplyChainTradeTransaction/`) | UBL-Pfad (ab `Invoice/`) |
|---|---|---|
| `kaeufer_name` | `ram:ApplicableHeaderTradeAgreement/ram:BuyerTradeParty/ram:Name` | `cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName` (Fallback `cac:PartyName/cbc:Name`) |
| `kaeufer_strasse` | `.../ram:BuyerTradeParty/ram:PostalTradeAddress/ram:LineOne` | `cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:StreetName` |
| `kaeufer_plz` | `.../ram:BuyerTradeParty/ram:PostalTradeAddress/ram:PostcodeCode` | `.../cac:PostalAddress/cbc:PostalZone` |
| `kaeufer_ort` | `.../ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CityName` | `.../cac:PostalAddress/cbc:CityName` |
| `kaeufer_land` | `.../ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CountryID` | `.../cac:PostalAddress/cac:Country/cbc:IdentificationCode` |
| `verkaeufer_strasse` | `.../ram:SellerTradeParty/ram:PostalTradeAddress/ram:LineOne` | `cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:StreetName` |
| `verkaeufer_plz` | `.../ram:SellerTradeParty/ram:PostalTradeAddress/ram:PostcodeCode` | `.../cac:PostalAddress/cbc:PostalZone` |
| `verkaeufer_ort` | `.../ram:SellerTradeParty/ram:PostalTradeAddress/ram:CityName` | `.../cac:PostalAddress/cbc:CityName` |
| `verkaeufer_land` | `.../ram:SellerTradeParty/ram:PostalTradeAddress/ram:CountryID` | `.../cac:PostalAddress/cac:Country/cbc:IdentificationCode` |
| `verkaeufer_steuernummer` | `.../ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID` | `cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID` |
| `verkaeufer_email` | `.../ram:SellerTradeParty/ram:URIUniversalCommunication/ram:URIID` | `cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:ElectronicMail` |
| `lieferantennummer` | `.../ram:SellerTradeParty/ram:ID` | `cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID` |
| `bestellnummer` | `.../ram:ApplicableHeaderTradeAgreement/ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID` | `cac:OrderReference/cbc:ID` |
| `leitweg_id` | `.../ram:ApplicableHeaderTradeAgreement/ram:BuyerReference` | `cbc:BuyerReference` (Root-Ebene) |
| `leistungsdatum` | `ram:ApplicableHeaderTradeDelivery/ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime/udt:DateTimeString` (via `formatiere_cii_datum`) | `cac:Delivery/cbc:ActualDeliveryDate` (bereits ISO, keine Konvertierung) |
| `zahlungsbedingungen` | `ram:ApplicableHeaderTradeSettlement/ram:SpecifiedTradePaymentTerms/ram:Description` | `cac:PaymentTerms/cbc:Note` |
| `faelligkeitsdatum` | `.../ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime/udt:DateTimeString` (via `formatiere_cii_datum`) | `cbc:DueDate` (Root-Ebene, bereits ISO) |
| `iban` | `.../ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeePartyCreditorFinancialAccount/ram:IBANID` | `cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID` |
| `bic` | `.../ram:SpecifiedTradeSettlementPaymentMeans/ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID` | `.../cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID` |
| `bankname` | `.../ram:PayeeSpecifiedCreditorFinancialInstitution/ram:Name` (best-effort, selten befüllt) | `.../cac:FinancialInstitutionBranch/cac:FinancialInstitution/cbc:Name` (best-effort) |
| Steuerzeile: `nettobetrag_cent` | `ram:ApplicableHeaderTradeSettlement/ram:ApplicableTradeTax/ram:BasisAmount` (kopfebene) | `cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount` |
| Steuerzeile: `steuerbetrag_cent` | `.../ram:ApplicableTradeTax/ram:CalculatedAmount` (kopfebene) | `.../cac:TaxSubtotal/cbc:TaxAmount` |
| Steuerzeile: `steuersatz_promille` | `.../ram:ApplicableTradeTax/ram:RateApplicablePercent` (kopfebene) | `.../cac:TaxSubtotal/cac:TaxCategory/cbc:Percent` |

Fehlt ein Feld in der Quelldatei, bleibt es leer (`String::new()`) bzw. bei
Steuerzeilen wird die Liste leer gelassen — kein Parse-Fehlschlag der
gesamten Rechnung deswegen (nur die 5 bereits heute geprüften Kernfelder
lösen bei Fehlen `manuell_erfasst = true` aus, siehe Ursprungsplan).

### Backend — Commands (`eingangsrechnungen.rs`)

`Eingangsrechnung`, `EingangsrechnungFelderNeu`, `EingangsrechnungPositionNeu`-
analoge `EingangsrechnungSteuerzeileNeu`/`EingangsrechnungSteuerzeile`
bekommen die gleichen neuen Felder. Bewusst **ein** gemeinsamer
`Eingangsrechnung`-Typ für `list()` und `get()` (wie bei den Positionen) statt
zweier ähnlicher Typen — die Liste selektiert dadurch mehr Spalten als sie
anzeigt, unproblematisch bei einer lokalen SQLite-Desktop-App mit
überschaubarem Datenvolumen.

`speichern()`s INSERT wächst entsprechend um die neuen Spalten sowie einen
zweiten Insert-Loop für `eingangsrechnungsteuer` (gleiche Transaktion wie
die Positionen). `format`/`manuell_erfasst` bleiben weiterhin serverseitig
aus den rohen Bytes abgeleitet (unverändert) — die neuen Felder ändern
nichts an diesem bereits etablierten Defense-in-Depth-Verhalten.

`eingangsrechnung_update` bleibt unverändert auf die 4 Kernfelder
beschränkt — keine der neuen Spalten wird dort angefasst.

### Frontend

**Neue gemeinsame Komponente** `src/components/EingangsrechnungZusatzfelder.tsx`:
nimmt die geparsten/gespeicherten Zusatzfelder + Steuerzeilen entgegen und
rendert sie gruppiert:

- **Rechnungssteller**: Anschrift, Steuernummer/USt-IdNr., Kontakt-E-Mail,
  Lieferantennummer
- **Rechnungsempfänger**: Name, Anschrift
- **Zahlung**: Zahlungsbedingungen-Text, Fälligkeitsdatum, IBAN, BIC,
  Bankname
- **Referenzen**: Bestellnummer, Leitweg-ID
- **Liefer-/Leistungsdatum**
- **Steuern**: Tabelle mit einer Zeile je Steuersatz (Netto, Satz,
  Steuerbetrag), analog zur bestehenden Positionstabelle

Leere Felder werden ausgeblendet (kein Label ohne Wert) — die meisten
einfachen Rechnungen liefern nicht alle diese Angaben. Reine Anzeige, keine
Eingabefelder.

**Verwendet von beiden Stellen:**
- `Eingangsrechnungen.tsx`: direkt nach dem Import, in der Vorschau (zeigt
  die frisch geparsten Werte aus `EingangsrechnungVorschau.felder` — noch
  vor dem Speichern).
- `EingangsrechnungDetail.tsx`: unterhalb der bestehenden (bearbeitbaren)
  Kernfelder-Karte, zeigt die gespeicherten Werte.

**Frontend-Typen** (`api.ts`): `EingangsrechnungFelderNeu`, `Eingangsrechnung`,
`EingangsrechnungDetail` bekommen die gleichen neuen Felder wie die
Rust-Structs, plus ein neues `EingangsrechnungSteuerzeile`-Interface.

## Nicht im Umfang

- Neue Felder bleiben nicht bearbeitbar (siehe Begründung oben) — auch die
  Steuerzeilen nicht, trotz Relevanz für Vorsteuerabzug-berechtigte Nutzer.
- Keine Verknüpfung von `lieferantennummer`/Verkäuferdaten mit einer
  eigenen Lieferanten-Stammdatenverwaltung — die App hat kein
  Lieferanten-Entity, die Felder werden als reiner Text aus der jeweiligen
  Rechnung gespeichert, ohne Bezug zu anderen Rechnungen desselben
  Lieferanten herzustellen.
- Keine automatische Prüfung, ob Netto + Steuerbetrag über alle
  Steuerzeilen hinweg tatsächlich dem Gesamtbetrag entspricht (keine
  Konsistenzvalidierung der Quelldaten).

## Tests

- Rust: `parse_cii`/`parse_ubl` — je ein Test, der alle neuen Felder aus
  einer erweiterten Test-Fixture korrekt extrahiert (CII-Fixture per
  Round-Trip-Erweiterung des bestehenden `xrechnung::xml_erzeugen`, sofern
  praktikabel, sonst handgeschriebene Fixture wie beim UBL-Parser bereits
  etabliert).
- Rust: mehrere Steuerzeilen (unterschiedliche Sätze) werden korrekt als
  Liste erfasst, nicht nur die letzte/erste überschreibt die anderen.
- Rust: fehlende optionale Felder (z. B. keine Leitweg-ID) führen zu leeren
  Strings, nicht zu einem Parse-Fehlschlag der gesamten Rechnung.
- Rust: `speichern()` persistiert alle neuen Felder inkl. Steuerzeilen in
  einer Transaktion.
- Rust: `eingangsrechnung_update` ändert weiterhin keine der neuen Spalten.
- Frontend: `EingangsrechnungZusatzfelder` blendet leere Felder aus, zeigt
  befüllte Felder gruppiert an, zeigt die Steuerzeilen-Tabelle korrekt.
- Frontend: Komponente wird sowohl in der Vorschau als auch in der
  Detailansicht mit den jeweils richtigen Daten aufgerufen.
