-- Format 'pdf' für Eingangsrechnungen ohne maschinenlesbare Daten zulassen.
--
-- Die Aufbewahrungspflicht gilt für alle Eingangsrechnungen, nicht nur für
-- maschinenlesbare. Eingescannte oder als reines PDF versandte Rechnungen ließen
-- sich bisher gar nicht ablegen: Jedes PDF galt als ZUGFeRD, scheiterte am
-- Parsen und wurde abgewiesen.
--
-- SQLite kann eine CHECK-Bedingung nicht ändern, deshalb der Umweg über eine
-- neue Tabelle. Die Spaltenliste entspricht dem Stand nach Migration 0004.
PRAGMA foreign_keys = OFF;

CREATE TABLE eingangsrechnung_neu (
  id TEXT PRIMARY KEY,
  dateiname TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('xrechnung','zugferd','pdf')),
  rohdatei BLOB NOT NULL,
  rechnungssteller_name TEXT NOT NULL DEFAULT '',
  rechnungsnummer TEXT NOT NULL DEFAULT '',
  rechnungsdatum TEXT NOT NULL DEFAULT '',
  betrag_cent INTEGER NOT NULL DEFAULT 0,
  waehrung TEXT NOT NULL DEFAULT 'EUR',
  manuell_erfasst INTEGER NOT NULL DEFAULT 0,
  importiert_am TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  kaeufer_name TEXT NOT NULL DEFAULT '',
  kaeufer_strasse TEXT NOT NULL DEFAULT '',
  kaeufer_plz TEXT NOT NULL DEFAULT '',
  kaeufer_ort TEXT NOT NULL DEFAULT '',
  kaeufer_land TEXT NOT NULL DEFAULT '',
  verkaeufer_strasse TEXT NOT NULL DEFAULT '',
  verkaeufer_plz TEXT NOT NULL DEFAULT '',
  verkaeufer_ort TEXT NOT NULL DEFAULT '',
  verkaeufer_land TEXT NOT NULL DEFAULT '',
  verkaeufer_steuernummer TEXT NOT NULL DEFAULT '',
  verkaeufer_email TEXT NOT NULL DEFAULT '',
  zahlungsbedingungen TEXT NOT NULL DEFAULT '',
  faelligkeitsdatum TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '',
  bic TEXT NOT NULL DEFAULT '',
  bankname TEXT NOT NULL DEFAULT '',
  bestellnummer TEXT NOT NULL DEFAULT '',
  leitweg_id TEXT NOT NULL DEFAULT '',
  lieferantennummer TEXT NOT NULL DEFAULT '',
  leistungsdatum TEXT NOT NULL DEFAULT ''
);

INSERT INTO eingangsrechnung_neu SELECT
  id, dateiname, format, rohdatei, rechnungssteller_name, rechnungsnummer,
  rechnungsdatum, betrag_cent, waehrung, manuell_erfasst, importiert_am,
  created_at, updated_at, kaeufer_name, kaeufer_strasse, kaeufer_plz,
  kaeufer_ort, kaeufer_land, verkaeufer_strasse, verkaeufer_plz, verkaeufer_ort,
  verkaeufer_land, verkaeufer_steuernummer, verkaeufer_email,
  zahlungsbedingungen, faelligkeitsdatum, iban, bic, bankname, bestellnummer,
  leitweg_id, lieferantennummer, leistungsdatum
FROM eingangsrechnung;

DROP TABLE eingangsrechnung;
ALTER TABLE eingangsrechnung_neu RENAME TO eingangsrechnung;

PRAGMA foreign_keys = ON;
