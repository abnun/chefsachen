# Erfolgs-Feedback nach Speichern-Aktionen, app-weit — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Speichern-, Anlegen- und Löschen-Aktion in der App zeigt nach Erfolg einen konsistenten, kurzen Erfolgs-Banner (wiederverwendbarer Hook auf Basis der bestehenden `Hinweis`-Komponente) statt wie bisher meist gar kein oder ein uneinheitliches ad-hoc-Feedback.

**Architecture:** Ein neuer Hook `useErfolgsHinweis` kapselt Banner-State + Auto-Dismiss und wird von jeder Komponente, die selbst eine Speichern-Aktion ausführt, eigenständig aufgerufen (kein globaler State). Betroffen: `KundeDetail.tsx` (3 Unterkomponenten), `Artikel.tsx` (2 Stellen), `BelegEditor.tsx` (3 Unterkomponenten), `Einstellungen.tsx` (4 Unterkomponenten).

**Tech Stack:** React 19/TypeScript, Vitest, bestehende `Hinweis`-Komponente.

**Spec:** `docs/superpowers/specs/2026-07-17-erfolgs-feedback-design.md`

---

### Task 1: Der Hook `useErfolgsHinweis`

**Files:**
- Create: `src/hooks/useErfolgsHinweis.ts`
- Create: `src/hooks/useErfolgsHinweis.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useErfolgsHinweis } from "./useErfolgsHinweis";

afterEach(cleanup);

function TestKomponente() {
  const { zeigen, hinweis } = useErfolgsHinweis();
  return (
    <div>
      {hinweis}
      <button type="button" onClick={() => zeigen("Erster Text")}>
        Erster Text zeigen
      </button>
      <button type="button" onClick={() => zeigen("Zweiter Text")}>
        Zweiter Text zeigen
      </button>
    </div>
  );
}

describe("useErfolgsHinweis", () => {
  it("zeigt den per zeigen() übergebenen Text", () => {
    render(<TestKomponente />);
    fireEvent.click(screen.getByRole("button", { name: "Erster Text zeigen" }));
    expect(screen.getByText("Erster Text")).toBeTruthy();
  });

  it("blendet den Banner nach 4000ms automatisch aus", () => {
    vi.useFakeTimers();
    render(<TestKomponente />);
    fireEvent.click(screen.getByRole("button", { name: "Erster Text zeigen" }));
    expect(screen.getByText("Erster Text")).toBeTruthy();
    vi.advanceTimersByTime(3999);
    expect(screen.getByText("Erster Text")).toBeTruthy();
    vi.advanceTimersByTime(1);
    expect(screen.queryByText("Erster Text")).toBeNull();
    vi.useRealTimers();
  });

  it("startet den Auto-Dismiss-Timer neu, wenn zeigen() erneut aufgerufen wird, während der vorherige Banner noch sichtbar ist", () => {
    vi.useFakeTimers();
    render(<TestKomponente />);
    fireEvent.click(screen.getByRole("button", { name: "Erster Text zeigen" }));
    vi.advanceTimersByTime(3000);
    fireEvent.click(screen.getByRole("button", { name: "Zweiter Text zeigen" }));
    expect(screen.getByText("Zweiter Text")).toBeTruthy();
    // Wären die 3000ms des ersten Aufrufs weitergezählt worden, wäre der Banner
    // nach diesen weiteren 999ms (zusammen 3999ms ab dem ERSTEN Aufruf) schon
    // weg. Da der Timer aber ab dem ZWEITEN Aufruf neu zählt, ist er hier noch da.
    vi.advanceTimersByTime(999);
    expect(screen.getByText("Zweiter Text")).toBeTruthy();
    vi.advanceTimersByTime(1);
    expect(screen.queryByText("Zweiter Text")).toBeNull();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- useErfolgsHinweis`
Erwartet: FAIL — Modul `./useErfolgsHinweis` existiert noch nicht.

- [ ] **Step 3: Hook implementieren**

```ts
import { useRef, useState } from "react";
import { Hinweis } from "../components/Hinweis";

export function useErfolgsHinweis() {
  const zaehler = useRef(0);
  const [banner, setBanner] = useState<{ text: string; id: number } | null>(null);

  function zeigen(text: string) {
    zaehler.current += 1;
    setBanner({ text, id: zaehler.current });
  }

  const hinweis = banner && (
    <Hinweis key={banner.id} autoDismissMs={4000} onSchliessen={() => setBanner(null)}>
      {banner.text}
    </Hinweis>
  );

  return { zeigen, hinweis };
}
```

Wichtig: `banner.id` kommt aus einem `useRef`-Zähler, NICHT aus `Date.now()` — unter `vi.useFakeTimers()` (Step 1s dritter Test) friert `Date.now()` ein, ein zeitbasierter Zähler würde den Retrigger-Test also nicht korrekt beweisen.

- [ ] **Step 4: Tests laufen**

Run: `npm test -- useErfolgsHinweis`
Erwartet: PASS (3/3).

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 65/65 (62 bestehend + 3 neu)
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useErfolgsHinweis.ts src/hooks/useErfolgsHinweis.test.tsx
git commit -m "feat: useErfolgsHinweis-Hook für konsistentes Erfolgs-Feedback"
```

---

### Task 2: `KundeDetail.tsx` — Stammdaten

**Files:**
- Modify: `src/pages/KundeDetail.tsx`
- Modify: `src/pages/KundeDetail.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

An `src/pages/KundeDetail.test.tsx` anhängen:

```tsx
  it("zeigt nach dem Speichern der Stammdaten einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText('Kunde „ACME GmbH" gespeichert')).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- KundeDetail`
