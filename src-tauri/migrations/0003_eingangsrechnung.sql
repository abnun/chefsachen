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
