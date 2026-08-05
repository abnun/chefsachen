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
        offener_betrag_cent: 0, steuerzeilen: [],
      }),
      positionSave: vi.fn().mockResolvedValue({
        id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "", einheit_kuerzel: "",
        einzelpreis_cent: 0, menge: 1000, positionssumme_cent: 0, ust_satz_prozent: 19, reihenfolge: 0,
      }),
      positionDelete: vi.fn().mockResolvedValue(undefined),
      positionVerschieben: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      duplizieren: vi.fn().mockResolvedValue({
        id: "kopie1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-08-04", leistungsdatum: "2026-08-04", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      }),
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
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "festgeschrieben", kunde_id: "k1",
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
      zahlungserinnerungExportieren: vi.fn().mockResolvedValue([1, 2, 3]),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([]),
      // Der Belegeditor lädt Adressen und Ansprechpartner des Kunden für die
      // Auswahl in den Stammdaten.
      get: vi.fn().mockResolvedValue({ kunde: {}, adressen: [], ansprechpartner: [] }),
    },
    artikel: {
      list: vi.fn().mockResolvedValue([]),
      // Liefert den Preis, der für Kunde und Belegdatum gilt. Ohne Kundenpreis
      // ist das der Standardpreis des Artikels.
      preisErmitteln: vi.fn().mockResolvedValue(9550),
    },
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
      offener_betrag_cent: 0, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Entwurf", { selector: ".status" })).toBeTruthy());
    const stellenButton = screen.getByRole("button", { name: "Festschreiben" });
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Kunde: ACME GmbH (alter Name)")).toBeTruthy());
  });
});

describe("BelegEditor – Als Kopie anlegen", () => {
  /*
   * Wer jeden Monat eine fast gleiche Rechnung stellt, tippte sie bisher
   * jedes Mal neu.
   */
  it("dupliziert einen Beleg und meldet den Wechsel zur Kopie", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: "AN-2026-0001", status: "festgeschrieben", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    });
    const onDupliziert = vi.fn();
    render(<BelegEditor id="b1" onDupliziert={onDupliziert} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als Kopie anlegen" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Als Kopie anlegen" }));

    await waitFor(() => expect(api.belege.duplizieren).toHaveBeenCalledWith("b1"));
    await waitFor(() => expect(onDupliziert).toHaveBeenCalledWith("kopie1"));
    await waitFor(() => expect(screen.getByText("Angebot dupliziert")).toBeTruthy());
  });

  it("ist auch bei einem Entwurf verfügbar, ohne Rückfrage", async () => {
    // Anders als „Entwurf löschen": Eine Kopie ist folgenlos, braucht also
    // keine Bestätigung.
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als Kopie anlegen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Als Kopie anlegen" }));
    await waitFor(() => expect(api.belege.duplizieren).toHaveBeenCalledWith("b1"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("BelegEditor – Gültigkeit des Angebots", () => {
  /*
   * Der Fußtext versprach bisher eine Frist ("Dieses Angebot ist 30 Tage
   * gültig"), ohne dass ein Datum dazu existierte. Die Übersicht führte
   * Angebote deshalb unbefristet als „offen" — die Zahl wurde bedeutungslos.
   */
  it("zeigt das Feld nur bei einem Angebot, nicht bei einer Rechnung", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
        gueltig_bis: "2026-08-09",
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText("Gültig bis")).toHaveValue("2026-08-09"));
  });

  it("zeigt bei einer Rechnung kein Feld für die Gültigkeit", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText("Datum")).toBeTruthy());
    expect(screen.queryByLabelText("Gültig bis")).toBeNull();
  });

  it("speichert eine geänderte Gültigkeit über die Stammdaten", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
        gueltig_bis: "2026-08-09",
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText("Gültig bis")).toHaveValue("2026-08-09"));

    fireEvent.change(screen.getByLabelText("Gültig bis"), { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(api.belege.update).toHaveBeenCalledWith(
        expect.objectContaining({ gueltig_bis: "2026-12-31" }),
      ),
    );
  });

  it("zeigt in der schreibgeschützten Ansicht unbefristet, wenn keine Gültigkeit gesetzt ist", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: "AN-2026-0001", status: "festgeschrieben", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
        gueltig_bis: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Gültig bis: unbefristet")).toBeTruthy());
  });

  it("zeigt die Gültigkeit in der Vorschau vor dem Festschreiben", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
        gueltig_bis: "2026-08-09",
      },
      positionen: [{
        id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Beratung",
        einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
        positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 0,
      }],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Festschreiben" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Festschreiben" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Gültig bis");
    expect(dialog).toHaveTextContent("09.08.2026");
  });
});

