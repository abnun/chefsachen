# Änderungen

Was in dieser Datei unter der jeweiligen Version steht, bekommt der Nutzer im
Aktualisierungsdialog zu sehen — `release.yml` liest den Abschnitt beim Bauen
aus und legt ihn in die `latest.json`. Nachträgliches Bearbeiten des Releases
auf GitHub ändert daran nichts mehr.

Deshalb hier in der Sprache der Anwender, nicht in der der Commits.

## 0.2.4

Eine kleine Fassung: Sichtbar ist daran nur das Artikelformular, der Rest ist
Wartung an den Tests.

**Artikel anlegen**
- Fehlt die Bezeichnung oder die Einheit, sagt das jetzt die Anwendung selbst —
  unter dem Feld, in der Form, die du von den anderen Meldungen kennst. Vorher
  übernahm das die eingebaute Meldung des Browsers: in der Sprache des Systems,
  in fremdem Aussehen und beim nächsten Klick wieder verschwunden.
- Wer keine Einheit auswählte, bekam „Einheit existiert nicht" zu lesen. Das
  stimmte zwar technisch, beschrieb aber die falsche Lage. Jetzt steht dort
  „Bitte eine Einheit wählen".

## 0.2.3

**Aussehen von Angebot und Rechnung einstellbar**
- Unter „Einstellungen → Belegvorlage" lassen sich Logo (links, rechts neben
  der Anschrift oder gar keins) und seine Höhe, die Absenderzeile, die
  Akzentfarbe, die Spalten „Pos.", „Einheit" und „Einzelpreis", der Ort der
  Bankverbindung sowie die Seitenränder anpassen. Daneben steht eine Vorschau
  mit deinen Firmendaten und deinem Logo; sie folgt dem Formular, du musst also
  nicht speichern, um zu sehen, was du einstellst.
- Nicht einstellbar sind mit Absicht: die Lage des Anschriftfelds (sie folgt
  DIN 5008 — woanders liegt die Anschrift nicht im Umschlagfenster) und die
  Spalten „Bezeichnung" und „Menge" (Pflichtangaben nach § 14 UStG).
- Ohne eigene Einstellung sieht alles aus wie bisher.

**Texte auf dem Beleg**
- Angebot und Rechnung haben jetzt eigene Kopf- und Fußtexte. Beim Überführen
  eines Angebots in eine Rechnung stand dort vorher der Wortlaut des Angebots —
  „anbei erhalten Sie das gewünschte Angebot" auf einer Rechnung.
- Einen Kopftext gab es bisher gar nicht als Vorlage; er blieb leer und musste
  jedes Mal neu geschrieben werden.

**Preise**
- Beim Erfassen einer Position steht jetzt da, welcher Preis gilt: „Kundenpreis
  65,00 € statt 95,50 €" oder „Standardpreis 95,50 € — kein Kundenpreis
  hinterlegt". Bisher erfuhr man das erst, wenn die Position schon in der Liste
  stand.
- Die Positionssumme wird schon vor dem Speichern ausgerechnet.

**Zahlungsziel**
- Ein Zahlungsziel von 0 Tagen ergibt jetzt „Zahlbar sofort ohne Abzug." Vorher
  stand dort „Zahlbar bis <Belegdatum> (0 Tage)".
- PDF und XRechnung formulieren die Zahlungsbedingung gleich; sie nannten
  dieselbe Sache bisher unterschiedlich.

**Klarere Wörter**
- Ein festgeschriebenes Angebot heißt jetzt „Festgeschrieben" statt
  „Versendet". Die Anwendung verschickt nichts — das sagt auch die Rückfrage
  davor, und der Status widersprach ihr.
- „Speichern" unter den Stammdaten meldet „Stammdaten gespeichert" statt
  „Angebot gespeichert". Gespeichert wurde nur diese eine Karte.

**Vor dem Festschreiben**
- Die Rückfrage zeigt jetzt Kunde, Positionen, Summe sowie Kopf- und Fußtext.
  Danach lässt sich nichts mehr ändern, und beim Klicken hat man die Texte
  nicht vor Augen.

**Kleinigkeiten**
- Der Hinweis nach einer Aktualisierung zeigt die Änderungen jetzt gesetzt
  statt mit Sternchen und Bindestrichen im Text.
- Das Protokoll hält fest, was die Suche nach einer Aktualisierung ergeben hat.
  „Auf dem neuesten Stand" stimmt immer — bezogen auf das, was die Abfrage zu
  sehen bekam.

## 0.2.2

**Behoben: Schaltflächen ließen sich nicht anklicken**
- Bei schmalem Fenster schob eine breite Tabelle die ganze Seite über den
  rechten Rand hinaus. Die Schaltflächen darüber standen dann außerhalb des
  Fensters: sichtbar nur nach seitlichem Schieben, und ein Klick darauf traf
  ins Leere — ohne jede Meldung. Am deutlichsten beim Festschreiben eines
  Angebots mit mehreren Positionen. Eine zu breite Tabelle bekommt jetzt einen
  eigenen Schiebebereich, alles andere bleibt im Fenster.

**Erste Schritte**
- Die Übersicht führt nach der Ersteinrichtung weiter: erster Kunde, erster
  Artikel, erstes Angebot oder erste Rechnung. Die Kachel verschwindet, sobald
  alles steht.

**Kundenpreise**
- Sie öffnen sich jetzt in einem eigenen Fenster, statt die Artikeltabelle
  mitten entzwei zu klappen. Das Eingabeformular erscheint erst, wenn du einen
  Preis hinzufügen willst.
- Ein Kundenpreis lässt sich entfernen. Bisher ließ er sich nur anlegen.
- Das Gültig-ab-Datum steht deutsch da statt in der Form „2026-01-01". Ohne
  Datum steht „sofort".
- In der Artikelliste haben die Kundenpreise eine eigene, sortierbare Spalte.

**Einheitlichere Oberfläche**
- Schaltflächen kleben nicht mehr am darüberliegenden Eingabefeld und stehen
  auf allen Seiten gleich.
- „Neuer Kunde" öffnet das Formular immer. Bisher schloss derselbe Knopf es
  wieder, ohne das anzuzeigen; geschlossen wird jetzt über „Abbrechen".

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
