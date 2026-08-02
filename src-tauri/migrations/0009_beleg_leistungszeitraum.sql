-- Ende eines Leistungszeitraums.
--
-- § 14 Abs. 4 Nr. 6 UStG verlangt den Zeitpunkt der Leistung "oder den
-- Zeitraum". Das Datenmodell kannte nur ein einzelnes Datum; bei Dauerleistungen
-- und Monatsabrechnungen war die Pflichtangabe damit sachlich falsch.
--
-- NULL bedeutet Einzeldatum — der Regelfall. Ist ein Ende gesetzt, gilt
-- leistungsdatum als Beginn des Zeitraums.
ALTER TABLE beleg ADD COLUMN leistungsdatum_bis TEXT;
