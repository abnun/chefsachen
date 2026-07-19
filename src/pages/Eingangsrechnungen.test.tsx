import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
      importVorschau: vi.fn(),
      speichern: vi.fn(),
    },
  },
}));
import { Eingangsrechnungen } from "./Eingangsrechnungen";

describe("Eingangsrechnungen", () => {
  it("zeigt die Liste importierter Eingangsrechnungen", async () => {
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.getByText("RE-2026-0042")).toBeTruthy();
    expect(screen.getByText("238,00 €")).toBeTruthy();
  });

  it("zeigt keinen Löschen-Button", async () => {
    render(<Eingangsrechnungen />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
  });
});
