import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UngespeichertProvider, useVerlassenPruefen } from "../hooks/useUngespeichert";

afterEach(cleanup);

vi.mock("../api", () => ({
  api: {
    artikel: { kundenpreiseFuerKunde: vi.fn().mockResolvedValue([]) },
    kunden: {
      get: vi.fn().mockResolvedValue({
        kunde: {
          id: "1",
          typ: "firma",
          name: "ACME GmbH",
          kundennummer: "KD-0001",
          zahlungsziel_tage: 14,
          notizen: "",
          ust_idnr: "",
          email: "",
          leitweg_id: "",
          kaeuferreferenz: "",
          hat_adresse: true,
          kundenpreise_anzahl: 0,
        },
        adressen: [
          {
            id: "adr1",
            kunde_id: "1",
            typ: "rechnung",
            strasse: "Musterstr. 1",
            plz: "12345",
            ort: "Musterstadt",
            land: "DE",
            ist_standard: true,
          },
        ],
        ansprechpartner: [
          {
            id: "ap1",
            kunde_id: "1",
            name: "Erika Musterfrau",
            rolle: "Einkauf",
            email: "",
            telefon: "",
            ist_standard: false,
          },
        ],
      }),
      update: vi.fn(),
      delete: vi.fn(),
      adresseSave: vi.fn(),
      adresseDelete: vi.fn(),
      ansprechpartnerSave: vi.fn(),
      ansprechpartnerDelete: vi.fn(),
    },
    belege: {
      list: vi.fn().mockResolvedValue([
        {
          id: "b1",
          typ: "rechnung",
          nummer: "RE-2026-0001",
          status: "gestellt",
          kunde_id: "1",
          datum: "2026-07-10",
          leistungsdatum: "2026-07-10",
          zahlungsziel_tage: 14,
          kopftext: "",
          fusstext: "",
          summe_cent: 9500,
          ursprungsangebot_id: null,
          storno_von_id: null,
        },
        {
          id: "b2",
          typ: "angebot",
          nummer: "AN-2026-0003",
          status: "festgeschrieben",
          kunde_id: "anderer-kunde",
          datum: "2026-07-01",
          leistungsdatum: "2026-07-01",
          zahlungsziel_tage: 14,
          kopftext: "",
          fusstext: "",
          summe_cent: 5000,
          ursprungsangebot_id: null,
          storno_von_id: null,
        },
      ]),
    },
  },
  istValidierungsfehler: () => false,
}));
import { KundeDetail } from "./KundeDetail";

