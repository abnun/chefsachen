CREATE TABLE einheit (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kuerzel TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE nummernkreis (
  id TEXT PRIMARY KEY, art TEXT NOT NULL UNIQUE, format TEXT NOT NULL,
  zaehler INTEGER NOT NULL DEFAULT 0, jahres_reset INTEGER NOT NULL DEFAULT 0,
  jahr INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE firma (
  id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', strasse TEXT NOT NULL DEFAULT '',
  plz TEXT NOT NULL DEFAULT '', ort TEXT NOT NULL DEFAULT '', land TEXT NOT NULL DEFAULT 'DE',
  steuernummer TEXT NOT NULL DEFAULT '', ust_idnr TEXT NOT NULL DEFAULT '',
  iban TEXT NOT NULL DEFAULT '', bic TEXT NOT NULL DEFAULT '',
  logo BLOB, kleinunternehmer INTEGER NOT NULL DEFAULT 1,
  eingerichtet INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE kunde (
  id TEXT PRIMARY KEY, typ TEXT NOT NULL CHECK (typ IN ('firma','privat')),
  name TEXT NOT NULL, kundennummer TEXT NOT NULL UNIQUE,
  zahlungsziel_tage INTEGER NOT NULL DEFAULT 14, notizen TEXT NOT NULL DEFAULT '',
  ust_idnr TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  leitweg_id TEXT NOT NULL DEFAULT '', kaeuferreferenz TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE adresse (
  id TEXT PRIMARY KEY, kunde_id TEXT NOT NULL REFERENCES kunde(id),
  typ TEXT NOT NULL CHECK (typ IN ('rechnung','lieferung')),
  strasse TEXT NOT NULL, plz TEXT NOT NULL, ort TEXT NOT NULL, land TEXT NOT NULL DEFAULT 'DE',
  ist_standard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE ansprechpartner (
  id TEXT PRIMARY KEY, kunde_id TEXT NOT NULL REFERENCES kunde(id),
  name TEXT NOT NULL, rolle TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '', telefon TEXT NOT NULL DEFAULT '',
  ist_standard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE artikel (
  id TEXT PRIMARY KEY, artikelnummer TEXT NOT NULL UNIQUE,
  bezeichnung TEXT NOT NULL, beschreibung TEXT NOT NULL DEFAULT '',
  einheit_id TEXT NOT NULL REFERENCES einheit(id),
  standardpreis_cent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE kundenpreis (
  id TEXT PRIMARY KEY,
  artikel_id TEXT NOT NULL REFERENCES artikel(id),
  kunde_id TEXT NOT NULL REFERENCES kunde(id),
  preis_cent INTEGER NOT NULL, gueltig_ab TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
-- Kein UNIQUE auf (artikel_id, kunde_id, gueltig_ab): SQLite behandelt NULLs als
-- verschieden, und Soft-Delete würde mit einem DB-Constraint kollidieren.
-- Eindeutigkeit wird stattdessen in kundenpreis_save geprüft (Task 6).
CREATE TABLE einstellung (
  key TEXT PRIMARY KEY, value TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- Seed: Einheiten
INSERT INTO einheit (id, name, kuerzel, created_at, updated_at) VALUES
 ('e0000000-0000-0000-0000-000000000001','Stunde','Std.',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('e0000000-0000-0000-0000-000000000002','Stück','Stk.',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('e0000000-0000-0000-0000-000000000003','Tag','Tag',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('e0000000-0000-0000-0000-000000000004','Pauschale','pausch.',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('e0000000-0000-0000-0000-000000000005','Kilometer','km',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- Seed: Nummernkreise
INSERT INTO nummernkreis (id, art, format, zaehler, jahres_reset, jahr, created_at, updated_at) VALUES
 ('a0000000-0000-0000-0000-000000000001','kunde','KD-{lfd:4}',0,0,CAST(strftime('%Y','now') AS INTEGER),strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('a0000000-0000-0000-0000-000000000002','artikel','ART-{lfd:4}',0,0,CAST(strftime('%Y','now') AS INTEGER),strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('a0000000-0000-0000-0000-000000000003','angebot','AN-{JJJJ}-{lfd:4}',0,1,CAST(strftime('%Y','now') AS INTEGER),strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('a0000000-0000-0000-0000-000000000004','rechnung','RE-{JJJJ}-{lfd:4}',0,1,CAST(strftime('%Y','now') AS INTEGER),strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- Seed: Firma (leerer Einzeldatensatz, wird im Assistenten befüllt)
INSERT INTO firma (id, created_at, updated_at) VALUES
 ('f0000000-0000-0000-0000-000000000001',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- Seed: Textbausteine & Defaults
INSERT INTO einstellung (key, value, created_at, updated_at) VALUES
 ('text.kleinunternehmer','Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('text.rechnung.fuss','Vielen Dank für Ihren Auftrag. Bitte überweisen Sie den Betrag innerhalb der Zahlungsfrist auf das unten genannte Konto.',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('text.angebot.fuss','Wir freuen uns auf Ihre Rückmeldung. Dieses Angebot ist 30 Tage gültig.',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('default.zahlungsziel_tage','14',strftime('%Y-%m-%dT%H:%M:%SZ','now'),strftime('%Y-%m-%dT%H:%M:%SZ','now'));
