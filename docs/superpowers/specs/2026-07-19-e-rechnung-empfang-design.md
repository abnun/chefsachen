# E-Rechnungs-Empfang (Teilprojekt 1: Empfangspflicht erfüllen)

## Kontext

Seit 1.1.2025 müssen alle Unternehmen inkl. Kleinunternehmer nach § 19 UStG
strukturierte E-Rechnungen (XRechnung/ZUGFeRD) EMPFANGEN können — keine
Ausnahme, keine Übergangsfrist. Reiner E-Mail-Empfang genügt rechtlich, aber
die Daten müssen lesbar gemacht und GoBD-konform archiviert werden
(Aufbewahrungsfrist für Buchungsbelege seit 1.1.2026 auf 8 Jahre verkürzt,
§ 147 Abs. 3 AO / § 257 Abs. 4 HGB / § 14b UStG).

Die App kann aktuell nur E-Rechnungen ausstellen (Plan 3: `dokument::xrechnung`,
`dokument::zugferd`), aber keine empfangen/importieren/archivieren.

**Bewusst außerhalb dieses Scopes:** eine vollständige Ausgaben-Verwaltung
(Lieferanten-Stammdaten, Kategorisierung, Auswertungen für eigene Buchhaltung/
EÜR). Dieser erste Schritt deckt nur die reine Empfangs-/Archivierungspflicht
ab; die vollständige Verwaltung bleibt als späteres, eigenes Vorhaben im
Blick.

## Ziel

Der Nutzer kann eine per E-Mail erhaltene E-Rechnung (XRechnung-XML oder
ZUGFeRD-PDF) manuell in die App importieren. Die App liest die Kerndaten
strukturiert aus, zeigt sie menschenlesbar an und archiviert die
Original-Datei unveränderbar und dauerhaft (keine Lösch-Möglichkeit über die
UI).

## Design

### Datenmodell

Neue Migration `0003_eingangsrechnung.sql`:

```sql
CREATE TABLE eingangsrechnung (
  id TEXT PRIMARY KEY,
  dateiname TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('xrechnung','zugferd')),
  rohdatei BLOB NOT NULL,
  rechnungssteller_name TEXT NOT NULL DEFAULT '',
  rechnungsnummer TEXT NOT NULL DEFAULT '',
  rechnungsdatum TEXT NOT NULL DEFAULT '',
  betrag_cent INTEGER NOT NULL DEFAULT 0,
  waehrung TEXT NOT NULL DEFAULT 'EUR',
  manuell_erfasst INTEGER NOT NULL DEFAULT 0,
  importiert_am TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE eingangsrechnungposition (
  id TEXT PRIMARY KEY,
  eingangsrechnung_id TEXT NOT NULL REFERENCES eingangsrechnung(id),
  bezeichnung TEXT NOT NULL,
  menge INTEGER NOT NULL DEFAULT 1000,
  einzelpreis_cent INTEGER NOT NULL DEFAULT 0,
  positionssumme_cent INTEGER NOT NULL DEFAULT 0,
  reihenfolge INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

`rohdatei` speichert die Original-Bytes unverändert (GoBD-Pflicht — das ist
die eigentliche Erfüllung der Aufbewahrungspflicht, alle geparsten Felder
sind nur eine Lesehilfe obendrauf). `menge` folgt der bestehenden
Festkomma-Konvention aus `belegposition`/`domain::beleg::positionssumme_cent`
(Faktor 1000, siehe `formatMenge`/`parseMenge` in `src/geld.ts`).

**Bewusst KEINE `deleted_at`-Spalte.** Anders als bei allen anderen Tabellen
in dieser App (die alle Soft-Delete via `deleted_at` nutzen) gibt es hier
keinerlei Lösch-Pfad — weder UI noch Backend-Command. Das erzwingt die
GoBD-Vorgabe "unveränderbar und nicht löschbar für die Aufbewahrungsfrist"
strukturell, statt sie nur durch das Fehlen eines Buttons zu simulieren.
Korrektur bei Fehlimport ist bewusst nur außerhalb der App möglich (direkter
DB-Zugriff) — kein bequemer Weg in der UI.

### Backend — Parsing (`src-tauri/src/dokument/eingangsrechnung_parse.rs`)

**Formaterkennung** über Dateiinhalt (Magic Bytes `%PDF` am Dateianfang →
ZUGFeRD, sonst XML → XRechnung), nicht nur über die Dateiendung.

**ZUGFeRD (PDF):** eingebettetes XML wird per `lopdf` aus den Embedded Files
extrahiert (Umkehrung von `dokument::zugferd::einbetten` — sucht nach
bekannten Anhang-Namen wie `factur-x.xml`, `zugferd-invoice.xml`,
`xrechnung.xml`). Wird kein XML-Anhang gefunden, gilt das wie ein
Parse-Fehlschlag (siehe unten) — die PDF-Bytes werden trotzdem archiviert.

**XML-Syntax-Erkennung** am Wurzelelement, da XRechnung sowohl UBL
(`Invoice`/`CreditNote`, Namespaces `cbc:`/`cac:`) als auch CII
(`rsm:CrossIndustryInvoice`, Namespace-Präfixe `ram:`/`rsm:`/`udt:` — das
Format, das unser eigener Export in `dokument::xrechnung` erzeugt) zulässt.
Zwei interne Parser-Funktionen (`parse_ubl`, `parse_cii`) bilden beide
Syntaxen auf dieselbe Struktur ab:

```rust
pub struct GeparsteRechnung {
    pub rechnungssteller_name: String,
    pub rechnungsnummer: String,
    pub rechnungsdatum: String,
    pub betrag_cent: i64,
    pub waehrung: String,
    pub positionen: Vec<GeparstePosition>,
}
pub struct GeparstePosition {
    pub bezeichnung: String,
    pub menge: i64,
    pub einzelpreis_cent: i64,
    pub positionssumme_cent: i64,
}

