# Landingpage für Chefsachen — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine öffentliche, statische Landingpage für „Chefsachen" unter
GitHub Pages, mit Beschreibung, plattformerkanntem Download, Open-Source-
Nachweis, Spendenlink und den rechtlich nötigen Seiten (Impressum,
Datenschutz).

**Architecture:** Statisches HTML/CSS/Vanilla-JS ohne Build-Tooling im
neuen Ordner `website/`. Ein eigener GitHub-Actions-Workflow deployt nach
GitHub Pages und schreibt die aktuellen Release-Download-Links beim Bauen
fest in die HTML-Datei (kein Client-seitiger API-Aufruf). Die Betriebs­system-
Erkennung ist rein optische Hervorhebung per JavaScript — die echten Links
funktionieren auch ohne JavaScript.

**Tech Stack:** HTML5, CSS3, Vanilla JavaScript, GitHub Actions, GitHub
Pages. Design-Feinschliff über den Skill `impeccable`.

## Global Constraints

- Quellcode liegt in `website/` in diesem Repository, kein eigenes Repo,
  kein Framework/Bundler.
- Deploy über einen neuen Workflow `.github/workflows/pages.yml` nach
  GitHub Pages.
- Download-Links werden **beim Bauen** aus der GitHub-Releases-API in die
  HTML-Datei eingesetzt — kein Live-Abruf im Browser.
- Die OS-Erkennung ist **nur optische Hervorhebung**; sie darf nie einen
  Downloadlink verstecken oder unbrauchbar machen.
- **Kein Google-Fonts-CDN** — die Schrift „Inter" wird aus
  `src-tauri/resources/fonts/Inter.ttf` selbst gehostet.
- **Keine Analytics, kein Tracking, keine eingebetteten Drittanbieter-
  Widgets.** Der PayPal-Spendenlink ist ein reiner `<a href>`-Link auf
  `https://paypal.me/markusmueller1981`.
- Impressum-Anschrift: Markus Müller, Paul-Göbel-Str. 1, 74076 Heilbronn,
  E-Mail abnun@gmx.de.
- Sprache: nur Deutsch. Kein Linux-Download-Button (kein Linux-Build
  vorhanden). Keine eigene Domain in dieser Version. Keine echten
  Screenshots — Platzhalter-Illustrationen reichen.
- Repo-Slug für alle GitHub-URLs: `abnun/kleinunternehmer-verwaltung`
  (unverändert, siehe Umbenennungs-Spec vom selben Tag).

---

### Task 1: Seiteninhalt, Grundstruktur und selbst gehostete Schrift

**Files:**
- Create: `website/index.html`
- Create: `website/impressum.html`
- Create: `website/datenschutz.html`
- Create: `website/styles.css`
- Create: `website/fonts/Inter.ttf` (Kopie von `src-tauri/resources/fonts/Inter.ttf`)
- Create: `website/app-icon.png` (Kopie von `public/app-icon.png`)

**Interfaces:**
- Produces: die drei HTML-Seiten mit genau zwei Download-Links —
  `id="download-primaer"` (Haupt-Button, Vorgabe macOS) und
  `id="download-sekundaer"` (Alternative, Vorgabe Windows). Task 2
  (OS-Erkennung) vertauscht bei Bedarf Text und `href` zwischen beiden;
  Task 3 (Workflow-Link-Einspeisung) setzt ihre `href`-Werte.
- Produces: CSS-Klassen `.download-primaer` / `.download-nebenrangig` an
  den Download-Buttons.

**Design-Entscheidung:** Genau zwei Links statt drei (Haupt-Button +
zwei nebenrangige) — mit drei Links zeigte die Vorgabe (kein JavaScript
oder unbekanntes Betriebssystem) macOS doppelt: einmal als Haupt-Button,
einmal zusätzlich als nebenrangigen Link direkt darunter. Mit nur einem
Sekundär-Slot gibt es diese Redundanz in keinem Zustand — ohne JavaScript
sieht man genau einen macOS- und einen Windows-Link, nie denselben
zweimal.

- [ ] **Schritt 1: `website/fonts/Inter.ttf` anlegen**

```bash
mkdir -p website/fonts
cp src-tauri/resources/fonts/Inter.ttf website/fonts/Inter.ttf
cp public/app-icon.png website/app-icon.png
```

