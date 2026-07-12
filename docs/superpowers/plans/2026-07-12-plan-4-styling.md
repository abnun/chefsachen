# Plan 4: Styling & Erscheinungsbild — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App bekommt ein durchgängiges, ruhiges Erscheinungsbild (Stil „Ruhig & sachlich") mit Hell- und Dunkelmodus, ohne Logik-Änderungen und ohne neue Laufzeit-Abhängigkeiten.

**Architektur:** Ein Token-Layer (`tokens.css`, CSS Custom Properties, mit Dark-Mode-Override via `prefers-color-scheme`), eine Basis-Schicht (`basis.css`) und ein knapper Satz semantischer Komponenten-Klassen (`komponenten.css`). Bestehende Seiten werden **nicht umstrukturiert** — bestehende `<div>`/`<label>`-Wrapper um Formularfelder bekommen einfach `className="feld"`, bestehende `<table>`/`<button>`/`<form>` bekommen die passende Klasse. Das hält den Diff minimal und das Risiko, bestehende Tests (die über Rollen/Texte/`aria`-Attribute abfragen) zu brechen, gering.

**Tech Stack:** React 19, Vite, reines CSS (keine neue Dependency). Referenz: `docs/superpowers/specs/2026-07-12-styling-design.md`.

---

## Gemeinsame Referenz: Klassen-Vokabular

Diese Tabelle gilt für **alle** Tasks. Jede Klasse wird in Task 1–3 definiert; ab Task 4 wird sie nur noch angewendet.

| Klasse | Wofür | Auf welchem Element |
|---|---|---|
| `.seiten-kopf` | Seitentitel | `<h1>` |
| `.btn` | Sekundär-Button (Standard) | `<button>` |
| `.btn-primaer` | Primäraktion (Speichern, Anlegen, Hinzufügen) | `<button type="submit">` |
| `.btn-gefahr` | Gefährliche Aktion (Löschen, Stornieren) | `<button>` |
| `.btn-leise` | Nebenaktion ohne Rahmen (Export-Buttons, Zurück) | `<button>` |
| `.feld` | Wrapper um Label+Eingabe (Spalten-Layout) | vorhandenes `<div>` **oder** `<label>` |
| `.feld-checkbox` | Wrapper um Checkbox+Text (Zeilen-Layout) | vorhandenes `<label>` um `type="checkbox"` |
| `.feld-fehler` | Rote Feldmeldung | vorhandenes `<div role="alert">` |
| `.tabelle` | Standard-Tabelle | `<table>` |
| `.tabelle-klickbar` | zusätzlich auf `<table>`, wenn Zeilen klickbar sind (Cursor/Hover) | `<table>` |
| `.tabelle-num` | Nummernspalte (tabellarische Ziffern, gedämpft) | `<td>` mit Beleg-/Kundennummer |
| `.karte` | Umrandete Fläche (Formulare, Detail-Abschnitte) | `<form>` oder `<section>` |
| `.werkzeugleiste` | Horizontale Such-/Aktionszeile | neuer Wrapper-`<div>` um Suche+Button |
| `.status` + Modifier | Status-Badge | neues `<span>` statt reinem Text |

**Status-Modifier-Zuordnung** (vier Bedeutungs-Buckets, wiederverwendet über alle Status-Werte):

| Status-Wert (Angebot/Rechnung) | Modifier-Klasse |
|---|---|
| `entwurf`, `abgelaufen` | `.status-entwurf` (neutral) |
| `versendet`, `gestellt` | `.status-gestellt` (Info-Blau) |
| `angenommen` | `.status-bezahlt` (Erfolg-Grün) |
| `abgelehnt`, `storniert` | `.status-storniert` (Gefahr-Rot) |

---

### Task 1: Design-Tokens

**Files:**
- Create: `src/styles/tokens.css`

- [ ] **Step 1: Datei erstellen**

```css
:root {
  /* Farben — Hell */
  --bg: #f4f6f8;
  --bg-gedaempft: #f7f8fa;
  --flaeche: #ffffff;
  --flaeche-eingabe: #ffffff;
  --rand: #e3e6ec;
  --rand-stark: #d3d8e0;
  --text: #1c2230;
  --text-leise: #6b7280;
  --text-leiser: #8a92a3;
  --akzent: #33506b;
  --akzent-hover: #2b4459;
  --akzent-text: #ffffff;
  --akzent-leise: #e9ecf1;

  --st-entwurf-bg: #eef0f3;
  --st-entwurf-text: #5a6273;
  --st-gestellt-bg: #e4edf5;
  --st-gestellt-text: #2f5c86;
  --st-bezahlt-bg: #e6f4ec;
  --st-bezahlt-text: #1f7a52;
  --st-storniert-bg: #fdecea;
  --st-storniert-text: #a3231f;

  --fehler-bg: #fdecea;
  --fehler-text: #7a1212;
  --fehler-rand: #f5c2c0;

  /* Abstände */
  --abstand-xs: 4px;
  --abstand-s: 8px;
  --abstand-m: 12px;
  --abstand-l: 16px;
  --abstand-xl: 24px;

  /* Radien */
  --radius-s: 6px;
  --radius-m: 8px;
  --radius-pill: 999px;

  /* Schatten */
  --schatten: 0 1px 2px rgba(20, 24, 33, 0.06);

  /* Schrift */
  --schrift: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
  --text-s: 12px;
  --text-m: 14px;
  --text-l: 16px;
  --text-xl: 20px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16181d;
    --bg-gedaempft: #1b1e24;
    --flaeche: #21252c;
    --flaeche-eingabe: #1b1e24;
    --rand: #2e333c;
    --rand-stark: #3a414c;
    --text: #e6e8ec;
    --text-leise: #9aa2b0;
    --text-leiser: #838b99;
    --akzent: #4d7093;
    --akzent-hover: #5a80a4;
    --akzent-text: #ffffff;
    --akzent-leise: #26303a;

    --st-entwurf-bg: #262b33;
    --st-entwurf-text: #9aa2b0;
    --st-gestellt-bg: #1d2c3a;
    --st-gestellt-text: #83aed6;
    --st-bezahlt-bg: #163a2a;
    --st-bezahlt-text: #6ed3a0;
    --st-storniert-bg: #3a1e1c;
    --st-storniert-text: #ef8f8a;

    --fehler-bg: #2c1a1a;
    --fehler-text: #ef9a95;
    --fehler-rand: #4a2c2a;

    --schatten: 0 1px 3px rgba(0, 0, 0, 0.4);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/tokens.css
git commit -m "feat: Design-Tokens für Hell-/Dunkelmodus"
```

---

### Task 2: Basis-Styles

**Files:**
- Create: `src/styles/basis.css`

- [ ] **Step 1: `src/styles/basis.css` erstellen**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--schrift);
  font-size: var(--text-m);
  line-height: 1.5;
  color: var(--text);
  background-color: var(--bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1 {
  font-size: var(--text-xl);
  font-weight: 600;
  margin: 0 0 var(--abstand-l);
}

h2 {
  font-size: var(--text-l);
  font-weight: 600;
  margin: var(--abstand-xl) 0 var(--abstand-m);
}

h3 {
  font-size: var(--text-m);
  font-weight: 600;
  margin: var(--abstand-l) 0 var(--abstand-s);
}

a {
  color: var(--akzent);
}

input,
select,
textarea {
  font-family: inherit;
  font-size: var(--text-m);
  color: var(--text);
  background-color: var(--flaeche-eingabe);
  border: 1px solid var(--rand-stark);
  border-radius: var(--radius-s);
  padding: 6px 10px;
}

textarea {
  min-height: 4.5em;
  resize: vertical;
}

button {
  font-family: inherit;
  cursor: pointer;
}

table {
  font-size: var(--text-m);
}

:focus-visible {
  outline: 2px solid var(--akzent);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test`
Erwartet: weiterhin alle Tests grün (neue, noch nicht importierte Datei — keine Komponente betroffen).

- [ ] **Step 3: Commit**

```bash
git add src/styles/basis.css
git commit -m "feat: Basis-Styles (Typografie, Formularelemente, Fokus-Ringe)"
```

---

### Task 3: Komponenten-Klassen

**Files:**
- Create: `src/styles/komponenten.css`

- [ ] **Step 1: Datei erstellen**

```css
/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-s);
  border: 1px solid var(--rand-stark);
  background: var(--flaeche);
  color: var(--text);
  font-size: var(--text-m);
  font-weight: 500;
  box-shadow: var(--schatten);
}

