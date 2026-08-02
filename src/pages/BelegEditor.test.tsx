import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      positionVerschieben: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      zahlungDelete: vi.fn().mockResolvedValue(undefined),
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
    await waitFor(() => expect(screen.getByText("Entwurf", { selector: ".status" })).toBeTruthy());
    const stellenButton = screen.getByRole("button", { name: "Stellen" });
    expect(stellenButton).toBeDisabled();
  });

  it("zeigt den Kunden-Snapshot-Namen in den Stammdaten, wenn vorhanden", async () => {
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
        kunde_snapshot_name: "ACME GmbH (alter Name)",
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550,
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Kunde: ACME GmbH (alter Name)")).toBeTruthy());
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
    // Die Artikelauswahl ist eine Tipphilfe (datalist), kein Auswahlfeld mehr:
    // Gewählt wird über die Beschriftung, nicht über die Id.
    await waitFor(() => expect(screen.getByLabelText("Artikel")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "Beratung" } });
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
    await waitFor(() => expect(screen.getByLabelText("Artikel")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "Beratung" } });
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
    // Angebot: der bestätigende Knopf heißt „Versenden", nicht „Stellen".
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Versenden" }));

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
    await waitFor(() => expect(screen.getByText("Angenommen", { selector: ".status" })).toBeTruthy());

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
    await waitFor(() => expect(screen.getByText("Gestellt", { selector: ".status" })).toBeTruthy());

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
    await waitFor(() => expect(screen.getByText("Gestellt", { selector: ".status" })).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("PDF exportiert")).toBeTruthy());
  });

  it("zeigt keinen Erfolgs-Hinweis, wenn der Speichern-Dialog beim PDF-Export abgebrochen wird", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500,
    });
    vi.mocked(save).mockResolvedValueOnce(null);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als PDF exportieren" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Als PDF exportieren" }));
    await waitFor(() => expect(api.belege.pdfExportieren).toHaveBeenCalledWith("b1"));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(writeFile).not.toHaveBeenCalled();
    expect(screen.queryByText("PDF exportiert")).toBeNull();
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
    await waitFor(() => expect(screen.getByText("XRechnung exportiert")).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText("ZUGFeRD-Rechnung exportiert")).toBeTruthy());
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
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Stellen" }));
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
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Stornieren" }));
    await waitFor(() => expect(screen.getByText("Rechnung storniert")).toBeTruthy());
  });

  // P1.5/P1.6/P1.7 — Schutz vor Fehlklicks bei nicht umkehrbaren Aktionen.
  const rechnungGestellt = (zusatz: Record<string, unknown> = {}) => ({
    beleg: {
      id: "b1", typ: "rechnung" as const, nummer: "R-2026-0001", status: "gestellt", kunde_id: "k1",
      datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
      kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null,
      storno_von_id: null, ...zusatz,
    },
    positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550,
  });

  it("storniert nicht, wenn die Rückfrage abgebrochen wird", async () => {
    vi.mocked(api.belege.get).mockResolvedValue(rechnungGestellt());
    render(<BelegEditor id="b1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Stornieren" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.belege.rechnungStornieren).not.toHaveBeenCalled();
  });

  it("stellt nicht, wenn die Rückfrage abgebrochen wird", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      ...rechnungGestellt({ status: "entwurf", nummer: null }),
      positionen: [{
        id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Beratung",
        einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
        positionssumme_cent: 9550, reihenfolge: 0,
      }],
    });
    render(<BelegEditor id="b1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Stellen" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.belege.stellen).not.toHaveBeenCalled();
  });

  // Ein Stornobeleg ist selbst eine gestellte Rechnung. Ohne Guard ließe er sich
  // erneut stornieren — Kaskade aus Gegenbelegen und verbrauchten Nummern.
  it("bietet für einen Stornobeleg kein Stornieren an", async () => {
    vi.mocked(api.belege.get).mockResolvedValue(rechnungGestellt({ storno_von_id: "b0" }));
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText(/R-2026-0001/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Stornieren" })).toBeNull();
  });

  it('fragt vor Abgelehnt nach, aber nicht vor Angenommen', async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      ...rechnungGestellt({ typ: "angebot", status: "versendet", nummer: "A-2026-0001" }),
    });
    render(<BelegEditor id="b1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Angenommen" }));
    await waitFor(() => expect(api.belege.angebotStatusSetzen).toHaveBeenCalledWith("b1", "angenommen"));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Abgelehnt" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  // Ohne Dialog davor: hier schützt nur die Sperre am Knopf. Eine doppelt
  // erfasste Zahlung ließe sich mangels Lösch-Funktion nicht mehr korrigieren.
  /// Ein versehentlich angelegter Entwurf blieb bislang für immer stehen und
  /// blockierte zusätzlich das Löschen seines Kunden.
  it("löscht einen Entwurf nach Rückfrage und meldet es der Seite", async () => {
    const onGeloescht = vi.fn();
    vi.mocked(api.belege.get).mockResolvedValue(rechnungGestellt({ status: "entwurf", nummer: null }));
    render(<BelegEditor id="b1" onGeloescht={onGeloescht} />);
    fireEvent.click(await screen.findByRole("button", { name: "Entwurf löschen" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(api.belege.delete).toHaveBeenCalledWith("b1"));
    expect(onGeloescht).toHaveBeenCalled();
  });

  it("löscht keinen Entwurf, wenn die Rückfrage abgebrochen wird", async () => {
    vi.mocked(api.belege.get).mockResolvedValue(rechnungGestellt({ status: "entwurf", nummer: null }));
    render(<BelegEditor id="b1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Entwurf löschen" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.belege.delete).not.toHaveBeenCalled();
  });

  /// Gestellte Belege sind unveränderbar — dort darf kein Löschknopf stehen.
  it("bietet für eine gestellte Rechnung kein Löschen an", async () => {
    vi.mocked(api.belege.get).mockResolvedValue(rechnungGestellt());
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText(/R-2026-0001/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Entwurf löschen" })).toBeNull();
  });

  /// Eine vertippte Zahlung war bislang nur über eine gegenläufige Erstattung
  /// zu heilen — die den Zahlungsverlauf dauerhaft verfälscht.
  it("löscht eine Zahlung nach Rückfrage", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      ...rechnungGestellt(),
      zahlungen: [{ id: "z1", rechnung_id: "b1", datum: "2026-07-20", betrag_cent: 5000, notiz: "" }],
    });
    render(<BelegEditor id="b1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Löschen" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("50,00 €");
    fireEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(api.belege.zahlungDelete).toHaveBeenCalledWith("z1"));
  });

  it("erfasst bei Doppelklick nur eine Zahlung", async () => {
    vi.mocked(api.belege.get).mockResolvedValue(rechnungGestellt());
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Zahlung erfassen" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Betrag"), { target: { value: "95,50" } });
    const knopf = screen.getByRole("button", { name: "Zahlung erfassen" });
    fireEvent.click(knopf);
    fireEvent.click(knopf);
    await waitFor(() => expect(screen.getByText("Zahlung erfasst")).toBeTruthy());
    expect(api.belege.zahlungErfassen).toHaveBeenCalledTimes(1);
  });

  it('stellt bei Doppelklick nur einmal', async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      ...rechnungGestellt({ status: "entwurf", nummer: null }),
      positionen: [{
        id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Beratung",
        einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
        positionssumme_cent: 9550, reihenfolge: 0,
      }],
    });
    render(<BelegEditor id="b1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Stellen" }));
    const knopf = within(await screen.findByRole("dialog")).getByRole("button", { name: "Stellen" });
    fireEvent.click(knopf);
    fireEvent.click(knopf);
    await waitFor(() => expect(screen.getByText("Rechnung gestellt")).toBeTruthy());
    expect(api.belege.stellen).toHaveBeenCalledTimes(1);
  });

  it("löscht eine Position nicht, wenn im Dialog abgebrochen wird", async () => {
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
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.belege.positionDelete)).not.toHaveBeenCalled();
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
    await waitFor(() => expect(screen.getByText('Position „Beratung" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Position gelöscht")).toBeTruthy());
  });

  /// § 14 Abs. 4 Nr. 6 UStG lässt Zeitpunkt „oder Zeitraum" zu. Bei einer
  /// Monatsabrechnung wäre ein Einzeldatum sachlich falsch.
  it("speichert einen Leistungszeitraum", async () => {
    vi.mocked(api.belege.get).mockResolvedValue(rechnungGestellt({ status: "entwurf", nummer: null }));
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText("Leistungsdatum")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Leistung bis (bei Zeitraum)"), {
      target: { value: "2026-07-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.belege.update).toHaveBeenCalledWith(
        expect.objectContaining({ leistungsdatum_bis: "2026-07-31" }),
      ),
    );
  });

  /// Leer bedeutet Einzeldatum — der Regelfall darf nicht als leerer Zeitraum
  /// im Beleg landen.
  it("sendet ohne Zeitraum null statt eines leeren Textes", async () => {
    vi.mocked(api.belege.get).mockResolvedValue(rechnungGestellt({ status: "entwurf", nummer: null }));
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.belege.update).toHaveBeenCalledWith(
        expect.objectContaining({ leistungsdatum_bis: null }),
      ),
    );
  });
});

