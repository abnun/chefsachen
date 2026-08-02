import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: { dashboard: { laden: vi.fn() } },
}));
import { api } from "../api";
import type { DashboardDaten, Umsatzgrenzen, Warnstufe } from "../api";
import { Dashboard } from "./Dashboard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const LEER = {
  jahr: 2026,
  umsatz_laufendes_jahr_cent: 0,
  umsatz_vorjahr_cent: 0,
  umsatzgrenzen: null,
  offene_rechnungen: [],
  offene_angebote: [],
  letzte_belege: [],
};

const grenze = (umsatz: number, obergrenze: number, prozent: number, stufe: Warnstufe) => ({
  umsatz_cent: umsatz,
  grenze_cent: obergrenze,
  anteil_prozent: prozent,
  warnstufe: stufe,
});

function mitGrenzen(zusatz: { umsatzgrenzen?: Umsatzgrenzen } = {}): DashboardDaten {
  return {
    ...LEER,
    umsatz_laufendes_jahr_cent: 2100000,
    umsatzgrenzen: {
      laufendes_jahr_gegen_vorjahresgrenze: grenze(2100000, 2500000, 84, "annaeherung"),
      laufendes_jahr_gegen_jahresgrenze: grenze(2100000, 10000000, 21, "keine"),
      vorjahr_gegen_vorjahresgrenze: grenze(0, 2500000, 0, "keine"),
      befund: "gegeben",
      ist_gruendungsjahr: false,
      hinweise: [],
      ...zusatz.umsatzgrenzen,
    },
  };
}

const laden = () => vi.mocked(api.dashboard.laden);
const props = { onRechnungOeffnen: vi.fn(), onAngebotOeffnen: vi.fn() };

