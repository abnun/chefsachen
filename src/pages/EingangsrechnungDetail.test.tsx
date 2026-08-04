import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
// Ein Test, der Aufrufe zählt, hängt dann an der Reihenfolge und an allem, was
// in den Tests davor geschah — genau so entstand ein Ausfall, der nur in der CI
// auftrat. `clearAllMocks` löscht die Aufrufe, nicht die hinterlegten Antworten.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Hinweis: Die Beispieldaten werden direkt im vi.mock-Factory-Callback definiert
// statt über eine äußere Konstante referenziert zu werden, da vi.mock-Aufrufe von
// Vitest an den Dateianfang gehoistet werden — eine Referenz auf eine später im
// Modul deklarierte const würde zu einem "Cannot access before initialization"-Fehler
// führen (Temporal Dead Zone). Abweichung vom Plan-Text, siehe Task-12-Bericht.
vi.mock("../api", () => ({
  api: {
    eingangsrechnungen: {
      get: vi.fn().mockResolvedValue({
        eingangsrechnung: {
          id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
          rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
          rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
          manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
          kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
          verkaeufer_strasse: "Lieferantenweg 9", verkaeufer_plz: "50667", verkaeufer_ort: "Köln", verkaeufer_land: "DE",
          verkaeufer_steuernummer: "DE123456789", verkaeufer_email: "",
          zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
          bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
        },
        positionen: [
          { bezeichnung: "Bürobedarf", menge: 2000, einzelpreis_cent: 11900, positionssumme_cent: 23800 },
        ],
        steuerzeilen: [{ nettobetrag_cent: 20000, steuersatz_promille: 190, steuerbetrag_cent: 3800 }],
      }),
      update: vi.fn().mockResolvedValue({
        id: "e1", dateiname: "rechnung.xml", format: "xrechnung",
        rechnungssteller_name: "Lieferant GmbH", rechnungsnummer: "RE-2026-0042",
        rechnungsdatum: "2026-07-15", betrag_cent: 23800, waehrung: "EUR",
        manuell_erfasst: false, importiert_am: "2026-07-19T10:00:00Z",
      }),
      originalExportieren: vi.fn().mockResolvedValue({ dateiname: "rechnung.xml", bytes: [1, 2, 3] }),
      aenderungen: vi.fn().mockResolvedValue([]),
    },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn().mockResolvedValue("/pfad/rechnung.xml") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));
import { writeFile } from "@tauri-apps/plugin-fs";
import { api } from "../api";
import { EingangsrechnungDetail } from "./EingangsrechnungDetail";

describe("EingangsrechnungDetail", () => {
  it("zeigt Kernfelder und Positionstabelle", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.getByText("RE-2026-0042")).toBeTruthy();
    expect(screen.getByText("Bürobedarf")).toBeTruthy();
    // "238,00 €" erscheint zweimal (Kopf-Betrag + Positionssumme, da die
    // Beispielposition den vollen Rechnungsbetrag ausmacht) — getAllByText
    // statt getByText, da Letzteres bei Mehrfachtreffern wirft. Abweichung
    // vom Plan-Text, siehe Task-12-Bericht.
    expect(screen.getAllByText("238,00 €")).toHaveLength(2);
  });

  it("zeigt keinen Löschen-Button", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Löschen" })).toBeNull();
  });

  it("wechselt nach Bearbeiten-Klick in editierbare Felder und speichert per update", async () => {
    const { api } = await import("../api");
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Rechnungssteller"), { target: { value: "Korrigiert GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.eingangsrechnungen.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "e1", rechnungssteller_name: "Korrigiert GmbH" }),
      ),
    );
  });

  it("exportiert die Original-Datei über den Speichern-Dialog", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Original-Datei exportieren" }));
    await waitFor(() =>
      expect(writeFile).toHaveBeenCalledWith("/pfad/rechnung.xml", new Uint8Array([1, 2, 3])),
    );
  });

  it("zeigt den Betrag im Bearbeiten-Modus als Euro-Eingabe, nicht als Cent-Zahl", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    expect(screen.getByLabelText("Betrag (EUR)")).toHaveValue("238,00");
  });

  it("übernimmt einen geänderten Euro-Betrag korrekt in Cent beim Speichern", async () => {
    const { api } = await import("../api");
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Betrag (EUR)"), { target: { value: "99,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.eingangsrechnungen.update).toHaveBeenCalledWith(expect.objectContaining({ betrag_cent: 9950 })),
    );
  });

  it("verwirft Änderungen bei Klick auf Abbrechen und zeigt wieder die Lesesicht", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Rechnungssteller"), { target: { value: "Verworfen GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Rechnungssteller")).toBeNull();
    expect(screen.getByText("Lieferant GmbH")).toBeTruthy();
  });

  it('ruft onZurueck bei Klick auf „Zurück zur Liste" auf', async () => {
    const onZurueck = vi.fn();
    render(<EingangsrechnungDetail id="e1" onZurueck={onZurueck} />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "← Zurück zur Liste" }));
    expect(onZurueck).toHaveBeenCalledTimes(1);
  });

  it("zeigt Zusatzfelder und Steuerzeilen in der Detailansicht", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.getByText("DE123456789")).toBeTruthy();
    expect(screen.getByText("19,0 %")).toBeTruthy();
  });

  it("zeigt die Änderungshistorie mit lesbar aufbereiteten Werten", async () => {
    vi.mocked(api.eingangsrechnungen.aenderungen).mockResolvedValueOnce([
      { feld: "Betrag", alt: "23800", neu: "25000", geaendert_am: "2026-07-20T08:30:00Z" },
      { feld: "Rechnungsdatum", alt: "2026-07-15", neu: "2026-07-16", geaendert_am: "2026-07-20T08:30:00Z" },
    ]);
    render(<EingangsrechnungDetail id="e1" />);

    await waitFor(() => expect(screen.getByText("Änderungshistorie")).toBeTruthy());
    // Cent und ISO-Datum wären hier unverständlich; die Tabelle zeigt die
    // Werte so, wie sie in der Oberfläche sonst auch stehen.
    expect(screen.getByText("250,00 €")).toBeTruthy();
    expect(screen.getByText("16.07.2026")).toBeTruthy();
    expect(screen.getByText("15.07.2026")).toBeTruthy();
  });

  it("zeigt ohne Korrekturen keine Änderungshistorie", async () => {
    render(<EingangsrechnungDetail id="e1" />);
    await waitFor(() => expect(screen.getByText("Lieferant GmbH")).toBeTruthy());
    expect(screen.queryByText("Änderungshistorie")).toBeNull();
  });
});
