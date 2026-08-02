# Installation und erste Schritte

Diese App ist nicht mit einem offiziellen Entwickler-Zertifikat signiert. Dein
Betriebssystem zeigt deshalb beim allerersten Start eine Sicherheitswarnung —
das ist normal und kein Zeichen für ein Problem mit der App. Die Warnung ist
nur **einmalig** zu bestätigen.

## macOS

1. Lade die Datei `Kleinunternehmer-Verwaltung_x.y.z_aarch64.dmg` herunter und
   öffne sie (bei älteren Macs mit Intel-Prozessor: `_x64.dmg`).
2. Ziehe die App in den `Programme`-Ordner, wie bei jeder Mac-App.
3. Starte sie per Doppelklick. macOS meldet, die App könne nicht geöffnet
   werden — das ist der erwartete Schritt, nicht das Ende.
4. Öffne **Systemeinstellungen → Datenschutz & Sicherheit** und scrolle nach
   unten. Dort steht jetzt ein Hinweis auf die blockierte App mit dem Button
   **„Trotzdem öffnen"**. Klicke ihn an und bestätige den folgenden Dialog.
5. Ab jetzt startet die App ganz normal per Doppelklick.

> Ältere Anleitungen im Netz empfehlen stattdessen einen **Rechtsklick →
> Öffnen**. Auf aktuellen macOS-Versionen führt dieser Weg nicht mehr zum
> Ziel; nimm den Weg über die Systemeinstellungen.

## Windows

1. Lade die Datei `Kleinunternehmer-Verwaltung_x.y.z_x64-setup.exe` (oder die
   `.msi`-Datei) herunter und führe sie aus.
2. Windows zeigt einen blauen Bildschirm **„Der Computer wurde durch Windows
   geschützt"**.
3. Klicke auf **„Weitere Informationen"**.
4. Klicke auf den nun erscheinenden Button **„Trotzdem ausführen"**.
5. Die Installation läuft danach ganz normal weiter.

## Warum diese Warnung erscheint

Apple und Microsoft verlangen für eine warnungsfreie Installation ein
kostenpflichtiges Entwickler-Zertifikat je Plattform. Diese App wird im
kleinen Kreis weitergegeben, dafür lohnt sich der Aufwand nicht. An der
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
| macOS | `~/Library/Application Support/de.kleinunternehmer.verwaltung` |
| Windows | `%APPDATA%\de.kleinunternehmer.verwaltung` |

Darin liegt `daten.db` und daneben der Ordner `Sicherungen`. Die App legt bei
jedem Start automatisch eine Kopie dort ab und behält die letzten zehn.

**Das ersetzt keine eigene Datensicherung.** Die Kopien liegen auf derselben
Festplatte wie das Original — bei einem Defekt oder einem verlorenen Rechner
sind sie mit weg. Sichere den ganzen Ordner regelmäßig zusätzlich woandershin,
etwa per Time Machine oder auf eine externe Festplatte. Aufbewahrungspflichtig
sind Rechnungen zehn Jahre lang.

## Updates

Die App aktualisiert sich nicht selbst. Für eine neue Version lädst du das
Installationspaket erneut herunter und installierst darüber — deine Daten
bleiben dabei erhalten, sie liegen außerhalb der App.

## Wenn etwas nicht funktioniert

Melde dich einfach mit einer Beschreibung, was du getan hast und was
stattdessen passiert ist. Falls die App eine Fehlermeldung anzeigt, hilft ein
Bildschirmfoto davon am meisten.
