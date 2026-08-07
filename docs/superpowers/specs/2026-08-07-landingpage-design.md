# Landingpage für Chefsachen

## Kontext

„Chefsachen" (bisher „Kleinunternehmer-Verwaltung") ist bislang nur über das
GitHub-Repository selbst auffindbar. Eine öffentliche Landingpage soll das
Projekt vorstellen, zu den aktuellen Installationspaketen führen, die
Open-Source-Natur sichtbar machen und einen Weg für freiwillige Spenden
bieten, da die App kostenlos bleibt.

## Hosting & Architektur

- **GitHub Pages**, Quellcode in einem neuen Ordner `website/` in diesem
  Repository (kein eigenes Repo) — passt zur bestehenden Ein-Repo-Struktur
  und braucht kein separates Setup.
- Statische Seite: HTML/CSS/etwas Vanilla-JS, kein Framework — für eine
  einzelne Landingpage unangemessener Overhead.
- Eigener Workflow `.github/workflows/pages.yml`, ausgelöst bei Push auf
  `main` mit Änderungen unter `website/`, sowie bei jedem veröffentlichten
  Release (`release: types: [released]`) — letzteres sorgt dafür, dass die
  Download-Links nach einer neuen Version aktuell sind, auch ohne
  Website-Änderung.
- **Download-Links werden beim Bauen fest in die Seite geschrieben**, nicht
  zur Laufzeit im Browser per GitHub-API abgefragt: Der Workflow fragt
  `GET /repos/abnun/kleinunternehmer-verwaltung/releases/latest` einmalig
  ab und ersetzt Platzhalter in der HTML-Datei durch die tatsächlichen
  Asset-URLs (dmg/exe/msi) und die Versionsnummer. Vorteile: kein
  GitHub-API-Rate-Limit-Risiko für Besucher, Download-Links funktionieren
  auch ohne JavaScript, kein zusätzlicher Client-seitiger Netzwerk-Aufruf.
- **Betriebssystem-Erkennung ist rein clientseitige Optik**: Ein kleines
  Skript liest `navigator.userAgent`/`navigator.platform` und hebt beim
  Laden den zur erkannten Plattform passenden, bereits im HTML vorhandenen
  Download-Button optisch hervor (z. B. als Haupt-Button, die anderen
  darunter als Liste). Erkennt es nichts Passendes (z. B. Linux — es gibt
  aktuell keinen Linux-Build, siehe `.github/workflows/release.yml`, das
  nur `macos-latest` und `windows-latest` baut), zeigt es alle Optionen
  gleichrangig.
- **CI-/Teststatus**: eingebettetes natives GitHub-Actions-Badge
  (`https://github.com/abnun/kleinunternehmer-verwaltung/actions/workflows/ci.yml/badge.svg`)
  als `<img>` — kein eigener Live-Abgleich per JavaScript nötig, keine
  zusätzliche Drittanbieter-Abhängigkeit (das Bild kommt direkt von
  GitHub, wo die Seite ohnehin gehostet ist).
- Kein eigener Domain-Zwischenschritt jetzt — Start auf der
  GitHub-Pages-Standardadresse
  (`https://abnun.github.io/kleinunternehmer-verwaltung/`). Eine spätere
  eigene Domain ist nur eine `CNAME`-Datei plus DNS-Eintrag, dafür wird
  jetzt nichts vorbereitet, was das erschweren würde.

## Inhalt der Seite

1. **Hero**: Name „Chefsachen", ein knapper Satz zum Zweck (Rechnungen und
   Angebote für Kleinunternehmer nach § 19 UStG), Haupt-Download-Button
   (OS-erkannt, siehe oben) mit den übrigen Plattformen darunter als Links.
2. **Kernfunktionen** als 5–6 Kacheln, verdichtet aus der README-Liste:
   PDF/A-3b mit allen Pflichtangaben, XRechnung/ZUGFeRD-Ausgang und
   -Eingang, Umsatzgrenzen-Überwachung nach § 19 UStG, Girocode zum
   Bezahlen per Smartphone, alle Daten bleiben lokal (kein Server, kein
   Konto), kostenlos & Open Source.
3. **„Warum kostenlos?"**: kurzer, ehrlicher Absatz (privates Projekt,
   für den eigenen Bedarf entstanden, wird mit anderen geteilt) plus
   PayPal-Spenden-Link (`https://paypal.me/markusmueller1981`) als reiner
   Link — kein eingebettetes PayPal-Button-Skript, damit keine
   Drittanbieter-Ressource auf der Seite lädt.
4. **Open-Source-Leiste**: MIT-Lizenz-Badge, das CI-Status-Badge (siehe
   oben), Link auf die GitHub-Releases-Seite, Link auf den Quellcode.
5. **Hinweis „Keine Steuerberatung"**: derselbe Warnhinweis wie in
   `README.md` — die Seite darf keine falschen Erwartungen wecken.
