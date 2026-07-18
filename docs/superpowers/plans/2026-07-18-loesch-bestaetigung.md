# Lösch-Bestätigungsdialog app-weit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede der vier bestehenden Löschaktionen (Adresse, Ansprechpartner, Position, Einheit) zeigt vor dem eigentlichen API-Call eine Bestätigung mit konkreter Objektbezeichnung, statt sofort zu löschen.

**Architecture:** Neue präsentationale Komponente `Bestaetigungsdialog` (zentriertes Modal, `role="dialog"`) plus neuer Hook `useLoeschBestaetigung()` (Promise-basiert, analog `useErfolgsHinweis`), der `{ bestaetigen, dialog }` zurückgibt. Jede der vier Aufrufstellen ruft den Hook eigenständig auf und schiebt `if (!(await bestaetigen(text))) return;` vor die bestehende Lösch-Logik.

**Tech Stack:** React/TypeScript/Vitest, bestehendes Design-Token-System (`src/styles/tokens.css`).

---

### Task 1: Komponente `Bestaetigungsdialog`

**Files:**
- Create: `src/components/Bestaetigungsdialog.tsx`
- Create: `src/components/Bestaetigungsdialog.test.tsx`
- Modify: `src/styles/komponenten.css`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Neue Datei `src/components/Bestaetigungsdialog.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Bestaetigungsdialog } from "./Bestaetigungsdialog";

afterEach(cleanup);

describe("Bestaetigungsdialog", () => {
  it("zeigt den übergebenen Text", () => {
    render(
      <Bestaetigungsdialog text='Adresse „Testadresse" löschen?' onAbbrechen={() => {}} onBestaetigen={() => {}} />,
    );
    expect(screen.getByText('Adresse „Testadresse" löschen?')).toBeTruthy();
  });

  it("ruft onAbbrechen bei Klick auf Abbrechen auf", () => {
    const onAbbrechen = vi.fn();
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={onAbbrechen} onBestaetigen={() => {}} />);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(onAbbrechen).toHaveBeenCalledTimes(1);
  });

  it("ruft onAbbrechen bei Klick auf den Hintergrund auf", () => {
    const onAbbrechen = vi.fn();
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={onAbbrechen} onBestaetigen={() => {}} />);
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onAbbrechen).toHaveBeenCalledTimes(1);
  });

  it("ruft onAbbrechen bei Escape auf", () => {
    const onAbbrechen = vi.fn();
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={onAbbrechen} onBestaetigen={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAbbrechen).toHaveBeenCalledTimes(1);
  });

  it("ruft onBestaetigen bei Klick auf Löschen auf", () => {
    const onBestaetigen = vi.fn();
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={() => {}} onBestaetigen={onBestaetigen} />);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    expect(onBestaetigen).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Bestaetigungsdialog`
Erwartet: FAIL — `./Bestaetigungsdialog` existiert nicht.

- [ ] **Step 3: Komponente implementieren**

Neue Datei `src/components/Bestaetigungsdialog.tsx`:

```tsx
import { useEffect } from "react";

interface BestaetigungsdialogProps {
  text: string;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
}

/**
 * Zentriertes Bestätigungs-Modal für destruktive Aktionen. Escape und Klick
 * auf den abgedunkelten Hintergrund brechen ab, wie ein Klick auf
 * "Abbrechen". Rendert nichts von sich aus dauerhaft — die aufrufende Seite
 * (über useLoeschBestaetigung) steuert die Sichtbarkeit per bedingtem
 * Rendering, diese Komponente merkt sich nichts.
 */
export function Bestaetigungsdialog({ text, onAbbrechen, onBestaetigen }: BestaetigungsdialogProps) {
  useEffect(() => {
    function aufTaste(e: KeyboardEvent) {
      if (e.key === "Escape") onAbbrechen();
    }
    document.addEventListener("keydown", aufTaste);
    return () => document.removeEventListener("keydown", aufTaste);
  }, [onAbbrechen]);

  return (
    <div className="bestaetigung-overlay" onClick={onAbbrechen}>
      <div className="bestaetigung-karte" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="bestaetigung-aktionen">
          <button type="button" className="btn" autoFocus onClick={onAbbrechen}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-gefahr" onClick={onBestaetigen}>
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: CSS ergänzen**

An `src/styles/komponenten.css` anhängen:

```css
/* Bestätigungsdialog */
.bestaetigung-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 33, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.bestaetigung-karte {
  background: var(--flaeche);
  border-radius: var(--radius-m);
  box-shadow: 0 8px 30px rgba(20, 24, 33, 0.25);
  padding: var(--abstand-l);
  max-width: 360px;
  width: calc(100% - var(--abstand-xl));
}

