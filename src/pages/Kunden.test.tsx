import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: { kunden: { list: vi.fn().mockResolvedValue([
    { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
      zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
      leitweg_id: "", kaeuferreferenz: "" },
  ]) } },
  istValidierungsfehler: () => false,
}));
import { Kunden } from "./Kunden";

describe("Kunden", () => {
  it("zeigt Kundenliste mit Nummer und Name", async () => {
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.getByText("KD-0001")).toBeTruthy();
  });
});
