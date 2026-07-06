# Design: Kleinunternehmer-Verwaltung (V1)

**Datum:** 2026-07-06
**Status:** Entwurf, vom Auftraggeber abschnittsweise freigegeben

## Ziel

Lokale Desktop-App (macOS + Windows) für Kleinunternehmer nach § 19 UStG in Deutschland. Primär als Produkt für Dritte gedacht. V1 deckt den durchgängigen Workflow „vom Kunden zur bezahlten Rechnung" ab. Die App ist durch mitgelieferte Standardwerte sofort nach der Ersteinrichtung benutzbar.

## Umfang V1

1. Firmendaten-Einrichtung mit Assistent und Standardwerten
2. Kunden mit Ansprechpartnern und typisierten Adressen (Rechnung/Lieferung)
3. Artikel/Leistungen, pflegbare Einheiten, kundenspezifische Preise
4. Angebote → Rechnungen (PDF, ZUGFeRD, XRechnung), Nummernkreise, § 19-Textbausteine
5. Zahlungserfassung (inkl. Teilzahlungen) und offene Posten
6. Dashboard mit Umsatz, offenen Rechnungen und Umsatzgrenzen-Warnung (25.000 € / 100.000 €). Basis der Umsatzberechnung sind die **vereinnahmten Zahlungen** des Kalenderjahres (§ 19 UStG stellt auf vereinnahmte Umsätze ab), Stornobeträge mindern den Umsatz. Beide Grenzen werden überwacht: 25.000 € Vorjahresgrenze (Warnstufen bei Annäherung) und 100.000 € laufendes Jahr — deren Überschreiten führt seit 2025 unterjährig sofort zum Verlust des Kleinunternehmerstatus, daher deutliche Warnung bereits ab 80 %

**Explizit nicht in V1:** Buchhaltung (EÜR, Belegerfassung, DATEV-Export), Mahnwesen, Zeiterfassung, Dokumentenablage, Aufgaben/Wiedervorlagen, Cloud-Sync. Cloud-Anbindung ist architektonisch vorbereitet, wird aber nicht gebaut.

## Architektur

**Stack:** Tauri 2.x, Rust-Kern, Frontend TypeScript + React + Vite, SQLite via `sqlx`.

Drei Schichten:

1. **Datenschicht (Rust):** SQLite, versionierte Migrations. Alle Entitäten mit UUID-Primärschlüsseln, `created_at`/`updated_at`, Soft-Delete — sync-tauglich für einen späteren Cloud-Dienst.
2. **Domänenlogik (Rust):** Nummernkreis-Vergabe, Preisfindung (Kundenpreis vor Standardpreis), Umsatzgrenzen-Berechnung, Statusübergänge. Gestellte Rechnungen sind unveränderbar; Korrektur nur per Stornobeleg (GoBD-Grundgedanke).
3. **Frontend:** kommuniziert ausschließlich über typisierte Tauri-Commands; diese Schnittstelle kann später 1:1 eine REST-API des Cloud-Diensts werden. UI-Sprache Deutsch, alle Texte in i18n-Struktur.

**Seed-Daten beim ersten Start:** Einheiten (Stunde, Stück, Tag, Pauschale, km, …), Zahlungsziele, Nummernkreis-Formate, Textbausteine (§ 19-Hinweis, Rechnungsfuß; kein E-Mail-Versand in V1). Alles danach vom Nutzer in den Einstellungen pflegbar.

## Datenmodell

Alle Entitäten: UUID, `created_at`/`updated_at`, Soft-Delete. Eindeutigkeits-Constraints (z. B. Belegnummern) schließen soft-gelöschte Datensätze ein, damit Nummern nie doppelt vergeben werden.

**Geldbeträge werden durchgängig als Integer in Cent gespeichert und berechnet** (keine Fließkommazahlen); Mengen werden als Dezimalzahl mit bis zu 3 Nachkommastellen gespeichert (Integer, Faktor 1000). Rundungskette: Positionssumme = Menge × Einzelpreis, kaufmännisch auf ganze Cent gerundet; Belegsumme = Summe der gerundeten Positionssummen. Währung in V1: ausschließlich EUR.

