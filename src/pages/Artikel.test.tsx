import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
});
