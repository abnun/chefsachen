import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// Hinweis: Die Beispieldaten werden direkt im vi.mock-Factory-Callback definiert
// statt über eine äußere Konstante referenziert zu werden, da vi.mock-Aufrufe von
// Vitest an den Dateianfang gehoistet werden — eine Referenz auf eine später im
// Modul deklarierte const würde zu einem "Cannot access before initialization"-Fehler
// führen (Temporal Dead Zone). Abweichung vom Plan-Text, siehe Task-12-Bericht.
vi.mock("../api", () => ({
  api: {
    eingangsrechnungen: {
      get: vi.fn().mockResolvedValue({
        eingangsrechnung: {
          id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
          rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
          rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
          manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
        },
        positionen: [
          { bezeichnung: "Bürobedarf", menge: 2000, einzelpreis_cent: 11900, positionssumme_cent: 23800 },
        ],
      }),
      update: vi.fn().mockResolvedValue({
        id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
        rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
        rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
        manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
      }),
      originalExportieren: vi.fn().mockResolvedValue({ dateiname: "rechnung.xml", bytes: [1, 2, 3] }),
    },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn().mockResolvedValue("/pfad/rechnung.xml") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));
import { writeFile } from "@tauri-apps/plugin-fs";
import { EingangsrechnungDetail } from "./EingangsrechnungDetail";

describe("EingangsrechnungDetail", () => {
  it("zeigt Kernfelder und Positionstabelle", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.getByText("RE-2026-0042")).toBeTruthy();
    expect(screen.getByText("Bürobedarf")).toBeTruthy();
    // "238,00 €" erscheint zweimal (Kopf-Betrag + Positionssumme, da die
    // Beispielposition den vollen Rechnungsbetrag ausmacht) — getAllByText
    // statt getByText, da Letzteres bei Mehrfachtreffern wirft. Abweichung
    // vom Plan-Text, siehe Task-12-Bericht.
    expect(screen.getAllByText("238,00 €")).toHaveLength(2);
  });

  it("zeigt keinen Löschen-Button", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
  });

  it("wechselt nach Bearbeiten-Klick in editierbare Felder und speichert per update", async () => {
    const { api } = await import("../api");
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Rechnungssteller"), { target: { value: "Korrigiert GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.eingangsrechnungen.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "e1", rechnungssteller_name: "Korrigiert GmbH" }),
      ),
    );
  });

  it("exportiert die Original-Datei über den Speichern-Dialog", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Original-Datei exportieren" }));
    await waitFor(() =>
      expect(writeFile).toHaveBeenCalledWith("/pfad/rechnung.xml", new Uint8Array([1, 2, 3])),
    );
  });

  it("zeigt den Betrag im Bearbeiten-Modus als Euro-Eingabe, nicht als Cent-Zahl", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.getByLabelText("Betrag")).toHaveValue("238,00");
  });

  it("übernimmt einen geänderten Euro-Betrag korrekt in Cent beim Speichern", async () => {
    const { api } = await import("../api");
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "99,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.eingangsrechnungen.update).toHaveBeenCalledWith(expect.objectContaining({ betrag_cent: 9950 })),
    );
  });

  it("verwirft Änderungen bei Klick auf Abbrechen und zeigt wieder die Lesesicht", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Rechnungssteller"), { target: { value: "Verworfen GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Rechnungssteller")).toBeNull();
    expect(screen.getByText("Lieferant GmbH")).toBeTruthy();
  });

  it('ruft onZurueck bei Klick auf „Zurück zur Liste" auf', async () => {
    const onZurueck = vi.fn();
    render(<EingangsrechnungDetail id="e1" onZurueck={onZurueck} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "← Zurück zur Liste" }));
    expect(onZurueck).toHaveBeenCalledTimes(1);
  });
});
