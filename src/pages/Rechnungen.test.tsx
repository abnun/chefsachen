import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

// Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
// Ein Test, der Aufrufe zählt, hängt dann an der Reihenfolge und an allem, was
// in den Tests davor geschah — genau so entstand ein Ausfall, der nur in der CI
// auftrat. `clearAllMocks` löscht die Aufrufe, nicht die hinterlegten Antworten.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("../api", () => ({
  api: {
    belege: {
      list: vi.fn(),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "", hat_adresse: true },
      ]),
    },
    einstellungen: { get: vi.fn().mockResolvedValue("") },
  },
}));
import { Rechnungen } from "./Rechnungen";

/** Ausgangslage für jeden Test. Ohne das Zurücksetzen wirkt ein `mockResolvedValue`
 *  aus einem früheren Test in allen folgenden weiter. */
const STANDARD = [
        { id: "1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
          datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null },
        { id: "2", typ: "rechnung", nummer: "RE-2026-0002", status: "gestellt", kunde_id: "k1",
          datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 5000, ursprungsangebot_id: null, storno_von_id: null,
          kunde_snapshot_name: "ACME GmbH (alter Name)" },
      ] as never;

beforeEach(() => {
  vi.mocked(api.belege.list).mockResolvedValue(STANDARD);
});

describe("Rechnungen", () => {
  it("zeigt Rechnungsliste mit Nummer und Kunde", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());
    expect(screen.getByText("ACME GmbH")).toBeTruthy();
  });

  it("zeigt den Snapshot-Namen statt des Live-Namens, wenn vorhanden", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0002")).toBeTruthy());
    expect(screen.getByText("ACME GmbH (alter Name)")).toBeTruthy();
  });

  it("sagt, dass es noch keine Rechnungen gibt, statt eine leere Tabelle zu zeigen", async () => {
    // Eine Tabelle mit Kopfzeile und ohne Inhalt lässt offen, ob nichts da ist
    // oder etwas schiefging.
    vi.mocked(api.belege.list).mockResolvedValueOnce([]);
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Rechnungen/)).toBeTruthy());
  });

  it("unterscheidet eine leere Liste von einem leeren Filterergebnis", async () => {
    vi.mocked(api.belege.list).mockResolvedValue([]);
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Rechnungen/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: "storniert" } });
    await waitFor(() => expect(screen.getByText(/Keine Rechnungen mit diesem Status/)).toBeTruthy());
  });

  it("reicht den Suchbegriff ans Backend weiter", async () => {
    // Gesucht wird serverseitig: Der Kundenname steht in einer anderen Tabelle
    // und ist bei gestellten Rechnungen eingefroren.
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());

    await userEvent.type(screen.getByLabelText(/Suche/), "ACME");
    await waitFor(
      () => expect(vi.mocked(api.belege.list)).toHaveBeenCalledWith("rechnung", undefined, "ACME"),
      { timeout: 2000 },
    );
  });

  it("sagt bei einer erfolglosen Suche, wonach gesucht wurde", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());

    vi.mocked(api.belege.list).mockResolvedValue([]);
    await userEvent.type(screen.getByLabelText(/Suche/), "gibtsnicht");
    await waitFor(() => expect(screen.getByText(/gibtsnicht/)).toBeTruthy(), { timeout: 2000 });
  });

  it("sortiert per Klick auf den Spaltenkopf und kehrt die Richtung um", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());

    const nummer = screen.getByRole("button", { name: /Nummer/ });
    await userEvent.click(nummer);
    expect(reihenfolge()).toEqual(["RE-2026-0001", "RE-2026-0002"]);
    expect(nummer.closest("th")).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(nummer);
    expect(reihenfolge()).toEqual(["RE-2026-0002", "RE-2026-0001"]);
    expect(nummer.closest("th")).toHaveAttribute("aria-sort", "descending");
  });

  it("blättert erst, wenn eine Seite nicht mehr reicht", async () => {
    // Bei den zwölf Rechnungen eines typischen Jahres wäre eine Blätterleiste
    // unter jeder Tabelle nur Beiwerk.
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());
    expect(screen.queryByRole("navigation", { name: "Seiten" })).toBeNull();

    const viele = Array.from({ length: 30 }, (_, i) => ({
      id: `v${i}`, typ: "rechnung", nummer: `RE-2026-${String(i + 100).padStart(4, "0")}`,
      status: "gestellt", kunde_id: "k1", datum: "2026-07-10", leistungsdatum: "2026-07-10",
      zahlungsziel_tage: 14, kopftext: "", fusstext: "", summe_cent: 100,
      ursprungsangebot_id: null, storno_von_id: null,
    }));
    vi.mocked(api.belege.list).mockResolvedValue(viele as never);
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: "gestellt" } });

    await waitFor(() => expect(screen.getByRole("navigation", { name: "Seiten" })).toBeTruthy());
    expect(screen.getByText(/Seite 1 von 2 \(30 Einträge\)/)).toBeTruthy();
    // 25 je Seite.
    expect(reihenfolge()).toHaveLength(25);

    await userEvent.click(screen.getByRole("button", { name: /Weiter/ }));
    expect(reihenfolge()).toHaveLength(5);
  });

  it("öffnet das Anlage-Formular bei ⌘N und fokussiert die Suche bei ⌘F", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());

    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Nummer oder Kunde"));
  });

  it("startet den Rundgang über den Knopf im Seitenkopf", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Rundgang" }));
    expect(screen.getByText("1 von 5")).toBeTruthy();
  });

  it("blendet die Rechnungsliste aus, während das Anlage-Formular offen ist", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Neue Rechnung" }));
    expect(screen.queryByText("RE-2026-0001")).toBeNull();
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeTruthy();
  });
});

/** Die Belegnummern der Tabelle in der angezeigten Reihenfolge. */
function reihenfolge(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((zeile) => zeile.querySelector(".zeilen-knopf")?.textContent ?? "");
}