describe("Dashboard", () => {
  it("zeigt den vereinnahmten Umsatz mit Vorjahresvergleich", async () => {
    laden().mockResolvedValue({ ...LEER, umsatz_laufendes_jahr_cent: 1234500, umsatz_vorjahr_cent: 987600 });
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText("12.345,00 €")).toBeTruthy());
    expect(screen.getByText(/9.876,00 €/)).toBeTruthy();
  });

  /// Bei Regelbesteuerung sind die Grenzen bedeutungslos — sie anzuzeigen wäre irreführend.
  it("zeigt ohne Kleinunternehmerstatus keine Grenzen, aber den Umsatz", async () => {
    laden().mockResolvedValue({ ...LEER, umsatz_laufendes_jahr_cent: 5000000 });
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText("50.000,00 €")).toBeTruthy());
    expect(screen.queryByText("Kleinunternehmergrenzen")).toBeNull();
  });

  it("zeigt mit Kleinunternehmerstatus alle drei Grenzen", async () => {
    laden().mockResolvedValue(mitGrenzen());
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText(/Kleinunternehmergrenzen/)).toBeTruthy());
    const balken = screen.getAllByRole("meter");
    expect(balken).toHaveLength(3);
    expect(balken[1]).toHaveAttribute("aria-valuenow", "84");
  });

  /// Die Titel werden alle aus der jeweiligen Grenze erzeugt — fest verdrahtete
  /// Beträge sähen im Gründungsjahr falsch aus und wurden zudem uneinheitlich
  /// formatiert („100.000,00 €" neben „25.000 €").
  it("beschriftet die Balken einheitlich ohne überflüssige Nachkommastellen", async () => {
    laden().mockResolvedValue(mitGrenzen());
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText("Laufendes Jahr gegen 100.000 €")).toBeTruthy());
    expect(screen.getByText("Laufendes Jahr gegen 25.000 €")).toBeTruthy();
    expect(screen.getByText("Vorjahr gegen 25.000 €")).toBeTruthy();
  });

  /// Im Gründungsjahr fallen die 25.000-€-Grenze des laufenden Jahres und die
  /// maßgebliche Jahresgrenze zusammen — zwei gleiche Balken wären verwirrend.
  it("zeigt im Gründungsjahr nur zwei Balken und kennzeichnet das Jahr", async () => {
    laden().mockResolvedValue(
      mitGrenzen({
        umsatzgrenzen: {
          laufendes_jahr_gegen_vorjahresgrenze: grenze(2100000, 2500000, 84, "annaeherung"),
          laufendes_jahr_gegen_jahresgrenze: grenze(2100000, 2500000, 84, "annaeherung"),
          vorjahr_gegen_vorjahresgrenze: grenze(0, 2500000, 0, "keine"),
          befund: "gegeben",
          ist_gruendungsjahr: true,
          hinweise: [],
        },
      }),
    );
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText("Gründungsjahr")).toBeTruthy());
    expect(screen.getAllByRole("meter")).toHaveLength(2);
  });

  /// Der praktisch wichtigste Teil: Betrag der Nachzahlung und die Schritte dazu.
  it("zeigt zu einem Hinweis den Betrag und alle Handlungsschritte", async () => {
    laden().mockResolvedValue(
      mitGrenzen({
        umsatzgrenzen: {
          laufendes_jahr_gegen_vorjahresgrenze: grenze(11000000, 2500000, 440, "ueberschritten"),
          laufendes_jahr_gegen_jahresgrenze: grenze(11000000, 10000000, 110, "ueberschritten"),
          vorjahr_gegen_vorjahresgrenze: grenze(0, 2500000, 0, "keine"),
          befund: "entfallen_wegen_laufendem_jahr",
          ist_gruendungsjahr: false,
          hinweise: [
            {
              stufe: "ueberschritten",
              titel: "Die Kleinunternehmerregelung ist unterjährig entfallen",
              bedeutung: "Der Status endet mit dem Umsatz, der die Grenze reißt.",
              finanzielle_folge: {
                grundlage_cent: 1000000,
                betrag_cent: 159664,
                erlaeuterung: "Umsatzsteuer aus dem Bruttobetrag herausgerechnet.",
              },
              handlung: ["Rücklage bilden.", "Umsatzsteuer ausweisen.", "Vorsteuer geltend machen."],
            },
          ],
        },
      }),
    );
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText(/unterjährig entfallen/)).toBeTruthy());
    expect(screen.getByText(/1.596,64 €/)).toBeTruthy();
    const schritte = screen.getAllByRole("listitem");
    expect(schritte).toHaveLength(3);
    expect(schritte[0]).toHaveTextContent("Rücklage bilden.");
  });

  it("hebt überfällige Rechnungen hervor und öffnet sie per Klick", async () => {
    laden().mockResolvedValue({
      ...LEER,
      offene_rechnungen: [
        {
          id: "r1", nummer: "RE-2026-0001", kunde_name: "ACME GmbH",
          datum: "2026-04-01", faellig_am: "2026-04-15",
          tage_bis_faellig: -17, offener_betrag_cent: 100000,
        },
      ],
    });
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText("RE-2026-0001")).toBeTruthy());
    expect(screen.getByText(/17 Tage überfällig/)).toBeTruthy();
    expect(screen.getByText(/15.04.2026/)).toBeTruthy();

    fireEvent.click(screen.getByText("RE-2026-0001"));
    expect(props.onRechnungOeffnen).toHaveBeenCalledWith("r1");
  });

  /// Tabellenzeilen müssen auch per Tastatur erreichbar sein (WCAG 2.1.1).
  it("öffnet eine Zeile auch mit der Eingabetaste", async () => {
    laden().mockResolvedValue({
      ...LEER,
      offene_angebote: [
        { id: "a1", nummer: "AN-2026-0001", kunde_name: "ACME GmbH", datum: "2026-05-01", summe_cent: 50000 },
      ],
    });
    render(<Dashboard {...props} />);
    // Bedienbar ist jetzt ein richtiger Knopf in der Zeile, nicht die Zeile
    // selbst — eine Tabellenzeile ist kein Bedienelement, und mit tabIndex und
    // role="button" verlöre sie für Screenreader ihre Zeilenbedeutung.
    const knopf = await screen.findByRole("button", { name: "AN-2026-0001" });
    knopf.focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onAngebotOeffnen).toHaveBeenCalledWith("a1");
  });

  it("zeigt Leerzustände statt leerer Tabellen", async () => {
    laden().mockResolvedValue(LEER);
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText("Keine offenen Rechnungen.")).toBeTruthy());
    expect(screen.getByText("Keine offenen Angebote.")).toBeTruthy();
    expect(screen.getByText("Noch keine Belege angelegt.")).toBeTruthy();
  });

  it("zeigt einen Ladezustand statt eines leeren Bildschirms", async () => {
    // Der Hinweis erscheint verzögert, damit er bei den üblichen
    // Millisekunden-Abrufen nicht aufblitzt — siehe Laden.tsx.
    laden().mockReturnValue(new Promise(() => {}));
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText(/wird geladen/i)).toBeTruthy(), { timeout: 1000 });
  });

  it("zeigt einen Backend-Fehler an, statt still zu bleiben", async () => {
    laden().mockRejectedValue({ typ: "technisch", meldung: "Datenbank nicht erreichbar" });
    render(<Dashboard {...props} />);
    await waitFor(() => expect(screen.getByText(/technischer Fehler/i)).toBeTruthy());
  });
});
