import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    artikel: {
      kundenpreise: vi.fn(),
      kundenpreisSave: vi.fn(),
      kundenpreisDelete: vi.fn(),
    },
  },
}));
import { api, type Kunde, type Kundenpreis } from "../api";
import { KundenpreiseDialog } from "./KundenpreiseDialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const KUNDEN = [
  { id: "k1", name: "ACME GmbH" },
  { id: "k2", name: "Bäckerei Ünlü" },
] as Kunde[];

const preis = (zusatz: Partial<Kundenpreis> = {}): Kundenpreis => ({
  id: "kp1",
  artikel_id: "a1",
  kunde_id: "k1",
  preis_cent: 6500,
  gueltig_ab: null,
  ...zusatz,
});

/** `preise: null` heißt: Der Aufrufer hat das Laden selbst vorbereitet. */
function zeige(preise: Kundenpreis[] | null, standardpreisCent = 9550) {
  if (preise) vi.mocked(api.artikel.kundenpreise).mockResolvedValue(preise);
  const onAenderung = vi.fn();
  const onSchliessen = vi.fn();
  render(
    <KundenpreiseDialog
      artikelId="a1"
      artikelBezeichnung="Beratung"
      standardpreisCent={standardpreisCent}
      kunden={KUNDEN}
      onAenderung={onAenderung}
      onSchliessen={onSchliessen}
    />,
  );
  return { onAenderung, onSchliessen };
}

beforeEach(() => {
  vi.mocked(api.artikel.kundenpreise).mockResolvedValue([]);
});

