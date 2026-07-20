-- Bereinigt Kundenpreise, deren Kunde bereits (soft-)gelöscht wurde. Das
-- Löschen eines Kunden hat solche Kundenpreise bisher nicht mitgelöscht
-- (Bug: Artikel::delete kaskadiert bereits auf Kundenpreis, Kunde::delete
-- tat es nicht) — betroffene Zeilen wurden bislang weiter angezeigt und
-- zeigten mangels auflösbarem Kundennamen die rohe Kunden-ID an.
UPDATE kundenpreis
SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE deleted_at IS NULL
  AND kunde_id IN (SELECT id FROM kunde WHERE deleted_at IS NOT NULL);