- **Firma** (Einzeldatensatz): Name, Anschrift, Steuernummer/USt-IdNr., Bankverbindung (IBAN/BIC), Logo, Kleinunternehmer-Flag
- **Kunde:** Firmenname/Privatperson, Kundennummer (aus Nummernkreis), Standard-Zahlungsziel, Notizen; für E-Rechnungen: USt-IdNr., E-Mail-Adresse, Leitweg-ID (optional, Pflicht nur bei XRechnung an öffentliche Auftraggeber), Käuferreferenz
  - **Adresse** (1:n, typisiert Rechnung/Lieferung, je Typ eine als Standard markierbar)
  - **Ansprechpartner** (1:n): Name, Rolle, E-Mail, Telefon, Standard-Flag
- **Einheit:** Name, Kürzel; aus Seed-Daten, pflegbar
- **Artikel/Leistung:** Bezeichnung, Beschreibung, Einheit, Standardpreis, Artikelnummer
  - **Kundenpreis** (n:m Artikel↔Kunde): abweichender Preis, optional Gültig-ab-Datum; maßgeblich für die Preisfindung ist das **Belegdatum**
- **Beleg** (gemeinsames Muster für Angebot und Rechnung): Nummer, Kundenreferenz plus eingefrorener Snapshot der Adress- und Firmendaten (JSON) — spätere Stammdatenänderungen verändern alte Belege nicht. Datum, **Leistungsdatum oder -zeitraum (Pflichtangabe nach § 14 UStG; Standardvorbelegung: Rechnungsdatum)**, Zahlungsziel, Status, Kopf-/Fußtexte.
  - **Belegposition:** Artikelreferenz plus eingefrorene Bezeichnung/Preis/Einheit, Menge, Positionssumme; Freitextpositionen ohne Artikelreferenz möglich
  - Angebot → Rechnung: Positionen werden kopiert, Verknüpfung zum Ursprungsangebot bleibt
- **Zahlung** (1:n zur Rechnung): Datum, Betrag, Notiz; Rechnung gilt als bezahlt, wenn die Summe der Zahlungen den Rechnungsbetrag erreicht oder übersteigt (Überzahlung wird angezeigt, aber nicht verhindert). Negative Beträge sind als Erstattungen erlaubt (z. B. Rückzahlung nach Storno) und mindern den vereinnahmten Umsatz
- **Nummernkreis:** je Nummernart (Angebot, Rechnung, Kunde, Artikel) Format-Template (z. B. `RE-{JJJJ}-{lfd:4}`), Zähler, optionaler Jahresreset. Stornobelege erhalten eine eigene Nummer aus dem Rechnungs-Nummernkreis
- **Einstellungen:** Key-Value für App-Optionen und Textbausteine

**Statusmodelle:**
- Angebot: Entwurf → versendet → angenommen / abgelehnt / abgelaufen
- Rechnung: Entwurf → gestellt → (teil)bezahlt / storniert

Nur Entwürfe sind editier- und löschbar. Beim Stellen wird die Nummer vergeben und der Beleg eingefroren.

**Storno:** Das Stornieren einer gestellten Rechnung erzeugt einen unveränderbaren Stornobeleg (Rechnungskorrektur mit negierten Positionen, eigene Nummer, Verweis auf die Ursprungsrechnung); die Ursprungsrechnung erhält den Status „storniert". Bereits erfasste Zahlungen bleiben als Datensätze erhalten; ein offener Erstattungsbetrag wird an der stornierten Rechnung ausgewiesen. Stornobeträge zählen negativ in die Umsatzberechnung.

## UI

Seitennavigation mit sechs Bereichen:

1. **Dashboard:** Jahresumsatz mit Fortschrittsbalken zur 25.000-€-Grenze und Warnstufen, offene Rechnungen mit Fälligkeit, zuletzt bearbeitete Belege, offene Angebote
2. **Kunden:** Liste mit Suche; Detailseite mit Reitern Stammdaten, Ansprechpartner, Adressen, Sonderpreise, Belege
3. **Artikel & Leistungen:** Liste, Detailformular, Sonderpreis-Übersicht je Artikel
4. **Angebote:** Liste mit Statusfilter, Editor, Aktion „In Rechnung überführen"
5. **Rechnungen:** Liste mit Statusfilter, Editor (nur Entwurf); Aktionen: Stellen, PDF/ZUGFeRD/XRechnung exportieren, Zahlung erfassen, Stornieren (erzeugt Stornobeleg)
6. **Einstellungen:** Firmendaten, Einheiten, Nummernkreise, Textbausteine, Standard-Zahlungsziele

