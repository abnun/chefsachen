# Änderungen

Was in dieser Datei unter der jeweiligen Version steht, bekommt der Nutzer im
Aktualisierungsdialog zu sehen — `release.yml` liest den Abschnitt beim Bauen
aus und legt ihn in die `latest.json`. Nachträgliches Bearbeiten des Releases
auf GitHub ändert daran nichts mehr.

Deshalb hier in der Sprache der Anwender, nicht in der der Commits.

## 0.2.1

**Ersteinrichtung**
- Die Angaben werden schon nach dem ersten Schritt geprüft, nicht erst am Ende.
  Ein Tippfehler in der IBAN schickte dich vorher nach fünf Schritten zurück
  an den Anfang.
- Eine Fehlermeldung verschwindet, sobald du das Feld korrigierst. Sie blieb
  bisher stehen und ließ offen, ob die Korrektur angekommen ist.
- Beim Gründungsjahr sind keine unsinnigen Werte mehr möglich.

**Menü und Aktualisierung**
- Das Programmmenü ist auf Deutsch, mit „Einstellungen …" (⌘,) und einem
  „Bearbeiten"-Menü — damit funktionieren unter macOS auch Kopieren und
  Einsetzen per Tastatur wieder.
- Unter „Einstellungen → Programmversion" lässt sich abschalten, dass beim
  Start nach einer Aktualisierung gesucht wird.
- Nach einer Aktualisierung erscheint einmalig ein Hinweis, was sich geändert
  hat, mit einem Verweis auf die vollständige Liste.
- Beim Installieren entfällt der englische Lizenzdialog.

## 0.2.0

Die erste Fassung, die sich selbst aktualisieren kann.

**Rechnungen und Angebote**
- Die Rechnungsanschrift steht jetzt an der genormten Stelle (DIN 5008) und
  liegt damit im Sichtfenster eines gewöhnlichen Umschlags.
- Statt „Zahlungsziel: 14 Tage" steht ein konkretes Datum auf der Rechnung.
- Positionen sind durchnummeriert, lassen sich nachträglich ändern und
  umsortieren.
- Eine Rechnungskorrektur verweist auf die ursprüngliche Rechnung.
- Rechnungsanschrift und Ansprechpartner sind je Beleg wählbar.
- Die Summe einer Position steht schon beim Eintippen da.

**Suchen und Finden**
- Rechnungen und Angebote lassen sich nach Nummer oder Kundenname durchsuchen,
  nach jeder Spalte sortieren und seitenweise durchblättern.
- Die Artikelauswahl im Beleg hat eine Tipphilfe.

**Kleinunternehmerregelung**
- Neue Übersichtsseite mit den Umsatzgrenzen nach § 19 UStG und einer
  Erläuterung, was ein Überschreiten kostet.

**Sicherheit der Daten**
- Bei jedem Start entsteht eine Sicherung; die zehn jüngsten bleiben erhalten.
- Sicherungen lassen sich aus der Anwendung heraus zurückspielen und an einen
  selbst gewählten Ort speichern.
- Vor dem Verwerfen ungespeicherter Eingaben wird gefragt — auch beim Schließen
  des Fensters.

**Sonstiges**
- Alles lässt sich ohne Maus bedienen.
- Ein Protokoll unter „Einstellungen → Programmversion" hilft bei der
  Fehlersuche. Es enthält keine Kunden- oder Rechnungsdaten.

## 0.1.0

Erste Fassung.
