# Installation und erste Schritte

Diese App ist nicht mit einem offiziellen Entwickler-Zertifikat signiert. Dein
Betriebssystem zeigt deshalb beim allerersten Start eine Sicherheitswarnung —
das ist normal und kein Zeichen für ein Problem mit der App. Die folgenden
Schritte fallen nur **einmalig** an.

## macOS

1. Lade die Datei `Chefsachen_x.y.z_universal.dmg` herunter und
   öffne sie. Sie passt auf beide Mac-Sorten, mit Apple- wie mit Intel-Prozessor —
   du musst nichts unterscheiden.
2. Ziehe die App in den `Programme`-Ordner, wie bei jeder Mac-App.
3. Starte sie per Doppelklick. macOS meldet, die App könne nicht geöffnet
   werden — das ist der erwartete Schritt, nicht das Ende. Nicht auf „In
   den Papierkorb legen" klicken, sondern auf **„Fertig"**.
4. Öffne **Systemeinstellungen von deinem Mac** (die App mit dem
   Zahnräder-Icon) **→ Datenschutz & Sicherheit** und scrolle nach
   unten. Dort steht jetzt ein Hinweis auf die blockierte App mit dem Button
   **„Dennoch öffnen"**. Klicke ihn an und bestätige den folgenden Dialog.
5. Es erscheint eine weitere Abfrage mit drei Buttons: „In den Papierkorb
   legen", „Dennoch öffnen" und „Fertig". Klicke auf **„Dennoch öffnen"**.
6. Bestätige noch mit Fingerabdruck oder Passwort.
7. Ab jetzt startet die App ganz normal per Doppelklick.

> Ältere Anleitungen im Netz empfehlen stattdessen einen **Rechtsklick →
> Öffnen**. Auf aktuellen macOS-Versionen führt dieser Weg nicht mehr zum
> Ziel; nimm den Weg über die Systemeinstellungen von deinem Mac.

## Windows

1. Lade die Datei `Chefsachen_x.y.z_x64-setup.exe` (oder die
   `.msi`-Datei) herunter und führe sie aus.
2. Windows zeigt einen blauen Bildschirm **„Der Computer wurde durch Windows
   geschützt"**.
3. Klicke auf **„Weitere Informationen"**.
4. Klicke auf den nun erscheinenden Button **„Trotzdem ausführen"**.
5. Die Installation läuft danach ganz normal weiter.

## Warum diese Warnung erscheint

Apple und Microsoft verlangen für eine warnungsfreie Installation ein
kostenpflichtiges Entwickler-Zertifikat je Plattform. Für ein kostenloses
Projekt lohnt sich dieser Aufwand nicht. An der
Sicherheit der App ändert das nichts: Die Warnung prüft nur, ob der
Herausgeber bei Apple bzw. Microsoft hinterlegt ist — nicht, was die App tut.

## Erste Schritte

Beim ersten Start führt dich die App durch die Einrichtung. Zwei Angaben
solltest du dafür bereithalten:

- **Deine Firmendaten**: Name, vollständige Anschrift, Steuernummer oder
  USt-IdNr. sowie Bankverbindung. Diese Angaben sind auf jeder Rechnung
  Pflicht (§ 14 UStG), die App verlangt sie deshalb.
- **Kleinunternehmer ja/nein**: Wenn du die Kleinunternehmerregelung nach
  § 19 UStG nutzt, weisen deine Rechnungen keine Umsatzsteuer aus und tragen
  stattdessen den vorgeschriebenen Hinweis. Die Übersichtsseite zeigt dir dann
  außerdem, wie weit du von den Umsatzgrenzen entfernt bist.

Danach: Kunden anlegen, gegebenenfalls Artikel mit Preisen hinterlegen, und
die erste Rechnung schreiben. Eine Rechnung lässt sich als PDF speichern oder
als E-Rechnung (XRechnung / ZUGFeRD) ausgeben — Letzteres brauchst du, wenn
dein Kunde eine Behörde ist oder ausdrücklich danach fragt.

**Achtung beim Festschreiben:** Eine festgeschriebene Rechnung lässt sich
nicht mehr ändern oder löschen. Das ist kein Versehen, sondern Vorschrift
(GoBD). Eine fehlerhafte Rechnung korrigierst du über eine Storno-Rechnung.

## Deine Daten

