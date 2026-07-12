# Design: Styling & visuelles Erscheinungsbild

**Datum:** 2026-07-12
**Status:** Entwurf, mit Auftraggeber abgestimmt

## Ziel

Die App bekommt ein durchgängiges, ruhiges und leicht verständliches Erscheinungsbild, passend zu einem seriösen Buchhaltungs-Werkzeug. Bisher existiert praktisch kein Design: rohe HTML-Elemente mit Browser-Standardaussehen, Inline-Styles in `Layout.tsx`/`Fehler.tsx` und ungenutztes Tauri/Vite-Boilerplate in `App.css`. Diese Umstellung ist **rein visuell/strukturell** — keine Änderung an Anwendungslogik, Datenfluss oder Backend.

**Gewählte Stilrichtung:** „Ruhig & sachlich" — gedeckte Grautöne, ein zurückhaltendes Blaugrau als Akzent, dezente Ränder, komfortable Abstände. Nichts drängt sich vor; die Daten stehen im Vordergrund.

**Umfang:** Hell- **und** Dunkelmodus (folgt automatisch dem System via `prefers-color-scheme`). Alle acht Seiten plus Layout und Fehler-Komponente werden in einem Rutsch umgestellt.

**Explizit außerhalb dieses Plans:** kein Umbau der Komponentenlogik, kein Router, keine neue Laufzeit-Abhängigkeit, keine Änderung an der PDF-Vorlage (`rechnung.typ` hat ihr eigenes, unabhängiges Layout).

## Architektur

Umsetzung als **globales Stylesheet mit Design-Tokens** (CSS Custom Properties) plus einem knappen Satz semantischer Komponenten-Klassen. Kein CSS-Framework, keine neue Dependency — passt zu Vite/React und hält das ruhige Erscheinungsbild vollständig unter eigener Kontrolle. Dark Mode entsteht allein durch einen zweiten Wertesatz der Tokens; kein Baustein wird doppelt gestylt.

Drei neue Dateien unter `src/styles/`, in dieser Reihenfolge in `main.tsx` (bzw. `App.tsx`) importiert:

1. **`tokens.css`** — Definiert alle Tokens auf `:root` (Hell-Werte) und überschreibt sie unter `@media (prefers-color-scheme: dark)` (Dunkel-Werte). Einzige Quelle der Wahrheit für Farben/Abstände/Radien/Schrift.
2. **`basis.css`** — Grundtypografie, `body`, `*`-Box-Sizing, Fokus-Ringe (Tastatur-Bedienbarkeit), vernünftige Element-Defaults für `input/select/textarea/button/table/a/h1–h3`. Ersetzt das ausgemistete `App.css`-Boilerplate.
3. **`komponenten.css`** — Wiederverwendbare Klassen (siehe unten).

### Tokens (semantische Namen, nicht rohe Farben)

**Farben (Hell → Dunkel):**
- `--bg` — App-Hintergrund (`#f4f6f8` → `#16181d`)
- `--bg-gedaempft` — Seitenleiste/Kopfzonen (`#f7f8fa` → `#1b1e24`)
- `--flaeche` — Karten, Tabellen, Eingaben (`#ffffff` → `#21252c`)
- `--flaeche-eingabe` — Eingabefelder-Hintergrund (`#ffffff` → `#1b1e24`)
- `--rand` — Ränder/Trennlinien (`#e3e6ec` → `#2e333c`)
- `--rand-stark` — Eingabe-Ränder (`#d3d8e0` → `#3a414c`)
- `--text` — Haupttext (`#1c2230` → `#e6e8ec`)
- `--text-leise` — Sekundärtext, Tabellenköpfe, Nummern (`#6b7280`/`#8a92a3` → `#9aa2b0`/`#838b99`)
- `--akzent` — Primäraktion/aktiver Zustand (`#33506b` → `#4d7093`)
- `--akzent-hover` — (`#2b4459` → `#5a80a4`)
- `--akzent-text` — Text auf Akzentfläche (`#ffffff` → `#ffffff`)
- `--akzent-leise` — aktiver Nav-Hintergrund, dezente Akzentfläche (`#e9ecf1` → `#26303a`)

**Status-/Signalfarben** (je Paar: Fläche + Text):
- Entwurf (neutral): `--st-entwurf-bg`/`-text` (`#eef0f3`/`#5a6273` → `#262b33`/`#9aa2b0`)
- Gestellt (Info-Blau): `--st-gestellt-bg`/`-text` (`#e4edf5`/`#2f5c86` → `#1d2c3a`/`#83aed6`)
- Bezahlt (Erfolg-Grün): `--st-bezahlt-bg`/`-text` (`#e6f4ec`/`#1f7a52` → `#163a2a`/`#6ed3a0`)
- Storniert (Gefahr-Rot): `--st-storniert-bg`/`-text` (`#fdecea`/`#a3231f` → `#3a1e1c`/`#ef8f8a`)
- Fehler-Box: `--fehler-bg`/`-text`/`-rand` (`#fdecea`/`#7a1212`/`#f5c2c0` → `#2c1a1a`/`#ef9a95`/`#4a2c2a`)