.btn:hover {
  border-color: var(--akzent);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primaer {
  background: var(--akzent);
  border-color: var(--akzent);
  color: var(--akzent-text);
}

.btn-primaer:hover {
  background: var(--akzent-hover);
  border-color: var(--akzent-hover);
}

.btn-gefahr {
  background: var(--flaeche);
  border-color: var(--st-storniert-bg);
  color: var(--st-storniert-text);
}

.btn-gefahr:hover {
  border-color: var(--st-storniert-text);
}

.btn-leise {
  background: transparent;
  border-color: transparent;
  color: var(--akzent);
  box-shadow: none;
}

.btn-leise:hover {
  background: var(--akzent-leise);
}

.btn[aria-current="page"] {
  background: var(--akzent-leise);
  border-color: var(--akzent);
  color: var(--akzent);
  font-weight: 600;
}

/* Seitenkopf */
.seiten-kopf {
  display: flex;
  align-items: baseline;
  gap: var(--abstand-s);
}

.seiten-kopf small {
  font-size: var(--text-s);
  font-weight: 400;
  color: var(--text-leise);
}

/* Formularfelder */
.feld,
label.feld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: var(--abstand-m);
}

.feld > label {
  font-size: var(--text-s);
  font-weight: 500;
  color: var(--text-leise);
}

label.feld {
  font-size: var(--text-s);
  font-weight: 500;
  color: var(--text-leise);
}

.feld input,
.feld select,
.feld textarea,
label.feld input,
label.feld select,
label.feld textarea {
  font-size: var(--text-m);
  font-weight: 400;
  color: var(--text);
}

.feld-checkbox {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--abstand-s);
  margin-bottom: var(--abstand-m);
  font-size: var(--text-m);
  font-weight: 400;
  color: var(--text);
}

.feld-checkbox input {
  width: auto;
}

.feld-fehler {
  color: var(--fehler-text);
  font-size: var(--text-s);
  margin: -6px 0 var(--abstand-m);
}

/* Tabellen */
.tabelle {
  width: 100%;
  border-collapse: collapse;
  background: var(--flaeche);
  border: 1px solid var(--rand);
  border-radius: var(--radius-m);
  overflow: hidden;
}

.tabelle th {
  text-align: left;
  font-size: var(--text-s);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-leiser);
  padding: var(--abstand-s) var(--abstand-m);
  background: var(--bg-gedaempft);
  border-bottom: 1px solid var(--rand);
}

.tabelle td {
  padding: var(--abstand-s) var(--abstand-m);
  border-bottom: 1px solid var(--rand);
}

.tabelle tbody tr:last-child td {
  border-bottom: none;
}

.tabelle tbody tr:hover {
  background: var(--bg-gedaempft);
}

.tabelle-klickbar tbody tr {
  cursor: pointer;
}

.tabelle-num {
  color: var(--text-leiser);
  font-variant-numeric: tabular-nums;
}

/* Karte */
.karte {
  background: var(--flaeche);
  border: 1px solid var(--rand);
  border-radius: var(--radius-m);
  padding: var(--abstand-l);
  margin-bottom: var(--abstand-l);
}

/* Werkzeugleiste */
.werkzeugleiste {
  display: flex;
  gap: var(--abstand-s);
  margin-bottom: var(--abstand-m);
}

.werkzeugleiste input[type="search"] {
  flex: 1;
}

.werkzeugleiste .feld {
  margin-bottom: 0;
}

/* Fehler-Box */
.fehler-box {
  background: var(--fehler-bg);
  color: var(--fehler-text);
  border: 1px solid var(--fehler-rand);
  border-radius: var(--radius-m);
  padding: var(--abstand-m) var(--abstand-l);
  margin-bottom: var(--abstand-l);
}

.fehler-box p {
  margin: 0;
}

/* Status-Badges */
.status {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--text-s);
  font-weight: 600;
}

.status-entwurf {
  background: var(--st-entwurf-bg);
  color: var(--st-entwurf-text);
}

.status-gestellt {
  background: var(--st-gestellt-bg);
  color: var(--st-gestellt-text);
}

.status-bezahlt {
  background: var(--st-bezahlt-bg);
  color: var(--st-bezahlt-text);
}

.status-storniert {
  background: var(--st-storniert-bg);
  color: var(--st-storniert-text);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/komponenten.css
git commit -m "feat: Komponenten-Klassen (Buttons, Felder, Tabellen, Status-Badges)"
```

---

### Task 4: App-Einstieg & Fehler-Komponente

**Files:**
- Modify: `src/App.tsx:12` (Import)
- Modify: `src/components/Fehler.tsx`

- [ ] **Step 1: Imports in `App.tsx` umstellen**

Vorher (`src/App.tsx:12`):
```tsx
import "./App.css";
```

Nachher:
```tsx
import "./styles/tokens.css";
import "./styles/basis.css";
import "./styles/komponenten.css";
```

- [ ] **Step 2: `src/App.css` löschen**

```bash
git rm src/App.css
```

- [ ] **Step 3: `Fehler.tsx` umstellen**

Vorher (`src/components/Fehler.tsx`):
```tsx
import type { AppFehler } from "../api";

interface FehlerProps {
  fehler: AppFehler | null;
}

const boxStyle: React.CSSProperties = {
  color: "#7a1212",
  background: "#fdecea",
  border: "1px solid #f5c2c0",
  borderRadius: "4px",
  padding: "0.75rem 1rem",
  margin: "0.5rem 0",
};

/**
 * Zeigt einen AppFehler als rote Meldung an. Rendert nichts, wenn `fehler`
 * null ist. Die Platzierung neben dem betroffenen Formularfeld bei
 * Validierungsfehlern ist Aufgabe des aufrufenden Formulars — diese
 * Komponente stellt nur die Meldung selbst dar.
 */
export function Fehler({ fehler }: FehlerProps) {
  if (fehler === null) {
    return null;
  }

  if (fehler.typ === "technisch") {
    return (
      <div style={boxStyle} role="alert">
        <p>Ein technischer Fehler ist aufgetreten</p>
        <details>
          <summary>Details</summary>
          <pre>{fehler.meldung}</pre>
        </details>
      </div>
    );
  }

  // validation und nicht_gefunden: Meldung direkt anzeigen
  return (
    <div style={boxStyle} role="alert">
      {fehler.meldung}
    </div>
  );
}
```

Nachher:
```tsx
import type { AppFehler } from "../api";

interface FehlerProps {
  fehler: AppFehler | null;
}

/**
 * Zeigt einen AppFehler als rote Meldung an. Rendert nichts, wenn `fehler`
 * null ist. Die Platzierung neben dem betroffenen Formularfeld bei
 * Validierungsfehlern ist Aufgabe des aufrufenden Formulars — diese
 * Komponente stellt nur die Meldung selbst dar.
 */
export function Fehler({ fehler }: FehlerProps) {
  if (fehler === null) {
    return null;
  }

  if (fehler.typ === "technisch") {
    return (
      <div className="fehler-box" role="alert">
        <p>Ein technischer Fehler ist aufgetreten</p>
        <details>
          <summary>Details</summary>
          <pre>{fehler.meldung}</pre>
        </details>
      </div>
    );
  }

  // validation und nicht_gefunden: Meldung direkt anzeigen
  return (
    <div className="fehler-box" role="alert">
      {fehler.meldung}
    </div>
  );
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test`
Erwartet: alle Tests grün (Fehler-Komponente behält `role="alert"` und Textinhalt bei — die Tests fragen darüber ab, nicht über Inline-Styles).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Fehler.tsx
git commit -m "feat: App-Einstieg auf neues Stylesheet umstellen, Fehler-Box stylen"
```

(Der `git rm src/App.css` aus Step 2 ist Teil desselben Commits, da er bereits im Index steht.)

---

### Task 5: Layout & Navigation (inkl. Icons)

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: `Layout.tsx` komplett ersetzen**

```tsx
import type { ReactNode } from "react";
import { t } from "../i18n";

export type Seite = "kunden" | "artikel" | "angebote" | "rechnungen" | "einstellungen";

interface NavEintrag {
  seite: Seite;
  label: string;
  icon: ReactNode;
}

const ICON_KUNDEN = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="10" cy="6.5" r="3.2" />
    <path d="M3.5 17c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" strokeLinecap="round" />
  </svg>
);

const ICON_ARTIKEL = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 6.5 10 3l6 3.5v7L10 17l-6-3.5z" strokeLinejoin="round" />
    <path d="M4 6.5 10 10l6-3.5M10 10v7" strokeLinejoin="round" />
  </svg>
);

const ICON_ANGEBOTE = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
    <path d="M12 3v3h3" strokeLinejoin="round" />
    <path d="M7.5 11h5M7.5 13.5h5" strokeLinecap="round" />
  </svg>
);

const ICON_RECHNUNGEN = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
    <path d="M12 3v3h3" strokeLinejoin="round" />
    <path d="M7.5 11.5h5M7.5 14h3" strokeLinecap="round" />
    <circle cx="14.5" cy="14.5" r="0.4" fill="currentColor" stroke="none" />
  </svg>
);

const ICON_EINSTELLUNGEN = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 3.5v2M10 14.5v2M16.5 10h-2M5.5 10h-2M14.9 5.1l-1.4 1.4M6.5 13.5l-1.4 1.4M14.9 14.9l-1.4-1.4M6.5 6.5 5.1 5.1" strokeLinecap="round" />
  </svg>
);

const NAV_EINTRAEGE: NavEintrag[] = [
  { seite: "kunden", label: t("nav.kunden"), icon: ICON_KUNDEN },
  { seite: "artikel", label: t("nav.artikel"), icon: ICON_ARTIKEL },
  { seite: "angebote", label: t("nav.angebote"), icon: ICON_ANGEBOTE },
  { seite: "rechnungen", label: t("nav.rechnungen"), icon: ICON_RECHNUNGEN },
  { seite: "einstellungen", label: t("nav.einstellungen"), icon: ICON_EINSTELLUNGEN },
];

interface LayoutProps {
  aktiveSeite: Seite;
  onNavigiere: (seite: Seite) => void;
  children: ReactNode;
}

/**
 * App-Layout mit fester linker Navigation und Content-Bereich. Kontrolliert
 * durch die Eltern-Komponente (App.tsx hält den Routing-State via useState) —
 * kein eigener Router, da bei fünf Seiten nicht nötig.
 */
export function Layout({ aktiveSeite, onNavigiere, children }: LayoutProps) {
  return (
    <div className="app-layout">
      <nav className="app-nav">
        <ul className="app-nav-liste">
          {NAV_EINTRAEGE.map(({ seite, label, icon }) => (
            <li key={seite}>
              <button
                type="button"
                onClick={() => onNavigiere(seite)}
                aria-current={aktiveSeite === seite ? "page" : undefined}
                className="app-nav-eintrag"
              >
                <span className="app-nav-icon">{icon}</span>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Layout-Klassen zu `komponenten.css` hinzufügen**

An `src/styles/komponenten.css` anhängen:

```css
/* Layout */
.app-layout {
  display: flex;
  min-height: 100vh;
}

.app-nav {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-gedaempft);
  border-right: 1px solid var(--rand);
  padding: var(--abstand-l) 0;
}

.app-nav-liste {
  list-style: none;
  margin: 0;
  padding: 0;
}

.app-nav-eintrag {
  display: flex;
  align-items: center;
  gap: var(--abstand-s);
  width: calc(100% - 16px);
  margin: 2px var(--abstand-s);
  text-align: left;
  padding: var(--abstand-s) var(--abstand-m);
  border: none;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--text-leise);
  font-size: var(--text-m);
  font-weight: 400;
  box-shadow: none;
}