.bestaetigung-aktionen {
  display: flex;
  gap: var(--abstand-s);
  justify-content: flex-end;
  margin-top: var(--abstand-l);
}
```

- [ ] **Step 5: Tests laufen**

Run: `npm test -- Bestaetigungsdialog`
Erwartet: PASS (5/5).

- [ ] **Step 6: Volle Suite + Build**

Run: `npm test` → 93/93
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/Bestaetigungsdialog.tsx src/components/Bestaetigungsdialog.test.tsx src/styles/komponenten.css
git commit -m "feat: Bestaetigungsdialog-Komponente für destruktive Aktionen"
```

---

### Task 2: Hook `useLoeschBestaetigung`

**Files:**
- Create: `src/hooks/useLoeschBestaetigung.tsx`
- Create: `src/hooks/useLoeschBestaetigung.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

Neue Datei `src/hooks/useLoeschBestaetigung.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLoeschBestaetigung } from "./useLoeschBestaetigung";

afterEach(cleanup);

function TestKomponente({ onErgebnis }: { onErgebnis: (ergebnis: boolean) => void }) {
  const { bestaetigen, dialog } = useLoeschBestaetigung();
  return (
    <div>
      {dialog}
      <button type="button" onClick={() => bestaetigen('Test „Beispiel" löschen?').then(onErgebnis)}>
        Löschen auslösen
      </button>
    </div>
  );
}

