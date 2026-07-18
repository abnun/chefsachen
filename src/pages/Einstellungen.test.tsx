import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("../api", () => ({
  api: {
    firma: {
      get: vi.fn().mockResolvedValue({
        id: "1",
        name: "Musterfirma",
        strasse: "Musterstr. 1",
        plz: "12345",
        ort: "Musterstadt",
        land: "DE",
        steuernummer: "123/456/789",
        ust_idnr: "",
        iban: "",
        bic: "",
        kleinunternehmer: true,
        eingerichtet: true,
      }),
      save: vi.fn(),
    },
    einheiten: {
      list: vi.fn().mockResolvedValue([{ id: "e1", name: "Stunde", kuerzel: "Std" }]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    einstellungen: {
      nummernkreise: vi.fn().mockResolvedValue([
        { art: "rechnung", format: "R-{jahr}-{nr}", zaehler: 5, jahres_reset: true },
      ]),
      nummernkreisUpdate: vi.fn(),
      get: vi.fn((key: string) => {
        const werte: Record<string, string> = {
          "text.kleinunternehmer": "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
          "text.rechnung.fuss": "Vielen Dank für Ihren Auftrag.",
          "text.angebot.fuss": "Dieses Angebot ist 30 Tage gültig.",
        };
        return Promise.resolve(werte[key] ?? null);
      }),
      set: vi.fn(),
    },
  },
  istValidierungsfehler: () => false,
}));
import { Einstellungen } from "./Einstellungen";

describe("Einstellungen", () => {
  it("laedt und zeigt Firmendaten, Einheiten und Nummernkreise", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByDisplayValue("Musterfirma")).toBeTruthy());
    expect(screen.getByText("Std")).toBeTruthy();
    expect(screen.getByDisplayValue("R-{jahr}-{nr}")).toBeTruthy();
    expect(screen.getByText(/Aktueller Zähler: 5/)).toBeTruthy();
  });

  it("laedt und zeigt Textbausteine", async () => {
    render(<Einstellungen />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.")).toBeTruthy(),
    );
    expect(screen.getAllByText("Kleinunternehmer-Hinweis").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Vielen Dank für Ihren Auftrag.")).toBeTruthy();
    expect(screen.getByDisplayValue("Dieses Angebot ist 30 Tage gültig.")).toBeTruthy();
  });

  it("zeigt nach dem Speichern der Firmendaten einen Erfolgs-Hinweis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.firma.save).mockResolvedValueOnce({
      id: "1", name: "Musterfirma", strasse: "Musterstr. 1", plz: "12345", ort: "Musterstadt",
      land: "DE", steuernummer: "123/456/789", ust_idnr: "", iban: "", bic: "",
      kleinunternehmer: true, eingerichtet: true,
    });
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByDisplayValue("Musterfirma")).toBeTruthy());
    // Index 0: Firmendaten ist der erste Abschnitt auf der Seite, dessen
    // "Speichern"-Button ist damit im DOM immer der erste unter diesem Namen.
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[0]);
    await waitFor(() => expect(screen.getByText("Firmendaten gespeichert")).toBeTruthy());
  });

  it("zeigt nach dem Anlegen einer neuen Einheit einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByText("Std")).toBeTruthy());
    // Index 1: Firmendaten hat ebenfalls ein "Name"-Feld und steht davor im DOM.
    fireEvent.change(screen.getAllByLabelText("Name")[1], { target: { value: "Pauschale" } });
    fireEvent.change(screen.getByLabelText("Kürzel"), { target: { value: "Pausch" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(screen.getByText('Einheit „Pauschale" angelegt')).toBeTruthy());
  });

  it("zeigt nach dem Löschen einer Einheit einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Einheit gelöscht")).toBeTruthy());
  });

  it("zeigt nach dem Speichern eines Nummernkreises einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByDisplayValue("R-{jahr}-{nr}")).toBeTruthy());
    // Index 1: Firmendaten (0) steht im DOM vor dem einzigen Nummernkreis-Eintrag (1).
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[1]);
    await waitFor(() => expect(screen.getByText("Nummernkreis gespeichert")).toBeTruthy());
  });
});
