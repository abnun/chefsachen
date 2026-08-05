-- Umsatzsteuersatz für die Regelbesteuerung.
--
-- Bisher war die Anwendung ein reines Kleinunternehmer-Werkzeug (§ 19 UStG,
-- keine USt). Wer die Grenze überschreitet, braucht den Steuerausweis: Der
-- Satz hängt am Artikel (19/7/0 %) und wird — wie Bezeichnung, Einheit und
-- Preis — beim Speichern einer Position eingefroren, damit ein späterer
-- Satzwechsel am Artikel keinen bestehenden Beleg verändert (GoBD).
--
-- Default 19 auch für Bestandsdaten: Deren Belege tragen im Snapshot
-- kleinunternehmer=true und weisen nie Steuer aus — der Wert ist dort ohne
-- Wirkung. Preise bleiben in jedem Fall Bruttobeträge; die USt wird nur
-- herausgerechnet.
ALTER TABLE artikel ADD COLUMN ust_satz_prozent INTEGER NOT NULL DEFAULT 19;
ALTER TABLE belegposition ADD COLUMN ust_satz_prozent INTEGER NOT NULL DEFAULT 19;