describe("useLoeschBestaetigung", () => {
  it("zeigt den Dialog mit dem übergebenen Text und löst die Promise mit true auf, wenn im Dialog bestätigt wird", async () => {
    const onErgebnis = vi.fn();
    render(<TestKomponente onErgebnis={onErgebnis} />);
    fireEvent.click(screen.getByRole("button", { name: "Löschen auslösen" }));
    expect(screen.getByText('Test „Beispiel" löschen?')).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(onErgebnis).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("löst die Promise mit false auf, wenn im Dialog abgebrochen wird", async () => {
    const onErgebnis = vi.fn();
    render(<TestKomponente onErgebnis={onErgebnis} />);
    fireEvent.click(screen.getByRole("button", { name: "Löschen auslösen" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(onErgebnis).toHaveBeenCalledWith(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- useLoeschBestaetigung`
Erwartet: FAIL — `./useLoeschBestaetigung` existiert nicht.

- [ ] **Step 3: Hook implementieren**

Neue Datei `src/hooks/useLoeschBestaetigung.tsx`:

```tsx
import { useState } from "react";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";

/**
 * Promise-basierte Lösch-Bestätigung. Jede Komponente, die eine destruktive
 * Aktion bestätigen lassen will, ruft diesen Hook eigenständig auf (kein
 * globaler State, analog useErfolgsHinweis).
 *
 * `bestaetigen(text)` zeigt den Dialog und löst sich auf `true` (Löschen
 * bestätigt) oder `false` (abgebrochen — Abbrechen-Button, Hintergrund-Klick
 * oder Escape) auf.
 */
export function useLoeschBestaetigung() {
  const [anfrage, setAnfrage] = useState<{
    text: string;
    aufloesen: (ergebnis: boolean) => void;
  } | null>(null);

  function bestaetigen(text: string): Promise<boolean> {
    return new Promise((aufloesen) => setAnfrage({ text, aufloesen }));
  }

  const dialog = anfrage && (
    <Bestaetigungsdialog
      text={anfrage.text}
      onAbbrechen={() => {
        anfrage.aufloesen(false);
        setAnfrage(null);
      }}
      onBestaetigen={() => {
        anfrage.aufloesen(true);
        setAnfrage(null);
      }}
    />
  );

  return { bestaetigen, dialog };
}
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- useLoeschBestaetigung`
Erwartet: PASS (2/2).

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 95/95
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useLoeschBestaetigung.tsx src/hooks/useLoeschBestaetigung.test.tsx
git commit -m "feat: useLoeschBestaetigung-Hook"
```

---

### Task 3: Einheit (`Einstellungen.tsx`)

**Files:**
- Modify: `src/pages/Einstellungen.tsx`
- Modify: `src/pages/Einstellungen.test.tsx`

- [ ] **Step 1: Bestehenden Test anpassen und neuen Test ergänzen**

In `src/pages/Einstellungen.test.tsx`, den bestehenden Lösch-Test um den Bestätigungsschritt erweitern und einen Abbrechen-Test ergänzen.

Vorher:
```tsx
  it("zeigt nach dem Löschen einer Einheit einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Einheit gelöscht")).toBeTruthy());
  });
```

Nachher:
```tsx
  it("löscht eine Einheit nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.einheiten.delete)).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Löschen einer Einheit einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Einheit „Stunde" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Einheit gelöscht")).toBeTruthy());
  });
```

**Wichtig — Reihenfolge**: Der Abbrechen-Test steht bewusst VOR dem Erfolgs-Test. Es gibt kein `clearMocks`/`resetMocks` in der Vitest-Konfiguration (`vite.config.ts`) und keinen `vi.clearAllMocks()`-Aufruf in dieser Testdatei — Mock-Aufrufhistorien bleiben also über Tests hinweg innerhalb derselben Datei erhalten. Stünde der Erfolgs-Test (der `api.einheiten.delete` einmal aufruft) zuerst, würde die Assertion `not.toHaveBeenCalled()` im Abbrechen-Test fälschlich fehlschlagen, da der Mock dann bereits einen Aufruf aus dem vorherigen Test trägt. Vitest führt Tests standardmäßig sequenziell in Deklarationsreihenfolge aus (kein Shuffle), die Reihenfolge im Code ist also verlässlich.

Ergänze `within` im bestehenden Import von `@testing-library/react` (Datei-Kopf, Zeile 1):

Vorher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Nachher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Einstellungen`
Erwartet: FAIL — kein Bestätigungsdialog vorhanden, „Einheit gelöscht" erscheint sofort nach dem ersten Klick statt erst nach der Bestätigung; der neue Abbrechen-Test findet keinen Dialog.

- [ ] **Step 3: `EinheitenAbschnitt` anpassen**

Vorher (Import, Datei-Kopf):
```tsx
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
```

Nachher:
```tsx
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useLoeschBestaetigung } from "../hooks/useLoeschBestaetigung";
```

Vorher (Hook-Aufruf in `EinheitenAbschnitt`):
```tsx
  const { zeigen, hinweis } = useErfolgsHinweis();

  function laden() {
```

Nachher:
```tsx
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useLoeschBestaetigung();

  function laden() {
```

Vorher (`loeschen`):
```tsx
  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.einheiten.delete(id);
      laden();
      zeigen("Einheit gelöscht");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function loeschen(id: string, name: string) {
    if (!(await bestaetigen(`Einheit „${name}" löschen?`))) return;
    setFehler(null);
    try {
      await api.einheiten.delete(id);
      laden();
      zeigen("Einheit gelöscht");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Button-Aufruf in der Zeilen-Iteration):
```tsx
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(e.id)}>
                  Löschen
                </button>
```

Nachher:
```tsx
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(e.id, e.name)}>
                  Löschen
                </button>
```

Vorher (Render, `{hinweis}`-Zeile):
```tsx
      {hinweis}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kürzel</th>
```

Nachher:
```tsx
      {hinweis}
      {dialog}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Kürzel</th>
```

(Es gibt zwei `{hinweis}`-Zeilen in `Einstellungen.tsx`, je eine pro Abschnitt — nur die in `EinheitenAbschnitt` ändern, identifizierbar an den direkt folgenden `<th>Name</th><th>Kürzel</th>`-Spaltenüberschriften.)

- [ ] **Step 4: Tests laufen**

Run: `npm test -- Einstellungen`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 96/96
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Einstellungen.tsx src/pages/Einstellungen.test.tsx
git commit -m "feat: Bestätigung vor Einheit-Löschen"
```

---

### Task 4: Adresse (`KundeDetail.tsx`)

**Files:**
- Modify: `src/pages/KundeDetail.tsx`
- Modify: `src/pages/KundeDetail.test.tsx`

- [ ] **Step 1: Bestehenden Test anpassen und neuen Test ergänzen**

In `src/pages/KundeDetail.test.tsx`, sicherstellen dass `within` im bestehenden `@testing-library/react`-Import vorhanden ist (Datei-Kopf, Zeile 2):

Vorher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Nachher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

Bestehenden Adresse-Lösch-Test anpassen und Abbrechen-Test ergänzen.

Vorher:
```tsx
  it("zeigt nach dem Löschen einer Adresse einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Adresse gelöscht")).toBeTruthy());
  });
```

Nachher:
```tsx
  it("löscht eine Adresse nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.kunden.adresseDelete)).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Löschen einer Adresse einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(screen.getByText('Adresse „rechnung, Musterstr. 1, 12345 Musterstadt" löschen?')).toBeTruthy(),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Adresse gelöscht")).toBeTruthy());
  });
```

**Wichtig — Reihenfolge**: Der Abbrechen-Test steht bewusst VOR dem Erfolgs-Test, aus demselben Grund wie in Task 3 (kein `clearMocks` in der Vitest-Konfiguration, Mock-Aufrufhistorie bleibt über Tests hinweg erhalten).

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- KundeDetail`
Erwartet: FAIL — kein Bestätigungsdialog vorhanden.

- [ ] **Step 3: `AdressenReiter` anpassen**

Vorher (Import, Datei-Kopf):
```tsx
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
```

Nachher:
```tsx
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useLoeschBestaetigung } from "../hooks/useLoeschBestaetigung";
```

Vorher (Hook-Aufruf in `AdressenReiter`):
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function speichern() {
```

Nachher:
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useLoeschBestaetigung();

  async function speichern() {
```

Vorher (`loeschen`, in `AdressenReiter`):
```tsx
  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.kunden.adresseDelete(id);
      zeigen("Adresse gelöscht");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function loeschen(id: string, typ: string, strasse: string, plz: string, ort: string) {
    if (!(await bestaetigen(`Adresse „${typ}, ${strasse}, ${plz} ${ort}" löschen?`))) return;
    setFehler(null);
    try {
      await api.kunden.adresseDelete(id);
      zeigen("Adresse gelöscht");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Button-Aufruf in der Adressen-Zeilen-Iteration):
```tsx
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(a.id)}>
                  Löschen
                </button>
```

Nachher:
```tsx
                <button
                  type="button"
                  className="btn btn-gefahr"
                  onClick={() => loeschen(a.id, a.typ, a.strasse, a.plz, a.ort)}
                >
                  Löschen
                </button>
```

Vorher (Render, `{hinweis}`-Zeile in `AdressenReiter`):
```tsx
    <section>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Typ</th>
```

Nachher:
```tsx
    <section>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Typ</th>
```

(Identifizierbar an der direkt folgenden `<th>Typ</th>`-Spaltenüberschrift — es gibt eine textlich sehr ähnliche Stelle in `AnsprechpartnerReiter` mit `<th>Name</th>`, die in Task 5 geändert wird, hier NICHT anfassen.)

- [ ] **Step 4: Tests laufen**

Run: `npm test -- KundeDetail`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 97/97
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/KundeDetail.tsx src/pages/KundeDetail.test.tsx
git commit -m "feat: Bestätigung vor Adresse-Löschen"
```

---

### Task 5: Ansprechpartner (`KundeDetail.tsx`)

**Files:**
- Modify: `src/pages/KundeDetail.tsx`
- Modify: `src/pages/KundeDetail.test.tsx`

- [ ] **Step 1: Bestehenden Test anpassen und neuen Test ergänzen**

Vorher:
```tsx
  it("zeigt nach dem Löschen eines Ansprechpartners einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="ansprechpartner" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ansprechpartner" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Ansprechpartner gelöscht")).toBeTruthy());
  });
});
```

Nachher:
```tsx
  it("löscht einen Ansprechpartner nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<KundeDetail id="1" startReiter="ansprechpartner" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ansprechpartner" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.kunden.ansprechpartnerDelete)).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Löschen eines Ansprechpartners einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="ansprechpartner" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ansprechpartner" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(screen.getByText('Ansprechpartner „Erika Musterfrau" löschen?')).toBeTruthy(),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Ansprechpartner gelöscht")).toBeTruthy());
  });
});
```

**Wichtig — Reihenfolge**: Der Abbrechen-Test steht bewusst VOR dem Erfolgs-Test, aus demselben Grund wie in Task 3 (kein `clearMocks` in der Vitest-Konfiguration, Mock-Aufrufhistorie bleibt über Tests hinweg erhalten).

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- KundeDetail`
Erwartet: FAIL — kein Bestätigungsdialog vorhanden.