Erwartet: FAIL — kein Erfolgs-Hinweis vorhanden.

- [ ] **Step 3: Import ergänzen**

Nach den bestehenden Imports in `src/pages/KundeDetail.tsx`:

```tsx
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { formatCent } from "../geld";
```

(Ersetzt die bisherigen zwei Zeilen `import { Fehler } from "../components/Fehler";` und `import { formatCent } from "../geld";` — die neue Zeile wird dazwischen eingefügt.)

- [ ] **Step 4: `StammdatenReiter` anpassen**

Vorher:
```tsx
function StammdatenReiter({ kunde, onGespeichert }: StammdatenReiterProps) {
  const [form, setForm] = useState<Kunde>(kunde);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    setForm(kunde);
  }, [kunde]);

  async function speichern() {
    setFehler(null);
    setGespeichert(false);
    try {
      await api.kunden.update(form);
      setGespeichert(true);
      onGespeichert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
function StammdatenReiter({ kunde, onGespeichert }: StammdatenReiterProps) {
  const [form, setForm] = useState<Kunde>(kunde);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  useEffect(() => {
    setForm(kunde);
  }, [kunde]);

  async function speichern() {
    setFehler(null);
    try {
      await api.kunden.update(form);
      zeigen(`Kunde „${form.name}" gespeichert`);
      onGespeichert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Render):
```tsx
    <section>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {gespeichert && <p>Gespeichert.</p>}
      <form
```

Nachher:
```tsx
    <section>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {hinweis}
      <form
```

- [ ] **Step 5: Test läuft**

Run: `npm test -- KundeDetail`
Erwartet: PASS.

- [ ] **Step 6: Volle Suite + Build**

Run: `npm test` → 66/66
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/KundeDetail.tsx src/pages/KundeDetail.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Kunde-Stammdaten speichern"
```

---

### Task 3: `KundeDetail.tsx` — Adressen

**Files:**
- Modify: `src/pages/KundeDetail.tsx`
- Modify: `src/pages/KundeDetail.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests ergänzen**

An `src/pages/KundeDetail.test.tsx` anhängen:

```tsx
  it("zeigt nach dem Anlegen einer neuen Adresse einen Erfolgs-Hinweis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.adresseSave).mockResolvedValueOnce({
      id: "adr2", kunde_id: "1", typ: "rechnung", strasse: "Neue Str. 5",
      plz: "54321", ort: "Neustadt", land: "DE", ist_standard: false,
    });
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Straße"), { target: { value: "Neue Str. 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(screen.getByText("Adresse angelegt")).toBeTruthy());
  });

  it("zeigt nach dem Löschen einer Adresse einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Adresse gelöscht")).toBeTruthy());
  });
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- KundeDetail`
Erwartet: FAIL — kein Erfolgs-Hinweis in `AdressenReiter` vorhanden.

- [ ] **Step 3: `AdressenReiter` anpassen**

Vorher:
```tsx
function AdressenReiter({ kundeId, adressen, onGeaendert }: AdressenReiterProps) {
  const [form, setForm] = useState<Omit<Adresse, "id"> & { id?: string }>(ADRESSE_NEU(kundeId));
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await api.kunden.adresseSave({ id: form.id ?? "", ...form } as Adresse);
      setForm(ADRESSE_NEU(kundeId));
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.kunden.adresseDelete(id);
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
function AdressenReiter({ kundeId, adressen, onGeaendert }: AdressenReiterProps) {
  const [form, setForm] = useState<Omit<Adresse, "id"> & { id?: string }>(ADRESSE_NEU(kundeId));
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function speichern() {
    setFehler(null);
    const warNeu = !form.id;
    try {
      await api.kunden.adresseSave({ id: form.id ?? "", ...form } as Adresse);
      setForm(ADRESSE_NEU(kundeId));
      zeigen(warNeu ? "Adresse angelegt" : "Adresse gespeichert");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

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

Vorher (Render):
```tsx
  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Typ</th>
```

Nachher — dieser exakte Block existiert ZWEIMAL in `KundeDetail.tsx` (Adressen und Ansprechpartner beginnen beide mit `{fehler && <Fehler fehler={fehler} />}` gefolgt von `<table className="tabelle">`) — hier NUR die Stelle in `AdressenReiter` ändern (die mit `<th>Typ</th>` als erster Tabellenspalte, nicht `<th>Name</th>` wie bei Ansprechpartner):

```tsx
  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Typ</th>
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- KundeDetail`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 68/68
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/KundeDetail.tsx src/pages/KundeDetail.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Adresse anlegen/speichern/löschen"
```

---

### Task 4: `KundeDetail.tsx` — Ansprechpartner

**Files:**
- Modify: `src/pages/KundeDetail.tsx`
- Modify: `src/pages/KundeDetail.test.tsx`

- [ ] **Step 1: Mock um einen bestehenden Ansprechpartner erweitern**

In `src/pages/KundeDetail.test.tsx`, im `vi.mock("../api", ...)`-Block:

Vorher:
```tsx
        adressen: [
          {
            id: "adr1",
            kunde_id: "1",
            typ: "rechnung",
            strasse: "Musterstr. 1",
            plz: "12345",
            ort: "Musterstadt",
            land: "DE",
            ist_standard: true,
          },
        ],
        ansprechpartner: [],
```

Nachher:
```tsx
        adressen: [
          {
            id: "adr1",
            kunde_id: "1",
            typ: "rechnung",
            strasse: "Musterstr. 1",
            plz: "12345",
            ort: "Musterstadt",
            land: "DE",
            ist_standard: true,
          },
        ],
        ansprechpartner: [
          {
            id: "ap1",
            kunde_id: "1",
            name: "Erika Musterfrau",
            rolle: "Einkauf",
            email: "",
            telefon: "",
            ist_standard: false,
          },
        ],
```

