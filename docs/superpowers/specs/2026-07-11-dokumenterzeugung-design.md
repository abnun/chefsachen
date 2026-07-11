# Design: Dokumenterzeugung (Plan 3 — PDF, XRechnung, ZUGFeRD)

**Datum:** 2026-07-11
**Status:** Entwurf, mit Auftraggeber abgestimmt

## Ziel

Belege (Angebote und Rechnungen) aus Plan 2 als PDF exportierbar machen, für Rechnungen zusätzlich als XRechnung-XML (EN 16931, CII-Syntax) und als ZUGFeRD-Rechnung (PDF/A-3 mit eingebetteter XML). Deckt den in der ursprünglichen Design-Spec (`docs/superpowers/specs/2026-07-06-kleinunternehmer-tool-design.md`, Abschnitt „Dokumenterzeugung") beschriebenen Umfang vollständig ab.

**Explizit außerhalb dieses Plans:** automatisierte externe Validierung (veraPDF, KoSIT-Schematron) — beides Java-Tools ohne Rust-Anbindung, üblicherweise CI-gebunden; CI-Pipeline existiert noch nicht. Verifikation erfolgt hier durch strukturelle Rust-Tests plus einen dokumentierten manuellen Prüfschritt, nicht automatisiert. Eine spätere CI-Integration mit echten Validatoren bleibt vorbereitet, ist aber kein Bestandteil dieses Plans.

## Recherche-Grundlage

Vor der Festlegung wurde geprüft, ob die benötigten Bausteine als Rust-Crates existieren:

- **Typst als eingebettete Bibliothek:** `typst`-Crate (Apache-2.0, offiziell zur Einbettung in eigene Anwendungen vorgesehen) plus `typst-as-lib` als vereinfachender Wrapper — bestätigt verfügbar, keine CLI/Sidecar-Lösung nötig.
- **PDF/A-3 + Attachment-Einbettung:** kein fertiges Rust-Crate für ZUGFeRD-spezifische PDF/A-3-Erzeugung gefunden. `lopdf` (PDF-Objektmanipulation) und `xmp-writer` (XMP-Metadaten, vom Typst-Team) sind die Bausteine für den in der ursprünglichen Spec bereits als Risiko benannten Nachbearbeitungsschritt — bestätigt das dort skizzierte Vorgehen.
- **XRechnung/ZUGFeRD-XML-Erzeugung:** zwei Kandidaten-Crates geprüft (`zugferd` v0.1.6 — zu unreif für ein rechtlich relevantes Dokument; `xrechnung` — erzeugt UBL statt der spezifizierten CII-Syntax). Beide verworfen zugunsten von direktem XML-Building mit `quick-xml`.

## Architektur

Neues, entkoppeltes Rust-Modul `src-tauri/src/dokument/` (analog zu `domain/`), das ausschließlich vom bestehenden `commands::belege`-Datenmodell liest — keine Rückwirkung auf Plan 2. Nur gestellte Belege (Status `gestellt`/`versendet`, nicht `entwurf`) sind exportierbar, da der `kunde_snapshot` erst beim Stellen befüllt wird.

**Module:**
- `dokument::kontext` — `BelegKontext`: flache Struktur aus Beleg, Positionen, Firma und `kunde_snapshot`, Eingabe für alle folgenden Schritte.
- `dokument::pdf` — Typst-Rendering (`.typ`-Vorlage, eine gemeinsame Vorlage für Angebot/Rechnung, Unterschied nur in Kopftext/Überschrift).
- `dokument::xrechnung` — CII-XML-Erzeugung (`quick-xml`) plus Pflichtfeldprüfung, ausschließlich für Rechnungen.
- `dokument::zugferd` — Nachbearbeitung: XML als PDF-Attachment einbetten, PDF/A-3-Metadaten (XMP, OutputIntent) ergänzen, ausschließlich für Rechnungen.

**Datenfluss beim Export:**
1. `kontext_aus_beleg(pool, beleg_id) -> BelegKontext`
2. `pdf::rendern(kontext) -> Vec<u8>` — für Angebote und Rechnungen gleichermaßen.
3. Nur Rechnungen: `xrechnung::xml_erzeugen(kontext) -> String`
4. Nur Rechnungen: `zugferd::einbetten(pdf_bytes, xml) -> Vec<u8>`
5. Tauri-Command liefert die Bytes ans Frontend (nativer Speichern-Dialog) und legt zusätzlich automatisch eine Kopie im App-Datenverzeichnis ab (`.../Belege/<beleg_id>.pdf`).

## PDF-Vorlage

Eingebettete Open-Source-Schrift: **Inter** (SIL Open Font License, gängige Gewichte Regular/Medium/Bold als Ressourcendateien im Projekt, von Typst zur Kompilierzeit eingebettet — kein Systemfont-Zugriff, garantiert identisches Aussehen auf allen Plattformen). Layout nach deutschen Rechnungskonventionen: Kopf mit Firmenlogo (`Firma.logo`) und Absenderzeile, Kunden-Adressblock (aus `kunde_snapshot`), Beleg-Metadaten (Nummer/Datum/Leistungsdatum/Zahlungsziel), Positionstabelle, Summe, Fußtext (Textbausteine) inkl. § 19-Hinweis bei Kleinunternehmer-Flag.

## ZUGFeRD-Einbettung

- `xmp-writer` erzeugt den XMP-Block mit Namensraum `urn:zugferd:pdfa:CrossIndustryDocument:invoice:2p0#` (Profil EN 16931/Comfort) plus PDF/A-3-Pflichtangaben.
- `lopdf` ergänzt einen OutputIntent (sRGB-ICC-Profil, als Ressource mitgeliefert) und bettet die XRechnung-XML als `/EmbeddedFile` mit `AFRelationship: Data` im Katalog ein.
- Struktur ist so gebaut, dass sich eine spätere automatisierte Validierung ohne Umbau ergänzen lässt.

## XRechnung-XML

Direktes XML-Building mit `quick-xml`, CII-Syntax (EN 16931). Pflichtfelder: Rechnungsnummer, Datum, Verkäufer-/Käufer-Stammdaten, Leitweg-ID (falls vorhanden), Positionszeilen mit Menge/Preis/Steuerkategorie **E** (steuerbefreit, § 19 UStG), Zahlungsbedingungen.

**Pflichtfeldprüfung vor Export:** `xrechnung::pruefe_exportierbarkeit(kontext) -> Result<(), Vec<AppError>>` prüft die für XRechnung zwingenden Felder (eigene Steuernummer/USt-IdNr., Leitweg-ID bei öffentlichen Auftraggebern) und liefert bei fehlenden Angaben feldbezogene Fehlermeldungen statt einer ungültigen Datei. Läuft automatisch vor jedem ZUGFeRD-Export; ein Fehlschlag blockiert nur den ZUGFeRD-Export, nicht den einfachen PDF-Export.

## Export-UX

Neue Tauri-Commands:
- `beleg_pdf_exportieren(id) -> Vec<u8>` — für Angebote und Rechnungen.
- `rechnung_zugferd_exportieren(id) -> Vec<u8>` — nur für Rechnungen.

Beide legen zusätzlich automatisch eine Kopie im App-Datenverzeichnis ab, unabhängig vom Ausgang des nativen Speichern-Dialogs (`@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs`, aus Plan 1 bereits eingebunden).

Frontend (`BelegEditor`): Button „Als PDF exportieren" (immer, wenn Status `gestellt`/`versendet`), Button „Als ZUGFeRD-Rechnung exportieren" (nur bei Rechnungen).

## Tests

- **Rust:** Snapshot-/Struktur-Tests für `xrechnung::xml_erzeugen` (inkl. Steuerkategorie E), Unit-Tests für `pruefe_exportierbarkeit` (fehlende Pflichtfelder → korrekte Fehlerliste), Struktur-Tests für `zugferd::einbetten` (Attachment-Stream vorhanden, XMP-Namespace korrekt). Kompilier-Smoke-Test für die Typst-Vorlage (kein Snapshot-Test des Renderings selbst).
- **Frontend:** Komponententests für die Export-Buttons (richtiger `invoke`-Aufruf, Fehleranzeige bei Validierungsfehlern).
- **Manueller Schritt (dokumentiert, nicht automatisiert):** erzeugte ZUGFeRD-Datei einmal in einem PDF-Viewer öffnen und die eingebettete XML sichtbar prüfen; optional gegen einen Online-Referenzvalidator (z. B. KoSIT) probieren.
