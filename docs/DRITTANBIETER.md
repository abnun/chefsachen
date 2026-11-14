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

## Bankleitzahlen und BIC: Deutsche Bundesbank

- Datei: `src/daten/blz-bic.txt` (rund 50 KB), erzeugt von
  `scripts/blz-daten.mjs`
- Quelle: Bankleitzahlendatei der Deutschen Bundesbank, unverbindliche
  Fassung im TXT-Format von
  <https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592>.
  Eingecheckt ist der Stand gültig vom 07.09.2026 bis 06.12.2026.
- Bedingungen: Die Downloadseite verweist für die Verwendung auf die
  Hinweise im Impressum; dort gelten die „Nutzungsbedingungen für den
  allgemeinen Gebrauch der Website" (Benutzerhinweise), Abschnitt 4.1:
  „Es steht Ihnen frei, für Ihren persönlichen oder geschäftlichen Gebrauch
  von der Deutschen Bundesbank erstellte Informationen in körperlicher oder
  elektronischer Form zu speichern, weiterzugeben oder zu vervielfältigen.
  Die Informationen dürfen nicht verändert oder verfälscht werden." Weitergabe
  und Vervielfältigung „haben unter der folgenden Angabe zu erfolgen:
  ‚Quelle: Deutsche Bundesbank'".
- Umsetzung dieser Bedingungen: Die Datei ist ein Auszug. Übernommen werden
  nur Bankleitzahl und BIC, beide Zeichen für Zeichen unverändert; je
  Bankleitzahl der BIC der Hauptstelle (Merkmal 1), Filialen und Namen
  fallen weg. Die Angabe „Quelle: Deutsche Bundesbank" steht im Kopf der
  Datei, hier und im Programm unter Einstellungen › Programmversion.
- Gewähr: Die Bundesbank stellt die Datei im Internet ausdrücklich
  unverbindlich bereit (verbindlich ist nur der Abruf über ihre Plattform
  NExt für Zahlungsdienstleister) und haftet nach Abschnitt 2 der
  Nutzungsbedingungen nur für Vorsatz und grobe Fahrlässigkeit. Chefsachen
  trägt den BIC deshalb nur als Vorschlag in ein leeres Feld ein.
- Aktualität: vierteljährlich neu, Auffrischen siehe README, „Eine neue
  Version veröffentlichen".

Geprüft am 14.11.2026 anhand der Downloadseite und von
<https://www.bundesbank.de/de/startseite/benutzerhinweise/benutzerhinweise-642874>
(Eintrag „Nutzungsbedingungen - Für den allgemeinen Gebrauch der Website").

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
