import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    kunden: {
      get: vi.fn().mockResolvedValue({
        kunde: {
          id: "1",
          typ: "firma",
          name: "ACME GmbH",
          kundennummer: "KD-0001",
          zahlungsziel_tage: 14,
          notizen: "",
          ust_idnr: "",
          email: "",
          leitweg_id: "",
          kaeuferreferenz: "",
        },
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
      }),
      update: vi.fn(),
      adresseSave: vi.fn(),
      adresseDelete: vi.fn(),
      ansprechpartnerSave: vi.fn(),
      ansprechpartnerDelete: vi.fn(),
    },
  },
  istValidierungsfehler: () => false,
}));
import { KundeDetail } from "./KundeDetail";

describe("KundeDetail", () => {
  it("laedt Kundendaten und zeigt Stammdaten", async () => {
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    expect(screen.getByText("KD-0001")).toBeTruthy();
  });
});
