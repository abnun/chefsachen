-- Fax-Nummer des Rechnungsstellers.
--
-- Rein optional (rechtlich nicht vorgeschrieben, anders als Steuernummer oder
-- USt-IdNr.) — manche Kunden verlangen sie trotzdem noch. Wird sie nicht
-- gepflegt, bleibt sie leer und erscheint nirgends auf dem Beleg, genau wie
-- ein leeres Feld bei E-Mail oder Telefon.
ALTER TABLE firma ADD COLUMN fax TEXT NOT NULL DEFAULT '';
