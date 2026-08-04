import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  // Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
  // Ein Test erwartete deshalb „zweimal aufgerufen", weil ein früherer Test
  // schon einmal aufgerufen hatte — damit hing er an der Reihenfolge und an
  // allem, was in den Tests davor geschah.
  vi.clearAllMocks();
});

vi.mock("../api", () => ({
  api: {
    eingangsrechnungen: {
      list: vi.fn().mockResolvedValue([
        {
          id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
          rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
          rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
          manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
          kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
          verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
          verkaeufer_steuernummer: "", verkaeufer_email: "",
          zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
          bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
        },
      ]),
      importVorschau: vi.fn().mockResolvedValue({
        format: "xrechnung",
        geparst: true,
        felder: {
          rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
          rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR", positionen: [],
          kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
          verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
          verkaeufer_steuernummer: "", verkaeufer_email: "",
          zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
          bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
          steuerzeilen: [],
        },
        ist_duplikat: false,
      }),
      speichern: vi.fn().mockResolvedValue({
        id: "e2", dateiname: "neu.xml", format: "xrechnung",
        rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
        rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR",
        manuell_erfasst: false, importiert_am: "2026-07-19T11:00:00Z",
        kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
        verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
        verkaeufer_steuernummer: "", verkaeufer_email: "",
        zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
        bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
      }),
    },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn().mockResolvedValue("/pfad/rechnung.xml") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) }));
import { open } from "@tauri-apps/plugin-dialog";
import { Eingangsrechnungen } from "./Eingangsrechnungen";