describe("BelegEditor – Positionen bearbeiten und sortieren", () => {
  /** Entwurf mit zwei Positionen. */
  function entwurfMitPositionen() {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 19100, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [
        { id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Konzept",
          einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
          positionssumme_cent: 9550, reihenfolge: 1 },
        { id: "p2", beleg_id: "b1", artikel_id: null, bezeichnung: "Umsetzung",
          einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
          positionssumme_cent: 9550, reihenfolge: 2 },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0,
    } as never);
    vi.mocked(api.artikel.list).mockResolvedValue([]);
  }

  it("übernimmt eine Position ins Formular und speichert sie unter ihrer Id", async () => {
    // Bisher ließ sich eine Position nur löschen und neu anlegen. Bei einem
    // Zahlendreher in der Menge hieß das: alles noch einmal eintippen.
    entwurfMitPositionen();
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Konzept")).toBeTruthy());

    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    expect(screen.getByText("Position ändern")).toBeTruthy();
    expect((screen.getByLabelText("Bezeichnung") as HTMLInputElement).value).toBe("Konzept");

    fireEvent.change(screen.getByLabelText("Menge"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderung speichern" }));

    await waitFor(() =>
      expect(api.belege.positionSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: "p1", menge: 3000 }),
      ),
    );
  });

  it("verschiebt eine Position und blendet die Knöpfe an den Rändern ab", async () => {
    entwurfMitPositionen();
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Konzept")).toBeTruthy());

    // Die erste Position kann nicht höher, die letzte nicht tiefer.
    expect(screen.getByRole("button", { name: '„Konzept" nach oben' })).toBeDisabled();
    expect(screen.getByRole("button", { name: '„Umsetzung" nach unten' })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: '„Umsetzung" nach oben' }));
    await waitFor(() => expect(api.belege.positionVerschieben).toHaveBeenCalledWith("p2", "hoch"));
  });

  it("zeigt die Positionssumme, bevor gespeichert wird", async () => {
    entwurfMitPositionen();
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Konzept")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Freitextposition"));
    fireEvent.change(screen.getByLabelText("Einzelpreis"), { target: { value: "95,50" } });
    fireEvent.change(screen.getByLabelText("Menge"), { target: { value: "3" } });

    await waitFor(() => expect(screen.getByText(/Positionssumme: 286,50/)).toBeTruthy());
  });

  it("erfindet keine Summe, wenn der Preis erst das Backend kennt", async () => {
    // Bei einem Artikel ohne überschriebenen Preis kann ein Kundenpreis gelten.
    // Den kennt nur das Backend — eine Zahl zu zeigen hieße, sie zu raten.
    entwurfMitPositionen();
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Konzept")).toBeTruthy());

    expect(screen.getByText(/Preis wird beim Speichern ermittelt/)).toBeTruthy();
  });

  it("sagt Bescheid, wenn die Menge nicht lesbar ist", async () => {
    entwurfMitPositionen();
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Konzept")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Menge"), { target: { value: "drei" } });
    await waitFor(() => expect(screen.getByText(/Menge unklar/)).toBeTruthy());
  });
});
