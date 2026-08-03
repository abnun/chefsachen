-- Kopftexte als Bausteine, je einer für Angebot und Rechnung.
--
-- Bisher gab es nur Fußtexte. Der Kopftext blieb beim Anlegen leer und wurde
-- von Hand geschrieben — und beim Überführen eines Angebots in eine Rechnung
-- unverändert mitkopiert. In der Rechnung stand dann „anbei erhalten Sie das
-- gewünschte Angebot".
--
-- `INSERT OR IGNORE`: Wer den Schlüssel schon hat, behält seinen Text.
INSERT OR IGNORE INTO einstellung (key, value, created_at, updated_at) VALUES
 ('text.angebot.kopf',
  'Sehr geehrte Damen und Herren,' || char(10) || char(10) ||
  'vielen Dank für Ihre Anfrage. Gern unterbreiten wir Ihnen folgendes Angebot.',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 ('text.rechnung.kopf',
  'Sehr geehrte Damen und Herren,' || char(10) || char(10) ||
  'wie vereinbart stellen wir Ihnen die folgenden Leistungen in Rechnung.',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'));