- [ ] **Step 3: `AnsprechpartnerReiter` anpassen**

Vorher (Hook-Aufruf in `AnsprechpartnerReiter`):
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function speichern() {
```

Nachher:
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useLoeschBestaetigung();

  async function speichern() {
```

(`useLoeschBestaetigung` ist bereits in Task 4 in den Datei-Kopf-Import von `KundeDetail.tsx` aufgenommen worden — kein erneuter Import nötig, da `AdressenReiter` und `AnsprechpartnerReiter` in derselben Datei liegen.)

Vorher (`loeschen`, in `AnsprechpartnerReiter`):
```tsx
  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.kunden.ansprechpartnerDelete(id);
      zeigen("Ansprechpartner gelöscht");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function loeschen(id: string, name: string) {
    if (!(await bestaetigen(`Ansprechpartner „${name}" löschen?`))) return;
    setFehler(null);
    try {
      await api.kunden.ansprechpartnerDelete(id);
      zeigen("Ansprechpartner gelöscht");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Button-Aufruf in der Ansprechpartner-Zeilen-Iteration):
```tsx
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(a.id)}>
                  Löschen
                </button>
```

Nachher:
```tsx
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(a.id, a.name)}>
                  Löschen
                </button>
```

Vorher (Render, `{hinweis}`-Zeile in `AnsprechpartnerReiter`):
```tsx
    <section>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
```

Nachher:
```tsx
    <section>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
```

(Identifizierbar an der direkt folgenden `<th>Name</th>`-Spaltenüberschrift — die andere `{hinweis}`-Stelle mit `<th>Typ</th>` gehört zu `AdressenReiter`, in Task 4 bereits geändert.)

- [ ] **Step 4: Tests laufen**

Run: `npm test -- KundeDetail`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 98/98
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/KundeDetail.tsx src/pages/KundeDetail.test.tsx
git commit -m "feat: Bestätigung vor Ansprechpartner-Löschen"
```

---

### Task 6: Position (`BelegEditor.tsx`)

**Files:**
- Modify: `src/pages/BelegEditor.tsx`
- Modify: `src/pages/BelegEditor.test.tsx`

- [ ] **Step 1: Bestehenden Test anpassen und neuen Test ergänzen**

`within` zum bestehenden `@testing-library/react`-Import ergänzen (Datei-Kopf, Zeile 2):

Vorher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Nachher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

Bestehenden Position-Lösch-Test anpassen und Abbrechen-Test ergänzen.

Vorher:
```tsx
  it("zeigt nach dem Löschen einer Position einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [
        {
          id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Beratung",
          einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
          positionssumme_cent: 9550, reihenfolge: 0,
        },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Position gelöscht")).toBeTruthy());
  });
});
```

Nachher:
```tsx
  it("löscht eine Position nicht, wenn im Dialog abgebrochen wird", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [
        {
          id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Beratung",
          einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
          positionssumme_cent: 9550, reihenfolge: 0,
        },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.belege.positionDelete)).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Löschen einer Position einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [
        {
          id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Beratung",
          einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
          positionssumme_cent: 9550, reihenfolge: 0,
        },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Position „Beratung" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Position gelöscht")).toBeTruthy());
  });
});
```

**Wichtig — Reihenfolge**: Der Abbrechen-Test steht bewusst VOR dem Erfolgs-Test, aus demselben Grund wie in Task 3 (kein `clearMocks` in der Vitest-Konfiguration, Mock-Aufrufhistorie bleibt über Tests hinweg erhalten).

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- BelegEditor`
Erwartet: FAIL — kein Bestätigungsdialog vorhanden.