describe("BelegEditor – Herkunft des Preises", () => {
  /*
   * Ob für einen Artikel ein Kundenpreis greift, war beim Erfassen nicht zu
   * sehen. Im Formular stand „Preis wird beim Speichern ermittelt" — man erfuhr
   * den Preis also erst, wenn die Position schon in der Liste stand. Der Befehl
   * zur Preisermittlung gab es längst, er wurde nur nirgends aufgerufen.
   */
  function entwurfMitArtikel() {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    } as never);
    vi.mocked(api.artikel.list).mockResolvedValue([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, ust_satz_prozent: 19, kundenpreise_anzahl: 1,
      },
    ] as never);
  }

  it("weist einen greifenden Kundenpreis samt Standardpreis aus", async () => {
    entwurfMitArtikel();
    vi.mocked(api.artikel.preisErmitteln).mockResolvedValue(6500);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText("Artikel")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "Beratung" } });

    // Beide Zahlen: Ohne den Standardpreis daneben sagt „Kundenpreis 65,00 €"
    // nichts darüber, ob das viel oder wenig ist.
    await waitFor(() => expect(screen.getByText(/Kundenpreis 65,00 €/)).toBeTruthy());
    // Auf den Absatz eingegrenzt: Die Artikelauswahl nennt denselben Betrag,
    // eine seitenweite Suche träfe also auch sie.
    const zeile = screen.getByText(/Kundenpreis 65,00 €/).closest("p");
    expect(zeile).toHaveTextContent("95,50 €");
  });

  it("sagt ausdrücklich, wenn kein Kundenpreis hinterlegt ist", async () => {
    // Schweigen ließe offen, ob geprüft wurde.
    entwurfMitArtikel();
    vi.mocked(api.artikel.preisErmitteln).mockResolvedValue(9550);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText("Artikel")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "Beratung" } });

    await waitFor(() =>
      expect(screen.getByText(/Standardpreis 95,50 € — kein Kundenpreis hinterlegt/)).toBeTruthy(),
    );
  });

  it("rechnet die Positionssumme mit dem geltenden Preis vor", async () => {
    // Vorher stand hier „Preis wird beim Speichern ermittelt" — der Betrag war
    // bis zum Absenden unbekannt.
    entwurfMitArtikel();
    vi.mocked(api.artikel.preisErmitteln).mockResolvedValue(6500);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText("Artikel")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "Beratung" } });
    fireEvent.change(screen.getByLabelText("Menge"), { target: { value: "4" } });

    await waitFor(() => expect(screen.getByText("Positionssumme: 260,00 €")).toBeTruthy());
  });

  it("bleibt bei der alten Auskunft, wenn die Ermittlung scheitert", async () => {
    // Eine Fehlermeldung wäre hier lauter als der Nutzen: Der Preis entsteht
    // beim Speichern ohnehin im Rust-Teil.
    entwurfMitArtikel();
    vi.mocked(api.artikel.preisErmitteln).mockRejectedValue(new Error("weg"));
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByLabelText("Artikel")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Artikel"), { target: { value: "Beratung" } });

    await waitFor(() =>
      expect(screen.getByText("Preis wird beim Speichern ermittelt")).toBeTruthy(),
    );
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
      offener_betrag_cent: 0, steuerzeilen: [],
    });
    vi.mocked(api.artikel.list).mockResolvedValue([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, ust_satz_prozent: 19, kundenpreise_anzahl: 0,
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
        ust_satz_prozent: null,
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    });
    vi.mocked(api.artikel.list).mockResolvedValue([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, ust_satz_prozent: 19, kundenpreise_anzahl: 0,
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
          positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 0,
        },
      ],
      zahlungen: [],
      bezahlt_cent: 0,
      offener_betrag_cent: 0, steuerzeilen: [],
    });

    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());

    const stellenButton = screen.getByRole("button", { name: "Festschreiben" });
    expect(stellenButton).not.toBeDisabled();
    fireEvent.click(stellenButton);
    // Angebot: der bestätigende Knopf heißt „Festschreiben", nicht „Stellen" —
    // die Anwendung verschickt nichts, sie hält nur fest.
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Festschreiben" }),
    );

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
      offener_betrag_cent: 0, steuerzeilen: [],
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
      offener_betrag_cent: 5000, steuerzeilen: [],
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 5000, steuerzeilen: [],
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500, steuerzeilen: [],
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500, steuerzeilen: [],
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500, steuerzeilen: [],
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500, steuerzeilen: [],
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500, steuerzeilen: [],
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
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "festgeschrieben", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als PDF exportieren" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Als XRechnung (XML) exportieren" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Als ZUGFeRD-Rechnung exportieren" })).toBeNull();
  });
});

