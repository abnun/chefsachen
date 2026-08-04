-- Der Standardtext der Zahlungserinnerung behauptete, es sei „noch kein
-- Zahlungseingang" festzustellen. Die Erinnerung ist aber auch bei einer
-- Teilzahlung zulässig — bei einer zu 90 % beglichenen Rechnung wäre der Satz
-- falsch. Die neue Formulierung spricht vom offenen Betrag und stimmt in
-- beiden Fällen.
--
-- Ersetzt wird nur, wenn der Text noch dem alten Standard entspricht: Wer ihn
-- unter „Einstellungen → Textbausteine" angepasst hat, behält seine Fassung.
-- (Eine nachträgliche Änderung von 0017 verbietet sich — sqlx prüft die
-- Prüfsummen bereits gelaufener Migrationen.)
UPDATE einstellung
SET value =
  'Zu der unten genannten Rechnung steht noch ein Betrag offen. ' ||
  'Falls Sie ihn bereits beglichen haben, betrachten Sie dieses Schreiben bitte als gegenstandslos. ' ||
  'Andernfalls bitten wir Sie, den offenen Betrag zeitnah zu überweisen.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE key = 'text.zahlungserinnerung'
  AND value =
  'Leider konnten wir zu der unten genannten Rechnung noch keinen Zahlungseingang feststellen. ' ||
  'Falls Sie den Betrag bereits beglichen haben, betrachten Sie dieses Schreiben bitte als gegenstandslos. ' ||
  'Andernfalls bitten wir Sie, den offenen Betrag zeitnah zu überweisen.';
