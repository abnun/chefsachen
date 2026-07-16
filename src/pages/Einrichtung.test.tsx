import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    firma: {
      get: vi.fn().mockResolvedValue({
        id: "f1",
        name: "",
        strasse: "",
        plz: "",
        ort: "",
        land: "DE",
        steuernummer: "",
        ust_idnr: "",
        iban: "",
        bic: "",
        kleinunternehmer: true,
        eingerichtet: false,
      }),
      save: vi.fn().mockResolvedValue({
        id: "f1",
        name: "Test GmbH",
        strasse: "",
        plz: "",
        ort: "",
        land: "DE",
        steuernummer: "12/345/67890",
        ust_idnr: "",
        iban: "",
        bic: "",
        kleinunternehmer: true,
        eingerichtet: true,
      }),
      logoSet: vi.fn().mockResolvedValue(undefined),
    },
  },
  istValidierungsfehler: () => false,
}));

import { Einrichtung } from "./Einrichtung";

describe("Einrichtung", () => {
  it("startet mit Schritt Firmendaten", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
  });

  it("zeigt die Fortschrittsanzeige im ersten Schritt", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Schritt 1 von 5")).toBeTruthy());
  });
});