describe("BelegEditor – Zahlungserinnerung", () => {
  function gestellteRechnung(offenerBetragCent: number, faelligAm: string | null = "2026-07-25") {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        faellig_am: faelligAm,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 9500 - offenerBetragCent,
      offener_betrag_cent: offenerBetragCent, steuerzeilen: [],
    });
  }

  it("bietet die Zahlungserinnerung an, solange etwas offen und die Rechnung überfällig ist", async () => {
    gestellteRechnung(9500);
    render(<BelegEditor id="b1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Zahlungserinnerung" })).toBeTruthy(),
    );
  });

  it("bietet keine Zahlungserinnerung für eine vollständig bezahlte Rechnung an", async () => {
    // Nichts zu erinnern, wenn nichts mehr offen ist.
    gestellteRechnung(0);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als PDF exportieren" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Zahlungserinnerung" })).toBeNull();
  });

  it("bietet keine Zahlungserinnerung an, solange die Rechnung nicht überfällig ist", async () => {
    // Vor Ablauf des Zahlungsziels ist der Kunde nicht im Verzug — der Brief
    // wiese eine negative Überfälligkeit aus.
    gestellteRechnung(9500, "2999-01-01");
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als PDF exportieren" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Zahlungserinnerung" })).toBeNull();
  });

  it("bietet bei einem Angebot keine Zahlungserinnerung an", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: "AN-2026-0001", status: "festgeschrieben", kunde_id: "k1",
        datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Als PDF exportieren" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Zahlungserinnerung" })).toBeNull();
  });

  it("exportiert eine Zahlungserinnerung über den Speichern-Dialog", async () => {
    gestellteRechnung(9500);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Zahlungserinnerung" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Zahlungserinnerung" }));

    await waitFor(() => expect(api.belege.zahlungserinnerungExportieren).toHaveBeenCalledWith("b1"));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: "RE-2026-0001-zahlungserinnerung.pdf" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("Zahlungserinnerung exportiert")).toBeTruthy());
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    });
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText("Stammdaten gespeichert")).toBeTruthy());
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
          positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 0,
        },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
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
        id: "b1", typ: "angebot", nummer: "A-2026-0001", status: "festgeschrieben", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
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
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550, steuerzeilen: [],
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
    positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9550, steuerzeilen: [],
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
        positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 0,
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
      ...rechnungGestellt({ typ: "angebot", status: "festgeschrieben", nummer: "A-2026-0001" }),
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
        positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 0,
      }],
    });
    render(<BelegEditor id="b1" />);
    // Eine Rechnung wird „gestellt"; nur ein Angebot wird „festgeschrieben".
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
          positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 0,
        },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
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
          positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 0,
        },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
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
          positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 1 },
        { id: "p2", beleg_id: "b1", artikel_id: null, bezeichnung: "Umsetzung",
          einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
          positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 2 },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
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

  it("sendet bei einer Freitextposition den gewählten Steuersatz mit", async () => {
    entwurfMitPositionen();
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText("Konzept")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Freitextposition"));
    fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Fachbuch" } });
    fireEvent.change(screen.getByLabelText("Einzelpreis"), { target: { value: "10,70" } });
    fireEvent.change(screen.getByLabelText("Umsatzsteuersatz"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Position hinzufügen" }));

    await waitFor(() =>
      expect(api.belege.positionSave).toHaveBeenCalledWith(
        expect.objectContaining({ bezeichnung: "Fachbuch", ust_satz_prozent: 7 }),
      ),
    );
  });
});

describe("BelegEditor – Steueraufschlüsselung", () => {
  it("zeigt bei Regelbesteuerung die enthaltene USt unter der Summe", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500,
      steuerzeilen: [{ satz_prozent: 19, netto_cent: 7983, ust_cent: 1517, brutto_cent: 9500 }],
    } as never);
    render(<BelegEditor id="b1" />);
    await waitFor(() =>
      expect(screen.getByText(/Enthaltene USt 19 % \(aus Nettobetrag 79,83/)).toBeTruthy(),
    );
  });

  it("zeigt bei Kleinunternehmer-Belegen keine Aufschlüsselung", async () => {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 9500, steuerzeilen: [],
    } as never);
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByText(/Summe: 95,00/)).toBeTruthy());
    expect(screen.queryByText(/Enthaltene USt/)).toBeNull();
  });
});