describe("KundeDetail", () => {
  it("laedt Kundendaten und zeigt Stammdaten", async () => {
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    expect(screen.getByText("KD-0001")).toBeTruthy();
  });

  it("zeigt nur Belege dieses Kunden", async () => {
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Belege" }));
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());
    expect(screen.queryByText("AN-2026-0003")).toBeNull();
  });

  it("startet mit dem über startReiter vorgegebenen Reiter", async () => {
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Adressen" })).toHaveAttribute("aria-current", "page");
  });

  it("ruft onReiterUebernommen einmalig nach dem Start mit startReiter auf", async () => {
    const onReiterUebernommen = vi.fn();
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={onReiterUebernommen} />);
    await waitFor(() => expect(onReiterUebernommen).toHaveBeenCalledTimes(1));
  });

  it("zeigt nach dem Speichern der Stammdaten einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText('Kunde „ACME GmbH" gespeichert')).toBeTruthy());
  });

  it("zeigt nach dem Anlegen einer neuen Adresse einen Erfolgs-Hinweis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.adresseSave).mockResolvedValueOnce({
      id: "adr2", kunde_id: "1", typ: "rechnung", strasse: "Neue Str. 5",
      plz: "54321", ort: "Neustadt", land: "DE", ist_standard: false,
    });
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Straße"), { target: { value: "Neue Str. 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(screen.getByText("Adresse angelegt")).toBeTruthy());
  });

  it("löscht eine Adresse nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.kunden.adresseDelete)).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Löschen einer Adresse einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(screen.getByText('Adresse „rechnung, Musterstr. 1, 12345 Musterstadt" löschen?')).toBeTruthy(),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Adresse gelöscht")).toBeTruthy());
  });

  it("zeigt nach dem Anlegen eines neuen Ansprechpartners einen Erfolgs-Hinweis mit Namen", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.ansprechpartnerSave).mockResolvedValueOnce({
      id: "ap2", kunde_id: "1", name: "Max Mustermann", rolle: "", email: "", telefon: "", ist_standard: false,
    });
    render(<KundeDetail id="1" startReiter="ansprechpartner" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ansprechpartner" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Max Mustermann" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(screen.getByText('Ansprechpartner „Max Mustermann" angelegt')).toBeTruthy());
  });

  it("löscht einen Ansprechpartner nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<KundeDetail id="1" startReiter="ansprechpartner" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ansprechpartner" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.kunden.ansprechpartnerDelete)).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Löschen eines Ansprechpartners einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="ansprechpartner" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ansprechpartner" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(screen.getByText('Ansprechpartner „Erika Musterfrau" löschen?')).toBeTruthy(),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Ansprechpartner gelöscht")).toBeTruthy());
  });

  it("Löschen-Button in den Stammdaten ist deaktiviert, wenn der Kunde offene Entwürfe hat", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.get).mockResolvedValueOnce({
      kunde: {
        id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, hat_offene_entwuerfe: true,
        kundenpreise_anzahl: 0,
      },
      adressen: [], ansprechpartner: [],
    });
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Löschen" })).toBeDisabled();
  });

  it("ruft onGeloescht nach dem Löschen des Kunden auf", async () => {
    const onGeloescht = vi.fn();
    render(<KundeDetail id="1" onGeloescht={onGeloescht} />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Kunde „ACME GmbH" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(onGeloescht).toHaveBeenCalledTimes(1));
  });

  it("zeigt einen Hinweis auf mitzulöschende Kundenpreise im Dialogtext und übergibt kundenpreiseMitloeschen", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.get).mockResolvedValueOnce({
      kunde: {
        id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: true, kundenpreise_anzahl: 2,
      },
      adressen: [], ansprechpartner: [],
    });
    render(<KundeDetail id="1" />);
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Kunde „ACME GmbH" hat 2 Kundenpreis(e). Diese werden beim Löschen ebenfalls entfernt. Trotzdem löschen?',
        ),
      ).toBeTruthy(),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(vi.mocked(api.kunden.delete)).toHaveBeenCalledWith("1", true));
  });

  /// Die Frage „Welche Sonderpreise hat dieser Kunde?" war bislang nicht
  /// beantwortbar — der Reiter war ein deaktivierter Platzhalter.
  it("zeigt die Sonderpreise des Kunden mit Vergleich zum Standardpreis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.kundenpreiseFuerKunde).mockResolvedValue([
      {
        id: "kp1", artikel_id: "a1", kunde_id: "k1", preis_cent: 9000, gueltig_ab: null,
        artikelnummer: "ART-0001", bezeichnung: "Beratung", standardpreis_cent: 12000,
      },
    ]);
    render(<KundeDetail id="k1" onGeloescht={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Sonderpreise" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sonderpreise" }));
    await waitFor(() => expect(screen.getByText("120,00 €")).toBeTruthy());
    expect(screen.getByText("90,00 €")).toBeTruthy();
    expect(screen.getByText("ART-0001")).toBeTruthy();
  });

  it("erklärt beim leeren Reiter, wo Sonderpreise gepflegt werden", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.kundenpreiseFuerKunde).mockResolvedValue([]);
    render(<KundeDetail id="k1" onGeloescht={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Sonderpreise" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sonderpreise" }));
    await waitFor(() => expect(screen.getByText(/keine Sonderpreise hinterlegt/)).toBeTruthy());
    expect(screen.getByText(/Artikel-Seite/)).toBeTruthy();
  });

  it("warnt vor dem Verlassen, wenn die Stammdaten geändert wurden", async () => {
    // Der Seitenwechsel läuft über den Zustand, nicht über eine Adresse — es
    // gibt also keinen Browser, der von sich aus nachfragte.
    const gewechselt = vi.fn();
    function Umgebung() {
      const pruefen = useVerlassenPruefen();
      return (
        <>
          <KundeDetail id="1" />
          <button type="button" onClick={async () => gewechselt(await pruefen())}>
            Zu den Rechnungen
          </button>
        </>
      );
    }
    render(
      <UngespeichertProvider>
        <Umgebung />
      </UngespeichertProvider>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());

    // Ohne Änderung: kein Aufhalten.
    await userEvent.click(screen.getByRole("button", { name: "Zu den Rechnungen" }));
    await waitFor(() => expect(gewechselt).toHaveBeenCalledWith(true));

    gewechselt.mockClear();
    fireEvent.change(screen.getByDisplayValue("ACME GmbH"), { target: { value: "ACME AG" } });
    await userEvent.click(screen.getByRole("button", { name: "Zu den Rechnungen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(gewechselt).not.toHaveBeenCalled();
  });

  it("fragt nicht, wenn eine Änderung wieder zurückgenommen wurde", async () => {
    // Verglichen wird gegen den geladenen Stand, nicht gegen ein
    // „berührt"-Merkmal — sonst wäre jede Rückfrage grundlos.
    const gewechselt = vi.fn();
    function Umgebung() {
      const pruefen = useVerlassenPruefen();
      return (
        <>
          <KundeDetail id="1" />
          <button type="button" onClick={async () => gewechselt(await pruefen())}>
            Weiter
          </button>
        </>
      );
    }
    render(
      <UngespeichertProvider>
        <Umgebung />
      </UngespeichertProvider>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("ACME GmbH")).toBeTruthy());

    fireEvent.change(screen.getByDisplayValue("ACME GmbH"), { target: { value: "ACME AG" } });
    fireEvent.change(screen.getByDisplayValue("ACME AG"), { target: { value: "ACME GmbH" } });

    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await waitFor(() => expect(gewechselt).toHaveBeenCalledWith(true));
  });
});
