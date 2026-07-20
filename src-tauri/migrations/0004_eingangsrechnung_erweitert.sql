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

CREATE TABLE eingangsrechnungsteuer (
  id TEXT PRIMARY KEY,
  eingangsrechnung_id TEXT NOT NULL REFERENCES eingangsrechnung(id),
  nettobetrag_cent INTEGER NOT NULL DEFAULT 0,
  steuersatz_promille INTEGER NOT NULL DEFAULT 0,
  steuerbetrag_cent INTEGER NOT NULL DEFAULT 0,
  reihenfolge INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
