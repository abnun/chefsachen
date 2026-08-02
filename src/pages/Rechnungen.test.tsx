import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

afterEach(cleanup);

vi.mock("../api", () => ({
  api: {
    belege: {
      list: vi.fn().mockResolvedValue([
        { id: "1", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde_id: "k1",
          datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null },
        { id: "2", typ: "rechnung", nummer: "RE-2026-0002", status: "gestellt", kunde_id: "k1",
          datum: "2026-07-11", leistungsdatum: "2026-07-11", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 5000, ursprungsangebot_id: null, storno_von_id: null,
          kunde_snapshot_name: "ACME GmbH (alter Name)" },
      ]),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001", zahlungsziel_tage: 14,
          notizen: "", ust_idnr: "", email: "", leitweg_id: "", kaeuferreferenz: "", hat_adresse: true },
      ]),
    },
    einstellungen: { get: vi.fn().mockResolvedValue("") },
  },
}));
import { Rechnungen } from "./Rechnungen";

describe("Rechnungen", () => {
  it("zeigt Rechnungsliste mit Nummer und Kunde", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());
    expect(screen.getByText("ACME GmbH")).toBeTruthy();
  });

  it("zeigt den Snapshot-Namen statt des Live-Namens, wenn vorhanden", async () => {
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0002")).toBeTruthy());
    expect(screen.getByText("ACME GmbH (alter Name)")).toBeTruthy();
  });

  it("sagt, dass es noch keine Rechnungen gibt, statt eine leere Tabelle zu zeigen", async () => {
    // Eine Tabelle mit Kopfzeile und ohne Inhalt lässt offen, ob nichts da ist
    // oder etwas schiefging.
    vi.mocked(api.belege.list).mockResolvedValueOnce([]);
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Rechnungen/)).toBeTruthy());
  });

  it("unterscheidet eine leere Liste von einem leeren Filterergebnis", async () => {
    vi.mocked(api.belege.list).mockResolvedValue([]);
    render(<Rechnungen onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Rechnungen/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: "storniert" } });
    await waitFor(() => expect(screen.getByText(/Keine Rechnungen mit diesem Status/)).toBeTruthy());
  });
});
