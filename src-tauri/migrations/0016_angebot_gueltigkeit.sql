-- Gültigkeitsdatum für Angebote.
--
-- Der Fußtext versprach „Dieses Angebot ist 30 Tage gültig", aber es gab kein
-- Datum dazu — nur den Status „Abgelaufen", den niemand von Hand setzt. Die
-- Übersicht zeigte deshalb auf Dauer auch Angebote von vor einem halben Jahr
-- unter „Offene Angebote", und die Zahl wurde bedeutungslos.
--
-- Nur für Angebote gedacht; bei Rechnungen bleibt die Spalte leer.
ALTER TABLE beleg ADD COLUMN gueltig_bis TEXT;

-- Vorgabe für die Anzahl der Tage, die ein neu angelegtes Angebot gültig ist.
-- `INSERT OR IGNORE`: Wer den Schlüssel schon hat, behält seinen Wert.
INSERT OR IGNORE INTO einstellung (key, value, created_at, updated_at) VALUES
 ('vorlage.angebot_gueltigkeit_tage', '30',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'));
