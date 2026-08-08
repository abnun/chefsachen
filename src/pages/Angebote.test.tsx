import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

// Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
// Ein Test, der Aufrufe zählt, hängt dann an der Reihenfolge und an allem, was
// in den Tests davor geschah — genau so entstand ein Ausfall, der nur in der CI
// auftrat. `clearAllMocks` löscht die Aufrufe, nicht die hinterlegten Antworten.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("../api", () => ({
  api: {
    belege: {
      list: vi.fn().mockResolvedValue([
        { id: "1", typ: "angebot", nummer: "AN-2026-0001", status: "festgeschrieben", kunde_id: "k1",
          datum: "2026-07-10", leistungsdatum: "2026-07-10", zahlungsziel_tage: 14,
          kopftext: "", fusstext: "", summe_cent: 9500, ursprungsangebot_id: null, storno_von_id: null },
        { id: "2", typ: "angebot", nummer: "AN-2026-0002", status: "festgeschrieben", kunde_id: "k1",
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
import { Angebote } from "./Angebote";

describe("Angebote", () => {
  it("zeigt Angebotsliste mit Nummer und Kunde", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("AN-2026-0001")).toBeTruthy());
    expect(screen.getByText("ACME GmbH")).toBeTruthy();
  });

  it("zeigt den Snapshot-Namen statt des Live-Namens, wenn vorhanden", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("AN-2026-0002")).toBeTruthy());
    expect(screen.getByText("ACME GmbH (alter Name)")).toBeTruthy();
  });

  it("sagt, dass es noch keine Angebote gibt, statt eine leere Tabelle zu zeigen", async () => {
    vi.mocked(api.belege.list).mockResolvedValueOnce([]);
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Angebote/)).toBeTruthy());
  });

  /*
   * Der leere Anfang war hier ein nackter Absatz, bei Kunden und Artikeln
   * dagegen die blaue Hinweisbox. Dieselbe Lage soll überall gleich aussehen
   * und sich überall wegklicken lassen.
   */
  it("zeigt den leeren Anfang als wegklickbaren Hinweis", async () => {
    vi.mocked(api.belege.list).mockResolvedValueOnce([]);
    render(<Angebote onOeffnen={() => {}} />);

    const meldung = await screen.findByText(/Noch keine Angebote/);
    expect(meldung.closest(".hinweis-box")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByText(/Noch keine Angebote/)).toBeNull();
  });

  /*
   * Ein leeres Suchergebnis ist eine Auskunft, keine Einladung zum Loslegen —
   * es gehört nicht in die blaue Box und darf auch nicht wegklickbar sein.
   */
  it("zeigt ein leeres Suchergebnis als schlichten Text", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("AN-2026-0001")).toBeTruthy());

    // Gesucht wird im Backend, nicht in der geladenen Liste: Der nächste
    // Aufruf muss also leer antworten. Dazu kommen 300 ms Verzögerung, damit
    // nicht jeder Tastendruck eine Abfrage auslöst — daher die längere Frist.
    vi.mocked(api.belege.list).mockResolvedValueOnce([]);
    fireEvent.change(screen.getByLabelText("Suche"), { target: { value: "gibtsnicht" } });

    const meldung = await screen.findByText(/Keine Angebote gefunden/, {}, { timeout: 2000 });
    expect(meldung.closest(".hinweis-box")).toBeNull();
  });

  it("zeigt das Datum deutsch, nicht in ISO-Schreibweise", async () => {
    // Die Rechnungsliste tat das längst; hier war es nie umgestellt worden.
    // „2026-07-10" liest sich für deutsche Nutzer leicht als Tag-Monat-Dreher.
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("10.07.2026")).toBeTruthy());
    expect(screen.queryByText("2026-07-10")).toBeNull();
  });

  it("beschriftet den Status, statt den Datenbankschlüssel zu zeigen", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getAllByText("Festgeschrieben", { selector: ".status" })).toHaveLength(2));
  });

  it("öffnet das Anlage-Formular bei ⌘N und fokussiert die Suche bei ⌘F", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("AN-2026-0001")).toBeTruthy());

    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Nummer oder Kunde"));
  });

  it("startet den Rundgang über den Knopf im Seitenkopf", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("AN-2026-0001")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Rundgang" }));
    expect(screen.getByText("1 von 5")).toBeTruthy();
  });

  it("blendet die Angebotsliste aus, während das Anlage-Formular offen ist", async () => {
    render(<Angebote onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("AN-2026-0001")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Neues Angebot" }));
    expect(screen.queryByText("AN-2026-0001")).toBeNull();
    expect(screen.getByRole("button", { name: "Anlegen" })).toBeTruthy();
  });
});