- [ ] **Step 3: `PositionenAbschnitt` anpassen**

Vorher (Import, Datei-Kopf):
```tsx
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
```

Nachher:
```tsx
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useLoeschBestaetigung } from "../hooks/useLoeschBestaetigung";
```

Vorher (Hook-Aufruf in `PositionenAbschnitt`):
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function hinzufuegen() {
```

Nachher:
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useLoeschBestaetigung();

  async function hinzufuegen() {
```

Direkt nach dem Ende der bestehenden `hinzufuegen()`-Funktion (vor dem `return (`) eine neue Funktion einfügen, die die Bestätigung vorschaltet, bevor die bestehende `onLoeschen`-Prop (unverändert, Signatur `(id: string) => void`) aufgerufen wird:

```tsx
  async function loeschenBestaetigen(id: string, bezeichnung: string) {
    if (!(await bestaetigen(`Position „${bezeichnung}" löschen?`))) return;
    onLoeschen(id);
  }
```

Vorher (Button-Aufruf in der Positionen-Zeilen-Iteration):
```tsx
                {bearbeitbar && (
                  <button type="button" className="btn btn-gefahr" onClick={() => onLoeschen(p.id)}>
                    Löschen
                  </button>
                )}
```

Nachher:
```tsx
                {bearbeitbar && (
                  <button
                    type="button"
                    className="btn btn-gefahr"
                    onClick={() => loeschenBestaetigen(p.id, p.bezeichnung)}
                  >
                    Löschen
                  </button>
                )}