**Abstände:** `--abstand-xs` (4px), `-s` (8px), `-m` (12px), `-l` (16px), `-xl` (24px).
**Radien:** `--radius-s` (6px), `--radius-m` (8px), `--radius-pill` (999px).
**Schatten:** `--schatten` (eine dezente Stufe, im Dunkelmodus kräftiger/transparenter).
**Schrift:** System-Font-Stack (`-apple-system, system-ui, "Segoe UI", Roboto, sans-serif`); `--text-s` (12px), `--text-m` (14px, Basis), `--text-l` (16px), `--text-xl` (20px, Seitentitel).

### Komponenten-Klassen

- **Buttons:** `.btn` (Basis: Sekundär-Look — `--flaeche`, `--rand-stark`, `--akzent`-Text), `.btn-primaer` (gefüllt `--akzent`), `.btn-gefahr` (roter Text/Rand, für Stornieren/Löschen), `.btn-leise` (rahmenlos, für Export-/Nebenaktionen). Fokus-Ring aus `basis.css`.
- **Formulare:** `.feld` (Wrapper Label→Eingabe als vertikale Einheit, konsistenter Abstand), `.feld-fehler` (rote Feldmeldung unter der Eingabe; ersetzt die heutigen nackten `<div role="alert">`). Eingaben erben Styling aus `basis.css`.
- **Tabellen:** `.tabelle` — `--flaeche`-Hintergrund, Kopf in `--text-leise`/Versalien, Zebra-/Hover-Zeilen, klickbare Zeilen mit Cursor und Hover-Hervorhebung. Nummern-Spalten `.tabelle-num` (tabulare Ziffern, `--text-leise`).
- **Status-Badges:** `.status` + `.status-entwurf|-gestellt|-bezahlt|-storniert` — abgerundete Pill-Badges aus den Status-Tokens. Machen Angebots-/Rechnungslisten auf einen Blick lesbar.
- **Struktur:** `.karte` (umrandete Fläche mit Innenabstand, für Formulare/Detailblöcke), `.werkzeugleiste` (horizontale Such-/Aktionszeile über Listen), `.seiten-kopf` (einheitlicher Titelbereich `<h1>`).

### Layout & Navigation

`Layout.tsx`: Inline-Styles werden durch Klassen ersetzt (`.app-layout`, `.app-nav`, `.app-nav-eintrag`, `.app-main`). Aktiver Eintrag klar über `--akzent-leise`/`--akzent`-Text und `aria-current="page"` hervorgehoben (bestehendes `aria-current` bleibt).

**Nav-Icons:** Jeder der fünf Nav-Einträge bekommt ein schlichtes Inline-SVG-Icon links vom Label (Kunden, Artikel, Angebote, Rechnungen, Einstellungen). Umsetzung als kleine Icon-Komponente/Konstante im Frontend — **keine Icon-Bibliothek als Dependency**. Verbessert schnelle Orientierung und Verständlichkeit.

## Betroffene Dateien

**Neu:**
- `src/styles/tokens.css`, `src/styles/basis.css`, `src/styles/komponenten.css`
- ggf. `src/components/NavIcon.tsx` (oder Inline-SVGs direkt in `Layout.tsx`)

**Umgestellt (Styling/Markup-Klassen, keine Logik):**
- `src/App.css` → ausgemistet bzw. durch die neuen Imports ersetzt; `src/App.tsx`/`src/main.tsx` (Imports)
- `src/components/Layout.tsx` (Inline-Styles → Klassen, Nav-Icons)
- `src/components/Fehler.tsx` (Inline-`boxStyle` → `.fehler`-Klasse)
- Seiten: `Kunden.tsx`, `KundeDetail.tsx`, `Artikel.tsx`, `Angebote.tsx`, `Rechnungen.tsx`, `BelegEditor.tsx`, `Einstellungen.tsx`, `Einrichtung.tsx` — Klassen ergänzen, Rollen/Labels/`aria`-Attribute unverändert lassen.

## Tests

Styling wird nicht per Unit-Test geprüft. Maßgabe: **die bestehenden 36 Frontend-Tests müssen unverändert grün bleiben.** Sie prüfen Verhalten über zugängliche Rollen, sichtbare Texte und `invoke`-Aufrufe — beim Markup-Umbau bleiben `role`, `aria-label`, `aria-current`, Button-/Label-Texte und Formularstruktur erhalten, damit keine Query bricht. Keine neuen Tests.

**Visuelle Abnahme (manuell, dokumentiert):** Nach der Umstellung die App in `npm run tauri dev` starten und jede der acht Seiten in Hell **und** Dunkel (System-Umschaltung) durchsehen — Lesbarkeit, Kontrast, Status-Badges, Fokus-Ringe. Diese Abnahme macht der Auftraggeber.

## Barrierefreiheit

- Fokus-Ringe für Tastaturbedienung auf allen interaktiven Elementen (in `basis.css`, nicht wegoptimiert).
- Kontrastverhältnisse für Text/Status-Badges in beiden Modi mindestens WCAG-AA-tauglich; die oben gewählten Token-Paare sind darauf ausgelegt.
- Farbe ist nie der einzige Bedeutungsträger — Status trägt immer auch das Wort (z. B. „Bezahlt"), nicht nur die Farbe.