- [ ] **Schritt 2: `website/styles.css` — minimales Grundgerüst**

Noch ohne visuellen Feinschliff (der kommt in Task 4 über den Skill
`impeccable`) — nur genug, damit nichts unleserlich übereinanderliegt.

```css
@font-face {
  font-family: "Inter";
  src: url("fonts/Inter.ttf") format("truetype");
  font-weight: 100 900;
  font-display: swap;
}

* {
  box-sizing: border-box;
}

body {
  font-family: "Inter", system-ui, sans-serif;
  margin: 0;
  color: #1a1a1a;
  line-height: 1.5;
}

.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

header, main, footer {
  padding: 2rem 0;
}

.kachel-liste {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
}

.download-primaer {
  display: inline-block;
  background: #1a1a1a;
  color: #fff;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
}

.download-nebenrangig {
  display: block;
  margin-top: 0.5rem;
  color: #1a1a1a;
}

.hinweis-box {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 1rem 1.5rem;
  background: #f7f7f7;
}
```

- [ ] **Schritt 3: `website/index.html`**

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chefsachen — Rechnungen und Angebote für Kleinunternehmer</title>
  <meta name="description" content="Chefsachen erstellt rechtssichere Rechnungen und Angebote für Kleinunternehmer nach § 19 UStG — lokal, ohne Cloud, kostenlos." />
  <link rel="icon" type="image/png" href="app-icon.png" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="container">
    <h1>Chefsachen</h1>
    <p>Rechnungen und Angebote für Kleinunternehmer nach § 19 UStG — lokal, ohne Cloud, kostenlos.</p>

    <p>
      <a id="download-primaer" class="download-primaer" href="https://github.com/abnun/kleinunternehmer-verwaltung/releases/latest">Für macOS herunterladen</a>
    </p>
    <p>
      <a id="download-sekundaer" class="download-nebenrangig" href="https://github.com/abnun/kleinunternehmer-verwaltung/releases/latest">Windows-Version herunterladen</a>
    </p>
    <p><small>Version <span id="release-version">siehe Releases</span> · <a href="https://github.com/abnun/kleinunternehmer-verwaltung/releases">Alle Versionen</a></small></p>
  </header>

  <main class="container">
    <section aria-label="Kernfunktionen">
      <div class="kachel-liste">
        <article>
          <h2>Rechtssichere PDFs</h2>
          <p>Jede Rechnung als PDF/A-3b mit allen Pflichtangaben nach § 14 UStG — archivierbar, wie es das Gesetz vorschreibt.</p>
        </article>
        <article>
          <h2>E-Rechnung, wenn's sein muss</h2>
          <p>XRechnung und ZUGFeRD im Ausgang, beide gegen die amtlichen Regelwerke geprüft. Eingehende E-Rechnungen werden importiert und unveränderlich archiviert.</p>
        </article>
        <article>
          <h2>Umsatzgrenzen im Blick</h2>
          <p>Die App zeigt jederzeit, wie weit du von den Grenzen der Kleinunternehmerregelung entfernt bist — und was ein Überschreiten finanziell bedeuten würde.</p>
        </article>
        <article>
          <h2>Bezahlen per Klick</h2>
          <p>Ein Girocode auf der Rechnung lässt Kunden per Smartphone-Kamera bezahlen, ohne IBAN abzutippen.</p>
        </article>
        <article>
          <h2>Deine Daten bleiben bei dir</h2>
          <p>Keine Cloud, kein Konto, kein Server. Alles liegt lokal auf deinem eigenen Rechner.</p>
        </article>
        <article>
          <h2>Kostenlos &amp; Open Source</h2>
          <p>Der komplette Quellcode ist einsehbar auf GitHub. Nutzung ist und bleibt kostenlos.</p>
        </article>
      </div>
    </section>

    <section aria-label="Warum kostenlos">
      <h2>Warum kostenlos?</h2>
      <p>
        Chefsachen ist aus dem eigenen Bedarf entstanden — als Werkzeug für
        die eigene Rechnungsstellung als Kleinunternehmer. Weil es anderen
        genauso helfen kann, gibt es die App kostenlos für alle. Wenn sie
        dir Zeit spart und du das unterstützen möchtest, freue ich mich
        über eine kleine Spende — muss aber nicht.
      </p>
      <p><a href="https://paypal.me/markusmueller1981">Spenden über PayPal</a></p>
    </section>

    <section aria-label="Open Source">
      <h2>Open Source</h2>
      <p>
        <img src="https://github.com/abnun/kleinunternehmer-verwaltung/actions/workflows/ci.yml/badge.svg" alt="Status der automatisierten Tests" />
      </p>
      <p>
        Lizenziert unter der <a href="https://github.com/abnun/kleinunternehmer-verwaltung/blob/main/LICENSE">MIT-Lizenz</a>.
      </p>
      <p>
        <a href="https://github.com/abnun/kleinunternehmer-verwaltung">Quellcode auf GitHub ansehen</a> ·
        <a href="https://github.com/abnun/kleinunternehmer-verwaltung/releases">Alle Releases</a>
      </p>
    </section>

    <section aria-label="Rechtlicher Hinweis" class="hinweis-box">
      <p>
        <strong>Keine Steuerberatung.</strong> Chefsachen erstellt Belege
        und weist auf die Umsatzgrenzen der Kleinunternehmerregelung hin.
        Die App ersetzt weder eine steuerliche Beratung noch eine
        Buchhaltungssoftware und erstellt weder Umsatzsteuer-Voranmeldung
        noch EÜR. Für die Richtigkeit der abgegebenen Erklärungen bleibt
        der Nutzer verantwortlich.
      </p>
    </section>

    <section aria-label="Häufige Fragen">
      <h2>Häufige Fragen</h2>
      <dl>
        <dt>Ist die App wirklich komplett kostenlos?</dt>
        <dd>Ja. Es gibt keine Bezahlversion, keine Werbung und keine versteckten Kosten. Eine Spende ist rein freiwillig und ändert nichts am Funktionsumfang.</dd>

        <dt>Wo liegen meine Daten?</dt>
        <dd>Ausschließlich lokal auf deinem eigenen Rechner, in einer einzigen Datenbankdatei. Es gibt keinen Server und keine Cloud-Anbindung — niemand außer dir hat Zugriff auf deine Kunden- und Rechnungsdaten.</dd>

        <dt>Warum zeigt mein Betriebssystem beim ersten Start eine Warnung?</dt>
        <dd>Die App ist nicht mit einem kostenpflichtigen Entwickler-Zertifikat signiert — das lohnt sich für ein kostenloses Projekt im kleinen Rahmen nicht. Die Warnung bestätigst du einmalig, danach startet die App ganz normal. Details in der <a href="https://github.com/abnun/kleinunternehmer-verwaltung/blob/main/docs/installation-freunde.md">Installationsanleitung</a>.</dd>

        <dt>Für wen ist die App gedacht?</dt>
        <dd>Für Kleinunternehmer nach § 19 UStG, die Rechnungen und Angebote in Deutschland rechtssicher erstellen wollen — ohne Abo, ohne Cloud-Zwang.</dd>
      </dl>
    </section>
  </main>

  <footer class="container">
    <p><a href="impressum.html">Impressum</a> · <a href="datenschutz.html">Datenschutz</a></p>
  </footer>

  <script src="script.js" defer></script>