- [ ] **Step 2: Fehlschlagende Tests ergänzen**

An `src/pages/KundeDetail.test.tsx` anhängen:

```tsx
  it("zeigt nach dem Anlegen eines neuen Ansprechpartners einen Erfolgs-Hinweis mit Namen", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.ansprechpartnerSave).mockResolvedValueOnce({
      id: "ap2", kunde_id: "1", name: "Max Mustermann", rolle: "", email: "", telefon: "", ist_standard: false,
    });
    render(<KundeDetail id="1" startReiter="ansprechpartner" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ansprechpartner" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Max Mustermann" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(screen.getByText('Ansprechpartner „Max Mustermann" angelegt')).toBeTruthy());
  });

  it("zeigt nach dem Löschen eines Ansprechpartners einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="ansprechpartner" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ansprechpartner" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Ansprechpartner gelöscht")).toBeTruthy());
  });
```

- [ ] **Step 3: Tests laufen nicht**

Run: `npm test -- KundeDetail`
Erwartet: FAIL — kein Erfolgs-Hinweis in `AnsprechpartnerReiter` vorhanden.

- [ ] **Step 4: `AnsprechpartnerReiter` anpassen**

Vorher:
```tsx
function AnsprechpartnerReiter({ kundeId, ansprechpartner, onGeaendert }: AnsprechpartnerReiterProps) {
  const [form, setForm] = useState<Omit<Ansprechpartner, "id"> & { id?: string }>(
    ANSPRECHPARTNER_NEU(kundeId),
  );
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await api.kunden.ansprechpartnerSave({
        id: form.id ?? "",
        ...form,
      } as Ansprechpartner);
      setForm(ANSPRECHPARTNER_NEU(kundeId));
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.kunden.ansprechpartnerDelete(id);
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
function AnsprechpartnerReiter({ kundeId, ansprechpartner, onGeaendert }: AnsprechpartnerReiterProps) {
  const [form, setForm] = useState<Omit<Ansprechpartner, "id"> & { id?: string }>(
    ANSPRECHPARTNER_NEU(kundeId),
  );
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function speichern() {
    setFehler(null);
    const warNeu = !form.id;
    const gespeicherterName = form.name;
    try {
      await api.kunden.ansprechpartnerSave({
        id: form.id ?? "",
        ...form,
      } as Ansprechpartner);
      setForm(ANSPRECHPARTNER_NEU(kundeId));
      zeigen(
        warNeu
          ? `Ansprechpartner „${gespeicherterName}" angelegt`
          : `Ansprechpartner „${gespeicherterName}" gespeichert`,
      );
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

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

(`gespeicherterName` wird VOR `setForm(ANSPRECHPARTNER_NEU(kundeId))` gesichert, da dieser Aufruf `form.name` sonst schon zurückgesetzt hat, bevor die Erfolgsmeldung ihn braucht.)

Vorher (Render — die Stelle in `AnsprechpartnerReiter`, erkennbar an `<th>Name</th>` als erster Tabellenspalte):
```tsx
  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
```

Nachher:
```tsx
  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
```

- [ ] **Step 5: Tests laufen**

Run: `npm test -- KundeDetail`
Erwartet: PASS.

- [ ] **Step 6: Volle Suite + Build**

