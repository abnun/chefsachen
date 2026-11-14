# Daten und Dienste Dritter

Chefsachen selbst steht unter der [MIT-Lizenz](../LICENSE). Diese Datei
nennt, was von anderen stammt und unter eigenen Bedingungen steht. Die
Rust- und npm-Abhängigkeiten führen ihre Lizenzen in ihren Paketen; hier
geht es um mitgelieferte Daten und um angesprochene Dienste.

## Postleitzahlen und Orte: GeoNames

- Datei: `src/daten/plz-de.txt`, erzeugt von `scripts/plz-daten.mjs`
- Quelle: GeoNames, <https://www.geonames.org>, Datei `DE.zip` aus
  <https://download.geonames.org/export/zip/>
- Lizenz: Creative Commons Namensnennung 4.0 International (CC BY 4.0),
  <https://creativecommons.org/licenses/by/4.0/>. Laut `readme.txt` der
  Quelle („This work is licensed under a Creative Commons Attribution 4.0
  License") genügt als Namensnennung ein Verweis auf geonames.org.
- Gewähr: Die Quelle schließt jede Gewähr für Richtigkeit, Aktualität und
  Vollständigkeit aus. Das gilt ebenso für die bearbeitete Fassung.
- Bearbeitung (CC BY 4.0 verlangt, sie anzugeben): Großkunden-Postleitzahlen
  ohne Ortsnamen (Banken, Ämter, Unternehmen), Ortsteile vom Ortsnamen
  getrennt, kompaktes eigenes Format. Einzelheiten im Kopf von
  `scripts/plz-daten.mjs`.
- Namensnennung im Programm: Einstellungen › Programmversion.

Geprüft am 14.11.2026 anhand von
<https://download.geonames.org/export/zip/readme.txt>.

## Straßenvorschläge: Photon von komoot (Dienst, keine Daten im Programm)

- Dienst: <https://photon.komoot.io>, betrieben von der komoot GmbH,
  Schönefeld. Nutzung nach den Angaben dort frei, bei maßvollem Gebrauch
  („please be fair"); Verfügbarkeit ohne Gewähr.
- Angesprochen nur, wenn der Nutzer in den Einstellungen „Adressvorschläge
  aus dem Internet" einschaltet. Was dabei übertragen wird, steht in der
  Einstellung selbst und in `website/datenschutz.html`.
- Die Treffer stammen aus OpenStreetMap (© OpenStreetMap-Mitwirkende,
  ODbL). Chefsachen speichert sie nicht als Datenbank, sondern übernimmt
  einzelne Anschriften auf Wunsch in ein Formular.
- Datenschutzerklärung von komoot: <https://www.komoot.com/de-de/privacy>