.app-nav-eintrag:hover {
  background: var(--rand);
  border-color: transparent;
  color: var(--text);
}

.app-nav-eintrag[aria-current="page"] {
  background: var(--akzent-leise);
  color: var(--akzent);
  font-weight: 600;
}

.app-nav-icon {
  display: inline-flex;
  flex-shrink: 0;
}

.app-main {
  flex: 1;
  padding: var(--abstand-xl);
  max-width: 960px;
}
```

- [ ] **Step 3: Tests laufen lassen**

Run: `npm test`
Erwartet: alle Tests grün — `aria-current="page"` bleibt erhalten, Button-Texte (`Kunden`, `Artikel`, …) bleiben als sichtbarer Text im Button (Icon ist ein zusätzliches `<span>`, kein Ersatz).

- [ ] **Step 4: Commit**

```bash
git add src/components/Layout.tsx src/styles/komponenten.css
git commit -m "feat: Layout stylen, Navigations-Icons ergänzen"
```

---

### Task 6: Seite Kunden

**Files:**
- Modify: `src/pages/Kunden.tsx`

- [ ] **Step 1: Änderungen anwenden**

Vorher:
```tsx
    <div>
      <h1>Kunden</h1>
      <Fehler fehler={fehler} />

      <input
        type="search"
        placeholder="Suche…"
        value={suche}
        onChange={(e) => setSuche(e.currentTarget.value)}
        aria-label="Kunden suchen"
      />
      <button type="button" onClick={() => setZeigeFormular((v) => !v)}>
        Neuer Kunde
      </button>

      {zeigeFormular && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && !istValidierungsfehler(formFehler) && <Fehler fehler={formFehler} />}
          <div>
            <label>
              Typ
              <select
                value={neuerKunde.typ}
                onChange={(e) =>
                  setNeuerKunde({ ...neuerKunde, typ: e.currentTarget.value as "firma" | "privat" })
                }
              >
                <option value="firma">Firma</option>
                <option value="privat">Privat</option>
              </select>
            </label>
          </div>
          <div>
            <label>
              Name
              <input
                value={neuerKunde.name}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, name: e.currentTarget.value })}
              />
            </label>
            {feldFehler("name") && <div role="alert">{feldFehler("name")}</div>}
          </div>
```

Nachher:
```tsx
    <div>
      <h1 className="seiten-kopf">Kunden</h1>
      <Fehler fehler={fehler} />

      <div className="werkzeugleiste">
        <input
          type="search"
          placeholder="Suche…"
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          aria-label="Kunden suchen"
        />
        <button type="button" className="btn btn-primaer" onClick={() => setZeigeFormular((v) => !v)}>
          Neuer Kunde
        </button>
      </div>

      {zeigeFormular && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && !istValidierungsfehler(formFehler) && <Fehler fehler={formFehler} />}
          <div className="feld">
            <label>
              Typ
              <select
                value={neuerKunde.typ}
                onChange={(e) =>
                  setNeuerKunde({ ...neuerKunde, typ: e.currentTarget.value as "firma" | "privat" })
                }
              >
                <option value="firma">Firma</option>
                <option value="privat">Privat</option>
              </select>
            </label>
          </div>
          <div className="feld">
            <label>
              Name
              <input
                value={neuerKunde.name}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, name: e.currentTarget.value })}
              />
            </label>
            {feldFehler("name") && <div className="feld-fehler" role="alert">{feldFehler("name")}</div>}
          </div>
