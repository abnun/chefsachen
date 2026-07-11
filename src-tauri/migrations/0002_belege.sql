CREATE TABLE beleg (
  id TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('angebot','rechnung')),
  nummer TEXT,
  status TEXT NOT NULL DEFAULT 'entwurf',
  kunde_id TEXT NOT NULL REFERENCES kunde(id),
  kunde_snapshot TEXT NOT NULL DEFAULT '',
  datum TEXT NOT NULL,
  leistungsdatum TEXT NOT NULL,
  zahlungsziel_tage INTEGER NOT NULL DEFAULT 14,
  kopftext TEXT NOT NULL DEFAULT '',
  fusstext TEXT NOT NULL DEFAULT '',
  summe_cent INTEGER NOT NULL DEFAULT 0,
  ursprungsangebot_id TEXT REFERENCES beleg(id),
  storno_von_id TEXT REFERENCES beleg(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE belegposition (
  id TEXT PRIMARY KEY,
  beleg_id TEXT NOT NULL REFERENCES beleg(id),
  artikel_id TEXT REFERENCES artikel(id),
  bezeichnung TEXT NOT NULL,
  einheit_kuerzel TEXT NOT NULL DEFAULT '',
  einzelpreis_cent INTEGER NOT NULL,
  menge INTEGER NOT NULL,
  positionssumme_cent INTEGER NOT NULL,
  reihenfolge INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE zahlung (
  id TEXT PRIMARY KEY,
  rechnung_id TEXT NOT NULL REFERENCES beleg(id),
  datum TEXT NOT NULL,
  betrag_cent INTEGER NOT NULL,
  notiz TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