</body>
</html>
```

- [ ] **Schritt 4: `website/impressum.html`**

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Impressum — Chefsachen</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="container">
    <h1>Impressum</h1>

    <h2>Angaben gemäß § 5 DDG</h2>
    <p>
      Markus Müller<br />
      Paul-Göbel-Str. 1<br />
      74076 Heilbronn
    </p>

    <h2>Kontakt</h2>
    <p>E-Mail: abnun@gmx.de</p>

    <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
    <p>
      Markus Müller<br />
      Anschrift wie oben
    </p>

    <p><a href="index.html">Zurück zur Startseite</a></p>
  </main>
</body>
</html>
```

- [ ] **Schritt 5: `website/datenschutz.html`**

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Datenschutz — Chefsachen</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="container">
    <h1>Datenschutzerklärung</h1>

    <h2>Verantwortlicher</h2>
    <p>
      Markus Müller<br />
      Paul-Göbel-Str. 1<br />
      74076 Heilbronn<br />
      E-Mail: abnun@gmx.de
    </p>

    <h2>Hosting bei GitHub Pages</h2>
    <p>
      Diese Seite wird über GitHub Pages ausgeliefert (GitHub Inc.,
      88 Colin P. Kelly Jr. St., San Francisco, CA 94107, USA). Beim
      Aufruf verarbeitet GitHub automatisch technische Zugriffsdaten,
      darunter die IP-Adresse, Datum und Uhrzeit des Zugriffs, die
      aufgerufene Seite und Angaben zu Browser und Betriebssystem. Diese
      Verarbeitung dient der Auslieferung und Absicherung der Seite und
      erfolgt auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f
      DSGVO). Es kann dabei zu einer Datenübermittlung in die USA kommen.
      Näheres regelt die Datenschutzerklärung von GitHub.
    </p>

    <h2>Schriftarten</h2>
    <p>
      Die verwendete Schrift „Inter" wird von dieser Seite selbst
      ausgeliefert, nicht von einem externen Anbieter wie Google Fonts
      geladen. Dabei werden keine zusätzlichen Daten an Dritte übertragen.
    </p>

    <h2>Cookies und Analyse-Werkzeuge</h2>
    <p>
      Diese Seite setzt keine Cookies und keine Analyse- oder
      Tracking-Werkzeuge ein.
    </p>

    <h2>Externe Links</h2>
    <p>
      Der Spenden-Link auf dieser Seite führt zu PayPal, einem externen
      Anbieter mit eigener Datenschutzerklärung. Beim bloßen Anzeigen
      dieser Seite findet keine Datenübertragung an PayPal statt — erst
      wenn der Link angeklickt wird, verlässt man diese Seite.
    </p>

    <h2>Ihre Rechte</h2>
    <p>
      Sie haben das Recht auf Auskunft, Berichtigung, Löschung und
      Einschränkung der Verarbeitung Ihrer personenbezogenen Daten sowie
      ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde. Wenden
      Sie sich dazu an die oben genannte E-Mail-Adresse.
    </p>

    <p><a href="index.html">Zurück zur Startseite</a></p>
  </main>