Run: `npm test` → 70/70
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/KundeDetail.tsx src/pages/KundeDetail.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Ansprechpartner anlegen/speichern/löschen"
```

---

### Task 5: `Artikel.tsx` — Neuanlage und Bearbeiten

**Files:**
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests ergänzen**

An `src/pages/Artikel.test.tsx` anhängen:

```tsx
  it("zeigt nach dem Anlegen eines Artikels einen Erfolgs-Hinweis, wenn bereits Kunden existieren", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Konzeption" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText('Artikel „Konzeption" angelegt')).toBeTruthy());
  });

  it("zeigt nach dem Bearbeiten eines Artikels einen Erfolgs-Hinweis", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText('Artikel „Beratung" gespeichert')).toBeTruthy());
  });
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Artikel`
Erwartet: FAIL — kein Erfolgs-Hinweis vorhanden.

- [ ] **Step 3: Import ergänzen**

Vorher:
```tsx
import { Fehler } from "../components/Fehler";
import { Hinweis } from "../components/Hinweis";
import { formatCent, parseEuro } from "../geld";
```

Nachher:
```tsx
import { Fehler } from "../components/Fehler";
import { Hinweis } from "../components/Hinweis";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { formatCent, parseEuro } from "../geld";
```

- [ ] **Step 4: Hook aufrufen und `speichern()` anpassen**

Vorher (Hook-Aufruf, direkt nach den bestehenden `useState`-Zeilen in `Artikel`):
```tsx
  const [zeigtKundenHinweis, setZeigtKundenHinweis] = useState(false);

  useEffect(() => {
```

Nachher:
```tsx
  const [zeigtKundenHinweis, setZeigtKundenHinweis] = useState(false);
  const { zeigen, hinweis } = useErfolgsHinweis();

  useEffect(() => {
```

Vorher (`speichern()`):
```tsx
    try {
      if (bearbeiteId) {
        await api.artikel.update({
          id: bearbeiteId,
          artikelnummer: artikel.find((a) => a.id === bearbeiteId)?.artikelnummer ?? "",
          kundenpreise_anzahl: artikel.find((a) => a.id === bearbeiteId)?.kundenpreise_anzahl ?? 0,
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
      } else {
        await api.artikel.create({
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
        if (kunden.length === 0) {
          setZeigtKundenHinweis(true);
        }
      }
      setZeigeFormular(false);
      ladeArtikel();
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
    try {
      if (bearbeiteId) {
        await api.artikel.update({
          id: bearbeiteId,
          artikelnummer: artikel.find((a) => a.id === bearbeiteId)?.artikelnummer ?? "",
          kundenpreise_anzahl: artikel.find((a) => a.id === bearbeiteId)?.kundenpreise_anzahl ?? 0,
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
        zeigen(`Artikel „${form.bezeichnung}" gespeichert`);
      } else {
        await api.artikel.create({
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
        if (kunden.length === 0) {
          setZeigtKundenHinweis(true);
        } else {
          zeigen(`Artikel „${form.bezeichnung}" angelegt`);
        }
      }
      setZeigeFormular(false);
      ladeArtikel();
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }
```

- [ ] **Step 5: Render anpassen**

Vorher:
```tsx
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />

      {zeigtKundenHinweis && (
```

Nachher:
```tsx
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />
      {hinweis}

      {zeigtKundenHinweis && (
```

- [ ] **Step 6: Tests laufen**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 7: Volle Suite + Build**

Run: `npm test` → 72/72
Run: `npm run build` → PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/Artikel.tsx src/pages/Artikel.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Artikel anlegen/speichern"
```

---

### Task 6: `Artikel.tsx` — Kundenpreise

**Files:**
- Modify: `src/pages/Artikel.tsx`
- Modify: `src/pages/Artikel.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

An `src/pages/Artikel.test.tsx` anhängen:

```tsx
  it("zeigt nach dem Anlegen eines Kundenpreises einen Erfolgs-Hinweis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([]);
    vi.mocked(api.artikel.kundenpreisSave).mockResolvedValueOnce({
      id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: null,
    });
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "ACME GmbH" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Kunde"), { target: { value: "k1" } });
    fireEvent.change(screen.getByLabelText("Preis (€)"), { target: { value: "65,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText("Kundenpreis angelegt")).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Artikel`
Erwartet: FAIL — kein Erfolgs-Hinweis in `KundenpreiseBereich` vorhanden.

- [ ] **Step 3: `KundenpreiseBereich` anpassen**

Vorher (Hook-Aufruf, direkt nach den bestehenden `useState`-Zeilen in `KundenpreiseBereich`):
```tsx
  const [gueltigAb, setGueltigAb] = useState("");

  function laden() {
```

Nachher:
```tsx
  const [gueltigAb, setGueltigAb] = useState("");
  const { zeigen, hinweis } = useErfolgsHinweis();

  function laden() {
```

Vorher (`speichern()`):
```tsx
      setKundeId("");
      setPreisText("");
      setGueltigAb("");
      laden();
      onAenderung();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
      setKundeId("");
      setPreisText("");
      setGueltigAb("");
      laden();
      onAenderung();
      zeigen("Kundenpreis angelegt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Render):
```tsx
  return (
    <div className="kundenpreis-bereich">
      <div className="kundenpreis-liste-box">
```

Nachher:
```tsx
  return (
    <div className="kundenpreis-bereich">
      {hinweis}
      <div className="kundenpreis-liste-box">
```

- [ ] **Step 4: Test läuft**

Run: `npm test -- Artikel`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 73/73
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Artikel.tsx src/pages/Artikel.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Kundenpreis anlegen"
```

---

### Task 7: `BelegEditor.tsx` — Stammdaten, Stellen, Angebot-Status, Stornieren, Position löschen

**Files:**
- Modify: `src/pages/BelegEditor.tsx`
- Modify: `src/pages/BelegEditor.test.tsx`

Diese fünf Aktionen (`stammdatenSpeichern`, `stellen`, `angebotStatus`, `stornieren`, `positionLoeschen`) leben alle in der obersten `BelegEditor`-Funktion selbst — ein gemeinsamer Hook-Aufruf genügt. (`positionLoeschen` ist trotz des Themas "Positionen" hier korrekt platziert, nicht in Task 8 — die Funktion ist in `BelegEditor` selbst definiert, nicht in `PositionenAbschnitt`; nur `hinzufuegen()` lebt dort, siehe Task 8.)

- [ ] **Step 1: Fehlende Mocks in `BelegEditor.test.tsx` ergänzen**

`api.belege.update`, `api.belege.angebotStatusSetzen` und `api.belege.rechnungStornieren` sind im bestehenden `vi.mock("../api", ...)`-Block noch NICHT enthalten — sie werden für die neuen Tests in Step 2 gebraucht, sonst schlagen die Aufrufe mit „is not a function" fehl.

Vorher:
```tsx
      positionSave: vi.fn().mockResolvedValue({
        id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "", einheit_kuerzel: "",
        einzelpreis_cent: 0, menge: 1000, positionssumme_cent: 0, reihenfolge: 0,
      }),
      stellen: vi.fn().mockResolvedValue({
```

Nachher:
```tsx
      positionSave: vi.fn().mockResolvedValue({
        id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "", einheit_kuerzel: "",
        einzelpreis_cent: 0, menge: 1000, positionssumme_cent: 0, reihenfolge: 0,
      }),
      update: vi.fn().mockResolvedValue({
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      }),
      angebotStatusSetzen: vi.fn().mockResolvedValue({
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "angenommen", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      }),
      rechnungStornieren: vi.fn().mockResolvedValue({
        id: "b1", typ: "rechnung", nummer: "R-2026-0001", status: "storniert", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      }),
      stellen: vi.fn().mockResolvedValue({
```

- [ ] **Step 2: Fehlschlagende Tests ergänzen**

An `src/pages/BelegEditor.test.tsx` anhängen (neuer `describe`-Block):

```tsx
describe("BelegEditor – Erfolgs-Hinweis", () => {
  it("zeigt nach dem Speichern der Stammdaten einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText("Angebot gespeichert")).toBeTruthy());
  });

  it("zeigt nach dem Stellen einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: null, status: "entwurf", kunde_id: "k1",
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
    fireEvent.click(screen.getByRole("button", { name: "Stellen" }));
    await waitFor(() => expect(screen.getByText("Rechnung gestellt")).toBeTruthy());
  });

  it("zeigt nach dem Setzen des Angebot-Status einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "versendet", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Angenommen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Angenommen" }));
    await waitFor(() => expect(screen.getByText("Status aktualisiert")).toBeTruthy());
  });

  it("zeigt nach dem Stornieren einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "R-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Stornieren" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Stornieren" }));
    await waitFor(() => expect(screen.getByText("Rechnung storniert")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("Position gelöscht")).toBeTruthy());
  });
});
```

- [ ] **Step 3: Tests laufen nicht**

Run: `npm test -- BelegEditor`
Erwartet: FAIL — kein Erfolgs-Hinweis vorhanden (die vier neuen Tests schlagen fehl, die bestehenden bleiben grün).

- [ ] **Step 4: Import und Hook-Aufruf ergänzen**

Vorher:
```tsx
import { Fehler } from "../components/Fehler";
import { formatCent, formatMenge, parseEuro, parseMenge } from "../geld";
```

Nachher:
```tsx
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { formatCent, formatMenge, parseEuro, parseMenge } from "../geld";
```

Vorher:
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.belege
```

Nachher:
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  function laden() {
    api.belege
```

- [ ] **Step 5: Die vier Funktionen anpassen**

Vorher (`stammdatenSpeichern`):
```tsx
    setFehler(null);
    try {
      await api.belege.update({ id: beleg.id, kunde_id: beleg.kunde_id, ...felder });
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function stellen() {
```

Nachher:
```tsx
    setFehler(null);
    try {
      await api.belege.update({ id: beleg.id, kunde_id: beleg.kunde_id, ...felder });
      laden();
      zeigen(beleg.typ === "angebot" ? "Angebot gespeichert" : "Rechnung gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function stellen() {
```

Vorher (`stellen`):
```tsx
  async function stellen() {
    setFehler(null);
    try {
      await api.belege.stellen(beleg.id);
      laden();
      onGeaendert?.();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function stellen() {
    setFehler(null);
    try {
      await api.belege.stellen(beleg.id);
      laden();
      onGeaendert?.();
      zeigen(beleg.typ === "angebot" ? "Angebot versendet" : "Rechnung gestellt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (`angebotStatus`):
```tsx
  async function angebotStatus(status: string) {
    setFehler(null);
    try {
      await api.belege.angebotStatusSetzen(beleg.id, status);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function angebotStatus(status: string) {
    setFehler(null);
    try {
      await api.belege.angebotStatusSetzen(beleg.id, status);
      laden();
      zeigen("Status aktualisiert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (`stornieren`):
```tsx
  async function stornieren() {
    setFehler(null);
    try {
      await api.belege.rechnungStornieren(beleg.id);
      laden();
      onGeaendert?.();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function stornieren() {
    setFehler(null);
    try {
      await api.belege.rechnungStornieren(beleg.id);
      laden();
      onGeaendert?.();
      zeigen("Rechnung storniert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (`positionLoeschen`):
```tsx
  async function positionLoeschen(positionId: string) {
    setFehler(null);
    try {
      await api.belege.positionDelete(positionId);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
  async function positionLoeschen(positionId: string) {
    setFehler(null);
    try {
      await api.belege.positionDelete(positionId);
      laden();
      zeigen("Position gelöscht");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

- [ ] **Step 6: Render anpassen**

Vorher:
```tsx
      {fehler && <Fehler fehler={fehler} />}

      <StammdatenAbschnitt
```

Nachher:
```tsx
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}

      <StammdatenAbschnitt
```

- [ ] **Step 7: Tests laufen**

Run: `npm test -- BelegEditor`
Erwartet: PASS.

- [ ] **Step 8: Volle Suite + Build**

Run: `npm test` → 78/78
Run: `npm run build` → PASS

- [ ] **Step 9: Commit**

```bash
git add src/pages/BelegEditor.tsx src/pages/BelegEditor.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Stammdaten speichern, Stellen, Angebot-Status, Stornieren"
```

---

### Task 8: `BelegEditor.tsx` — Position hinzufügen

**Files:**
- Modify: `src/pages/BelegEditor.tsx`
- Modify: `src/pages/BelegEditor.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

An `src/pages/BelegEditor.test.tsx` anhängen:

```tsx
  it("zeigt nach dem Hinzufügen einer Position einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    vi.mocked(api.artikel.list).mockResolvedValue([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 0,
      },
    ]);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Position hinzufügen" }));
    await waitFor(() => expect(screen.getByText("Position hinzugefügt")).toBeTruthy());
  });
```

Diesen Test in den bestehenden `describe("BelegEditor – Position hinzufügen", ...)`-Block einfügen (nicht in einen neuen).

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- BelegEditor`
Erwartet: FAIL — kein Erfolgs-Hinweis in `PositionenAbschnitt` vorhanden.

- [ ] **Step 3: `PositionenAbschnitt` anpassen**

Vorher (Hook-Aufruf, direkt nach den bestehenden `useState`-Zeilen):
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  async function hinzufuegen() {
```

Nachher:
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function hinzufuegen() {
```

Vorher (Ende von `hinzufuegen()`):
```tsx
      setBezeichnung("");
      setEinheitKuerzel("");
      setEinzelpreis("");
      setMenge("1");
      setArtikelId("");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
      setBezeichnung("");
      setEinheitKuerzel("");
      setEinzelpreis("");
      setMenge("1");
      setArtikelId("");
      onGeaendert();
      zeigen("Position hinzugefügt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Render):
```tsx
    <section className="karte">
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      <table className="tabelle">
```

Nachher:
```tsx
    <section className="karte">
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      <table className="tabelle">
```

- [ ] **Step 4: Test läuft**

Run: `npm test -- BelegEditor`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 79/79
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/BelegEditor.tsx src/pages/BelegEditor.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Position hinzufügen"
```

---

### Task 9: `BelegEditor.tsx` — Zahlung erfassen

**Files:**
- Modify: `src/pages/BelegEditor.tsx`
- Modify: `src/pages/BelegEditor.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

An `src/pages/BelegEditor.test.tsx` anhängen, im bestehenden `describe("BelegEditor – Zahlungen", ...)`-Block:

```tsx
  it("zeigt nach dem Erfassen einer Zahlung einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "R-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 5000, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 5000,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("gestellt", { selector: ".status" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Zahlung erfassen" }));
    await waitFor(() => expect(screen.getByText("Zahlung erfasst")).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- BelegEditor`
Erwartet: FAIL — kein Erfolgs-Hinweis in `ZahlungenAbschnitt` vorhanden.

- [ ] **Step 3: `ZahlungenAbschnitt` anpassen**

Vorher (Hook-Aufruf, direkt nach den bestehenden `useState`-Zeilen):
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  async function erfassen() {
```

Nachher:
```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function erfassen() {
```

Vorher (Ende von `erfassen()`):
```tsx
      setBetrag("");
      setNotiz("");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
      setBetrag("");
      setNotiz("");
      onGeaendert();
      zeigen("Zahlung erfasst");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Render):
```tsx
    <section className="karte">
      <h2>Zahlungen</h2>
      {fehler && <Fehler fehler={fehler} />}
      <p>Offener Betrag: {formatCent(offenerBetragCent)}</p>
```

Nachher:
```tsx
    <section className="karte">
      <h2>Zahlungen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      <p>Offener Betrag: {formatCent(offenerBetragCent)}</p>
```

- [ ] **Step 4: Test läuft**

Run: `npm test -- BelegEditor`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 80/80
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/BelegEditor.tsx src/pages/BelegEditor.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Zahlung erfassen"
```

---

### Task 10: `Einstellungen.tsx` — Firmendaten

**Files:**
- Modify: `src/pages/Einstellungen.tsx`
- Modify: `src/pages/Einstellungen.test.tsx`

- [ ] **Step 1: `fireEvent` importieren und fehlschlagenden Test ergänzen**

Vorher (Import-Zeile in `src/pages/Einstellungen.test.tsx`):
```tsx
import { cleanup, render, screen, waitFor } from "@testing-library/react";
```

Nachher:
```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Anhängen:

```tsx
  it("zeigt nach dem Speichern der Firmendaten einen Erfolgs-Hinweis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.firma.save).mockResolvedValueOnce({
      id: "1", name: "Musterfirma", strasse: "Musterstr. 1", plz: "12345", ort: "Musterstadt",
      land: "DE", steuernummer: "123/456/789", ust_idnr: "", iban: "", bic: "",
      kleinunternehmer: true, eingerichtet: true,
    });
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByDisplayValue("Musterfirma")).toBeTruthy());
    // Index 0: Firmendaten ist der erste Abschnitt auf der Seite, dessen
    // "Speichern"-Button ist damit im DOM immer der erste unter diesem Namen.
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[0]);
    await waitFor(() => expect(screen.getByText("Firmendaten gespeichert")).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Einstellungen`
Erwartet: FAIL — kein Erfolgs-Hinweis in `FirmendatenAbschnitt` vorhanden.

- [ ] **Step 3: Import ergänzen**

Vorher:
```tsx
import {
  api,
  istValidierungsfehler,
  type AppFehler,
  type Einheit,
  type Firma,
  type Nummernkreis,
} from "../api";
import { Fehler } from "../components/Fehler";
```

Nachher:
```tsx
import {
  api,
  istValidierungsfehler,
  type AppFehler,
  type Einheit,
  type Firma,
  type Nummernkreis,
} from "../api";
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
```

- [ ] **Step 4: `FirmendatenAbschnitt` anpassen**

Vorher:
```tsx
function FirmendatenAbschnitt() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    api.firma.get().then(setFirma).catch((e) => setFehler(e as AppFehler));
  }, []);

  async function speichern() {
    if (!firma) return;
    setFehler(null);
    setGespeichert(false);
    try {
      const gespeicherteFirma = await api.firma.save(firma);
      setFirma(gespeicherteFirma);
      setGespeichert(true);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
function FirmendatenAbschnitt() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  useEffect(() => {
    api.firma.get().then(setFirma).catch((e) => setFehler(e as AppFehler));
  }, []);

  async function speichern() {
    if (!firma) return;
    setFehler(null);
    try {
      const gespeicherteFirma = await api.firma.save(firma);
      setFirma(gespeicherteFirma);
      zeigen("Firmendaten gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Render):
```tsx
      <h2>Firmendaten</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {gespeichert && <p>Gespeichert.</p>}
      <form
```

Nachher:
```tsx
      <h2>Firmendaten</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {hinweis}
      <form
```

- [ ] **Step 5: Test läuft**

Run: `npm test -- Einstellungen`
Erwartet: PASS.

- [ ] **Step 6: Volle Suite + Build**

Run: `npm test` → 81/81
Run: `npm run build` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/Einstellungen.tsx src/pages/Einstellungen.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Firmendaten speichern"
```

---

### Task 11: `Einstellungen.tsx` — Einheiten

**Files:**
- Modify: `src/pages/Einstellungen.tsx`
- Modify: `src/pages/Einstellungen.test.tsx`

- [ ] **Step 1: Fehlschlagende Tests ergänzen**

```tsx
  it("zeigt nach dem Anlegen einer neuen Einheit einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByText("Std")).toBeTruthy());
    // Index 1: Firmendaten hat ebenfalls ein "Name"-Feld und steht davor im DOM.
    fireEvent.change(screen.getAllByLabelText("Name")[1], { target: { value: "Pauschale" } });
    fireEvent.change(screen.getByLabelText("Kürzel"), { target: { value: "Pausch" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(screen.getByText('Einheit „Pauschale" angelegt')).toBeTruthy());
  });

  it("zeigt nach dem Löschen einer Einheit einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Einheit gelöscht")).toBeTruthy());
  });
```

- [ ] **Step 2: Tests laufen nicht**

Run: `npm test -- Einstellungen`
Erwartet: FAIL — kein Erfolgs-Hinweis in `EinheitenAbschnitt` vorhanden.

- [ ] **Step 3: `EinheitenAbschnitt` anpassen**

Vorher:
```tsx
function EinheitenAbschnitt() {
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [name, setName] = useState("");
  const [kuerzel, setKuerzel] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);

  function laden() {
    api.einheiten
      .list()
      .then((liste) => {
        setEinheiten(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  async function speichern() {
    setFehler(null);
    try {
      if (bearbeiteId) {
        await api.einheiten.update({ id: bearbeiteId, name, kuerzel });
      } else {
        await api.einheiten.create(name, kuerzel);
      }
      setName("");
      setKuerzel("");
      setBearbeiteId(null);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.einheiten.delete(id);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
function EinheitenAbschnitt() {
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [name, setName] = useState("");
  const [kuerzel, setKuerzel] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  function laden() {
    api.einheiten
      .list()
      .then((liste) => {
        setEinheiten(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  async function speichern() {
    setFehler(null);
    const warNeu = !bearbeiteId;
    const gespeicherterName = name;
    try {
      if (bearbeiteId) {
        await api.einheiten.update({ id: bearbeiteId, name, kuerzel });
      } else {
        await api.einheiten.create(name, kuerzel);
      }
      setName("");
      setKuerzel("");
      setBearbeiteId(null);
      laden();
      zeigen(
        warNeu ? `Einheit „${gespeicherterName}" angelegt` : `Einheit „${gespeicherterName}" gespeichert`,
      );
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

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

Vorher (Render):
```tsx
      <h2>Einheiten</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      <table className="tabelle">
```

Nachher:
```tsx
      <h2>Einheiten</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {hinweis}
      <table className="tabelle">
```

- [ ] **Step 4: Tests laufen**

Run: `npm test -- Einstellungen`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 83/83
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Einstellungen.tsx src/pages/Einstellungen.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Einheit anlegen/speichern/löschen"
```

---

### Task 12: `Einstellungen.tsx` — Nummernkreise

**Files:**
- Modify: `src/pages/Einstellungen.tsx`
- Modify: `src/pages/Einstellungen.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

```tsx
  it("zeigt nach dem Speichern eines Nummernkreises einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByDisplayValue("R-{jahr}-{nr}")).toBeTruthy());
    // Index 1: Firmendaten (0) steht im DOM vor dem einzigen Nummernkreis-Eintrag (1).
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[1]);
    await waitFor(() => expect(screen.getByText("Nummernkreis gespeichert")).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Einstellungen`
Erwartet: FAIL — kein Erfolgs-Hinweis in `NummernkreiseAbschnitt` vorhanden.

- [ ] **Step 3: `NummernkreiseAbschnitt` anpassen**

Vorher:
```tsx
function NummernkreiseAbschnitt() {
  const [nummernkreise, setNummernkreise] = useState<Nummernkreis[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.einstellungen
      .nummernkreise()
      .then((liste) => {
        setNummernkreise(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  async function speichern(nk: Nummernkreis) {
    setFehler(null);
    try {
      await api.einstellungen.nummernkreisUpdate(nk.art, nk.format, nk.jahres_reset);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
function NummernkreiseAbschnitt() {
  const [nummernkreise, setNummernkreise] = useState<Nummernkreis[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  function laden() {
    api.einstellungen
      .nummernkreise()
      .then((liste) => {
        setNummernkreise(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  async function speichern(nk: Nummernkreis) {
    setFehler(null);
    try {
      await api.einstellungen.nummernkreisUpdate(nk.art, nk.format, nk.jahres_reset);
      laden();
      zeigen("Nummernkreis gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Render):
```tsx
      <h2>Nummernkreise</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {nummernkreise.map((nk) => (
```

Nachher:
```tsx
      <h2>Nummernkreise</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {hinweis}
      {nummernkreise.map((nk) => (
```

- [ ] **Step 4: Test läuft**

Run: `npm test -- Einstellungen`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 84/84
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Einstellungen.tsx src/pages/Einstellungen.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Nummernkreis speichern"
```

---

### Task 13: `Einstellungen.tsx` — Textbausteine

**Files:**
- Modify: `src/pages/Einstellungen.tsx`
- Modify: `src/pages/Einstellungen.test.tsx`

- [ ] **Step 1: Fehlschlagenden Test ergänzen**

```tsx
  it("zeigt nach dem Speichern eines Textbausteins einen Erfolgs-Hinweis mit Feldname", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByDisplayValue("Vielen Dank für Ihren Auftrag.")).toBeTruthy());
    // Reihenfolge im DOM: Firmendaten (0), Nummernkreis (1), dann Textbausteine
    // in TEXTBAUSTEIN_KEYS-Reihenfolge: Kleinunternehmer-Hinweis (2),
    // Rechnungs-Fußtext (3), Angebots-Fußtext (4).
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[3]);
    await waitFor(() => expect(screen.getByText("Rechnungs-Fußtext gespeichert")).toBeTruthy());
  });
```

- [ ] **Step 2: Test läuft nicht**

Run: `npm test -- Einstellungen`
Erwartet: FAIL — kein Erfolgs-Hinweis in `TextbausteineAbschnitt` vorhanden.

- [ ] **Step 3: `TextbausteineAbschnitt` anpassen**

Vorher:
```tsx
function TextbausteineAbschnitt() {
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  useEffect(() => {
    Promise.all(TEXTBAUSTEIN_KEYS.map((key) => api.einstellungen.get(key)))
      .then((liste) => {
        const neueWerte: Record<string, string> = {};
        TEXTBAUSTEIN_KEYS.forEach((key, i) => {
          neueWerte[key] = liste[i] ?? "";
        });
        setWerte(neueWerte);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }, []);

  function aendere(key: string, wert: string) {
    setWerte((bisherige) => ({ ...bisherige, [key]: wert }));
  }

  async function speichern(key: string) {
    setFehler(null);
    try {
      await api.einstellungen.set(key, werte[key] ?? "");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Nachher:
```tsx
function TextbausteineAbschnitt() {
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  useEffect(() => {
    Promise.all(TEXTBAUSTEIN_KEYS.map((key) => api.einstellungen.get(key)))
      .then((liste) => {
        const neueWerte: Record<string, string> = {};
        TEXTBAUSTEIN_KEYS.forEach((key, i) => {
          neueWerte[key] = liste[i] ?? "";
        });
        setWerte(neueWerte);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }, []);

  function aendere(key: string, wert: string) {
    setWerte((bisherige) => ({ ...bisherige, [key]: wert }));
  }

  async function speichern(key: string) {
    setFehler(null);
    try {
      await api.einstellungen.set(key, werte[key] ?? "");
      zeigen(`${TEXTBAUSTEIN_LABEL[key]} gespeichert`);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }
```

Vorher (Render):
```tsx
      <h2>Textbausteine</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {TEXTBAUSTEIN_KEYS.map((key) => (
```

Nachher:
```tsx
      <h2>Textbausteine</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {hinweis}
      {TEXTBAUSTEIN_KEYS.map((key) => (
```

- [ ] **Step 4: Test läuft**

Run: `npm test -- Einstellungen`
Erwartet: PASS.

- [ ] **Step 5: Volle Suite + Build**

Run: `npm test` → 85/85
Run: `npm run build` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Einstellungen.tsx src/pages/Einstellungen.test.tsx
git commit -m "feat: Erfolgs-Hinweis für Textbaustein speichern"
```

---

### Task 14: Abschlussprüfung

**Files:** keine Änderungen — reine Verifikation.

- [ ] **Step 1: Vollständige Frontend-Test-Suite**

Run: `npm test`
Erwartet: alle 85 Tests grün.

- [ ] **Step 2: Typecheck und Build**

Run: `npm run build`
Erwartet: `tsc && vite build` erfolgreich, keine Typfehler.

- [ ] **Step 3: Rust-Tests**

Run: `cd src-tauri && cargo test`
Erwartet: 99 Tests grün — unverändert, dieser Plan berührt keinen Rust-Code.

- [ ] **Step 4: Manuelle Abnahme (durch Auftraggeber)**

`npm run tauri dev` starten und folgende Abläufe einmal live durchklicken:
1. Kunde bearbeiten (Stammdaten) speichern → grüner Banner mit Kundenname, verschwindet nach ~4 Sekunden.
2. Adresse und Ansprechpartner jeweils anlegen und löschen → jeweils eigener Banner.
3. Artikel anlegen (bei bereits vorhandenen Kunden) und bearbeiten → Banner mit Artikelbezeichnung.
4. Kundenpreis anlegen → „Kundenpreis angelegt".
5. Ein Angebot/eine Rechnung anlegen → bewusst KEIN Banner (Landung direkt im BelegEditor ist die Bestätigung) — prüfen, dass das nicht wie ein Bug wirkt.
6. Im BelegEditor: Stammdaten speichern, Stellen, bei einem versendeten Angebot einen Abschluss-Status setzen, eine Position hinzufügen, bei einer gestellten Rechnung eine Zahlung erfassen, eine Rechnung stornieren → je ein eigener Banner.
7. In den Einstellungen: Firmendaten speichern, eine Einheit anlegen/löschen, einen Nummernkreis speichern, einen Textbaustein speichern → je ein eigener Banner.
8. Zwei Speichern-Aktionen kurz hintereinander auf derselben Seite auslösen (z. B. zwei Textbausteine nacheinander) → der zweite Banner ersetzt den ersten sauber, verschwindet nicht vorzeitig.
9. Hell- und Dunkelmodus gegenprüfen (Systemeinstellung umschalten, App-Fenster offen lassen) — die `Hinweis`-Komponente ist bereits aus einem früheren Plan themefähig, hier nur stichprobenartig bestätigen.

- [ ] **Step 5: Commit (nur falls Schritt 4 Korrekturen ergab)**

Nur falls die manuelle Abnahme Anpassungen ergeben hat — sonst entfällt dieser Schritt.

---

## Nach Task 14

Alle 14 Tasks abgeschlossen → `superpowers:finishing-a-development-branch` für Merge nach `main`.
