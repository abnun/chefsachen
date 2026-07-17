import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

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
  istValidierungsfehler: vi.fn(
    (e: unknown) => typeof e === "object" && e !== null && (e as { typ?: string }).typ === "validation",
  ),
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

  it("zeigt nach Nummernkreise einen Abschluss-Schritt mit zwei Zielen", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ersten Kunden anlegen" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Ersten Artikel anlegen" })).toBeTruthy();
  });

  it("ruft onFertig mit zielSeite \"kunden\" auf, wenn 'Ersten Kunden anlegen' geklickt wird", async () => {
    const onFertig = vi.fn();
    render(<Einrichtung onFertig={onFertig} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ersten Kunden anlegen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Ersten Kunden anlegen" }));
    await waitFor(() => expect(onFertig).toHaveBeenCalledWith("kunden"));
  });

  it("springt bei einem Validierungsfehler beim Abschließen zurück zu Schritt 1 und zeigt den Feldfehler", async () => {
    const { api } = await import("../api");
    vi.mocked(api.firma.save).mockRejectedValueOnce({
      typ: "validation",
      feld: "steuernummer",
      meldung: "Steuernummer oder USt-IdNr. ist erforderlich",
    });
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }));
    await waitFor(() =>
      expect(screen.getByText("Steuernummer oder USt-IdNr. ist erforderlich")).toBeTruthy(),
    );
    expect(screen.getByText("Schritt 1 von 5")).toBeTruthy();
  });
});
