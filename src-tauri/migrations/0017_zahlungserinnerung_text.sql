-- Textbaustein für die Zahlungserinnerung.
--
-- `INSERT OR IGNORE`: Wer den Schlüssel schon hat, behält seinen Text.
INSERT OR IGNORE INTO einstellung (key, value, created_at, updated_at) VALUES
 ('text.zahlungserinnerung',
  'Leider konnten wir zu der unten genannten Rechnung noch keinen Zahlungseingang feststellen. ' ||
  'Falls Sie den Betrag bereits beglichen haben, betrachten Sie dieses Schreiben bitte als gegenstandslos. ' ||
  'Andernfalls bitten wir Sie, den offenen Betrag zeitnah zu überweisen.',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'));