```

Vorher (Render, `{hinweis}`-Zeile in `PositionenAbschnitt`):
```tsx
    <section className="karte">
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
```

Nachher:
```tsx
    <section className="karte">
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
```

**Hinweis**: `positionLoeschen` in der obersten `BelegEditor`-Komponente (führt den eigentlichen `api.belege.positionDelete`-Aufruf aus) bleibt komplett unverändert — die Bestätigung ist rein clientseitig in `PositionenAbschnitt` vorgeschaltet, bevor die unveränderte `onLoeschen`-Prop aufgerufen wird.

- [ ] **Step 4: Tests laufen**

Run: `npm test -- BelegEditor`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 99/99
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/BelegEditor.tsx src/pages/BelegEditor.test.tsx
git commit -m "feat: Bestätigung vor Position-Löschen"
```

---

### Task 7: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständige Frontend-Test-Suite**

Run: `npm test`
Erwartet: alle 99 Tests grün.

- [ ] **Step 2: Typecheck und Build**

Run: `npm run build`
Erwartet: `tsc && vite build` erfolgreich, keine Typfehler.

- [ ] **Step 3: Rust-Tests**

Run: `cd src-tauri && cargo test`
Erwartet: 104 Tests grün — unverändert, dieser Plan berührt keinen Rust-Code.

- [ ] **Step 4: Manuelle Abnahme (durch Auftraggeber)**

`npm run tauri dev` starten und folgende Abläufe einmal live durchklicken:
1. Kunde öffnen → Adresse löschen → Dialog zeigt Adressdaten → Abbrechen → Adresse bleibt bestehen.
2. Dieselbe Adresse löschen → im Dialog bestätigen → Adresse verschwindet, Erfolgs-Banner erscheint.
3. Ansprechpartner löschen (Abbrechen und Bestätigen je einmal testen) → gleiches Verhalten mit Namen im Dialogtext.
4. In einem Angebot/einer Rechnung (Entwurf) eine Position löschen (Abbrechen und Bestätigen) → gleiches Verhalten mit Positionsbezeichnung im Dialogtext.
5. In Einstellungen eine Einheit löschen (Abbrechen und Bestätigen) → gleiches Verhalten mit Einheitsname im Dialogtext.
6. Escape-Taste bei offenem Dialog prüfen → schließt wie Abbrechen.
7. Klick auf den abgedunkelten Hintergrund bei offenem Dialog prüfen → schließt wie Abbrechen.
8. Hell- und Dunkelmodus stichprobenartig gegenprüfen.

- [ ] **Step 5: Commit (nur falls Schritt 4 Korrekturen ergab)**

Nur falls die manuelle Abnahme Anpassungen ergeben hat — sonst entfällt dieser Schritt.

---

## Nach Task 7

Alle 7 Tasks abgeschlossen → weiter mit Teilprojekt 3 (Kunde/Artikel Lösch-UI) im nächsten Brainstorming-Durchlauf, das auf `useLoeschBestaetigung` aufbaut. Merge nach `main` über `superpowers:finishing-a-development-branch` wie bei Teilprojekt 1.
