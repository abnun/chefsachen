-- Der Status eines festgeschriebenen Angebots hieß „versendet".
--
-- Das behauptete etwas, das nicht stimmt: Die Anwendung verschickt nichts. Sie
-- vergibt eine Nummer und macht den Beleg unveränderbar — verschickt wird er
-- vom Nutzer selbst, per Mail, Post oder gar nicht. Genau das steht auch in der
-- Rückfrage vor dem Festschreiben, und der Status widersprach ihr.
--
-- Nur Angebote sind betroffen; Rechnungen führen dafür 'gestellt', und das
-- trifft zu: Eine Rechnung ist mit dem Festschreiben tatsächlich gestellt.
UPDATE beleg
SET status = 'festgeschrieben'
WHERE status = 'versendet' AND typ = 'angebot';
