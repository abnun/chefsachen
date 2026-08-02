-- Änderungshistorie für Eingangsrechnungen.
--
-- Die Rohdatei ist unveränderlich, die daraus abgeleiteten Felder waren es
-- nicht: Rechnungssteller, Nummer, Datum und Betrag ließen sich spurlos
-- überschreiben. Die GoBD verlangen, dass Änderungen an aufbewahrungspflichtigen
-- Aufzeichnungen nachvollziehbar bleiben — der ursprüngliche Inhalt muss
-- feststellbar sein.
--
-- Je geändertem Feld ein Eintrag mit altem und neuem Wert. Bewusst ohne
-- deleted_at: Ein löschbares Protokoll wäre keines.
CREATE TABLE eingangsrechnung_aenderung (
  id TEXT PRIMARY KEY,
  eingangsrechnung_id TEXT NOT NULL REFERENCES eingangsrechnung(id),
  feld TEXT NOT NULL,
  alt TEXT NOT NULL,
  neu TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);

CREATE INDEX idx_eingangsrechnung_aenderung_rechnung
  ON eingangsrechnung_aenderung(eingangsrechnung_id, geaendert_am);