describe("KundenpreiseDialog", () => {
  it("nennt Artikel und Standardpreis, damit die Abweichung einen Bezug hat", async () => {
    zeige([]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByRole("dialog")).toHaveTextContent("Kundenpreise für „Beratung“");
    expect(screen.getByRole("dialog")).toHaveTextContent("Standardpreis 95,50 €");
  });

  it("zeigt Kunde und Preis mit der Abweichung vom Standardpreis", async () => {
    zeige([preis()]);
    // 95,50 € auf 65,00 € sind rund 32 % weniger.
    await waitFor(() => expect(screen.getByText("−32 %")).toBeTruthy());
    expect(screen.getByText("ACME GmbH")).toBeTruthy();
    expect(screen.getByText(/65,00 €/)).toBeTruthy();
  });

  it("zeigt einen höheren Preis als Aufschlag", async () => {
    zeige([preis({ preis_cent: 12000 })]);
    await waitFor(() => expect(screen.getByText("+26 %")).toBeTruthy());
  });

  it("lässt die Abweichung weg, wenn der Standardpreis 0 ist", async () => {
    // Jede Abweichung von 0 wäre unendlich; „+∞ %" hilft niemandem.
    zeige([preis({ preis_cent: 5000 })], 0);
    await waitFor(() => expect(screen.getByText(/50,00 €/)).toBeTruthy());
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("schreibt das Gültig-ab-Datum deutsch", async () => {
    // Vorher stand hier die rohe ISO-Form „2026-01-01" aus der Datenbank.
    zeige([preis({ gueltig_ab: "2026-01-01" })]);
    await waitFor(() => expect(screen.getByText("01.01.2026")).toBeTruthy());
  });

  it("sagt „sofort“ statt eines Gedankenstrichs, wenn kein Datum gesetzt ist", async () => {
    // „—" ließe offen, ob der Preis dann überhaupt gilt.
    zeige([preis()]);
    await waitFor(() => expect(screen.getByText("sofort")).toBeTruthy());
  });

  it("meldet ausdrücklich, wenn es keine Ausnahmen gibt", async () => {
    zeige([]);
    await waitFor(() => expect(screen.getByText("Noch keine Ausnahmen hinterlegt.")).toBeTruthy());
  });

  it("hält das Formular geschlossen, bis es verlangt wird", async () => {
    // Wer nur nachsehen will, was hinterlegt ist, soll nicht an einem leeren
    // Eingabeformular vorbeiscrollen — es war vorher größer als die Liste.
    zeige([preis()]);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.queryByLabelText("Preis (€)", { exact: false })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Preis hinzufügen" }));
    expect(screen.getByLabelText("Preis (€)", { exact: false })).toBeTruthy();
  });

  it("legt einen Preis an und meldet die Änderung nach außen", async () => {
    vi.mocked(api.artikel.kundenpreisSave).mockResolvedValue(preis());
    const { onAenderung } = zeige([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Preis hinzufügen" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Preis hinzufügen" }));
    fireEvent.change(screen.getByLabelText(/^Kunde( |$)/), { target: { value: "k1" } });
    fireEvent.change(screen.getByLabelText("Preis (€)", { exact: false }), { target: { value: "65,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(api.artikel.kundenpreisSave).toHaveBeenCalledWith(
        expect.objectContaining({ kunde_id: "k1", preis_cent: 6500, gueltig_ab: null }),
      ),
    );
    // Die Artikelliste führt ihre Zählung sonst nicht nach.
    await waitFor(() => expect(onAenderung).toHaveBeenCalled());
    // Nach dem Speichern schließt sich das Formular wieder — der neue Eintrag
    // in der Liste ist die Rückmeldung.
    await waitFor(() => expect(screen.queryByLabelText("Preis (€)", { exact: false })).toBeNull());
  });

  it("weist einen unlesbaren Preis am Feld aus, statt still nichts zu tun", async () => {
    zeige([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Preis hinzufügen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Preis hinzufügen" }));
    fireEvent.change(screen.getByLabelText(/^Kunde( |$)/), { target: { value: "k1" } });
    fireEvent.change(screen.getByLabelText("Preis (€)", { exact: false }), { target: { value: "sechs Euro" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("gültigen Preis"));
    expect(api.artikel.kundenpreisSave).not.toHaveBeenCalled();
  });

  it("fragt vor dem Entfernen nach — an der Zeile, nicht in einem zweiten Dialog", async () => {
    // Zwei übereinanderliegende Dialoge streiten sich um die Fokusfalle: Beide
    // hängen am Dokument, und der äußere holt den Fokus zurück.
    vi.mocked(api.artikel.kundenpreisDelete).mockResolvedValue(undefined);
    const { onAenderung } = zeige([preis()]);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /ACME GmbH entfernen/ }));
    expect(api.artikel.kundenpreisDelete).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Wirklich entfernen" }));
    await waitFor(() => expect(api.artikel.kundenpreisDelete).toHaveBeenCalledWith("kp1"));
    await waitFor(() => expect(onAenderung).toHaveBeenCalled());
  });

  it("entfernt nichts, wenn die Rückfrage abgebrochen wird", async () => {
    zeige([preis()]);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /ACME GmbH entfernen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(api.artikel.kundenpreisDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /ACME GmbH entfernen/ })).toBeTruthy();
  });

  it("benennt den Entfernen-Knopf je Zeile, damit er allein verständlich ist", async () => {
    // Fünf gleich beschriftete Knöpfe „Entfernen" untereinander sagen einer
    // Vorlesehilfe nicht, welcher Preis daran hängt.
    zeige([preis(), preis({ id: "kp2", kunde_id: "k2", preis_cent: 8000 })]);
    await waitFor(() => expect(screen.getByText("Bäckerei Ünlü")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Kundenpreis für ACME GmbH entfernen" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Kundenpreis für Bäckerei Ünlü entfernen" }),
    ).toBeTruthy();
  });

  it("meldet einen Fehler beim Laden, statt eine leere Liste vorzutäuschen", async () => {
    vi.mocked(api.artikel.kundenpreise).mockRejectedValue({ typ: "unbekannt", meldung: "kaputt" });
    zeige(null);
    await waitFor(() => expect(screen.getByText(/kaputt/)).toBeTruthy());
  });

  it("schließt über den Knopf am Fuß", async () => {
    const { onSchliessen } = zeige([]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Schließen" }));
    expect(onSchliessen).toHaveBeenCalled();
  });
});
