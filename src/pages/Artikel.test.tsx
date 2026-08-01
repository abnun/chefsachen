import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

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
          standardpreis_cent: 9550,
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

  it("zeigt nach dem Anlegen einen Kunden-Hinweis, wenn noch keine Kunden existieren", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([]);
    const onZuKundenWechseln = vi.fn();
    render(<Artikel onZuKundenWechseln={onZuKundenWechseln} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Neuer Artikel" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Artikel" }));
    fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Beratung" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /jetzt auch einen Kunden anlegen/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /jetzt auch einen Kunden anlegen/ }));
    expect(onZuKundenWechseln).toHaveBeenCalledTimes(1);
  });

  it("zeigt den Kundenpreise-Button ohne Zahl, wenn keine Kundenpreise vorhanden sind", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Kundenpreise" })).toBeTruthy();
  });

  it("zeigt den Kundenpreise-Button mit Anzahl, wenn Kundenpreise vorhanden sind", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 2,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Kundenpreise (2)" })).toBeTruthy();
  });

  it("zeigt im aufgeklappten Bereich den Standardpreis in der Überschrift sowie Kundenname und -preis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 0,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: null },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    await waitFor(() =>
      expect(screen.getByText("Kundenpreise — Ausnahmen vom Standardpreis (95,50 €)")).toBeTruthy(),
    );
    // Kundenname und -preis hängen von zwei unabhängig auflösenden Promises ab
    // (api.kunden.list und api.artikel.kundenpreise) — deshalb eigenes waitFor je
    // Assertion statt sich auf das Timing des obigen waitFor zu verlassen (das nur
    // von standardpreisCent abhängt, einer synchron verfügbaren Prop, und daher
    // schon vor dem Laden der beiden Listen erfüllt sein kann).
    // { selector: "span" } grenzt außerdem gegen die gleichnamige <option> im
    // Kunde-Dropdown desselben Panels ab — sonst meldet getByText "Found multiple
    // elements", da <option>-Text ebenfalls zu getByText passt.
    await waitFor(() => expect(screen.getByText("ACME GmbH", { selector: "span" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("65,00 €")).toBeTruthy());
  });

  it("zeigt das Gültig-ab-Datum als Zusatz, wenn gesetzt", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 0,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: "2026-01-01" },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    await waitFor(() => expect(screen.getByText("ab 2026-01-01")).toBeTruthy());
  });

  it("zeigt eine günstiger-Badge, wenn der Kundenpreis niedriger als der Standardpreis ist", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 0,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: null },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    // Standardpreis 95,50 € -> 65,00 € ist rund 32% günstiger.
    await waitFor(() => expect(screen.getByText("−32%")).toBeTruthy());
  });

  it("zeigt eine teurer-Badge, wenn der Kundenpreis höher als der Standardpreis ist", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 0,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 12000, gueltig_ab: null },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    // Standardpreis 95,50 € -> 120,00 € ist rund 26% teurer.
    await waitFor(() => expect(screen.getByText("+26%")).toBeTruthy());
  });

  it("zeigt keine Abweichungs-Badge, wenn der Standardpreis 0 ist", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Gratis-Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 0, kundenpreise_anzahl: 1,
      },
    ]);
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 0,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([
      { id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 5000, gueltig_ab: null },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Gratis-Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise (1)" }));
    await waitFor(() => expect(screen.getByText("50,00 €")).toBeTruthy());
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("aktualisiert die Kundenpreise-Anzahl im Button, nachdem ein neuer Kundenpreis gespeichert wurde", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 0,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([]);
    vi.mocked(api.artikel.kundenpreisSave).mockResolvedValueOnce({
      id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: null,
    });
    vi.mocked(api.artikel.list).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 0,
      },
    ]).mockResolvedValueOnce([
      {
        id: "a1", artikelnummer: "ART-0001", bezeichnung: "Beratung",
        beschreibung: "", einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 1,
      },
    ]);
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    // Explizit auf die geladene <option> warten, nicht nur auf das <select> selbst:
    // Das <select> existiert schon synchron beim Mount, bevor api.kunden.list
    // aufgelöst hat — ein fireEvent.change auf "k1" liefe ansonsten ins Leere,
    // solange die passende <option value="k1"> noch nicht im DOM ist.
    await waitFor(() => expect(screen.getByRole("option", { name: "ACME GmbH" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Kunde"), { target: { value: "k1" } });
    fireEvent.change(screen.getByLabelText("Preis (€)"), { target: { value: "65,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Kundenpreise (1)" })).toBeTruthy(),
    );
  });

  it("trennt das Formular zum Anlegen eines neuen Kundenpreises optisch von der Preisliste", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    await waitFor(() => expect(screen.getByText("Neuen Kundenpreis anlegen")).toBeTruthy());
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
    fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Konzeption" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€)"), { target: { value: "50,00" } });
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
    fireEvent.change(screen.getByLabelText("Bezeichnung"), { target: { value: "Konzeption" } });
    fireEvent.change(screen.getByLabelText("Standardpreis (€)"), { target: { value: "50,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText(meldung)).toBeTruthy());
  });

  it("zeigt nach dem Bearbeiten eines Artikels einen Erfolgs-Hinweis", async () => {
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText('Artikel „Beratung" gespeichert')).toBeTruthy());
  });

  it("zeigt nach dem Anlegen eines Kundenpreises einen Erfolgs-Hinweis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([
      {
        id: "k1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 0,
      },
    ]);
    vi.mocked(api.artikel.kundenpreise).mockResolvedValueOnce([]);
    vi.mocked(api.artikel.kundenpreisSave).mockResolvedValueOnce({
      id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 6500, gueltig_ab: null,
    });
    render(<Artikel />);
    await waitFor(() => expect(screen.getByText("Beratung")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Kundenpreise" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "ACME GmbH" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Kunde"), { target: { value: "k1" } });
    fireEvent.change(screen.getByLabelText("Preis (€)"), { target: { value: "65,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText("Kundenpreis angelegt")).toBeTruthy());
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
        einheit_id: "e1", standardpreis_cent: 9550, kundenpreise_anzahl: 2,
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
});
