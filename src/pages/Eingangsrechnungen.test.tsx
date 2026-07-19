import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("../api", () => ({
  api: {
    eingangsrechnungen: {
      list: vi.fn().mockResolvedValue([
        {
          id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
          rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
          rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
          manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
        },
      ]),
      importVorschau: vi.fn().mockResolvedValue({
        geparst: true,
        felder: {
          rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
          rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR", positionen: [],
        },
        ist_duplikat: false,
      }),
      speichern: vi.fn().mockResolvedValue({
        id: "e2", dateiname: "neu.xml", format: "xrechnung",
        rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
        rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR",
        manuell_erfasst: false, importiert_am: "2026-07-19T11:00:00Z",
      }),
    },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn().mockResolvedValue("/pfad/rechnung.xml") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) }));
import { open } from "@tauri-apps/plugin-dialog";
import { Eingangsrechnungen } from "./Eingangsrechnungen";

describe("Eingangsrechnungen", () => {
  it("zeigt die Liste importierter Eingangsrechnungen", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.getByText("RE-2026-0042")).toBeTruthy();
    expect(screen.getByText("238,00 €")).toBeTruthy();
  });

  it("zeigt keinen Löschen-Button", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
  });

  it("zeigt nach Dateiauswahl die geparsten Felder nur als Text, mit Bearbeiten-Button", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    expect(screen.queryByLabelText("Rechnungssteller")).toBeNull();
    expect(screen.getByRole("button", { name: "Bearbeiten" })).toBeTruthy();
  });

  it("wechselt nach Klick auf Bearbeiten in editierbare Felder", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.getByLabelText("Rechnungssteller")).toBeTruthy();
  });

  it("zeigt bei Parse-Fehlschlag sofort editierbare, leere Felder ohne Bearbeiten-Button", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
      geparst: false,
      felder: { rechnungssteller_name: "", rechnungsnummer: "", rechnungsdatum: "", betrag_cent: 0, waehrung: "EUR", positionen: [] },
      ist_duplikat: false,
    });
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText(/Konnte nicht automatisch gelesen werden/)).toBeTruthy());
    expect(screen.getByLabelText("Rechnungssteller")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
  });

  it("warnt bei Duplikat und speichert erst nach Bestätigung des Dialogs", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
      geparst: true,
      felder: {
        rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
        rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR", positionen: [],
      },
      ist_duplikat: true,
    });
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText(/bereits importiert/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(api.eingangsrechnungen.speichern).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Trotzdem importieren" }));
    await waitFor(() => expect(api.eingangsrechnungen.speichern).toHaveBeenCalledTimes(1));
  });

  it("speichert nach Bestätigung und zeigt die Liste ohne Vorschau", async () => {
    const { api } = await import("../api");
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.eingangsrechnungen.speichern).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
  });

  it("öffnet den Datei-Dialog mit XML/PDF-Filter beim Klick auf Importieren", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        expect.objectContaining({ filters: [{ name: "E-Rechnung", extensions: ["xml", "pdf"] }] }),
      ),
    );
  });
});
