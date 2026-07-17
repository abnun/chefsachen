import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

// Verhindert, dass ein von einem Test noch offenes mockResolvedValueOnce(...)
// (z. B. im Leerzustand-Test ungenutzt, da der Leerzustand bereits durch den
// initialen State erfüllt ist, bevor der 300ms-Debounce feuert) in einen
// nachfolgenden Test durchsickert.
beforeEach(async () => {
  const { api } = await import("../api");
  vi.mocked(api.kunden.list).mockReset();
  vi.mocked(api.kunden.list).mockResolvedValue([
    { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
      zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
      leitweg_id: "", kaeuferreferenz: "", hat_adresse: false },
  ]);
});

vi.mock("../api", () => ({
  api: {
    kunden: {
      list: vi.fn().mockResolvedValue([
        { id: "1", typ: "firma", name: "ACME GmbH", kundennummer: "KD-0001",
          zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
          leitweg_id: "", kaeuferreferenz: "", hat_adresse: false },
      ]),
      create: vi.fn().mockResolvedValue({
        id: "neu1", typ: "firma", name: "Neu GmbH", kundennummer: "KD-0002",
        zahlungsziel_tage: 14, notizen: "", ust_idnr: "", email: "",
        leitweg_id: "", kaeuferreferenz: "", hat_adresse: false,
      }),
    },
    artikel: { list: vi.fn().mockResolvedValue([{ id: "a1" }]) },
  },
  istValidierungsfehler: () => false,
}));
import { Kunden } from "./Kunden";

describe("Kunden", () => {
  it("zeigt Kundenliste mit Nummer und Name", async () => {
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.getByText("KD-0001")).toBeTruthy();
  });

  it("zeigt ein Warnsymbol für Kunden ohne Adresse", async () => {
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.getByTitle("Keine Adresse hinterlegt")).toBeTruthy();
  });

  it("zeigt den Leerzustand-Hinweis, wenn keine Kunden vorhanden und nicht gesucht wird", async () => {
    const { api } = await import("../api");
    vi.mocked(api.kunden.list).mockResolvedValueOnce([]);
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Kunden/)).toBeTruthy());
  });

  it("zeigt nach dem Anlegen einen Hinweis mit Link zu Adresse/Ansprechpartner", async () => {
    const onOeffnen = vi.fn();
    render(<Kunden onOeffnen={onOeffnen} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Kunde" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Neu GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /jetzt Adresse und Ansprechpartner ergänzen/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /jetzt Adresse und Ansprechpartner ergänzen/ }));
    expect(onOeffnen).toHaveBeenCalledWith("neu1", "adressen");
  });

  it("zeigt nach dem Anlegen zusätzlich einen Artikel-Hinweis, wenn noch keine Artikel existieren", async () => {
    const { api } = await import("../api");
    vi.mocked(api.artikel.list).mockResolvedValueOnce([]);
    const onZuArtikelWechseln = vi.fn();
    render(<Kunden onOeffnen={() => {}} onZuArtikelWechseln={onZuArtikelWechseln} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Neuer Kunde" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Neu GmbH" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /jetzt auch einen Artikel anlegen/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /jetzt auch einen Artikel anlegen/ }));
    expect(onZuArtikelWechseln).toHaveBeenCalledTimes(1);
  });

  it("zeigt einen Hinweis, wenn die Suche keine Treffer liefert", async () => {
    const { api } = await import("../api");
    render(<Kunden onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    vi.mocked(api.kunden.list).mockResolvedValueOnce([]);
    fireEvent.change(screen.getByLabelText("Kunden suchen"), { target: { value: "xyz" } });
    await waitFor(() => expect(screen.getByText('Keine Kunden gefunden für „xyz".')).toBeTruthy());
  });

  it("öffnet das Anlage-Formular sofort, wenn zeigeFormularBeimStart gesetzt ist, und meldet die Übernahme", async () => {
    const onFormularUebernommen = vi.fn();
    render(
      <Kunden onOeffnen={() => {}} zeigeFormularBeimStart onFormularUebernommen={onFormularUebernommen} />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy());
    expect(onFormularUebernommen).toHaveBeenCalledTimes(1);
  });
});