describe("BelegEditor – Anschrift und Ansprechpartner", () => {
  function entwurfMitKunde() {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "rechnung", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext: "", fusstext: "", summe_cent: 0, ursprungsangebot_id: null,
        storno_von_id: null, adresse_id: null, ansprechpartner_id: null,
      },
      positionen: [], zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    } as never);
    vi.mocked(api.kunden.list).mockResolvedValue([
      { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
        notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "", hat_adresse: true },
    ] as never);
    vi.mocked(api.kunden.get).mockResolvedValue({
      kunde: { id: "k1", name: "ACME GmbH" },
      adressen: [
        { id: "adr1", kunde_id: "k1", typ: "rechnung", strasse: "Hauptstr. 1", plz: "10115",
          ort: "Berlin", land: "DE", ist_standard: true },
        { id: "adr2", kunde_id: "k1", typ: "rechnung", strasse: "Zweigstelle 7", plz: "20095",
          ort: "Hamburg", land: "DE", ist_standard: false },
        { id: "adr3", kunde_id: "k1", typ: "liefer", strasse: "Lager 3", plz: "50667",
          ort: "Köln", land: "DE", ist_standard: false },
      ],
      ansprechpartner: [
        { id: "ap1", kunde_id: "k1", name: "Erika Musterfrau", rolle: "Einkauf",
          email: "", telefon: "", ist_standard: false },
      ],
    } as never);
  }

  it("bietet nur Rechnungsadressen zur Auswahl an", async () => {
    // Eine Lieferadresse auf der Rechnung wäre schlicht falsch.
    entwurfMitKunde();
    render(<BelegEditor id="b1" />);
    const auswahl = await screen.findByLabelText("Rechnungsadresse");
    await waitFor(() => expect(within(auswahl).getAllByRole("option")).toHaveLength(3));

    const texte = within(auswahl).getAllByRole("option").map((o) => o.textContent);
    expect(texte[0]).toContain("Standardadresse");
    expect(texte.join(" ")).toContain("Hamburg");
    expect(texte.join(" ")).not.toContain("Köln");
  });

  it("schickt die gewählte Anschrift und den Ansprechpartner mit", async () => {
    entwurfMitKunde();
    render(<BelegEditor id="b1" />);
    const auswahl = await screen.findByLabelText("Rechnungsadresse");
    await waitFor(() => expect(within(auswahl).getAllByRole("option")).toHaveLength(3));

    fireEvent.change(auswahl, { target: { value: "adr2" } });
    fireEvent.change(screen.getByLabelText("Ansprechpartner"), { target: { value: "ap1" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(api.belege.update).toHaveBeenCalledWith(
        expect.objectContaining({ adresse_id: "adr2", ansprechpartner_id: "ap1" }),
      ),
    );
  });

  it("schickt ohne Wahl null statt einer leeren Zeichenkette", async () => {
    // Das Backend unterscheidet „keine Wahl" von „ungültige Id"; ein leerer
    // String wäre Letzteres.
    entwurfMitKunde();
    render(<BelegEditor id="b1" />);
    await screen.findByLabelText("Rechnungsadresse");

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.belege.update).toHaveBeenCalledWith(
        expect.objectContaining({ adresse_id: null, ansprechpartner_id: null }),
      ),
    );
  });

  /*
   * Vor dem Festschreiben zeigen, was festgeschrieben wird.
   *
   * Eine Rückfrage, die nur „Wirklich?" fragt, prüft die Entschlossenheit. Bei
   * einem Schritt, der den Beleg unveränderbar macht, ist die eigentliche
   * Frage aber, ob der Inhalt stimmt — und den hat man beim Klick nicht vor
   * Augen. In einer überführten Rechnung stand früher der Wortlaut des
   * Angebots, und genau das fiel erst hinterher auf.
   */
  function entwurfMitTexten(kopftext: string, fusstext: string) {
    vi.mocked(api.belege.get).mockResolvedValue({
      beleg: {
        id: "b1", typ: "angebot", nummer: null, status: "entwurf", kunde_id: "k1",
        datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
        kopftext, fusstext, summe_cent: 9550, ursprungsangebot_id: null, storno_von_id: null,
      },
      positionen: [
        { id: "p1", beleg_id: "b1", artikel_id: null, bezeichnung: "Konzept",
          einheit_kuerzel: "Std", einzelpreis_cent: 9550, menge: 1000,
          positionssumme_cent: 9550, ust_satz_prozent: 19, reihenfolge: 1 },
      ],
      zahlungen: [], bezahlt_cent: 0, offener_betrag_cent: 0, steuerzeilen: [],
    } as never);
  }

  it("zeigt Kopf- und Fußtext in der Rückfrage vor dem Festschreiben", async () => {
    entwurfMitTexten("Sehr geehrte Damen und Herren,", "Dieses Angebot ist 30 Tage gültig.");
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Festschreiben" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Festschreiben" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Sehr geehrte Damen und Herren,");
    expect(dialog).toHaveTextContent("Dieses Angebot ist 30 Tage gültig.");
  });

  it("nennt einen leeren Text als leer, statt die Zeile wegzulassen", async () => {
    // Eine fehlende Zeile sähe aus wie „nicht vorgesehen"; leer ist aber eine
    // Aussage — und oft ein Versehen, das genau hier auffallen soll.
    entwurfMitTexten("", "  ");
    render(<BelegEditor id="b1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Festschreiben" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Festschreiben" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("leer")).toHaveLength(2);
  });
});
