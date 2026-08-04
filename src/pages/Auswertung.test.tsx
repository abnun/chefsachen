import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    auswertung: {
      verfuegbareJahre: vi.fn(),
      jahresauswertung: vi.fn(),
    },
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }));

import { api } from "../api";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Auswertung } from "./Auswertung";

/*
 * Die Seite wählt ohne Vorgabe das laufende Jahr — mit einer festen Systemzeit
 * ist das Ergebnis unabhängig davon, wann der Test läuft.
 */
beforeEach(() => {
  // Nur `Date` fälschen, nicht `setTimeout`: `waitFor` von Testing Library
  // baut auf echten Timern auf und hinge sonst, weil kein echter Tick mehr
  // vergeht, auf den es warten könnte.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-05T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const LEER = (jahr: number) => ({ jahr, summe_cent: 0, vereinnahmungen: [] });

describe("Auswertung", () => {
  it("wählt ohne Zahlungen das laufende Jahr", async () => {
    vi.mocked(api.auswertung.verfuegbareJahre).mockResolvedValue([]);
    vi.mocked(api.auswertung.jahresauswertung).mockResolvedValue(LEER(2026));

    render(<Auswertung />);

    await waitFor(() => expect(api.auswertung.jahresauswertung).toHaveBeenCalledWith(2026));
    expect(screen.getByRole("combobox", { name: "Jahr" })).toHaveValue("2026");
    expect(screen.getByText("Keine vereinnahmten Zahlungen in 2026.")).toBeTruthy();
  });

  it("bietet Jahre mit Zahlungen zur Auswahl an, jüngstes zuerst", async () => {
    vi.mocked(api.auswertung.verfuegbareJahre).mockResolvedValue([2025, 2024]);
    vi.mocked(api.auswertung.jahresauswertung).mockResolvedValue(LEER(2026));

    render(<Auswertung />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Jahr" })).toBeTruthy());
    const optionen = screen.getAllByRole("option").map((o) => o.textContent);
    // Das laufende Jahr steht auch ohne eigene Zahlung zur Auswahl, an erster
    // Stelle — sonst ließe sich das Jahr nicht ansehen, solange nichts einging.
    expect(optionen).toEqual(["2026", "2025", "2024"]);
  });

  it("lädt beim Jahreswechsel die passenden Daten", async () => {
    vi.mocked(api.auswertung.verfuegbareJahre).mockResolvedValue([2025]);
    vi.mocked(api.auswertung.jahresauswertung).mockImplementation((jahr) =>
      Promise.resolve(LEER(jahr)),
    );

    render(<Auswertung />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Jahr" })).toBeTruthy());

    fireEvent.change(screen.getByRole("combobox", { name: "Jahr" }), { target: { value: "2025" } });

    await waitFor(() => expect(api.auswertung.jahresauswertung).toHaveBeenCalledWith(2025));
    await waitFor(() =>
      expect(screen.getByText("Keine vereinnahmten Zahlungen in 2025.")).toBeTruthy(),
    );
  });

  it("zeigt die Vereinnahmungen mit Datum, Rechnung, Kunde und Betrag", async () => {
    vi.mocked(api.auswertung.verfuegbareJahre).mockResolvedValue([2026]);
    vi.mocked(api.auswertung.jahresauswertung).mockResolvedValue({
      jahr: 2026,
      summe_cent: 8_000_00,
      vereinnahmungen: [
        { datum: "2026-02-05", rechnung_nummer: "RE-2026-0001", kunde_name: "ACME GmbH", betrag_cent: 5_000_00 },
        { datum: "2026-06-10", rechnung_nummer: "RE-2026-0002", kunde_name: "Beta AG", betrag_cent: 3_000_00 },
      ],
    });

    render(<Auswertung />);

    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    expect(screen.getByText("05.02.2026")).toBeTruthy();
    expect(screen.getByText("RE-2026-0001")).toBeTruthy();
    expect(screen.getByText("5.000,00 €")).toBeTruthy();
    expect(screen.getByText("Beta AG")).toBeTruthy();
    expect(screen.getByText("Summe: 8.000,00 €")).toBeTruthy();
  });

  it("exportiert die Vereinnahmungen als CSV mit deutschem Dezimalkomma", async () => {
    vi.mocked(api.auswertung.verfuegbareJahre).mockResolvedValue([2026]);
    vi.mocked(api.auswertung.jahresauswertung).mockResolvedValue({
      jahr: 2026,
      summe_cent: 5_000_00,
      vereinnahmungen: [
        { datum: "2026-02-05", rechnung_nummer: "RE-2026-0001", kunde_name: "ACME GmbH", betrag_cent: 5_000_00 },
      ],
    });
    vi.mocked(save).mockResolvedValue("/ziel/Auswertung-2026.csv");

    render(<Auswertung />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Als CSV exportieren" }));

    await waitFor(() => expect(writeFile).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "Auswertung-2026.csv" }),
    );
    const [, bytes] = vi.mocked(writeFile).mock.calls[0];
    const text = new TextDecoder().decode(bytes as Uint8Array);
    // Deutsches Dezimalkomma statt Punkt, kein Währungszeichen — sonst läse
    // eine Tabellenkalkulation die Spalte als Text statt als Zahl.
    expect(text).toContain("05.02.2026;RE-2026-0001;ACME GmbH;5.000,00");
    expect(text).not.toContain("€");
  });

  it("exportiert nichts, wenn kein Ziel gewählt wird", async () => {
    vi.mocked(api.auswertung.verfuegbareJahre).mockResolvedValue([2026]);
    vi.mocked(api.auswertung.jahresauswertung).mockResolvedValue({
      jahr: 2026,
      summe_cent: 5_000_00,
      vereinnahmungen: [
        { datum: "2026-02-05", rechnung_nummer: "RE-2026-0001", kunde_name: "ACME GmbH", betrag_cent: 5_000_00 },
      ],
    });
    vi.mocked(save).mockResolvedValue(null);

    render(<Auswertung />);
    await waitFor(() => expect(screen.getByText("ACME GmbH")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Als CSV exportieren" }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("sperrt den CSV-Export, solange nichts zu exportieren ist", async () => {
    vi.mocked(api.auswertung.verfuegbareJahre).mockResolvedValue([]);
    vi.mocked(api.auswertung.jahresauswertung).mockResolvedValue(LEER(2026));

    render(<Auswertung />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Als CSV exportieren" })).toBeDisabled(),
    );
  });

  it("meldet einen Fehler beim Laden, statt eine leere Seite zu zeigen", async () => {
    vi.mocked(api.auswertung.verfuegbareJahre).mockRejectedValue({
      typ: "unbekannt",
      meldung: "Datenbank nicht erreichbar",
    });

    render(<Auswertung />);
    await waitFor(() => expect(screen.getByText(/Datenbank nicht erreichbar/)).toBeTruthy());
  });
});