```

Jedes weitere umschließende `<div>` im Formular bekommt ebenso `className="feld"` — konkret die `<div>`-Wrapper um: `Zahlungsziel (Tage)` (kein `feldFehler`-Aufruf), `Notizen` (Textarea, kein `feldFehler`-Aufruf), `USt-IdNr.` (hat `feldFehler("ust_idnr")` — dessen `<div role="alert">` bekommt zusätzlich `className="feld-fehler"`, analog zum Name-Feld), `E-Mail` (hat `feldFehler("email")` — ebenso `className="feld-fehler"` auf dessen `<div role="alert">`), `Leitweg-ID` (kein `feldFehler`-Aufruf), `Käuferreferenz` (kein `feldFehler`-Aufruf). Kein Feld wird umstrukturiert — es wird ausschließlich `className="feld"` auf das jeweils schon vorhandene `<div>` gesetzt.

Der Submit-Button:

Vorher:
```tsx
          <button type="submit">Speichern</button>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Name</th>
            <th>Typ</th>
          </tr>
        </thead>
        <tbody>
          {kunden.map((kunde) => (
            <tr key={kunde.id} onClick={() => onOeffnen(kunde.id)} style={{ cursor: "pointer" }}>
              <td>{kunde.kundennummer}</td>
              <td>{kunde.name}</td>
              <td>{kunde.typ}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
```

Nachher:
```tsx
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      )}

      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Name</th>
            <th>Typ</th>
          </tr>
        </thead>
        <tbody>
          {kunden.map((kunde) => (
            <tr key={kunde.id} onClick={() => onOeffnen(kunde.id)}>
              <td className="tabelle-num">{kunde.kundennummer}</td>
              <td>{kunde.name}</td>
              <td>{kunde.typ}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
```

(Das `style={{ cursor: "pointer" }}` entfällt — `.tabelle-klickbar` übernimmt das per CSS.)

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- Kunden`
Erwartet: PASS — `Kunden.test.tsx` fragt über `role`/Label-Text ab, nicht über Klassen oder Inline-Styles.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Kunden.tsx
git commit -m "feat: Kunden-Seite stylen"
```

---

### Task 7: Seite KundeDetail

**Files:**
- Modify: `src/pages/KundeDetail.tsx`

- [ ] **Step 1: Kopf und Reiter-Navigation**

Vorher:
```tsx
  return (
    <div>
      <h1>
        {detail.kunde.name} <small>{detail.kunde.kundennummer}</small>
      </h1>
      {fehler && <Fehler fehler={fehler} />}

      <nav>
        {REITER.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={!r.aktiv}
            aria-current={reiter === r.id ? "page" : undefined}
            onClick={() => r.aktiv && setReiter(r.id)}
          >
            {r.label}
          </button>
        ))}
      </nav>
```

Nachher:
```tsx
  return (
    <div>
      <h1 className="seiten-kopf">
        {detail.kunde.name} <small>{detail.kunde.kundennummer}</small>
      </h1>
      {fehler && <Fehler fehler={fehler} />}

      <nav className="werkzeugleiste">
        {REITER.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={!r.aktiv}
            aria-current={reiter === r.id ? "page" : undefined}
            onClick={() => r.aktiv && setReiter(r.id)}
            className="btn"
          >
            {r.label}
          </button>
        ))}
      </nav>
```

- [ ] **Step 2: `BelegeReiter` — Tabelle mit Status-Badge**

Vorher:
```tsx
  return (
    <section>
      <h2>Belege</h2>
      {fehler && <Fehler fehler={fehler} />}
      <table>
        <thead>
          <tr>
            <th>Typ</th>
            <th>Nummer</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {belege.map((b) => (
            <tr key={b.id}>
              <td>{b.typ === "angebot" ? "Angebot" : "Rechnung"}</td>
              <td>{b.nummer ?? "Entwurf"}</td>
              <td>{b.datum}</td>
              <td>{b.status}</td>
              <td>{formatCent(b.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

Nachher:
```tsx
  return (
    <section>
      <h2>Belege</h2>
      {fehler && <Fehler fehler={fehler} />}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Typ</th>
            <th>Nummer</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {belege.map((b) => (
            <tr key={b.id}>
              <td>{b.typ === "angebot" ? "Angebot" : "Rechnung"}</td>
              <td className="tabelle-num">{b.nummer ?? "Entwurf"}</td>
              <td>{b.datum}</td>
              <td>
                <span className={`status ${STATUS_BADGE_KLASSE[b.status] ?? "status-entwurf"}`}>{b.status}</span>
              </td>
              <td>{formatCent(b.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const STATUS_BADGE_KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  abgelaufen: "status-entwurf",
  versendet: "status-gestellt",
  gestellt: "status-gestellt",
  angenommen: "status-bezahlt",
  abgelehnt: "status-storniert",
  storniert: "status-storniert",
};
```

- [ ] **Step 3: `StammdatenReiter` — Formular**

Vorher:
```tsx
  return (
    <section>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {gespeichert && <p>Gespeichert.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div>
          <label>
            Typ
```

Nachher:
```tsx
  return (
    <section>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {gespeichert && <p>Gespeichert.</p>}
      <form
        className="karte"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="feld">
          <label>
            Typ
```

Alle weiteren `<div>`-Wrapper in `StammdatenReiter` (Name, Zahlungsziel, Notizen, USt-IdNr., E-Mail, Leitweg-ID, Käuferreferenz) bekommen ebenso `className="feld"`; jedes `<div role="alert">{feldFehler(...)}</div>` bekommt zusätzlich `className="feld-fehler"`. Der Submit-Button am Ende:

Vorher: `<button type="submit">Speichern</button>`
Nachher: `<button type="submit" className="btn btn-primaer">Speichern</button>`

- [ ] **Step 4: `AdressenReiter` — Tabelle und Formular**

Vorher:
```tsx
  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      <table>
        <thead>
          <tr>
            <th>Typ</th>
            <th>Straße</th>
            <th>PLZ</th>
            <th>Ort</th>
            <th>Land</th>
            <th>Standard</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {adressen.map((a) => (
            <tr key={a.id}>
              <td>{a.typ}</td>
              <td>{a.strasse}</td>
              <td>{a.plz}</td>
              <td>{a.ort}</td>
              <td>{a.land}</td>
              <td>{a.ist_standard ? "Ja" : "Nein"}</td>
              <td>
                <button type="button" onClick={() => setForm(a)}>
                  Bearbeiten
                </button>
                <button type="button" onClick={() => loeschen(a.id)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label>
          Typ
```

Nachher:
```tsx
  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Typ</th>
            <th>Straße</th>
            <th>PLZ</th>
            <th>Ort</th>
            <th>Land</th>
            <th>Standard</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {adressen.map((a) => (
            <tr key={a.id}>
              <td>{a.typ}</td>
              <td>{a.strasse}</td>
              <td>{a.plz}</td>
              <td>{a.ort}</td>
              <td>{a.land}</td>
              <td>{a.ist_standard ? "Ja" : "Nein"}</td>
              <td>
                <button type="button" className="btn" onClick={() => setForm(a)}>
                  Bearbeiten
                </button>
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(a.id)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="karte"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label className="feld">
          Typ
```

**Wichtig:** Bei `AdressenReiter` und `AnsprechpartnerReiter` sind die Formularfelder als bare `<label>Text<input/></label>` ohne umschließendes `<div>` geschrieben (anders als bei `Kunden.tsx`/`StammdatenReiter`). Hier `className="feld"` **direkt auf jedes `<label>`** setzen (nicht extra einpacken), außer beim Checkbox-Feld (`Standardadresse`) — dort `className="feld-checkbox"` auf das `<label>` setzen. Das Typ-Select oben ist bereits so umgesetzt (`<label className="feld">`, kein zusätzlicher `<div>`-Wrapper, `</label>` bleibt als Abschluss stehen). Beispiel für das Straße-Feld:

Vorher:
```tsx
        <label>
          Straße
          <input value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.currentTarget.value })} />
        </label>
```

Nachher:
```tsx
        <label className="feld">
          Straße
          <input value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.currentTarget.value })} />
        </label>
```

Ebenso für PLZ, Ort, Land. Das Checkbox-Feld:

Vorher:
```tsx
        <label>
          <input
            type="checkbox"
            checked={form.ist_standard}
            onChange={(e) => setForm({ ...form, ist_standard: e.currentTarget.checked })}
          />
          Standardadresse
        </label>
        <button type="submit">{form.id ? "Aktualisieren" : "Hinzufügen"}</button>
```

Nachher:
```tsx
        <label className="feld-checkbox">
          <input
            type="checkbox"
            checked={form.ist_standard}
            onChange={(e) => setForm({ ...form, ist_standard: e.currentTarget.checked })}
          />
          Standardadresse
        </label>
        <button type="submit" className="btn btn-primaer">{form.id ? "Aktualisieren" : "Hinzufügen"}</button>
```

- [ ] **Step 5: `AnsprechpartnerReiter` — Tabelle und Formular**

Gleiches Muster wie Step 4 (Adressen): `<table>` → `className="tabelle"`, „Bearbeiten"-Button → `className="btn"`, „Löschen"-Button → `className="btn btn-gefahr"`, `<form>` → `className="karte"`, jedes bare `<label>` (Name, Rolle, E-Mail, Telefon) → `className="feld"`, das Checkbox-Label (Standard-Ansprechpartner) → `className="feld-checkbox"`, Submit-Button → `className="btn btn-primaer"`.

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test -- KundeDetail`
Erwartet: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/KundeDetail.tsx
git commit -m "feat: KundeDetail-Seite stylen (Reiter, Formulare, Belege-Status)"
```

---

### Task 8: Seite Artikel

**Files:**
- Modify: `src/pages/Artikel.tsx`

- [ ] **Step 1: Kopf, Button, Formular**

Vorher:
```tsx
  return (
    <div>
      <h1>Artikel & Leistungen</h1>
      <Fehler fehler={fehler} />

      <button type="button" onClick={neuFormular}>
        Neuer Artikel
      </button>

      {zeigeFormular && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          {formFehler && !istValidierungsfehler(formFehler) && <Fehler fehler={formFehler} />}
          <div>
            <label>
              Bezeichnung
              <input
                value={form.bezeichnung}
                onChange={(e) => setForm({ ...form, bezeichnung: e.currentTarget.value })}
              />
            </label>
            {feldFehler("bezeichnung") && <div role="alert">{feldFehler("bezeichnung")}</div>}
          </div>
```

Nachher:
```tsx
  return (
    <div>
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />

      <button type="button" className="btn btn-primaer" onClick={neuFormular}>
        Neuer Artikel
      </button>

      {zeigeFormular && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          {formFehler && !istValidierungsfehler(formFehler) && <Fehler fehler={formFehler} />}
          <div className="feld">
            <label>
              Bezeichnung
              <input
                value={form.bezeichnung}
                onChange={(e) => setForm({ ...form, bezeichnung: e.currentTarget.value })}
              />
            </label>
            {feldFehler("bezeichnung") && <div className="feld-fehler" role="alert">{feldFehler("bezeichnung")}</div>}
          </div>
```

Die übrigen `<div>`-Wrapper im Formular (Beschreibung, Einheit, Standardpreis) bekommen ebenso `className="feld"`; das `<div role="alert">{preisFehlerText}</div>` bekommt zusätzlich `className="feld-fehler"`.

- [ ] **Step 2: Submit-Button und Tabelle**

Vorher:
```tsx
          <button type="submit">Speichern</button>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Bezeichnung</th>
            <th>Einheit</th>
            <th>Preis</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {artikel.map((a) => (
            <Fragment key={a.id}>
              <tr>
                <td>{a.artikelnummer}</td>
                <td>{a.bezeichnung}</td>
                <td>{einheitKuerzel(a.einheit_id)}</td>
                <td>{formatCent(a.standardpreis_cent)}</td>
                <td>
                  <button type="button" onClick={() => bearbeiten(a)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => setAufgeklappt(aufgeklappt === a.id ? null : a.id)}
                  >
                    Kundenpreise
                  </button>
                </td>
              </tr>
```

Nachher:
```tsx
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      )}

      <table className="tabelle">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Bezeichnung</th>
            <th>Einheit</th>
            <th>Preis</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {artikel.map((a) => (
            <Fragment key={a.id}>
              <tr>
                <td className="tabelle-num">{a.artikelnummer}</td>
                <td>{a.bezeichnung}</td>
                <td>{einheitKuerzel(a.einheit_id)}</td>
                <td>{formatCent(a.standardpreis_cent)}</td>
                <td>
                  <button type="button" className="btn" onClick={() => bearbeiten(a)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn btn-leise"
                    onClick={() => setAufgeklappt(aufgeklappt === a.id ? null : a.id)}
                  >
                    Kundenpreise
                  </button>
                </td>
              </tr>
```

- [ ] **Step 3: `KundenpreiseBereich`**

Vorher:
```tsx
  return (
    <div>
      <h3>Kundenpreise</h3>
      <Fehler fehler={fehler} />
      <table>
        <thead>
          <tr>
            <th>Kunde</th>
            <th>Preis</th>
            <th>Gültig ab</th>
          </tr>
        </thead>
        <tbody>
          {kundenpreise.map((kp) => (
            <tr key={kp.id}>
              <td>{kundeName(kp.kunde_id)}</td>
              <td>{formatCent(kp.preis_cent)}</td>
              <td>{kp.gueltig_ab ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label>
          Kunde
          <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
            <option value="">–</option>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Preis (€)
          <input value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
        </label>
        {preisFehlerText && <div role="alert">{preisFehlerText}</div>}
        <label>
          Gültig ab
          <input type="date" value={gueltigAb} onChange={(e) => setGueltigAb(e.currentTarget.value)} />
        </label>
        <button type="submit">Speichern</button>
      </form>
    </div>
  );
}
```

Nachher:
```tsx
  return (
    <div className="karte">
      <h3>Kundenpreise</h3>
      <Fehler fehler={fehler} />
      <table className="tabelle">
        <thead>
          <tr>
            <th>Kunde</th>
            <th>Preis</th>
            <th>Gültig ab</th>
          </tr>
        </thead>
        <tbody>
          {kundenpreise.map((kp) => (
            <tr key={kp.id}>
              <td>{kundeName(kp.kunde_id)}</td>
              <td>{formatCent(kp.preis_cent)}</td>
              <td>{kp.gueltig_ab ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label className="feld">
          Kunde
          <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
            <option value="">–</option>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="feld">
          Preis (€)
          <input value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
        </label>
        {preisFehlerText && <div className="feld-fehler" role="alert">{preisFehlerText}</div>}
        <label className="feld">
          Gültig ab
          <input type="date" value={gueltigAb} onChange={(e) => setGueltigAb(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">Speichern</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Artikel.tsx
git commit -m "feat: Artikel-Seite stylen"
```

---

### Task 9: Seiten Angebote & Rechnungen

**Files:**
- Modify: `src/pages/Angebote.tsx`
- Modify: `src/pages/Rechnungen.tsx`

Beide Dateien sind strukturell identisch (Liste + Anlegen-Formular); dieselben Änderungen werden auf beide angewendet, mit `Angebote`/`Angebot`/`angebote` durch `Rechnungen`/`Rechnung`/`rechnungen` ersetzt.

- [ ] **Step 1: `Angebote.tsx` — Status-Klassen-Konstante ergänzen**

Vorher:
```tsx
const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  versendet: "Versendet",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  abgelaufen: "Abgelaufen",
};
```

Nachher:
```tsx
const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  versendet: "Versendet",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  abgelaufen: "Abgelaufen",
};

const STATUS_KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  abgelaufen: "status-entwurf",
  versendet: "status-gestellt",
  angenommen: "status-bezahlt",
  abgelehnt: "status-storniert",
};
```

- [ ] **Step 2: `Angebote.tsx` — Kopf, Filter, Tabelle, Formular**

Vorher:
```tsx
  return (
    <div>
      <h1>Angebote</h1>
      {fehler && <Fehler fehler={fehler} />}
      <label>
        Status
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
          <option value="">Alle</option>
          {Object.entries(STATUS_LABEL).map(([wert, label]) => (
            <option key={wert} value={wert}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <table>
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {angebote.map((a) => (
            <tr key={a.id} onClick={() => onOeffnen(a.id)} style={{ cursor: "pointer" }}>
              <td>{a.nummer ?? "Entwurf"}</td>
              <td>{kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id}</td>
              <td>{a.datum}</td>
              <td>{STATUS_LABEL[a.status] ?? a.status}</td>
              <td>{formatCent(a.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {zeigeFormular ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && <Fehler fehler={formFehler} />}
          <label>
            Kunde
            <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
              <option value="">– wählen –</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
          </label>
          <button type="submit">Anlegen</button>
        </form>
      ) : (
        <button type="button" onClick={() => setZeigeFormular(true)}>
          Neues Angebot
        </button>
      )}
    </div>
  );
}
```

Nachher:
```tsx
  return (
    <div>
      <h1 className="seiten-kopf">Angebote</h1>
      {fehler && <Fehler fehler={fehler} />}
      <div className="werkzeugleiste">
        <label className="feld">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
            <option value="">Alle</option>
            {Object.entries(STATUS_LABEL).map(([wert, label]) => (
              <option key={wert} value={wert}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {angebote.map((a) => (
            <tr key={a.id} onClick={() => onOeffnen(a.id)}>
              <td className="tabelle-num">{a.nummer ?? "Entwurf"}</td>
              <td>{kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id}</td>
              <td>{a.datum}</td>
              <td>
                <span className={`status ${STATUS_KLASSE[a.status] ?? "status-entwurf"}`}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </td>
              <td>{formatCent(a.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {zeigeFormular ? (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && <Fehler fehler={formFehler} />}
          <label className="feld">
            Kunde
            <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
              <option value="">– wählen –</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="feld">
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
          </label>
          <button type="submit" className="btn btn-primaer">Anlegen</button>
        </form>
      ) : (
        <button type="button" className="btn btn-primaer" onClick={() => setZeigeFormular(true)}>
          Neues Angebot
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `Rechnungen.tsx` — dieselben Änderungen**

Dieselben Ersetzungen wie Step 1–2, mit folgenden Anpassungen für dieses Dateipaar:
- Status-Konstante:
```tsx
const STATUS_KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  gestellt: "status-gestellt",
  storniert: "status-storniert",
};
```
- `<h1>Rechnungen</h1>` → `<h1 className="seiten-kopf">Rechnungen</h1>`
- `Neue Rechnung`-Button statt `Neues Angebot`
- Variable `rechnungen` statt `angebote`, `r` statt `a` als Map-Parameter (wie im Original) — sonst identisches Muster (Werkzeugleiste um Statusfilter, `tabelle tabelle-klickbar`, `tabelle-num` auf Nummernspalte, Status-Badge-`<span>`, `karte` auf Formular, `feld` auf beide Labels, `btn btn-primaer` auf beide Buttons).

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- Angebote`
Run: `npm test -- Rechnungen`
Erwartet: beide PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Angebote.tsx src/pages/Rechnungen.tsx
git commit -m "feat: Angebote- und Rechnungen-Seite stylen (inkl. Status-Badges)"
```

---

### Task 10: Seite BelegEditor

**Files:**
- Modify: `src/pages/BelegEditor.tsx`

- [ ] **Step 1: Hauptkomponente — Kopf, Status, Export-/Aktions-Buttons**

Vorher:
```tsx
  return (
    <main>
      <h1>
        {beleg.typ === "angebot" ? "Angebot" : "Rechnung"} {beleg.nummer ?? "(Entwurf)"}
      </h1>
      <p>Status: {beleg.status}</p>
      {fehler && <Fehler fehler={fehler} />}
```

Nachher:
```tsx
  return (
    <main>
      <h1 className="seiten-kopf">
        {beleg.typ === "angebot" ? "Angebot" : "Rechnung"} {beleg.nummer ?? "(Entwurf)"}
      </h1>
      <p>
        Status:{" "}
        <span className={`status ${BELEGEDITOR_STATUS_KLASSE[beleg.status] ?? "status-entwurf"}`}>
          {beleg.status}
        </span>
      </p>
      {fehler && <Fehler fehler={fehler} />}
```

Direkt vor der `export function BelegEditor` ergänzen (nach den bestehenden `ANGEBOT_ABSCHLUSS_STATUS`):

Vorher:
```tsx
const ANGEBOT_ABSCHLUSS_STATUS = [
  { wert: "angenommen", label: "Angenommen" },
  { wert: "abgelehnt", label: "Abgelehnt" },
  { wert: "abgelaufen", label: "Abgelaufen" },
];
```

Nachher:
```tsx
const ANGEBOT_ABSCHLUSS_STATUS = [
  { wert: "angenommen", label: "Angenommen" },
  { wert: "abgelehnt", label: "Abgelehnt" },
  { wert: "abgelaufen", label: "Abgelaufen" },
];

const BELEGEDITOR_STATUS_KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  abgelaufen: "status-entwurf",
  versendet: "status-gestellt",
  gestellt: "status-gestellt",
  angenommen: "status-bezahlt",
  abgelehnt: "status-storniert",
  storniert: "status-storniert",
};
```

- [ ] **Step 2: Aktions-Buttons**

Vorher:
```tsx
      {beleg.status !== "entwurf" && (
        <button type="button" onClick={pdfExportieren}>
          Als PDF exportieren
        </button>
      )}
      {beleg.typ === "rechnung" && beleg.status !== "entwurf" && (
        <>
          <button type="button" onClick={xrechnungExportieren}>
            Als XRechnung (XML) exportieren
          </button>
          <button type="button" onClick={zugferdExportieren}>
            Als ZUGFeRD-Rechnung exportieren
          </button>
        </>
      )}

      {istEntwurf && (
        <button type="button" disabled={positionen.length === 0} onClick={stellen}>
          Stellen
        </button>
      )}

      {beleg.typ === "angebot" && beleg.status === "versendet" && (
        <section>
          <h2>Abschluss</h2>
          {ANGEBOT_ABSCHLUSS_STATUS.map((s) => (
            <button key={s.wert} type="button" onClick={() => angebotStatus(s.wert)}>
              {s.label}
            </button>
          ))}
        </section>
      )}

      {beleg.typ === "angebot" && ["versendet", "angenommen"].includes(beleg.status) && (
        <button type="button" onClick={inRechnungUeberfuehren}>
          In Rechnung überführen
        </button>
      )}

      {beleg.typ === "rechnung" && beleg.status === "gestellt" && (
        <button type="button" onClick={stornieren}>
          Stornieren
        </button>
      )}
```

Nachher:
```tsx
      {beleg.status !== "entwurf" && (
        <button type="button" className="btn btn-leise" onClick={pdfExportieren}>
          Als PDF exportieren
        </button>
      )}
      {beleg.typ === "rechnung" && beleg.status !== "entwurf" && (
        <>
          <button type="button" className="btn btn-leise" onClick={xrechnungExportieren}>
            Als XRechnung (XML) exportieren
          </button>
          <button type="button" className="btn btn-leise" onClick={zugferdExportieren}>
            Als ZUGFeRD-Rechnung exportieren
          </button>
        </>
      )}

      {istEntwurf && (
        <button type="button" className="btn btn-primaer" disabled={positionen.length === 0} onClick={stellen}>
          Stellen
        </button>
      )}

      {beleg.typ === "angebot" && beleg.status === "versendet" && (
        <section>
          <h2>Abschluss</h2>
          {ANGEBOT_ABSCHLUSS_STATUS.map((s) => (
            <button key={s.wert} type="button" className="btn" onClick={() => angebotStatus(s.wert)}>
              {s.label}
            </button>
          ))}
        </section>
      )}

      {beleg.typ === "angebot" && ["versendet", "angenommen"].includes(beleg.status) && (
        <button type="button" className="btn btn-primaer" onClick={inRechnungUeberfuehren}>
          In Rechnung überführen
        </button>
      )}

      {beleg.typ === "rechnung" && beleg.status === "gestellt" && (
        <button type="button" className="btn btn-gefahr" onClick={stornieren}>
          Stornieren
        </button>
      )}
```

- [ ] **Step 3: `StammdatenAbschnitt`**

Vorher:
```tsx
  return (
    <section>
      <h2>Stammdaten</h2>
      <p>Kunde: {kunde?.name ?? beleg.kunde_id}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSpeichern({ datum, leistungsdatum, zahlungsziel_tage: zahlungszielTage, kopftext, fusstext });
        }}
      >
        <label>
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label>
          Leistungsdatum
          <input type="date" value={leistungsdatum} onChange={(e) => setLeistungsdatum(e.currentTarget.value)} />
        </label>
        <label>
          Zahlungsziel (Tage)
          <input
            type="number"
            value={zahlungszielTage}
            onChange={(e) => setZahlungszielTage(Number(e.currentTarget.value))}
          />
        </label>
        <label>
          Kopftext
          <textarea value={kopftext} onChange={(e) => setKopftext(e.currentTarget.value)} />
        </label>
        <label>
          Fußtext
          <textarea value={fusstext} onChange={(e) => setFusstext(e.currentTarget.value)} />
        </label>
        <button type="submit">Speichern</button>
      </form>
    </section>
  );
}
```

Nachher:
```tsx
  return (
    <section className="karte">
      <h2>Stammdaten</h2>
      <p>Kunde: {kunde?.name ?? beleg.kunde_id}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSpeichern({ datum, leistungsdatum, zahlungsziel_tage: zahlungszielTage, kopftext, fusstext });
        }}
      >
        <label className="feld">
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Leistungsdatum
          <input type="date" value={leistungsdatum} onChange={(e) => setLeistungsdatum(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Zahlungsziel (Tage)
          <input
            type="number"
            value={zahlungszielTage}
            onChange={(e) => setZahlungszielTage(Number(e.currentTarget.value))}
          />
        </label>
        <label className="feld">
          Kopftext
          <textarea value={kopftext} onChange={(e) => setKopftext(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Fußtext
          <textarea value={fusstext} onChange={(e) => setFusstext(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">Speichern</button>
      </form>
    </section>
  );
}
```

**Hinweis:** Der nicht-bearbeitbare Zweig (`if (!bearbeitbar) { return <section>...` weiter oben in derselben Funktion) bekommt ebenfalls `className="karte"` auf das `<section>`.

- [ ] **Step 4: `PositionenAbschnitt`**

Vorher:
```tsx
  return (
    <section>
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      <table>
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th>Menge</th>
            <th>Einheit</th>
            <th>Einzelpreis</th>
            <th>Summe</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positionen.map((p) => (
            <tr key={p.id}>
              <td>{p.bezeichnung}</td>
              <td>{formatMenge(p.menge)}</td>
              <td>{p.einheit_kuerzel}</td>
              <td>{formatCent(p.einzelpreis_cent)}</td>
              <td>{formatCent(p.positionssumme_cent)}</td>
              <td>
                {bearbeitbar && (
                  <button type="button" onClick={() => onLoeschen(p.id)}>
                    Löschen
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bearbeitbar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            hinzufuegen();
          }}
        >
          <label>
            <input type="checkbox" checked={freitext} onChange={(e) => setFreitext(e.currentTarget.checked)} />
            Freitextposition
          </label>
          {freitext ? (
            <>
              <label>
                Bezeichnung
                <input value={bezeichnung} onChange={(e) => setBezeichnung(e.currentTarget.value)} />
              </label>
              <label>
                Einheit
                <input value={einheitKuerzel} onChange={(e) => setEinheitKuerzel(e.currentTarget.value)} />
              </label>
              <label>
                Einzelpreis
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="95,00" />
              </label>
            </>
          ) : (
            <>
              <label>
                Artikel
                <select value={artikelId} onChange={(e) => setArtikelId(e.currentTarget.value)}>
                  <option value="">– wählen –</option>
                  {artikelListe.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bezeichnung}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preis überschreiben (optional)
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="automatisch" />
              </label>
            </>
          )}
          <label>
            Menge
            <input value={menge} onChange={(e) => setMenge(e.currentTarget.value)} />
          </label>
          <button type="submit">Position hinzufügen</button>
        </form>
      )}
    </section>
  );
}
```

Nachher:
```tsx
  return (
    <section className="karte">
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th>Menge</th>
            <th>Einheit</th>
            <th>Einzelpreis</th>
            <th>Summe</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positionen.map((p) => (
            <tr key={p.id}>
              <td>{p.bezeichnung}</td>
              <td>{formatMenge(p.menge)}</td>
              <td>{p.einheit_kuerzel}</td>
              <td>{formatCent(p.einzelpreis_cent)}</td>
              <td>{formatCent(p.positionssumme_cent)}</td>
              <td>
                {bearbeitbar && (
                  <button type="button" className="btn btn-gefahr" onClick={() => onLoeschen(p.id)}>
                    Löschen
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bearbeitbar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            hinzufuegen();
          }}
        >
          <label className="feld-checkbox">
            <input type="checkbox" checked={freitext} onChange={(e) => setFreitext(e.currentTarget.checked)} />
            Freitextposition
          </label>
          {freitext ? (
            <>
              <label className="feld">
                Bezeichnung
                <input value={bezeichnung} onChange={(e) => setBezeichnung(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einheit
                <input value={einheitKuerzel} onChange={(e) => setEinheitKuerzel(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einzelpreis
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="95,00" />
              </label>
            </>
          ) : (
            <>
              <label className="feld">
                Artikel
                <select value={artikelId} onChange={(e) => setArtikelId(e.currentTarget.value)}>
                  <option value="">– wählen –</option>
                  {artikelListe.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bezeichnung}
                    </option>
                  ))}
                </select>
              </label>
              <label className="feld">
                Preis überschreiben (optional)
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="automatisch" />
              </label>
            </>
          )}
          <label className="feld">
            Menge
            <input value={menge} onChange={(e) => setMenge(e.currentTarget.value)} />
          </label>
          <button type="submit" className="btn btn-primaer">Position hinzufügen</button>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 5: `ZahlungenAbschnitt`**

Vorher:
```tsx
  return (
    <section>
      <h2>Zahlungen</h2>
      {fehler && <Fehler fehler={fehler} />}
      <p>Offener Betrag: {formatCent(offenerBetragCent)}</p>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Notiz</th>
          </tr>
        </thead>
        <tbody>
          {zahlungen.map((z) => (
            <tr key={z.id}>
              <td>{z.datum}</td>
              <td>{formatCent(z.betrag_cent)}</td>
              <td>{z.notiz}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          erfassen();
        }}
      >
        <label>
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label>
          Betrag
          <input value={betrag} onChange={(e) => setBetrag(e.currentTarget.value)} placeholder="95,00" />
        </label>
        <label>
          <input type="checkbox" checked={erstattung} onChange={(e) => setErstattung(e.currentTarget.checked)} />
          Erstattung (negativer Betrag)
        </label>
        <label>
          Notiz
          <input value={notiz} onChange={(e) => setNotiz(e.currentTarget.value)} />
        </label>
        <button type="submit">Zahlung erfassen</button>
      </form>
    </section>
  );
}
```

Nachher:
```tsx
  return (
    <section className="karte">
      <h2>Zahlungen</h2>
      {fehler && <Fehler fehler={fehler} />}
      <p>Offener Betrag: {formatCent(offenerBetragCent)}</p>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Notiz</th>
          </tr>
        </thead>
        <tbody>
          {zahlungen.map((z) => (
            <tr key={z.id}>
              <td>{z.datum}</td>
              <td>{formatCent(z.betrag_cent)}</td>
              <td>{z.notiz}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          erfassen();
        }}
      >
        <label className="feld">
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Betrag
          <input value={betrag} onChange={(e) => setBetrag(e.currentTarget.value)} placeholder="95,00" />
        </label>
        <label className="feld-checkbox">
          <input type="checkbox" checked={erstattung} onChange={(e) => setErstattung(e.currentTarget.checked)} />
          Erstattung (negativer Betrag)
        </label>
        <label className="feld">
          Notiz
          <input value={notiz} onChange={(e) => setNotiz(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">Zahlung erfassen</button>
      </form>
    </section>
  );
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test -- BelegEditor`
Erwartet: PASS — insbesondere die Export-Button-Tests (`Als PDF exportieren` etc.), die über den sichtbaren Button-Text abfragen, bleiben unberührt von der zusätzlichen `className`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/BelegEditor.tsx
git commit -m "feat: BelegEditor-Seite stylen (Status-Badge, Karten, Buttons)"
```

---

### Task 11: Seite Einstellungen

**Files:**
- Modify: `src/pages/Einstellungen.tsx`

- [ ] **Step 1: Kopf und `FirmendatenAbschnitt`**

Vorher:
```tsx
export function Einstellungen() {
  return (
    <div>
      <h1>Einstellungen</h1>
      <FirmendatenAbschnitt />
```

Nachher:
```tsx
export function Einstellungen() {
  return (
    <div>
      <h1 className="seiten-kopf">Einstellungen</h1>
      <FirmendatenAbschnitt />
```

Im `FirmendatenAbschnitt`-Formular, vorher:
```tsx
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div>
          <label>
            Name
```

Nachher:
```tsx
      <form
        className="karte"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="feld">
          <label>
            Name
```

Jeder weitere `<div>`-Wrapper in diesem Formular (Straße, PLZ, Ort, Land, Steuernummer, USt-IdNr., IBAN, BIC) bekommt `className="feld"`; jedes `<div role="alert">{feldFehler(...)}</div>` bekommt zusätzlich `className="feld-fehler"`. Das Kleinunternehmer-Checkbox-Feld:

Vorher:
```tsx
        <div>
          <label>
            <input
              type="checkbox"
              checked={firma.kleinunternehmer}
              onChange={(e) => setFirma({ ...firma, kleinunternehmer: e.currentTarget.checked })}
            />
            Kleinunternehmer (§19 UStG)
          </label>
        </div>
        <button type="submit">Speichern</button>
```

Nachher:
```tsx
        <label className="feld-checkbox">
          <input
            type="checkbox"
            checked={firma.kleinunternehmer}
            onChange={(e) => setFirma({ ...firma, kleinunternehmer: e.currentTarget.checked })}
          />
          Kleinunternehmer (§19 UStG)
        </label>
        <button type="submit" className="btn btn-primaer">Speichern</button>
```

(Das umschließende `<div>` entfällt hier, da `.feld-checkbox` direkt auf dem `<label>` sitzt.)

- [ ] **Step 2: `EinheitenAbschnitt`**

Vorher:
```tsx
  return (
    <section>
      <h2>Einheiten</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Kürzel</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {einheiten.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>{e.kuerzel}</td>
              <td>
                <button type="button" onClick={() => bearbeiten(e)}>
                  Bearbeiten
                </button>
                <button type="button" onClick={() => loeschen(e.id)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label>
          Kürzel
          <input value={kuerzel} onChange={(e) => setKuerzel(e.currentTarget.value)} />
        </label>
        <button type="submit">{bearbeiteId ? "Aktualisieren" : "Hinzufügen"}</button>
      </form>
    </section>
  );
}
```

Nachher:
```tsx
  return (
    <section className="karte">
      <h2>Einheiten</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kürzel</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {einheiten.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>{e.kuerzel}</td>
              <td>
                <button type="button" className="btn" onClick={() => bearbeiten(e)}>
                  Bearbeiten
                </button>
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(e.id)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label className="feld">
          Name
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Kürzel
          <input value={kuerzel} onChange={(e) => setKuerzel(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">{bearbeiteId ? "Aktualisieren" : "Hinzufügen"}</button>
      </form>
    </section>
  );
}
```

- [ ] **Step 3: `NummernkreiseAbschnitt`**

Vorher:
```tsx
  return (
    <section>
      <h2>Nummernkreise</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {nummernkreise.map((nk) => (
        <form
          key={nk.art}
          onSubmit={(e) => {
            e.preventDefault();
            speichern(nk);
          }}
        >
          <label>
            {NUMMERNKREIS_LABEL[nk.art] ?? nk.art}
            <input value={nk.format} onChange={(e) => aendere(nk.art, { format: e.currentTarget.value })} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={nk.jahres_reset}
              onChange={(e) => aendere(nk.art, { jahres_reset: e.currentTarget.checked })}
            />
            Jährlicher Reset
          </label>
          <span>Aktueller Zähler: {nk.zaehler}</span>
          <button type="submit">Speichern</button>
        </form>
      ))}
    </section>
  );
}
```

Nachher:
```tsx
  return (
    <section>
      <h2>Nummernkreise</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {nummernkreise.map((nk) => (
        <form
          key={nk.art}
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern(nk);
          }}
        >
          <label className="feld">
            {NUMMERNKREIS_LABEL[nk.art] ?? nk.art}
            <input value={nk.format} onChange={(e) => aendere(nk.art, { format: e.currentTarget.value })} />
          </label>
          <label className="feld-checkbox">
            <input
              type="checkbox"
              checked={nk.jahres_reset}
              onChange={(e) => aendere(nk.art, { jahres_reset: e.currentTarget.checked })}
            />
            Jährlicher Reset
          </label>
          <p>Aktueller Zähler: {nk.zaehler}</p>
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      ))}
    </section>
  );
}
```

(`<span>` → `<p>` für den Zähler-Hinweis, damit er als eigene Zeile statt inline neben Formularfeldern steht — rein strukturelle Layoutverbesserung, keine Textänderung.)

- [ ] **Step 4: `TextbausteineAbschnitt`**

Vorher:
```tsx
  return (
    <section>
      <h2>Textbausteine</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {TEXTBAUSTEIN_KEYS.map((key) => (
        <form
          key={key}
          onSubmit={(e) => {
            e.preventDefault();
            speichern(key);
          }}
        >
          <label>
            {TEXTBAUSTEIN_LABEL[key]}
            <textarea value={werte[key] ?? ""} onChange={(e) => aendere(key, e.currentTarget.value)} />
          </label>
          <button type="submit">Speichern</button>
        </form>
      ))}
    </section>
  );
}
```

Nachher:
```tsx
  return (
    <section>
      <h2>Textbausteine</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {TEXTBAUSTEIN_KEYS.map((key) => (
        <form
          key={key}
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern(key);
          }}
        >
          <label className="feld">
            {TEXTBAUSTEIN_LABEL[key]}
            <textarea value={werte[key] ?? ""} onChange={(e) => aendere(key, e.currentTarget.value)} />
          </label>
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test -- Einstellungen`
Erwartet: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Einstellungen.tsx
git commit -m "feat: Einstellungen-Seite stylen"
```

---

### Task 12: Seite Einrichtung

**Files:**
- Modify: `src/pages/Einrichtung.tsx`

- [ ] **Step 1: Wrapper und Kopf**

Vorher:
```tsx
  if (!firma) {
    return (
      <main style={{ maxWidth: "480px", margin: "3rem auto" }}>
        {fehler && <Fehler fehler={fehler} />}
      </main>
    );
  }
```

Nachher:
```tsx
  if (!firma) {
    return (
      <main className="einrichtung-main">
        {fehler && <Fehler fehler={fehler} />}
      </main>
    );
  }
```

Vorher:
```tsx
  return (
    <main style={{ maxWidth: "480px", margin: "3rem auto" }}>
      <h1>Ersteinrichtung</h1>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}

      {schritt === 1 && (
        <section>
          <h2>Firmendaten</h2>
          <div>
            <label>
              Name
              <input value={firma.name} onChange={(e) => setFirma({ ...firma, name: e.currentTarget.value })} />
            </label>
            {feldFehler("name") && <div role="alert">{feldFehler("name")}</div>}
          </div>
```

Nachher:
```tsx
  return (
    <main className="einrichtung-main">
      <h1 className="seiten-kopf">Ersteinrichtung</h1>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}

      {schritt === 1 && (
        <section className="karte">
          <h2>Firmendaten</h2>
          <div className="feld">
            <label>
              Name
              <input value={firma.name} onChange={(e) => setFirma({ ...firma, name: e.currentTarget.value })} />
            </label>
            {feldFehler("name") && <div className="feld-fehler" role="alert">{feldFehler("name")}</div>}
          </div>
```

Alle weiteren `<div>`-Wrapper in Schritt 1 (Straße, PLZ, Ort, Steuernummer, USt-IdNr., IBAN, BIC) bekommen `className="feld"`; das Steuernummer-Feld hat zusätzlich `{feldFehler("steuernummer") && <div role="alert">...}` → `className="feld-fehler"` ergänzen. Der „Weiter"-Button am Ende von Schritt 1:

Vorher: `<button type="button" onClick={() => setSchritt(2)}>Weiter</button>`
Nachher: `<button type="button" className="btn btn-primaer" onClick={() => setSchritt(2)}>Weiter</button>`

- [ ] **Step 2: Schritt 2 (Logo)**

Vorher:
```tsx
      {schritt === 2 && (
        <section>
          <h2>Logo</h2>
          <p>Optional — kann auch später in den Einstellungen hinzugefügt werden.</p>
          <button type="button" onClick={logoWaehlen}>
            Datei wählen
          </button>
          {logoBytes && <p>Logo ausgewählt ({logoBytes.length} Bytes).</p>}
          <div>
            <button type="button" onClick={() => setSchritt(1)}>
              Zurück
            </button>
            <button type="button" onClick={() => setSchritt(3)}>
              Weiter
            </button>
          </div>
        </section>
      )}
```

Nachher:
```tsx
      {schritt === 2 && (
        <section className="karte">
          <h2>Logo</h2>
          <p>Optional — kann auch später in den Einstellungen hinzugefügt werden.</p>
          <button type="button" className="btn" onClick={logoWaehlen}>
            Datei wählen
          </button>
          {logoBytes && <p>Logo ausgewählt ({logoBytes.length} Bytes).</p>}
          <div className="werkzeugleiste">
            <button type="button" className="btn btn-leise" onClick={() => setSchritt(1)}>
              Zurück
            </button>
            <button type="button" className="btn btn-primaer" onClick={() => setSchritt(3)}>
              Weiter
            </button>
          </div>
        </section>
      )}
```

- [ ] **Step 3: Schritt 3 (Kleinunternehmer)**

Vorher:
```tsx
      {schritt === 3 && (
        <section>
          <h2>Kleinunternehmer-Bestätigung</h2>
          <p>
            Nach § 19 UStG müssen Kleinunternehmer keine Umsatzsteuer ausweisen, solange der
            Vorjahresumsatz 25.000 € und der voraussichtliche Umsatz des laufenden Jahres 100.000 € nicht
            übersteigt.
          </p>
          <label>
            <input
              type="checkbox"
              checked={firma.kleinunternehmer}
              onChange={(e) => setFirma({ ...firma, kleinunternehmer: e.currentTarget.checked })}
            />
            Ich falle unter die Kleinunternehmerregelung
          </label>
          <div>
            <button type="button" onClick={() => setSchritt(2)}>
              Zurück
            </button>
            <button type="button" onClick={() => setSchritt(4)}>
              Weiter
            </button>
          </div>
        </section>
      )}
```

Nachher:
```tsx
      {schritt === 3 && (
        <section className="karte">
          <h2>Kleinunternehmer-Bestätigung</h2>
          <p>
            Nach § 19 UStG müssen Kleinunternehmer keine Umsatzsteuer ausweisen, solange der
            Vorjahresumsatz 25.000 € und der voraussichtliche Umsatz des laufenden Jahres 100.000 € nicht
            übersteigt.
          </p>
          <label className="feld-checkbox">
            <input
              type="checkbox"
              checked={firma.kleinunternehmer}
              onChange={(e) => setFirma({ ...firma, kleinunternehmer: e.currentTarget.checked })}
            />
            Ich falle unter die Kleinunternehmerregelung
          </label>
          <div className="werkzeugleiste">
            <button type="button" className="btn btn-leise" onClick={() => setSchritt(2)}>
              Zurück
            </button>
            <button type="button" className="btn btn-primaer" onClick={() => setSchritt(4)}>
              Weiter
            </button>
          </div>
        </section>
      )}
```

- [ ] **Step 4: Schritt 4 (Nummernkreise / Abschluss)**

Vorher:
```tsx
      {schritt === 4 && (
        <section>
          <h2>Nummernkreise</h2>
          <p>Die vorbelegten Formate können später jederzeit in den Einstellungen angepasst werden.</p>
          <ul>
            <li>Kunden: KD-0001</li>
            <li>Artikel: ART-0001</li>
            <li>Angebote: AN-{new Date().getFullYear()}-0001</li>
            <li>Rechnungen: RE-{new Date().getFullYear()}-0001</li>
          </ul>
          <div>
            <button type="button" onClick={() => setSchritt(3)}>
              Zurück
            </button>
            <button type="button" disabled={speichert} onClick={abschliessen}>
              Einrichtung abschließen
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
```

Nachher:
```tsx
      {schritt === 4 && (
        <section className="karte">
          <h2>Nummernkreise</h2>
          <p>Die vorbelegten Formate können später jederzeit in den Einstellungen angepasst werden.</p>
          <ul>
            <li>Kunden: KD-0001</li>
            <li>Artikel: ART-0001</li>
            <li>Angebote: AN-{new Date().getFullYear()}-0001</li>
            <li>Rechnungen: RE-{new Date().getFullYear()}-0001</li>
          </ul>
          <div className="werkzeugleiste">
            <button type="button" className="btn btn-leise" onClick={() => setSchritt(3)}>
              Zurück
            </button>
            <button type="button" className="btn btn-primaer" disabled={speichert} onClick={abschliessen}>
              Einrichtung abschließen
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 5: `.einrichtung-main`-Klasse zu `komponenten.css` hinzufügen**

An `src/styles/komponenten.css` anhängen:

```css
/* Einrichtungs-Assistent */
.einrichtung-main {
  max-width: 480px;
  margin: 48px auto;
  padding: 0 var(--abstand-l);
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test -- Einrichtung`
Erwartet: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Einrichtung.tsx src/styles/komponenten.css
git commit -m "feat: Einrichtungs-Assistent stylen"
```

---

### Task 13: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständige Test-Suite**

Run: `npm test`
Erwartet: alle 36 Tests grün, keine Regression.

- [ ] **Step 2: Typecheck und Build**

Run: `npm run build`
Erwartet: `tsc && vite build` erfolgreich, keine Typfehler (insbesondere durch die neuen `className`-Props und den entfernten `React.CSSProperties`-Import in `Fehler.tsx`).

- [ ] **Step 3: Rust-Tests unberührt**

Run: `cd src-tauri && cargo test`
Erwartet: weiterhin 97 bestehend — dieser Plan berührt keine Rust-Dateien.

- [ ] **Step 4: Visuelle Abnahme (manuell, durch Auftraggeber)**

`npm run tauri dev` starten, alle acht Seiten in Hell- und Dunkelmodus durchsehen (System-Farbschema umschalten). Prüfen: Lesbarkeit, Kontrast, Status-Badges auf Angebote/Rechnungen/KundeDetail-Belege, Fokus-Ringe bei Tab-Navigation, Nav-Icons.

- [ ] **Step 5: Commit (falls bei Schritt 4 Korrekturen nötig waren)**

Nur falls die visuelle Abnahme Anpassungen ergeben hat — sonst entfällt dieser Schritt, da Task 13 sonst keine Code-Änderungen enthält.

---

## Nach Task 13

Alle 13 Tasks abgeschlossen → `superpowers:finishing-a-development-branch` für Merge nach `main`.
