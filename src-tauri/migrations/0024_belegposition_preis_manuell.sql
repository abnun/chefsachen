-- Kennzeichnet, ob der Preis einer Artikelposition von Hand gesetzt wurde.
-- Alle anderen Artikelpositionen folgen der Preisliste (Kundenpreis oder
-- Standardpreis am Belegdatum) und werden im Entwurf nachgeführt, wenn sich
-- Datum, Kunde oder Preisliste ändern.
-- Bestehende Positionen gelten als von Hand gesetzt: Was schon so gespeichert
-- ist, soll sich nicht nachträglich still ändern.
ALTER TABLE belegposition ADD COLUMN preis_manuell INTEGER NOT NULL DEFAULT 0;
UPDATE belegposition SET preis_manuell = 1 WHERE artikel_id IS NOT NULL;
