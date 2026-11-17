-- Ein Sonderpreis kann befristet sein: gueltig_bis ist der letzte Tag, an dem er gilt
-- (einschließlich). NULL heißt unbefristet, so wie bisher.
ALTER TABLE kundenpreis ADD COLUMN gueltig_bis TEXT;