describe("Eingangsrechnungen", () => {
  it("zeigt die Liste importierter Eingangsrechnungen", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.getByText("RE-2026-0042")).toBeTruthy();
    expect(screen.getByText("238,00 €")).toBeTruthy();
  });

  it("zeigt den Betrag mit der tatsächlichen Rechnungswährung, nicht fest mit €", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.list).mockResolvedValueOnce([
      {
        id: "e2", dateiname: "us-rechnung.xml", format: "xrechnung",
        rechnungssteller_name: "US Supplier Inc.", rechnungsnummer: "INV-1",
        rechnungsdatum: "2026-07-10", betrag_cent: 5000, waehrung: "USD",
        manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
        kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
        verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
        verkaeufer_steuernummer: "", verkaeufer_email: "",
        zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
        bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
      },
    ]);
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("US Supplier Inc.")).toBeTruthy());
    expect(screen.getByText("50,00 USD")).toBeTruthy();
  });

  it("zeigt keinen Löschen-Button", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
  });

  it("zeigt nach Dateiauswahl die geparsten Felder nur als Text, mit Bearbeiten-Button", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    expect(screen.queryByLabelText("Rechnungssteller")).toBeNull();
    expect(screen.getByRole("button", { name: "Bearbeiten" })).toBeTruthy();
  });

  it("wechselt nach Klick auf Bearbeiten in editierbare Felder", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.getByLabelText("Rechnungssteller")).toBeTruthy();
  });

  it("zeigt bei Parse-Fehlschlag sofort editierbare, leere Felder ohne Bearbeiten-Button", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
      format: "xrechnung",
      geparst: false,
      felder: {
        rechnungssteller_name: "", rechnungsnummer: "", rechnungsdatum: "", betrag_cent: 0, waehrung: "EUR", positionen: [],
        kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
        verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
        verkaeufer_steuernummer: "", verkaeufer_email: "",
        zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
        bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
        steuerzeilen: [],
      },
      ist_duplikat: false,
    });
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText(/Konnte nicht automatisch gelesen werden/)).toBeTruthy());
    expect(screen.getByLabelText("Rechnungssteller")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull();
  });

  it("warnt bei Duplikat und speichert erst nach Bestätigung des Dialogs", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
      format: "xrechnung",
      geparst: true,
      felder: {
        rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
        rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR", positionen: [],
        kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
        verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
        verkaeufer_steuernummer: "", verkaeufer_email: "",
        zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
        bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
        steuerzeilen: [],
      },
      ist_duplikat: true,
    });
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText(/bereits importiert/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(api.eingangsrechnungen.speichern).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Trotzdem importieren" }));
    await waitFor(() => expect(api.eingangsrechnungen.speichern).toHaveBeenCalledTimes(1));
  });

  it("speichert nach Bestätigung und zeigt die Liste ohne Vorschau", async () => {
    const { api } = await import("../api");
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.eingangsrechnungen.speichern).toHaveBeenCalledTimes(1));
    // Abwarten statt sofort prüfen: Die Vorschau wird erst zurückgesetzt,
    // nachdem `speichern` aufgelöst hat. Ein `waitFor` auf die Aufrufzahl kann
    // schon zurückkehren, während die Zustandsänderung noch aussteht — in der
    // CI schlug das zu, lokal nicht.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Bearbeiten" })).toBeNull(),
    );
  });

  // Regression P1.8: Datei und Metadaten dürfen nie auseinanderlaufen. Vorher
  // wurden Bytes und Dateiname vor dem Parsen übernommen — schlug das Parsen
  // fehl, blieb die alte Vorschau stehen und "Speichern" hätte die NEUE Datei
  // unter den ALTEN Metadaten abgelegt.
  it("übernimmt bei fehlgeschlagenem Parsen nicht die neue Datei", async () => {
    const { api } = await import("../api");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const { open } = await import("@tauri-apps/plugin-dialog");

    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());

    // Erster Import gelingt — Vorschau und Bytes gehören zu "gut.xml".
    vi.mocked(open).mockResolvedValueOnce("/pfad/gut.xml");
    vi.mocked(readFile).mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());

    // Zweiter Import scheitert am Parsen.
    vi.mocked(open).mockResolvedValueOnce("/pfad/kaputt.xml");
    vi.mocked(readFile).mockResolvedValueOnce(new Uint8Array([9, 9, 9]));
    vi.mocked(api.eingangsrechnungen.importVorschau).mockRejectedValueOnce({
      typ: "technisch", meldung: "Datei nicht lesbar",
    });
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText(/technischer Fehler/i)).toBeTruthy());

    // Speichern muss die Bytes und den Namen des ERSTEN, gültigen Imports nutzen.
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.eingangsrechnungen.speichern).toHaveBeenCalled());
    const aufrufe = vi.mocked(api.eingangsrechnungen.speichern).mock.calls;
    const [bytes, dateiname] = aufrufe[aufrufe.length - 1];
    expect(bytes).toEqual([1, 2, 3]);
    expect(dateiname).toBe("gut.xml");
  });

  it("öffnet den Datei-Dialog mit XML/PDF-Filter beim Klick auf Importieren", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        expect.objectContaining({ filters: [{ name: "E-Rechnung", extensions: ["xml", "pdf"] }] }),
      ),
    );
  });

  it("zeigt Zusatzfelder in der Vorschau, sobald sie geparst wurden", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
      format: "xrechnung",
      geparst: true,
      felder: {
        rechnungssteller_name: "Neuer Lieferant", rechnungsnummer: "RE-9999",
        rechnungsdatum: "2026-07-19", betrag_cent: 10000, waehrung: "EUR", positionen: [],
        kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
        verkaeufer_strasse: "Lieferantenweg 9", verkaeufer_plz: "50667", verkaeufer_ort: "Köln", verkaeufer_land: "DE",
        verkaeufer_steuernummer: "DE123456789", verkaeufer_email: "",
        zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
        bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
        steuerzeilen: [],
      },
      ist_duplikat: false,
    });
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    expect(screen.getByText("DE123456789")).toBeTruthy();
  });

  // Ab hier: Tests, die speichern() aufrufen, stehen bewusst am Dateiende — kein
  // clearMocks in der Vitest-Konfiguration, weitere Call-Count-Assertions auf
  // demselben Mock würden sonst mit den obigen Tests kollidieren (siehe Task 11).

  it("zeigt den Betrag im Bearbeiten-Modus als Euro-Eingabe, nicht als Cent-Zahl", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.getByLabelText("Betrag (EUR)")).toHaveValue("100,00");
  });

  it("wechselt bei Klick auf Abbrechen zurück in die Lesesicht", async () => {
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Rechnungssteller")).toBeNull();
    expect(screen.getByRole("button", { name: "Bearbeiten" })).toBeTruthy();
  });

  it("übernimmt einen geänderten Euro-Betrag korrekt in Cent beim Speichern", async () => {
    const { api } = await import("../api");
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText("Neuer Lieferant")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Betrag (EUR)"), { target: { value: "12,34" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.eingangsrechnungen.speichern).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), expect.objectContaining({ betrag_cent: 1234 }),
      ),
    );
  });

  /// Aufbewahrungspflichtig sind alle Eingangsrechnungen. Ein eingescanntes PDF
  /// ist kein Fehlschlag — die Meldung darf nicht nach einem Problem klingen.
  it("erklärt bei einem reinen PDF, dass die Datei trotzdem archiviert wird", async () => {
    const { api } = await import("../api");
    vi.mocked(api.eingangsrechnungen.importVorschau).mockResolvedValueOnce({
      format: "pdf",
      geparst: false,
      felder: {
        rechnungssteller_name: "", rechnungsnummer: "", rechnungsdatum: "", betrag_cent: 0,
        waehrung: "EUR", positionen: [],
        kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
        verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
        verkaeufer_steuernummer: "", verkaeufer_email: "",
        zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
        bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
        steuerzeilen: [],
      },
      ist_duplikat: false,
    });
    render(<Eingangsrechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Importieren" }));
    await waitFor(() => expect(screen.getByText(/unverändert archiviert/)).toBeTruthy());
    // Kein alarmierender Ton — es ist der Normalfall bei Scans.
    expect(screen.queryByText(/Konnte nicht automatisch gelesen werden/)).toBeNull();
    expect(screen.getByLabelText("Rechnungssteller")).toBeTruthy();
  });
});
