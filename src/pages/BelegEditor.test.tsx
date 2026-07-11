import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    belege: {
      get: vi.fn().mockResolvedValue({
        beleg: {
          id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
          datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
        },
        positionen: [],
        zahlungen: [],
        bezahlt_cent: 0,
        offener_betrag_cent: 0,
      }),
    },
    kunden: { list: vi.fn().mockResolvedValue([]) },
    artikel: { list: vi.fn().mockResolvedValue([]) },
  },
}));
import { BelegEditor } from "./BelegEditor";

describe("BelegEditor", () => {
  it("zeigt Status eines Entwurfs und deaktiviert Stellen ohne Positionen", async () => {
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Status: entwurf")).toBeTruthy());
    const stellenButton = screen.getByRole("button", { name: "Stellen" });
    expect(stellenButton).toBeDisabled();
  });
});
