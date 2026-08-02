-- Indizes auf den Fremdschlüsseln.
--
-- SQLite legt für PRIMARY KEY automatisch einen Index an, für Fremdschlüssel
-- nicht. Jede Abfrage der Form „alle Positionen zu diesem Beleg" las bisher die
-- ganze Tabelle. Bei einem Kleinunternehmer mit ein paar hundert Belegen fällt
-- das nicht auf; über zehn Jahre Aufbewahrungspflicht wächst das stetig, und
-- die Belegdetailseite lädt gleich mehrere solcher Abfragen hintereinander.
--
-- Aufgenommen sind die Spalten, nach denen der Code tatsächlich filtert. Ein
-- Index kostet Schreibzeit und Platz; einen anzulegen, den nie eine Abfrage
-- benutzt, ist reiner Aufwand.
--
-- `deleted_at` steht jeweils mit im Index: Sämtliche Abfragen hängen
-- `AND deleted_at IS NULL` an, und so kann SQLite die Zeile abweisen, ohne die
-- Tabelle anzufassen.

-- Belegpositionen und Zahlungen — geladen bei jedem Öffnen eines Belegs.
CREATE INDEX idx_belegposition_beleg ON belegposition(beleg_id, deleted_at);
CREATE INDEX idx_zahlung_rechnung ON zahlung(rechnung_id, deleted_at);

-- Belege eines Kunden: Kundendetailseite und Löschprüfung.
CREATE INDEX idx_beleg_kunde ON beleg(kunde_id, deleted_at);

-- Verweise zwischen Belegen: Angebot → Rechnung, Rechnung → Storno.
CREATE INDEX idx_beleg_ursprungsangebot ON beleg(ursprungsangebot_id);
CREATE INDEX idx_beleg_storno_von ON beleg(storno_von_id);

-- Adressen und Ansprechpartner eines Kunden.
CREATE INDEX idx_adresse_kunde ON adresse(kunde_id, deleted_at);
CREATE INDEX idx_ansprechpartner_kunde ON ansprechpartner(kunde_id, deleted_at);

-- Kundenpreise: Bei jeder Position wird der gültige Preis ermittelt, und zwar
-- über beide Spalten zugleich.
CREATE INDEX idx_kundenpreis_artikel_kunde ON kundenpreis(artikel_id, kunde_id, deleted_at);
CREATE INDEX idx_kundenpreis_kunde ON kundenpreis(kunde_id, deleted_at);

-- Positionen und Steuerzeilen einer Eingangsrechnung.
CREATE INDEX idx_eingangsrechnungposition_rechnung ON eingangsrechnungposition(eingangsrechnung_id);
CREATE INDEX idx_eingangsrechnungsteuer_rechnung ON eingangsrechnungsteuer(eingangsrechnung_id);

-- Artikel je Einheit — nötig für die Prüfung, ob eine Einheit noch benutzt wird.
CREATE INDEX idx_artikel_einheit ON artikel(einheit_id, deleted_at);