</body>
</html>
```

- [ ] **Schritt 6: Prüfen**

Öffne `website/index.html` direkt im Browser (`file://`-URL oder
`python3 -m http.server` im Ordner `website/`). Erwartet:
- Alle drei Seiten laden ohne Konsolenfehler.
- Die Schrift „Inter" wird verwendet (in den Entwicklertools unter
  „Computed" prüfen).
- Kein Netzwerk-Request an `fonts.googleapis.com` oder eine andere
  externe Schrift-Quelle (Netzwerk-Tab der Entwicklertools).
- Die Links „Impressum" und „Datenschutz" funktionieren in beide
  Richtungen (inkl. „Zurück zur Startseite").

- [ ] **Schritt 7: Commit**

```bash
git add website/
git commit -m "feat: Landingpage — Inhalt, Struktur, selbst gehostete Schrift"
```

---

### Task 2: Betriebssystem-Erkennung für die Download-Buttons

**Files:**
- Create: `website/script.js`
- Modify: `website/index.html` (Skript-Einbindung besteht bereits aus
  Task 1, Schritt 3 — `<script src="script.js" defer>`)

**Interfaces:**
- Consumes: `#download-primaer`, `#download-sekundaer` aus Task 1.
- Verhalten: Vertauscht bei erkanntem Windows Text **und** `href`
  zwischen den beiden Elementen. Nichts wird entfernt oder neu erzeugt —
  dadurch bleiben immer genau zwei Links sichtbar, nie einer doppelt.
  Task 3 schreibt die ursprünglichen `href`-Werte (macOS auf
  `#download-primaer`, Windows auf `#download-sekundaer`); dieses Skript
  vertauscht sie zur Laufzeit bei Bedarf, ändert aber nicht, welche zwei
  Ziel-URLs insgesamt existieren.

- [ ] **Schritt 1: `website/script.js`**

```javascript
// Vertauscht Haupt- und Alternativ-Download, wenn Windows erkannt wird.
// Vorgabe im HTML ist macOS als Haupt-Button — für macOS oder ein nicht
// erkanntes System (z. B. Linux, wofür es keinen Build gibt) bleibt das
// so; es wird nie etwas entfernt, nur bei Windows vertauscht. Dadurch
// gibt es in jedem Zustand genau zwei Links, nie eine Dopplung.
function erkanntesBetriebssystem() {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macos";
  return null;
}

function hervorheben(os) {
  if (os !== "windows") return;

  const primaer = document.getElementById("download-primaer");
  const sekundaer = document.getElementById("download-sekundaer");
  if (!primaer || !sekundaer) return;

  const primaerHref = primaer.href;
  const primaerText = primaer.textContent;
  primaer.href = sekundaer.href;
  primaer.textContent = "Für Windows herunterladen";
  sekundaer.href = primaerHref;
  sekundaer.textContent = "macOS-Version herunterladen";
  void primaerText; // nur zur Klarheit im Lesefluss, kein weiterer Gebrauch
}

hervorheben(erkanntesBetriebssystem());
```

- [ ] **Schritt 2: Prüfen — macOS-Erkennung (und unbekanntes System)**

In den Entwicklertools (Chrome/Firefox) den User-Agent auf einen
macOS-String stellen, z. B. per
`Object.defineProperty(navigator, 'userAgent', {value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})`
in der Konsole vor dem Neuladen. Erwartet: keine Änderung gegenüber der
HTML-Vorgabe — Haupt-Button „Für macOS herunterladen", Alternativ-Link
„Windows-Version herunterladen". Denselben Test mit einem
Linux-User-Agent wiederholen: gleiches Ergebnis, nichts ändert sich.

- [ ] **Schritt 3: Prüfen — Windows-Erkennung**

Denselben Test mit einem Windows-User-Agent-String wiederholen. Erwartet:
Haupt-Button zeigt jetzt „Für Windows herunterladen" mit der zuvor im
Alternativ-Link stehenden `href`, der Alternativ-Link zeigt „macOS-Version
herunterladen" mit der zuvor im Haupt-Button stehenden `href`. Beide
`href`-Werte zusammen sind exakt dieselben zwei wie vorher — nur
vertauscht, keiner geht verloren, keiner verdoppelt sich.

- [ ] **Schritt 4: Commit**

```bash
git add website/script.js
git commit -m "feat: Landingpage hebt Download je nach erkanntem Betriebssystem hervor"
```

---

### Task 3: GitHub-Actions-Workflow für den Pages-Deploy mit Release-Link-Einspeisung

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: `website/index.html`s feste `id`-Attribute
  `#release-version`, `#download-primaer`, `#download-sekundaer` (siehe
  Task 1) als Ersetzungsziele.
- Produces: den fertigen, veröffentlichbaren Inhalt des Ordners
  `website/` als GitHub-Pages-Artefakt.

- [ ] **Schritt 1: Vorbedingung prüfen**

`website/index.html` aus Task 1 hat bereits die `id`-Attribute
`release-version`, `download-primaer` und `download-sekundaer` — keine
weitere Code-Änderung an `index.html` nötig. Dieser Schritt dokumentiert
nur, dass Task 3 exakt diese drei Elemente per `sed` ersetzt.

- [ ] **Schritt 2: `.github/workflows/pages.yml`**

```yaml
name: Landingpage veröffentlichen

# Baut den Ordner website/ und veröffentlicht ihn über GitHub Pages.
# Läuft bei Änderungen an website/ auf main sowie bei jedem veröffentlichten
# Release — Letzteres sorgt dafür, dass die Download-Links nach einer neuen
# Version aktuell sind, auch ohne eigene Änderung an der Website.
#
# Die Download-Links werden hier beim Bauen fest in index.html eingesetzt,
# nicht zur Laufzeit im Browser abgefragt (siehe docs/superpowers/specs/
# 2026-08-07-landingpage-design.md, Abschnitt "Hosting & Architektur").

on:
  push:
    branches: [main]
    paths: ["website/**"]
  release:
    types: [released]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Neuestes Release abfragen
        id: release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          json=$(gh api repos/abnun/kleinunternehmer-verwaltung/releases/latest)
          version=$(echo "$json" | jq -r '.tag_name' | sed 's/^v//')
          dmg=$(echo "$json" | jq -r '.assets[] | select(.name | endswith(".dmg")) | .browser_download_url')
          exe=$(echo "$json" | jq -r '.assets[] | select(.name | endswith("-setup.exe")) | .browser_download_url')
          msi=$(echo "$json" | jq -r '.assets[] | select(.name | endswith(".msi")) | .browser_download_url')
          echo "version=$version" >> "$GITHUB_OUTPUT"
          echo "dmg=$dmg" >> "$GITHUB_OUTPUT"
          echo "exe=$exe" >> "$GITHUB_OUTPUT"
          echo "msi=$msi" >> "$GITHUB_OUTPUT"

      - name: Download-Links in index.html einsetzen
        run: |
          sed -i \
            -e "s#<span id=\"release-version\">siehe Releases</span>#<span id=\"release-version\">${{ steps.release.outputs.version }}</span>#" \
            -e "s#id=\"download-primaer\" class=\"download-primaer\" href=\"[^\"]*\"#id=\"download-primaer\" class=\"download-primaer\" href=\"${{ steps.release.outputs.dmg }}\"#" \
            -e "s#id=\"download-sekundaer\" class=\"download-nebenrangig\" href=\"[^\"]*\"#id=\"download-sekundaer\" class=\"download-nebenrangig\" href=\"${{ steps.release.outputs.exe }}\"#" \
            website/index.html
          # Die MSI-URL (steps.release.outputs.msi) wird hier bewusst nicht
          # als eigener dritter Download-Button eingesetzt — die Seite hat
          # genau zwei Download-Links (siehe Task 1), die MSI-Variante
          # bleibt über die allgemeine Release-Seite erreichbar.

      - name: Prüfen, dass alle Platzhalter ersetzt wurden
        run: |
          if grep -q "siehe Releases" website/index.html; then
            echo "Versionsplatzhalter wurde nicht ersetzt." >&2
            exit 1
          fi
          if grep -q "releases/latest\"" website/index.html; then
            echo "Mindestens ein Download-Link zeigt noch auf die allgemeine Release-Seite statt auf ein Asset." >&2
            exit 1
          fi

      - name: Pages einrichten
        uses: actions/configure-pages@v5

      - name: Artefakt hochladen
        uses: actions/upload-pages-artifact@v3
        with:
          path: website/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Nach GitHub Pages veröffentlichen
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Schritt 3: YAML-Syntax prüfen**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pages.yml'))"`
Expected: kein Fehler (valides YAML).

- [ ] **Schritt 4: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "feat: GitHub-Actions-Workflow für die Landingpage (Pages-Deploy)"
```

---

### Task 4: Visueller Feinschliff mit dem Skill `impeccable`

**Files:**
- Modify: `website/index.html`
- Modify: `website/impressum.html`
- Modify: `website/datenschutz.html`
- Modify: `website/styles.css`

**Interfaces:**
- Consumes: den vollständigen Inhalt aus Task 1 — dieser Task ändert
  **Aussehen**, nicht Inhalt/Struktur/Copy. Alle `id`-Attribute aus Task 1
  und 2 (`download-primaer`, `download-sekundaer`, `release-version`)
  müssen erhalten bleiben, sonst bricht Task 2s Skript und Task 3s
  `sed`-Ersetzung.

- [ ] **Schritt 1: Kontext laden**

Im Skill-Verzeichnis von `impeccable` (siehe `~/.claude/plugins` oder wo
das Plugin installiert wurde) `scripts/context.mjs` einmal mit
`--target website/index.html` ausführen, wie in der `SKILL.md` des
Skills beschrieben.

- [ ] **Schritt 2: Refinement, nicht Redesign**

Dies ist **Refinement**: Copy, Struktur, IDs, Links und Inhalt aus Task 1
und 2 bleiben unverändert — nur Typografie, Abstände, Farben, Layout und
Mikro-Interaktionen werden verfeinert. Vorgabe an den Skill: ernsthaft-
vertrauenswürdig (Steuerthema), aber nicht steif — passend zum „locker-
freundlich"-Ton, der für den Produktnamen „Chefsachen" gewählt wurde.
Ausgangspunkt für die Akzentfarbe: `#1a1a1a` (App-Standardfarbe) oder eine
frischere Variante nach Einschätzung des Skills.

Den entsprechenden `impeccable`-Befehl für einen vollständigen
Gestaltungsdurchgang auf `website/` anwenden (laut `SKILL.md` z. B.
`/impeccable shape` oder `/impeccable polish`, je nachdem, was die
Skill-eigene Dokumentation für einen ersten vollständigen Durchgang auf
einer neuen Seite vorsieht).

- [ ] **Schritt 3: IDs und Links stichprobenhaft prüfen**

Nach dem Feinschliff-Durchgang:

Run: `grep -c 'id="download-primaer"' website/index.html`
Expected: `1` (das Attribut existiert weiterhin genau einmal)

Run: `grep -c 'id="download-sekundaer"' website/index.html`
Expected: `1`

Run: `grep -c 'id="release-version"' website/index.html`
Expected: `1`

Run: `grep -c 'paypal.me/markusmueller1981' website/index.html`
Expected: mindestens `1` (Spendenlink wurde nicht versehentlich entfernt)

- [ ] **Schritt 4: Visuelle Prüfung im Browser**

`website/index.html`, `website/impressum.html` und
`website/datenschutz.html` im Browser öffnen (Desktop- und eine
mobile/verkleinerte Fensterbreite). Erwartet: kein horizontales Scrollen,
Kontrast ausreichend lesbar, Download-Buttons klar als klickbar erkennbar,
Impressum/Datenschutz weiterhin über den Footer-Link erreichbar.

- [ ] **Schritt 5: Commit**

```bash
git add website/
git commit -m "feat: Landingpage visuell verfeinert (impeccable)"
```

---

### Task 5: Freigabe und Veröffentlichung

**Files:** keine neuen Dateien — reine Aktivierungs- und
Verlinkungsschritte.

**Interfaces:** keine (letzter Schritt der Kette).

- [ ] **Schritt 1: GitHub Pages im Repository aktivieren**

Einmalig, per Rückfrage beim Menschen vor der Ausführung (ändert eine
öffentlich sichtbare Repository-Einstellung):

```bash
gh api -X PUT repos/abnun/kleinunternehmer-verwaltung/pages \
  -f build_type=workflow
```

- [ ] **Schritt 2: Workflow einmal auslösen und beobachten**

```bash
gh workflow run pages.yml --repo abnun/kleinunternehmer-verwaltung
gh run watch --repo abnun/kleinunternehmer-verwaltung --exit-status
```

Expected: Workflow läuft grün durch, die „Prüfen, dass alle Platzhalter
ersetzt wurden"-Schritte aus Task 3 schlagen nicht fehl.

- [ ] **Schritt 3: Veröffentlichte Seite stichprobenhaft prüfen**

```bash
gh api repos/abnun/kleinunternehmer-verwaltung/pages --jq '.html_url'
```

Die ausgegebene URL im Browser öffnen. Erwartet: Seite lädt, Download-
Button zeigt auf eine echte, existierende Datei (nicht mehr auf
„releases/latest"), Versionsnummer stimmt mit dem neuesten Release
überein.

- [ ] **Schritt 4: Verlinkung in `README.md` ergänzen**

Direkt unter der Überschrift `# Chefsachen` einen Link auf die neue Seite
einfügen, damit sie auch von dort aus auffindbar ist:

```markdown
# Chefsachen

[Website](https://abnun.github.io/kleinunternehmer-verwaltung/)
```

- [ ] **Schritt 5: Commit**

```bash
git add README.md
git commit -m "docs: Link zur Landingpage im README ergänzt"
```

## Verifikation (gesamt)

1. Alle Tasks einzeln wie oben beschrieben verifiziert.
2. Die veröffentlichte Seite lädt unter der GitHub-Pages-Adresse, alle
   drei Unterseiten (Start, Impressum, Datenschutz) sind erreichbar.
3. Kein Netzwerk-Request an eine externe Schriftquelle, kein
   Tracking-/Analytics-Skript — per Entwicklertools-Netzwerktab
   nachprüfen.
4. Der Pages-Workflow läuft nach einem echten Release automatisch neu an
   und aktualisiert die Download-Links (beim nächsten Versions-Release
   beobachten).
5. `docs/CHANGELOG.md` bekommt **keinen** eigenen Eintrag — die Landingpage
   ist keine App-Funktion, die der Nutzer im Aktualisierungsdialog sehen
   müsste.
