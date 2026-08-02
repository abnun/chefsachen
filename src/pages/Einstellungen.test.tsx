import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  // Ohne das sehen spätere Tests die Aufrufe der früheren. clearAllMocks setzt
  // nur die Aufrufliste zurück, nicht die bei der Deklaration gesetzten
  // Rückgabewerte — die übrigen Tests bleiben davon unberührt.
  vi.clearAllMocks();
});

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn().mockResolvedValue(new Uint8Array()) }));
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
        email: "", telefon: "", kontakt_name: "", gruendungsjahr: null,
        kleinunternehmer: true,
        eingerichtet: true,
      }),
      save: vi.fn(),
      logoGet: vi.fn().mockResolvedValue(null),
      logoSet: vi.fn().mockResolvedValue(undefined),
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
      email: "", telefon: "", kontakt_name: "", gruendungsjahr: null,
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

  it("löscht eine Einheit nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.einheiten.delete)).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Löschen einer Einheit einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Einheit „Stunde" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Einheit gelöscht")).toBeTruthy());
  });

  it("zeigt nach dem Speichern eines Nummernkreises einen Erfolgs-Hinweis", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByDisplayValue("R-{jahr}-{nr}")).toBeTruthy());
    // Index 1: Firmendaten (0) steht im DOM vor dem einzigen Nummernkreis-Eintrag (1).
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[1]);
    await waitFor(() => expect(screen.getByText("Nummernkreis gespeichert")).toBeTruthy());
  });

  it("zeigt nach dem Speichern eines Textbausteins einen Erfolgs-Hinweis mit Feldname", async () => {
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByDisplayValue("Vielen Dank für Ihren Auftrag.")).toBeTruthy());
    // Reihenfolge im DOM: Firmendaten (0), Nummernkreis (1), dann Textbausteine
    // in TEXTBAUSTEIN_KEYS-Reihenfolge: Kleinunternehmer-Hinweis (2),
    // Rechnungs-Fußtext (3), Angebots-Fußtext (4).
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[3]);
    await waitFor(() => expect(screen.getByText("Rechnungs-Fußtext gespeichert")).toBeTruthy());
  });

  /// Der Einrichtungsassistent sagt ausdrücklich zu, das Logo lasse sich später
  /// in den Einstellungen ändern — bislang gab es dafür keine Möglichkeit.
  it("hinterlegt ein Logo und lässt es wieder entfernen", async () => {
    const { api } = await import("../api");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    vi.mocked(api.firma.logoGet).mockResolvedValue(null);
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByText(/Kein Logo hinterlegt/)).toBeTruthy());

    vi.mocked(open).mockResolvedValueOnce("/pfad/logo.png");
    vi.mocked(readFile).mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4]));
    fireEvent.click(screen.getByRole("button", { name: "Logo wählen" }));
    await waitFor(() => expect(api.firma.logoSet).toHaveBeenCalledWith([1, 2, 3, 4]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Logo entfernen" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Logo entfernen" }));
    await waitFor(() => expect(api.firma.logoSet).toHaveBeenLastCalledWith([]));
    await waitFor(() => expect(screen.getByText(/Kein Logo hinterlegt/)).toBeTruthy());
  });

  it("bricht die Logo-Auswahl ohne Fehler ab, wenn kein Bild gewählt wurde", async () => {
    const { api } = await import("../api");
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(api.firma.logoGet).mockResolvedValue(null);
    render(<Einstellungen />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Logo wählen" })).toBeTruthy());
    vi.mocked(open).mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Logo wählen" }));
    await waitFor(() => expect(api.firma.logoSet).not.toHaveBeenCalled());
  });
});
