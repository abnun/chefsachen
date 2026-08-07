import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    artikel: {
      list: vi.fn().mockResolvedValue([
        {
          id: "a1",
          artikelnummer: "ART-0001",
          bezeichnung: "Beratung",
          beschreibung: "",
          einheit_id: "e1",
          standardpreis_cent: 9550, ust_satz_prozent: 19,
          kundenpreise_anzahl: 0,
        },
      ]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      kundenpreise: vi.fn().mockResolvedValue([]),
      kundenpreisSave: vi.fn(),
      kundenpreisDelete: vi.fn(),
    },
    einheiten: {
      list: vi.fn().mockResolvedValue([{ id: "e1", name: "Stunde", kuerzel: "Std" }]),
    },
    kunden: {
      list: vi.fn().mockResolvedValue([]),
    },
  },
  // Echte Logik statt eines pauschalen false — sonst kann in Tests grundsätzlich
  // kein Feldfehler sichtbar werden und genau die Regression bliebe unentdeckt.
  istValidierungsfehler: (e: unknown) =>
    typeof e === "object" && e !== null && (e as { typ?: string }).typ === "validation",
}));
import { Artikel } from "./Artikel";

describe("Artikel", () => {
  it("laedt und zeigt Artikelliste mit Nummer, Bezeichnung, Einheit und Preis", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("ART-0001")).toBeTruthy());
    expect(screen.getByText("Beratung")).toBeTruthy();
    expect(screen.getByText("Std")).toBeTruthy();
    expect(screen.getByText("95,50 €")).toBeTruthy();
  });

  it("zeigt den Leerzustand-Hinweis, wenn keine Artikel vorhanden sind", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText(/Noch keine Artikel/)).toBeTruthy());
  });

  it("zeigt einen Hinweis, wenn die Suche keine Treffer liefert", async () => {
    const { api } = await import("../api");
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    vi.mocked(api.artikel.list).mockResolvedValueOnce([]);
    fireEvent.change(screen.getByLabelText("Suche"), { target: { value: "xyz" } });
    await waitFor(() => expect(screen.getByText('Keine Artikel gefunden für „xyz".')).toBeTruthy());
  });

  it("zeigt nach dem Anlegen einen Kunden-Hinweis, wenn noch keine Kunden existieren", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([]);
    const onZuKundenWechseln = vi.fn();
    render(<Artikel onZuKundenWechseln={onZuKundenWechseln} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung *"), { target: { value: "Beratung" } });
    fireEvent.change(screen.getByLabelText("Einheit *"), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€, brutto)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /jetzt auch einen Kunden anlegen/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /jetzt auch einen Kunden anlegen/ }));
    expect(onZuKundenWechseln).toHaveBeenCalledTimes(1);
  });

  it("sagt in der Kundenpreis-Spalte \u201ekeine\u201c, wenn es keine Ausnahmen gibt", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Kundenpreise für Beratung" })).toHaveTextContent(
      "keine",
    );
  });

  it("zählt die Ausnahmen in der Kundenpreis-Spalte", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, ust_satz_prozent: 19, kundenpreise_anzahl: 2,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    // „2 Ausnahmen", nicht „Kundenpreise (2)": Die Spaltenüberschrift sagt
    // schon, worum es geht, und die Zahl allein ließe offen, wovon.
    expect(screen.getByRole("button", { name: "Kundenpreise für Beratung" })).toHaveTextContent(
      "2 Ausnahmen",
    );
  });






  it("öffnet die Kundenpreise als Dialog, ohne die Tabelle zu zerreißen", async () => {
    // Vorher klappte hier eine Zeile mit `colSpan` über alle Spalten auf.
    const { api } = await import("../api");
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise für Beratung" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByRole("dialog")).toHaveTextContent("Kundenpreise für");
  });


  it("zeigt nach dem Anlegen eines Artikels einen Erfolgs-Hinweis, wenn bereits Kunden existieren", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 0,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung *"), { target: { value: "Konzeption" } });
    // Die Einheit ist im Formular Pflicht; ohne Auswahl blockiert der Browser
    // das Abschicken und der Backend-Fehler entstünde gar nicht erst.
    fireEvent.change(screen.getByLabelText("Einheit *"), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€, brutto)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText('Artikel „Konzeption" angelegt')).toBeTruthy());
  });

  // Regression: Das Backend meldet Validierungsfehler auch für Felder, die das
  // Formular nicht einzeln ausweist (einheit_id, standardpreis_cent). Vorher
  // wurden die stumm verschluckt — der Speichern-Knopf tat sichtbar nichts.
  it.each([
    ["einheit_id", "Einheit existiert nicht"],
    ["standardpreis_cent", "Standardpreis darf nicht negativ sein"],
    ["voellig_unbekanntes_feld", "Irgendein neuer Backend-Fehler"],
  ])("zeigt den Validierungsfehler für das Feld %s an", async (feld, meldung) => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.create).mockRejectedValueOnce({ typ: "validation", feld, meldung });
    render(<Artikel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung *"), { target: { value: "Konzeption" } });
    // Die Einheit ist im Formular Pflicht; ohne Auswahl blockiert der Browser
    // das Abschicken und der Backend-Fehler entstünde gar nicht erst.
    fireEvent.change(screen.getByLabelText("Einheit *"), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€, brutto)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText(meldung)).toBeTruthy());
  });

  it("sendet den gewählten Umsatzsteuersatz beim Anlegen mit", async () => {
    const { api } = await import("../api");
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung *"), { target: { value: "Fachbuch" } });
    fireEvent.change(screen.getByLabelText("Einheit *"), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€, brutto)"), { target: { value: "10,70" } });
    fireEvent.change(screen.getByLabelText("Umsatzsteuersatz"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(api.artikel.create).toHaveBeenCalledWith(
        expect.objectContaining({ ust_satz_prozent: 7 }),
      ),
    );
  });

  it("zeigt nach dem Bearbeiten eines Artikels einen Erfolgs-Hinweis", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText('Artikel „Beratung" gespeichert')).toBeTruthy());
  });


  it("löscht einen Artikel nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.artikel.delete)).not.toHaveBeenCalled();
  });

  it("löscht einen Artikel ohne Kundenpreise nach Bestätigung", async () => {
    const { api } = await import("../api");
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Artikel „Beratung" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Artikel „Beratung" gelöscht')).toBeTruthy());
    expect(vi.mocked(api.artikel.delete)).toHaveBeenCalledWith("a1", false);
  });

  it("zeigt einen Hinweis auf mitzulöschende Kundenpreise im Dialogtext und übergibt kundenpreiseMitloeschen", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung", beschreibung: "",
        einheit_id: "e1", standardpreis_cent: 9550, ust_satz_prozent: 19, kundenpreise_anzahl: 2,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Artikel „Beratung" hat 2 Kundenpreis(e). Diese werden beim Löschen ebenfalls entfernt. Trotzdem löschen?',
        ),
      ).toBeTruthy(),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(vi.mocked(api.artikel.delete)).toHaveBeenCalledWith("a1", true));
  });

  /*
   * Pflichtfelder melden sich wie alle anderen Feldfehler.
   *
   * Bezeichnung und Einheit hingen zuvor an `required`. Die eingebaute Blase
   * des Browsers steht in der Sprache des Systems, sieht anders aus als jede
   * andere Meldung der Anwendung und verschwindet beim nächsten Klick — in
   * einem Formular, das sonst deutsche Feldfehler zeigt, ein Fremdkörper.
   */
  it("weist eine fehlende Einheit am Feld aus", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.create).mockRejectedValueOnce({
      typ: "validation", feld: "einheit_id", meldung: "Bitte eine Einheit wählen",
    });
    render(<Artikel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung *"), { target: { value: "Konzeption" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€, brutto)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(screen.getByText("Bitte eine Einheit wählen")).toBeTruthy());
  });

  it("kommt bis zum Absenden, auch wenn die Bezeichnung fehlt", async () => {
    // Ohne diesen Weg bliebe der Fehler beim Browser hängen und die eigene
    // Meldung erschiene nie.
    const { api } = await import("../api");
    vi.mocked(api.artikel.create).mockRejectedValueOnce({
      typ: "validation", feld: "bezeichnung", meldung: "Bezeichnung darf nicht leer sein",
    });
    render(<Artikel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Einheit *"), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€, brutto)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(screen.getByText("Bezeichnung darf nicht leer sein")).toBeTruthy());
  });

  it("öffnet das Anlage-Formular bei ⌘N", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy();
  });

  it("verwirft bei offenem Formular keine Eingaben durch ⌘N", async () => {
    // neuFormular() leert alle Felder — ein ⌘N mitten im Ausfüllen darf die
    // Eingaben nicht kommentarlos verwerfen.
    render(<Artikel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung *"), { target: { value: "Halb getippt" } });

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    expect(screen.getByLabelText("Bezeichnung *")).toHaveValue("Halb getippt");
  });

  it("startet den Rundgang über den Knopf im Seitenkopf", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Rundgang" }));
    expect(screen.getByText("1 von 5")).toBeTruthy();
  });

  it("blendet die Artikelliste aus, während das Formular offen ist", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    expect(screen.queryByText("Beratung")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
  });
});