**Ersteinrichtung:** Assistent (Firmendaten → Logo → Kleinunternehmer-Bestätigung → Nummernkreise mit Vorschlägen); danach sofort einsatzbereit.

**Beleg-Editor:** Kundenauswahl belegt Adresse, Ansprechpartner und Zahlungsziel vor. Positionen mit Artikel-Autocomplete; Preis automatisch (Kundenpreis vor Standardpreis), manuell überschreibbar. Freitextpositionen. Live-Summenvorschau. Kopf-/Fußtexte aus Textbausteinen vorbelegt.

## Dokumenterzeugung

Eigenes Rust-Modul, vom Rest entkoppelt.

- **PDF:** Typst als eingebettete Rendering-Bibliothek. Eine Standard-Rechnungsvorlage in V1; Vorlagen-System erweiterbar.
- **XRechnung:** XML nach EN 16931 (CII-Syntax) direkt aus dem Belegmodell, mit Kleinunternehmer-Kennzeichnung (Steuerkategorie E / § 19-Vermerk). Pflichtfeld-Prüfung vor dem Export (z. B. Leitweg-ID des Kunden, eigene Steuernummer) mit klarer Fehlermeldung statt invalider Datei.
- **ZUGFeRD:** Rechnungs-PDF als PDF/A-3 mit eingebettetem XML (Profil EN 16931). **Bekanntes Risiko:** Typst erzeugt nicht direkt PDF/A-3 mit Dateianhang; es ist ein Nachbearbeitungsschritt in Rust nötig (XML-Einbettung, PDF/A-3-Metadaten/XMP, Ausgabe-Validierung mit veraPDF in der CI). Dieser Schritt wird früh im Projekt als technischer Durchstich verifiziert; Fallback wäre eine eigene PDF/A-3-Schreibschicht (z. B. `lopdf`-basiert).
- Export über Speichern-Dialog; zusätzlich Ablage jeder erzeugten Datei pro Beleg im Anwendungsdaten-Verzeichnis des Betriebssystems (macOS: `~/Library/Application Support/…`, Windows: `%APPDATA%\…`) — dort liegen auch Datenbank und Backups, bewusst außerhalb von Cloud-Sync-Ordnern.

## Fehlerbehandlung & Datensicherheit

- Typisierte Fehler aus allen Tauri-Commands: Validierungsfehler feldbezogen im Formular, technische Fehler als verständliche deutsche Meldung mit aufklappbaren Details
- Schreiboperationen transaktional; Nummernvergabe atomar (keine Duplikate oder Lücken durch Abstürze)
- Automatisches rotierendes SQLite-Backup bei App-Start (letzte 10) plus manueller Export/Import in den Einstellungen

## Tests

- **Rust:** Unit-Tests für Domänenlogik (Preisfindung, Nummernkreise, Statusübergänge, Summen/Rundung); Snapshot-Tests für XRechnung-XML; CI-Validierung der XML-Ausgabe gegen die offiziellen KoSIT-Schematron-Regeln
- **Frontend:** Komponententests für die Editor-Logik; ein End-to-End-Durchstich (Kunde anlegen → Rechnung stellen → PDF erzeugt) via `tauri-driver` (WebDriver; Playwright unterstützt Tauri nicht)

## Distribution

Da die App als Produkt für Dritte gedacht ist, gehört zur V1-Auslieferung:

- Signierte Installer: macOS (Universal Binary, signiert + notarisiert, `.dmg`) und Windows (signiertes `.msi`/NSIS) über den Tauri-Bundler; benötigt Apple-Developer- und Windows-Code-Signing-Zertifikate
- Auto-Update über den Tauri-Updater (signierte Update-Manifeste, statisches Hosting genügt)
- CI-Pipeline (GitHub Actions) baut und signiert beide Plattformen

## Ausblick (nicht V1)

Mahnwesen, Zeiterfassung, Dokumentenablage, Aufgaben/Wiedervorlagen, Buchhaltungsmodul (EÜR, DATEV-Export), eigener Cloud-Dienst mit Sync und Multi-Gerät. Die Architektur (UUIDs, Zeitstempel, Soft-Delete, IPC-Schnittstelle als API-Vorlage) ist darauf ausgelegt.
