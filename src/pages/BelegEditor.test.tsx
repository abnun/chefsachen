import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
      positionSave: vi.fn().mockResolvedValue({
        id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "", einheit_kuerzel: "",
        einzelpreis_cent: 0, menge: 1000, positionssumme_cent: 0, reihenfolge: 0,
      }),
      stellen: vi.fn().mockResolvedValue({
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "versendet", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      }),
      zahlungErfassen: vi.fn().mockResolvedValue({
        id: "z1", rechnung_id: "b1", datum: "2026-07-10", betrag_cent: -5000, notiz: "",
      }),
    },
    kunden: { list: vi.fn().mockResolvedValue([]) },
    artikel: { list: vi.fn().mockResolvedValue([]) },
  },
}));
import { api } from "../api";
import { BelegEditor } from "./BelegEditor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BelegEditor", () => {
  it("zeigt Status eines Entwurfs und deaktiviert Stellen ohne Positionen", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [],
      zahlungen: [],
      bezahlt_cent: 0,
      offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Status: entwurf")).toBeTruthy());
    const stellenButton = screen.getByRole("button", { name: "Stellen" });
    expect(stellenButton).toBeDisabled();
  });
});

describe("BelegEditor – Position hinzufügen", () => {
  it("fügt eine Position über den Artikel-Pfad hinzu und lädt neu", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [],
      zahlungen: [],
      bezahlt_cent: 0,
      offener_betrag_cent: 0,
    });
    vi.mocked(api.artikel.list).mockResolvedValue([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550,
      },
    ]);

    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Position hinzufügen" }));

    await waitFor(() =>
      expect(api.belege.positionSave).toHaveBeenCalledWith({
        id: "",
        beleg_id: "b1",
        artikel_id: "a1",
        bezeichnung: "",
        einheit_kuerzel: "",
        einzelpreis_cent: null,
        menge: 1000,
      }),
    );
    await waitFor(() => expect(vi.mocked(api.belege.get).mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe("BelegEditor – Stellen", () => {
  it("stellt einen Entwurf mit vorhandener Position und lädt neu", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [
        {
          id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Beratung",
          einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
          positionssumme_cent: 9550, reihenfolge: 0,
        },
      ],
      zahlungen: [],
      bezahlt_cent: 0,
      offener_betrag_cent: 0,
    });

    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());

    const stellenButton = screen.getByRole("button", { name: "Stellen" });
    expect(stellenButton).not.toBeDisabled();
    fireEvent.click(stellenButton);

    await waitFor(() => expect(api.belege.stellen).toHaveBeenCalledWith("b1"));
    await waitFor(() => expect(vi.mocked(api.belege.get).mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe("BelegEditor – Zahlungen", () => {
  it("erfasst eine Erstattung mit negativem Betrag über das Zahlungen-Formular", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "R-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 5000, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [],
      zahlungen: [],
      bezahlt_cent: 0,
      offener_betrag_cent: 5000,
    });

    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Status: gestellt")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByLabelText("Erstattung (negativer Betrag)"));
    fireEvent.click(screen.getByRole("button", { name: "Zahlung erfassen" }));

    await waitFor(() =>
      expect(api.belege.zahlungErfassen).toHaveBeenCalledWith(
        expect.objectContaining({
          rechnung_id: "b1",
          betrag_cent: -5000,
          notiz: "",
        }),
      ),
    );
  });
});
