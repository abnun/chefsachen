import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("../api", () => ({
  api: {
    artikel: {
      list: vi.fn().mockResolvedValue([
        {
          id: "a1",
          artikelnummer: "ART-0001",
          bezeichnung: "Beratung",
          beschreibung: "",
          einheit_id: "e1",
          standardpreis_cent: 9550,
          kundenpreise_anzahl: 0,
        },
      ]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      kundenpreise: vi.fn().mockResolvedValue([]),
      kundenpreisSave: vi.fn(),
      kundenpreisDelete: vi.fn(),
    },
    einheiten: {
      list: vi.fn().mockResolvedValue([{ id: "e1", name: "Stunde", kuerzel: "Std" }]),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([]),
    },
  },
  istValidierungsfehler: () => false,
}));
import { Artikel } from "./Artikel";

describe("Artikel", () => {
  it("laedt und zeigt Artikelliste mit Nummer, Bezeichnung, Einheit und Preis", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("ART-0001")).toBeTruthy());
    expect(screen.getByText("Beratung")).toBeTruthy();
    expect(screen.getByText("Std")).toBeTruthy();
    expect(screen.getByText("95,50 €")).toBeTruthy();
  });

  it("zeigt den Leerzustand-Hinweis, wenn keine Artikel vorhanden sind", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText(/Noch keine Artikel/)).toBeTruthy());
  });

  it("zeigt nach dem Anlegen einen Kunden-Hinweis, wenn noch keine Kunden existieren", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([]);
    const onZuKundenWechseln = vi.fn();
    render(<Artikel onZuKundenWechseln={onZuKundenWechseln} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Beratung" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /jetzt auch einen Kunden anlegen/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /jetzt auch einen Kunden anlegen/ }));
    expect(onZuKundenWechseln).toHaveBeenCalledTimes(1);
  });
});
