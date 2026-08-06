-- Gesamt-Auftragswert für einfache Abschlagsrechnungen: ein rein
-- informativer Hinweis auf dem PDF ("Gesamt-Auftragswert: X € (zzgl.
-- USt)"). Keine Verkettung mehrerer Abschläge, keine automatisch
-- berechnete Schlussrechnung — nur diese eine Zahl. Nullable, weil die
-- meisten Belege keine Teilrechnung eines größeren Auftrags sind.
ALTER TABLE beleg ADD COLUMN gesamtauftragswert_cent INTEGER;