6. **FAQ** (3–4 Fragen): Ist es wirklich komplett kostenlos? Wo liegen
   meine Daten? Warum zeigt mein Betriebssystem beim ersten Start eine
   Sicherheitswarnung? (Antwort verweist inhaltlich auf
   `docs/installation-freunde.md`, ohne dessen ganzen Text zu wiederholen.)
7. **Footer** mit Links auf Impressum- und Datenschutz-Unterseiten.

## Rechtliches

**Kontext dieser Entscheidung:** Eine Rechnung geht an eine selbst gewählte
Geschäftsbeziehung; eine öffentliche Landingpage ist für jeden im Internet
einsehbar — das ist ein echter Unterschied im Offenlegungsrisiko, kein
Grund, die eine Offenlegung mit der anderen zu rechtfertigen. Ob für eine
kostenlose, spendenbasierte Seite überhaupt eine Impressumspflicht besteht,
ist rechtlich nicht restlos eindeutig (§ 5 DDG verlangt „geschäftsmäßig, in
der Regel gegen Entgelt" — eine freiwillige Spende ist kein Entgelt im
eigentlichen Sinn). Diese Spec ist keine Rechtsberatung. Nach Abwägung fällt
die Entscheidung hier bewusst auf die rechtlich sicherste Variante:

- **Impressum** (`website/impressum.html`) mit Name, Anschrift und E-Mail:
  Markus Müller, Paul-Göbel-Str. 1, 74076 Heilbronn, abnun@gmx.de. Zusätzlich
  eine Zeile „Verantwortlich für den Inhalt" mit demselben Namen (gängige
  Praxis, auch wenn der Medienstaatsvertrag hier nicht zwingend einschlägig
  ist).
- **Datenschutzerklärung** (`website/datenschutz.html`), weil GitHub Pages
  selbst beim Hosting IP-Adressen und weitere Zugriffsdaten protokolliert
  (Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse) — das passiert
  unabhängig von dieser Seite und muss offengelegt werden. Erwähnt: welche
  Daten GitHub Pages verarbeitet, dass kein eigenes Tracking/Analytics
  eingesetzt wird, dass die Schrift „Inter" selbst gehostet wird (liegt
  bereits als Datei im Repo, siehe `src-tauri/resources/fonts/Inter.ttf`)
  statt per Google-Fonts-CDN geladen zu werden — seit dem Urteil des LG
  München I vom 20.01.2022 (3 O 17493/20) sonst ein eigenständiges
  DSGVO-Risiko — und dass der PayPal-Link auf eine externe Seite mit eigener
  Datenschutzerklärung führt.
- **Bewusst kein Cookie-Banner**: Ohne Analytics/Tracking-Skripte und ohne
  eingebettete Drittanbieter-Widgets gibt es nichts, wofür eine
  Einwilligung nötig wäre. Das ist keine Lücke, sondern eine Entscheidung,
  die den Rest der Seite einfacher hält.

## Visuelle Richtung

Der Skill **superpowers:impeccable**-Workflow (init → shape → polish) führt
die eigentliche Umsetzung. Vorgabe an den Skill: ernsthaft-vertrauenswürdig
(Steuerthema), aber nicht steif — passend zum „locker-freundlich"-Ton, der
für den Produktnamen „Chefsachen" gewählt wurde. Schrift „Inter" (schon im
Projekt vorhanden, siehe oben). Die genaue Farbgestaltung (Ausgangspunkt:
App-Standardfarbe `#1a1a1a` oder eine frischere Variante) überlässt diese
Spec bewusst dem Design-Skill in der Umsetzung, statt sie hier vorzugeben.

## Nicht Teil dieser Version

- Keine echten Screenshots der App — die Seite startet mit
  Platzhaltern/stilisierten Illustrationen statt echter Bildschirmfotos;
  die kommen später nach, sobald welche vorliegen.
- Kein Linux-Build, also kein Linux-Download-Button (nur macOS/Windows,
  siehe `.github/workflows/release.yml`).
- Keine eigene Domain in dieser Version — nur die GitHub-Pages-Adresse,
  aber so gebaut, dass eine Domain später ohne Umbau nachgerüstet werden
  kann.
- Kein mehrsprachiger Auftritt — nur Deutsch, wie die App selbst.

## Verifikation

1. `website/` lässt sich lokal ohne Build-Schritt im Browser öffnen (reines
   HTML/CSS/JS, kein Bundler nötig) — Kontrolle per Sichtprüfung.
2. Der Pages-Workflow läuft nach dem Zusammenführen einmal manuell an
   (`workflow_dispatch` oder ein Test-Push), die Download-Links zeigen auf
   echte, existierende Release-Assets.
3. Lighthouse/Grundcheck auf Barrierefreiheit (Alt-Texte, Kontrast,
   Tastaturbedienbarkeit der Buttons) — Teil von Impeccables eigenem
   Prüfzyklus.
4. Manuelle Prüfung: Öffnen mit einem macOS- und einem Windows-`User-Agent`
   (z. B. über die Entwicklertools), um die OS-Erkennung zu bestätigen.
