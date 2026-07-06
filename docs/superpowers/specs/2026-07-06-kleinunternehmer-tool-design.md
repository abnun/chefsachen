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
6. Dashboard mit Umsatz, offenen Rechnungen und Umsatzgrenzen-Warnung (25.000 € / 100.000 €)

**Explizit nicht in V1:** Buchhaltung (EÜR, Belegerfassung, DATEV-Export), Mahnwesen, Zeiterfassung, Dokumentenablage, Aufgaben/Wiedervorlagen, Cloud-Sync. Cloud-Anbindung ist architektonisch vorbereitet, wird aber nicht gebaut.

## Architektur

**Stack:** Tauri 2.x, Rust-Kern, Frontend TypeScript + React + Vite, SQLite via `sqlx`.

Drei Schichten:

1. **Datenschicht (Rust):** SQLite, versionierte Migrations. Alle Entitäten mit UUID-Primärschlüsseln, `created_at`/`updated_at`, Soft-Delete — sync-tauglich für einen späteren Cloud-Dienst.
2. **Domänenlogik (Rust):** Nummernkreis-Vergabe, Preisfindung (Kundenpreis vor Standardpreis), Umsatzgrenzen-Berechnung, Statusübergänge. Gestellte Rechnungen sind unveränderbar; Korrektur nur per Stornobeleg (GoBD-Grundgedanke).
3. **Frontend:** kommuniziert ausschließlich über typisierte Tauri-Commands; diese Schnittstelle kann später 1:1 eine REST-API des Cloud-Diensts werden. UI-Sprache Deutsch, alle Texte in i18n-Struktur.

**Seed-Daten beim ersten Start:** Einheiten (Stunde, Stück, Tag, Pauschale, km, …), Zahlungsziele, Nummernkreis-Formate, Textbausteine (§ 19-Hinweis, Rechnungsfuß, E-Mail-Texte). Alles danach vom Nutzer in den Einstellungen pflegbar.

## Datenmodell

Alle Entitäten: UUID, `created_at`/`updated_at`, Soft-Delete.

- **Firma** (Einzeldatensatz): Name, Anschrift, Steuernummer/USt-IdNr., Bankverbindung (IBAN/BIC), Logo, Kleinunternehmer-Flag
- **Kunde:** Firmenname/Privatperson, Kundennummer (aus Nummernkreis), Standard-Zahlungsziel, Notizen
  - **Adresse** (1:n, typisiert Rechnung/Lieferung, je Typ eine als Standard markierbar)
  - **Ansprechpartner** (1:n): Name, Rolle, E-Mail, Telefon, Standard-Flag
- **Einheit:** Name, Kürzel; aus Seed-Daten, pflegbar
- **Artikel/Leistung:** Bezeichnung, Beschreibung, Einheit, Standardpreis, Artikelnummer
  - **Kundenpreis** (n:m Artikel↔Kunde): abweichender Preis, optional Gültig-ab-Datum
- **Beleg** (gemeinsames Muster für Angebot und Rechnung): Nummer, Kundenreferenz plus eingefrorener Snapshot der Adress- und Firmendaten (JSON) — spätere Stammdatenänderungen verändern alte Belege nicht. Datum, Zahlungsziel, Status, Kopf-/Fußtexte.
  - **Belegposition:** Artikelreferenz plus eingefrorene Bezeichnung/Preis/Einheit, Menge, Positionssumme; Freitextpositionen ohne Artikelreferenz möglich
  - Angebot → Rechnung: Positionen werden kopiert, Verknüpfung zum Ursprungsangebot bleibt
- **Zahlung** (1:n zur Rechnung): Datum, Betrag, Notiz; Rechnung gilt als bezahlt, wenn die Summe der Zahlungen den Rechnungsbetrag erreicht
- **Nummernkreis:** je Belegart Format-Template (z. B. `RE-{JJJJ}-{lfd:4}`), Zähler, optionaler Jahresreset
- **Einstellungen:** Key-Value für App-Optionen und Textbausteine

**Statusmodelle:**
- Angebot: Entwurf → versendet → angenommen / abgelehnt / abgelaufen
- Rechnung: Entwurf → gestellt → (teil)bezahlt / storniert

Nur Entwürfe sind editier- und löschbar. Beim Stellen wird die Nummer vergeben und der Beleg eingefroren.

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
- **ZUGFeRD:** Rechnungs-PDF als PDF/A-3 mit eingebettetem XML (Profil EN 16931).
- Export über Speichern-Dialog; zusätzlich Ablage jeder erzeugten Datei in einem App-Datenordner pro Beleg.

## Fehlerbehandlung & Datensicherheit

- Typisierte Fehler aus allen Tauri-Commands: Validierungsfehler feldbezogen im Formular, technische Fehler als verständliche deutsche Meldung mit aufklappbaren Details
- Schreiboperationen transaktional; Nummernvergabe atomar (keine Duplikate oder Lücken durch Abstürze)
- Automatisches rotierendes SQLite-Backup bei App-Start (letzte 10) plus manueller Export/Import in den Einstellungen

## Tests

- **Rust:** Unit-Tests für Domänenlogik (Preisfindung, Nummernkreise, Statusübergänge, Summen/Rundung); Snapshot-Tests für XRechnung-XML; CI-Validierung der XML-Ausgabe gegen die offiziellen KoSIT-Schematron-Regeln
- **Frontend:** Komponententests für die Editor-Logik; ein End-to-End-Durchstich (Kunde anlegen → Rechnung stellen → PDF erzeugt) mit Playwright/WebDriver

## Ausblick (nicht V1)

Mahnwesen, Zeiterfassung, Dokumentenablage, Aufgaben/Wiedervorlagen, Buchhaltungsmodul (EÜR, DATEV-Export), eigener Cloud-Dienst mit Sync und Multi-Gerät. Die Architektur (UUIDs, Zeitstempel, Soft-Delete, IPC-Schnittstelle als API-Vorlage) ist darauf ausgelegt.
