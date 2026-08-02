-- Rechnungsadresse und Ansprechpartner je Beleg wählbar machen.
--
-- Bisher nahm das Festschreiben immer die als Standard markierte
-- Rechnungsadresse des Kunden. Wer mehrere Standorte beliefert oder eine
-- abweichende Rechnungsanschrift braucht, konnte das nur, indem er den
-- Standard beim Kunden umstellte — was rückwirkend nichts ändert, aber alle
-- künftigen Belege betrifft.
--
-- Beide Felder sind optional. Bleiben sie leer, gilt weiter der Standard;
-- bestehende Belege verhalten sich also unverändert.
ALTER TABLE beleg ADD COLUMN adresse_id TEXT REFERENCES adresse(id);
ALTER TABLE beleg ADD COLUMN ansprechpartner_id TEXT REFERENCES ansprechpartner(id);