Alle Daten — Kunden, Rechnungen, Angebote, importierte Eingangsrechnungen —
liegen ausschließlich lokal auf deinem Rechner in einer einzigen Datei. Es
gibt keinen Server, keine Cloud-Anbindung und keine Übertragung an Dritte.

Wo diese Datei liegt:

| System | Ordner |
|---|---|
| macOS | `~/Library/Application Support/de.chefsachen.app` |
| Windows | `%APPDATA%\de.chefsachen.app` |

Darin liegt `daten.db` und daneben der Ordner `Sicherungen`. Die App legt bei
jedem Start automatisch eine Kopie dort ab und behält die letzten zehn.

**Das ersetzt keine eigene Datensicherung.** Die Kopien liegen auf derselben
Festplatte wie das Original — bei einem Defekt oder einem verlorenen Rechner
sind sie mit weg. Sichere den ganzen Ordner regelmäßig zusätzlich woandershin,
etwa per Time Machine oder auf eine externe Festplatte. Aufbewahrungspflichtig
sind Rechnungen zehn Jahre lang.

## Umzug in die Store-Fassung

Die Fassungen aus dem Mac App Store und dem Microsoft Store legen ihre Daten
an einem eigenen Ort ab und sehen die Daten der Fassung von GitHub nicht. Auf
macOS ist das ein abgeschotteter Bereich unter
`~/Library/Containers/de.chefsachen.app`. Deine bisherigen Daten nimmst du so
mit:

1. In der **bisherigen Fassung** unter **Einstellungen → Sicherungen** bei der
   jüngsten Sicherung **„Speichern unter …"** wählen. Am besten vorher
   **„Jetzt sichern"**, damit auch die letzten Eingaben darin sind. Es entsteht
   eine Zip-Datei mit der Datenbank und dem Belegarchiv.
2. Die bisherige Fassung beenden und die **Store-Fassung** starten.
3. Im Einrichtungsassistenten gleich auf der ersten Seite **„Ich nutze
   Chefsachen schon: Sicherung einspielen …"** wählen und die Zip-Datei
   öffnen. Die Firmendaten musst du dafür nicht ausfüllen.
4. **„Jetzt neu starten"**. Danach sind Kunden, Belege und Einstellungen wieder
   da.

Die bisherige Fassung und ihre Daten bleiben dabei unverändert. Lösche sie erst,
wenn in der Store-Fassung alles angekommen ist, und arbeite nicht in beiden
weiter: Sie gleichen sich nicht ab.

## Updates

Die Fassungen aus dem Mac App Store und dem Microsoft Store aktualisiert der
jeweilige Store; der folgende Abschnitt gilt für die Fassung von GitHub.

Die App sucht bei jedem Start nach einer neuen Version. Findet sie eine,
erscheint unter **Einstellungen → Programmversion** ein Hinweis mit einem
Knopf **„Jetzt aktualisieren"**. Installiert wird nur, wenn du das anstößt —
im Hintergrund passiert nichts.

Dort steht auch, welche Version bei dir läuft, und du kannst jederzeit selbst
nach einer Aktualisierung suchen.

Beim Aktualisieren wird das neue Paket geladen und seine Signatur geprüft;
passt sie nicht, bricht die App ab und installiert nichts. Danach startet sie
neu. Deine Daten bleiben unverändert — sie liegen außerhalb des Programms.

Ohne Internetverbindung meldet die App beim Start nichts; die Suche wird
einfach übersprungen.

## Wenn etwas nicht funktioniert

Melde dich mit einer Beschreibung, was du getan hast und was stattdessen
passiert ist. Falls die App eine Fehlermeldung anzeigt, hilft ein
Bildschirmfoto davon.

Am meisten hilft die **Protokolldatei**. Sie steht unter **Einstellungen →
Programmversion → Protokoll**; der Knopf „Protokolldatei im Ordner zeigen"
öffnet den Ordner, in dem sie liegt. Schick sie einfach mit.

In der Datei stehen technische Vorgänge und Fehlermeldungen — wann die App
gestartet wurde, welche Version läuft, was schiefging. **Keine Kundennamen,
keine Rechnungsinhalte, keine Beträge.** Du kannst sie also bedenkenlos
weitergeben. Sie wird umgebrochen, sobald sie 2 MB erreicht; eine ältere
Fassung bleibt erhalten.