pub fn parsen(xml: &str) -> AppResult<GeparsteRechnung>;
```

Schlägt das Parsen fehl (unbekanntes Wurzelelement, kaputtes XML, keine
Kernfelder auffindbar) → `parsen` liefert `Err`. Das aufrufende Command
archiviert die Rohdatei trotzdem, mit leeren Feldern und
`manuell_erfasst = true`.

### Backend — Commands (`src-tauri/src/commands/eingangsrechnungen.rs`)

Zweistufiger Ablauf, da Rechnungssteller/Nummer erst nach dem Parsen bekannt
sind, aber schon vor dem Speichern auf Duplikate geprüft werden sollen:

**`eingangsrechnung_import_vorschau(datei_bytes, dateiname)`** — erkennt
Format, versucht zu parsen, liefert bei Erfolg alle Felder inkl. Positionen
(`geparst: true`), bei Fehlschlag leere Felder (`geparst: false`). Prüft
zusätzlich `SELECT COUNT(*) FROM eingangsrechnung WHERE rechnungssteller_name
= ? AND rechnungsnummer = ?` (nur wenn beide Felder nicht leer sind) →
`ist_duplikat: bool`. **Persistiert nichts.**

**`eingangsrechnung_speichern(datei_bytes, dateiname, format, felder…,
positionen…)`** — speichert Rohdatei + (ggf. vom Nutzer korrigierte) Felder +
Positionen. Duplikat-Prüfung ist hier nur eine UI-Vorstufe (siehe Frontend),
kein DB-Constraint — ein Duplikat kann legitim sein (z. B. eine
Rechnungskorrektur/Gutschrift mit gleicher Nummer).

**`eingangsrechnung_list()`** — Liste sortiert nach `rechnungsdatum DESC`.

**`eingangsrechnung_get(id)`** — Detail inkl. Positionen.

**`eingangsrechnung_update(id, felder…)`** — korrigiert nur die extrahierten
Kernfelder (Rechnungssteller, Nummer, Datum, Betrag, Währung), nie
`rohdatei` oder die Positionen. Positions-Korrektur nach dem Import ist ein
Randfall, den dieser erste Schritt bewusst nicht abdeckt.

**`eingangsrechnung_original_exportieren(id)`** — liefert die rohen Bytes
zurück; Frontend speichert sie über denselben Speichern-Dialog-Mechanismus
wie beim PDF-/XRechnung-/ZUGFeRD-Export im `BelegEditor`
(`@tauri-apps/plugin-dialog` `save` + `@tauri-apps/plugin-fs` `writeFile`).

### Frontend — API (`src/api.ts`)

Neue Typen `Eingangsrechnung`, `EingangsrechnungPosition`,
`EingangsrechnungVorschau` sowie ein `eingangsrechnungen`-Namespace mit
`importVorschau`, `speichern`, `list`, `get`, `update`,
`originalExportieren` — analog zu `belege.*`.

### Frontend — Neue Seite (`src/pages/Eingangsrechnungen.tsx`)

Neuer Nav-Eintrag "Eingangsrechnungen" in `Layout.tsx`, zwischen
"Rechnungen" und "Einstellungen" (`Seite`-Union bekommt
`"eingangsrechnungen"`).

**Liste:** Tabelle mit Rechnungssteller, Nummer, Datum, Betrag,
Format-Badge (XRechnung/ZUGFeRD), sortiert nach Datum absteigend. Kein
Löschen-Button. "Importieren"-Button öffnet den nativen Datei-Dialog
(`@tauri-apps/plugin-dialog` `open`, Filter `.xml`/`.pdf`).

**Import-Vorschau:** nach Dateiauswahl → `eingangsrechnung_import_vorschau`
→ Formular mit den geparsten Feldern und Positionstabelle (nur lesend).

- **Erfolgreich geparst (`geparst: true`):** Felder werden zunächst nur als
  Text angezeigt, mit einem "Bearbeiten"-Button. Erst nach Klick wechseln
  sie in editierbare Inputs — Korrektur ist eine bewusste Zusatzaktion,
  kein versehentliches Verändern beim Durchklicken.
- **Parsen fehlgeschlagen (`geparst: false`):** Felder sind von Anfang an
  editierbare Inputs (leer), mit Hinweistext "Konnte nicht automatisch
  gelesen werden — bitte Felder von Hand eintragen". Kein zusätzlicher
  Bearbeiten-Klick, da die Felder ohnehin zwingend auszufüllen sind.
- **Duplikat erkannt (`ist_duplikat: true`):** Warnbanner + Rückfrage
  "Rechnung Nr. „…" von „…" wurde bereits importiert. Trotzdem
  importieren?" vor dem `eingangsrechnung_speichern`-Aufruf. Nutzt die
  bestehende `Bestaetigungsdialog`-Komponente (Teilprojekt 2) direkt mit
  eigenem Text/Button-Label ("Trotzdem importieren" statt "Löschen") —
  nicht über den delete-spezifischen `useLoeschBestaetigung`-Hook, sondern
  mit lokaler Bestätigungs-State-Verwaltung an dieser einen Stelle, da sie
  die einzige nicht-delete-bezogene Bestätigung im Projekt ist.

**Detailansicht:** Rechnungssteller, Nummer, Datum, Betrag, Format,
Positionstabelle (analog zur bestehenden Beleg-Detailansicht),
"Bearbeiten"-Button (gleiches Text/Bearbeiten-Klick-Muster wie oben) und
"Original-Datei exportieren"-Button.

## Nicht im Umfang

- Automatischer E-Mail-Abruf (IMAP) — Import bleibt manuell.
- Vollständige Ausgaben-Verwaltung (Lieferanten-Stammdaten, Kategorisierung,
  EÜR-Auswertung) — späteres, eigenes Vorhaben.
- Löschen importierter Eingangsrechnungen — bewusst nicht vorgesehen.
- Nachträgliche Korrektur der geparsten Positionen.
- Validierung der eingehenden Rechnung gegen das XRechnung-Pflichtfeld-Schema
  (existiert bereits für den eigenen Export in Plan 3, gilt hier nicht —
  eine unvollständige/nicht-konforme Lieferantenrechnung muss trotzdem
  archivierbar sein, siehe Parse-Fehlschlag-Verhalten).

## Tests

- Rust: `parsen()` für UBL- und CII-Syntax je mit einem Beispiel-XML
  (Kernfelder + mind. eine Position korrekt extrahiert).
- Rust: `parsen()` liefert `Err` bei unbekanntem Wurzelelement / kaputtem XML.
- Rust: ZUGFeRD-Extraktion holt das eingebettete XML aus einer per
  `zugferd::einbetten` erzeugten Test-PDF wieder heraus (Round-Trip mit dem
  bestehenden Export-Code).
- Rust: `eingangsrechnung_import_vorschau` erkennt Duplikat korrekt
  (gleicher Rechnungssteller + gleiche Nummer).
- Rust: `eingangsrechnung_speichern` archiviert bei Parse-Fehlschlag trotzdem
  mit `manuell_erfasst = true` und leeren Feldern.
- Rust: kein `eingangsrechnung_delete`-Command existiert (keine
  Lösch-Möglichkeit — durch Abwesenheit sichergestellt, kein expliziter Test
  nötig, aber im Review gegenzuchecken).
- Frontend: Import-Flow — erfolgreich geparst zeigt Text+Bearbeiten-Button,
  Klick auf Bearbeiten wechselt zu Inputs; Parse-Fehlschlag zeigt sofort
  Inputs; Duplikat zeigt Warnbanner + Bestätigungsdialog vor dem Speichern.
- Frontend: Liste zeigt keinen Löschen-Button.
- Frontend: Original-Datei-Export nutzt denselben Speichern-Dialog wie die
  bestehenden Beleg-Exporte.
