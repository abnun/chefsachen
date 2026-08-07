# Pflichtfeld-Markierung über die gesamte App

## Kontext

Formulare zeigen bisher nicht an, welche Felder zwingend sind. Ob ein Feld
Pflicht ist, merkt man erst beim Absenden, wenn eine Fehlermeldung kommt.
Zwei Kategorien von „Pflicht" gibt es dabei:

1. **Echte Pflichtfelder** — das Backend verweigert das Speichern, wenn sie
   leer sind.
2. **Für den XRechnung-Export nötig** — beim Speichern akzeptiert, aber ohne
   sie schlägt `pruefe_exportierbarkeit`/die EN-16931-Pflichtangabe beim
   Export fehl.

Beide werden unterschiedlich markiert: `*` für Kategorie 1, `†` für
Kategorie 2, mit einer Legende am Ende jedes betroffenen Formulars.

**Leitprinzip dieser App** (aus dem bestehenden Code ersichtlich, z. B.
`Artikel.tsx`): Keine native `required`-Blase des Browsers — die sieht
uneinheitlich aus und verschwindet beim nächsten Klick. Jede Markierung
entspricht stattdessen einer echten Prüfung im Rust-Teil, deren Fehler über
das etablierte `feldFehler`/`feld-fehler`-Muster erscheint.

## Geltungsbereich

### `*` Echtes Pflichtfeld

| Formular | Felder | Neu zu prüfen? |
|---|---|---|
| Firma (`Einrichtung.tsx`, `Einstellungen.tsx`) | Name | schon geprüft |
| Firma | Straße, PLZ, Ort, Land | **neu** — bisher ungeprüft |
| Firma | Steuernummer *oder* USt-IdNr. | schon geprüft (eins von beiden) |
| Adresse (`KundeDetail.tsx`, Reiter „Adressen") | Straße, PLZ, Ort, Land | **neu** — bisher ungeprüft |
| Kunde (`Kunden.tsx`, `KundeDetail.tsx` Stammdaten) | Name | schon geprüft |
| Beleg (`BelegEditor.tsx`) | Kundenauswahl | schon geprüft (`"Kunde existiert nicht"`) |
| Artikel (`Artikel.tsx`) | Bezeichnung, Einheit | schon geprüft |
| Einheit (`Einstellungen.tsx`, Einheiten-Verwaltung) | Name | schon geprüft |
| Beleg-Position (`BelegEditor.tsx`, Freitext ohne Artikelauswahl) | Bezeichnung, Einzelpreis, Menge | schon geprüft |
| Kundenpreis (`KundenpreiseDialog.tsx`) | Kunde, Preis | schon geprüft (`required`-Attribut) |

### `†` Für den XRechnung-Export nötig

| Formular | Felder |
|---|---|
| Firma | E-Mail, Telefon (BT-34, BG-6) |
| Kunde | Käuferreferenz *oder* Leitweg-ID (eins von beiden reicht, `pruefe_exportierbarkeit`) |

### Bewusst nicht markiert

- Nummernkreise, Textbausteine, Belegvorlage-Einstellungen — reine
  Vorgabewerte mit sinnvollem Standard, nie „leer ungültig".
- Datum/Leistungsdatum in Belegen — immer vorbefüllt, in der Praxis nie leer.
- Fax überall — ausdrücklich optional (siehe bestehender Hinweistext).

## Backend-Änderungen

Zwei neue Prüfungen, jeweils nach dem Muster der bestehenden
`pruefe_*`-Funktionen (leerer, getrimmter String → `AppError::Validation`):

1. **`pruefe_firma`** (`src-tauri/src/commands/firma.rs`): ergänzt um
   Prüfungen für `strasse`, `plz`, `ort`, `land` (alle nicht leer).
2. **Neue Funktion `pruefe_adresse`** (`src-tauri/src/commands/kunden.rs`),
   aufgerufen am Anfang von `adresse_speichern`: prüft `strasse`, `plz`,
   `ort`, `land` (alle nicht leer).

Beide sind eine Verhaltensänderung: Wer heute eine Firma oder Adresse mit
leerer Straße/PLZ/Ort/Land gespeichert hat, kann das ab jetzt nicht mehr neu
so speichern (bestehende, bereits gespeicherte Datensätze werden davon nicht
berührt — die Prüfung greift nur beim nächsten Speichern). Das ist so
gewollt: Eine Rechnung ohne vollständige Anschrift ist nach § 14 UStG nicht
ordnungsgemäß.

## Frontend-Änderungen

Für jedes betroffene Feld:
- Label bekommt das passende Suffix (`*` oder `†`), als eigenes,
  `aria-hidden`es Element direkt hinter dem Feldnamen, damit
  Screenreader nicht „Name Stern" vorlesen — der eigentliche Pflicht-Status
  wird über `aria-required="true"` am Eingabefeld selbst vermittelt.
- Jedes Formular mit mindestens einer Markierung bekommt am Ende eine
  Legende: `* Pflichtfeld` bzw. `* Pflichtfeld · † Für den XRechnung-Export
  nötig`, je nachdem, welche Kategorien im Formular vorkommen.
- Für die „eins von beiden"-Fälle (Steuernummer/USt-IdNr.,
  Käuferreferenz/Leitweg-ID) bekommt **jedes** der beiden Felder die
  Markierung — der Hinweistext unter dem Feld (bereits vorhanden) erklärt
  das „oder".

Eine kleine gemeinsame Komponente `PflichtMarker.tsx` (`art: "pflicht" |
"xrechnung"`) rendert das passende Zeichen mit Titel-Attribut (Tooltip bei
Maus-Hover: „Pflichtfeld" bzw. „Für den XRechnung-Export nötig") — vermeidet
Wiederholung des Zeichens/Tooltip-Texts an über zehn Stellen.

## Verifikation

1. `cargo test` — insbesondere neue Tests für `pruefe_firma` und
   `pruefe_adresse`, plus Prüfung, dass bestehende Tests mit
   Firma-/Adresse-Fixtures (die evtl. leere Straße/PLZ/Ort/Land verwenden)
   weiterhin grün sind oder angepasst werden.
2. `npx tsc --noEmit`, `npx eslint .`, `npm test -- --run`
3. Manuell: jedes betroffene Formular einmal ansehen — Sterne/Kreuze an der
   richtigen Stelle, Legende korrekt, kein Formular ohne Markierung zeigt
   trotzdem eine Legende.
