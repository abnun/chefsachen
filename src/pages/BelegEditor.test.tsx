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
      positionDelete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      }),
      angebotStatusSetzen: vi.fn().mockResolvedValue({
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "angenommen", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      }),
      rechnungStornieren: vi.fn().mockResolvedValue({
        id: "b1", typ: "rechnung", nummer: "R-2026-0001", status: "storniert", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      }),
      stellen: vi.fn().mockResolvedValue({
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "versendet", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      }),
      zahlungErfassen: vi.fn().mockResolvedValue({
        id: "z1", rechnung_id: "b1", datum: "2026-07-10", betrag_cent: -5000, notiz: "",
      }),
      angebotInRechnungUeberfuehren: vi.fn().mockResolvedValue({
        id: "r1", typ: "rechnung", nummer: "R-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: "b1", storno_von_id: null,
      }),
      pdfExportieren: vi.fn().mockResolvedValue([1, 2, 3]),
      xrechnungExportieren: vi.fn().mockResolvedValue([1, 2, 3]),
      zugferdExportieren: vi.fn().mockResolvedValue([1, 2, 3]),
    },
    kunden: { list: vi.fn().mockResolvedValue([]) },
    artikel: { list: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn().mockResolvedValue("/pfad/rechnung.pdf") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));
import { api } from "../api";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
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
    await waitFor(() => expect(screen.getByText("entwurf", { selector: ".status" })).toBeTruthy());
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
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 0,
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

  it("zeigt nach dem Hinzufügen einer Position einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    vi.mocked(api.artikel.list).mockResolvedValue([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 0,
      },
    ]);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Position hinzufügen" }));
    await waitFor(() => expect(screen.getByText("Position hinzugefügt")).toBeTruthy());
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

describe("BelegEditor – In Rechnung überführen", () => {
  it("überführt ein Angebot in eine Rechnung und meldet die neue Rechnungs-Id", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "angenommen", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [],
      zahlungen: [],
      bezahlt_cent: 0,
      offener_betrag_cent: 0,
    });

    const onRechnungErstellt = vi.fn();
    render(<BelegEditor id="b1" onRechnungErstellt={onRechnungErstellt} />);
    await waitFor(() => expect(screen.getByText("angenommen", { selector: ".status" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "In Rechnung überführen" }));

    await waitFor(() => expect(api.belege.angebotInRechnungUeberfuehren).toHaveBeenCalledWith("b1"));
    await waitFor(() => expect(onRechnungErstellt).toHaveBeenCalledWith("r1"));
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
    await waitFor(() => expect(screen.getByText("gestellt", { selector: ".status" })).toBeTruthy());

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

  it("zeigt nach dem Erfassen einer Zahlung einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "R-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 5000, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 5000,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("gestellt", { selector: ".status" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Zahlung erfassen" }));
    await waitFor(() => expect(screen.getByText("Zahlung erfasst")).toBeTruthy());
  });
});

describe("BelegEditor – Export", () => {
  it("exportiert ein PDF über den Speichern-Dialog", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als PDF exportieren" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Als PDF exportieren" }));
    await waitFor(() => expect(api.belege.pdfExportieren).toHaveBeenCalledWith("b1"));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: "RE-2026-0001.pdf" }),
      ),
    );
    await waitFor(() =>
      expect(writeFile).toHaveBeenCalledWith("/pfad/rechnung.pdf", new Uint8Array([1, 2, 3])),
    );
  });

  it("exportiert eine XRechnung (XML) über den Speichern-Dialog", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Als XRechnung (XML) exportieren" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Als XRechnung (XML) exportieren" }));
    await waitFor(() => expect(api.belege.xrechnungExportieren).toHaveBeenCalledWith("b1"));
  });

  it("exportiert eine ZUGFeRD-Rechnung über den Speichern-Dialog", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Als ZUGFeRD-Rechnung exportieren" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Als ZUGFeRD-Rechnung exportieren" }));
    await waitFor(() => expect(api.belege.zugferdExportieren).toHaveBeenCalledWith("b1"));
  });

  it("zeigt eine Fehlermeldung an, wenn der XRechnung-Export mit einem Validierungsfehler abgelehnt wird", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500,
    });
    vi.mocked(api.belege.xrechnungExportieren).mockRejectedValue({
      typ: "validation",
      feld: "kaeuferreferenz",
      meldung: "Für den XRechnung-Export ist eine Käuferreferenz beim Kunden erforderlich",
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Als XRechnung (XML) exportieren" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Als XRechnung (XML) exportieren" }));
    await waitFor(() => expect(api.belege.xrechnungExportieren).toHaveBeenCalledWith("b1"));
    await screen.findByText("Für den XRechnung-Export ist eine Käuferreferenz beim Kunden erforderlich");
  });

  it("zeigt XRechnung/ZUGFeRD-Buttons nicht für Angebote an", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "versendet", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als PDF exportieren" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Als XRechnung (XML) exportieren" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Als ZUGFeRD-Rechnung exportieren" })).toBeNull();
  });
});

describe("BelegEditor – Erfolgs-Hinweis", () => {
  it("zeigt nach dem Speichern der Stammdaten einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText("Angebot gespeichert")).toBeTruthy());
  });

  it("zeigt nach dem Stellen einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: null, status: "entwurf", kunde_id: "k1",
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
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Stellen" }));
    await waitFor(() => expect(screen.getByText("Rechnung gestellt")).toBeTruthy());
  });

  it("zeigt nach dem Setzen des Angebot-Status einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "versendet", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Angenommen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Angenommen" }));
    await waitFor(() => expect(screen.getByText("Status aktualisiert")).toBeTruthy());
  });

  it("zeigt nach dem Stornieren einen Erfolgs-Hinweis", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "R-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Stornieren" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Stornieren" }));
    await waitFor(() => expect(screen.getByText("Rechnung storniert")).toBeTruthy());
  });

  it("zeigt nach dem Löschen einer Position einen Erfolgs-Hinweis", async () => {
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
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Position gelöscht")).toBeTruthy());
  });
});
