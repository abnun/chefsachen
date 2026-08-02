-- Kontaktangaben des Rechnungsstellers.
--
-- EN 16931 verlangt für eine XRechnung zwingend die elektronische Adresse des
-- Verkäufers (BT-34) und die Gruppe SELLER CONTACT (BG-6) mit Ansprechpartner,
-- Telefon und E-Mail (BR-DE-2). Ohne diese Felder war jede erzeugte XRechnung
-- unabhängig vom übrigen Inhalt ungültig — aufgefallen erst durch die Prüfung
-- gegen den amtlichen KoSIT-Validator.
ALTER TABLE firma ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE firma ADD COLUMN telefon TEXT NOT NULL DEFAULT '';
ALTER TABLE firma ADD COLUMN kontakt_name TEXT NOT NULL DEFAULT '';
