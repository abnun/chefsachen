import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("../api", () => ({
  api: {
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
        ansprechpartner: [],
      }),
      update: vi.fn(),
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
          status: "versendet",
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

  it("zeigt nach dem Löschen einer Adresse einen Erfolgs-Hinweis", async () => {
    render(<KundeDetail id="1" startReiter="adressen" onReiterUebernommen={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adressen" })).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Adresse gelöscht")).toBeTruthy());
  });
});
