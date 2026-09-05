-- no-transaction
-- Kaufmännische Gutschrift als eigene Belegart.
--
-- Erste Zeile `-- no-transaction`: nötig, damit PRAGMA foreign_keys = OFF
-- wirkt (innerhalb einer Transaktion ist es ein No-op). Ohne das kann der
-- Tabellen-Neubau bei Nutzern mit vorhandenen Belegen an den FK-Constraints
-- der Kindtabellen (belegposition.beleg_id, zahlung.rechnung_id) scheitern.
--
-- Zwei Einstiege: nachträgliche Teilkorrektur mit Rechnungsbezug
-- (gutschrift_zu_id gesetzt) und freie Gutschrift ohne Bezug (NULL).
-- Beträge werden — wie beim Vollstorno — negativ gespeichert. Das Vollstorno
-- (status 'storniert' am Ursprung + Gegenbeleg) bleibt unverändert daneben.
--
-- SQLite kann eine CHECK-Bedingung nicht per ALTER ändern, deshalb der Umweg
-- über eine neue Tabelle (dokumentierte 12-Schritt-ALTER-Prozedur). Die
-- Spaltenliste entspricht dem Stand nach Migration 0021 (Basis 0002 + ALTERs
-- 0009, 0012, 0016, 0021). DROP TABLE verwirft die Indizes aus 0013 — unten
-- neu angelegt, plus der neue Fremdschlüssel.
--
-- `-- no-transaction` heißt: bricht die Migration mittendrin ab, gibt es kein
-- Rollback. Vertretbar, weil die App vor jeder Migration eine automatische
-- Sicherung anlegt; ein Fehlschlag ist daraus wiederherstellbar.

PRAGMA foreign_keys = OFF;

CREATE TABLE beleg_neu (
  id TEXT PRIMARY KEY,
  typ TEXT NOT NULL CHECK (typ IN ('angebot','rechnung','gutschrift')),
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
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  leistungsdatum_bis TEXT,
  adresse_id TEXT REFERENCES adresse(id),
  ansprechpartner_id TEXT REFERENCES ansprechpartner(id),
  gueltig_bis TEXT,
  gesamtauftragswert_cent INTEGER,
  gutschrift_zu_id TEXT REFERENCES beleg(id)
);

INSERT INTO beleg_neu (
  id, typ, nummer, status, kunde_id, kunde_snapshot, datum, leistungsdatum,
  zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id,
  storno_von_id, created_at, updated_at, deleted_at, leistungsdatum_bis,
  adresse_id, ansprechpartner_id, gueltig_bis, gesamtauftragswert_cent
)
SELECT
  id, typ, nummer, status, kunde_id, kunde_snapshot, datum, leistungsdatum,
  zahlungsziel_tage, kopftext, fusstext, summe_cent, ursprungsangebot_id,
  storno_von_id, created_at, updated_at, deleted_at, leistungsdatum_bis,
  adresse_id, ansprechpartner_id, gueltig_bis, gesamtauftragswert_cent
FROM beleg;

DROP TABLE beleg;
ALTER TABLE beleg_neu RENAME TO beleg;

-- Indizes neu anlegen: Unique-Index aus 0006, die Fremdschlüssel-Indizes aus
-- 0013 und der neue Fremdschlüssel. DROP TABLE hatte sie alle verworfen.
CREATE UNIQUE INDEX idx_beleg_nummer_eindeutig ON beleg(nummer);
CREATE INDEX idx_beleg_kunde ON beleg(kunde_id, deleted_at);
CREATE INDEX idx_beleg_ursprungsangebot ON beleg(ursprungsangebot_id);
CREATE INDEX idx_beleg_storno_von ON beleg(storno_von_id);
CREATE INDEX idx_beleg_gutschrift_zu ON beleg(gutschrift_zu_id);

PRAGMA foreign_keys = ON;

-- Eigener Nummernkreis, jahresweise zurücksetzbar wie Rechnung und Angebot.
INSERT INTO nummernkreis (id, art, format, zaehler, jahres_reset, jahr, created_at, updated_at) VALUES
 ('a0000000-0000-0000-0000-000000000005','gutschrift','GS-{JJJJ}-{lfd:4}',0,1,
  CAST(strftime('%Y','now') AS INTEGER),
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- Textbausteine für die Gutschrift (analog text.rechnung.kopf/fuss).
INSERT OR IGNORE INTO einstellung (key, value, created_at, updated_at) VALUES
 ('text.gutschrift.kopf', '',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('text.gutschrift.fuss', 'Der ausgewiesene Betrag wird Ihnen erstattet bzw. mit der nächsten Rechnung verrechnet.',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'));
