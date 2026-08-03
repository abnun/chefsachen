import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: { kunden: { list: vi.fn() }, artikel: { list: vi.fn() } },
}));
import { api } from "../api";
import { ErsteSchritte } from "./ErsteSchritte";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Bestand vortäuschen: leere Liste heißt „Schritt noch offen". */
function bestand({ kunden = false, artikel = false }) {
  // Die Kachel liest nur die Länge; die Felder eines echten Kunden wären
  // Beiwerk, das bei jeder Feldänderung nachzupflegen wäre.
  vi.mocked(api.kunden.list).mockResolvedValue((kunden ? [{ id: "k" }] : []) as never);
  vi.mocked(api.artikel.list).mockResolvedValue((artikel ? [{ id: "a" }] : []) as never);
}

describe("ErsteSchritte", () => {
  it("führt zuerst zum Kunden, weil ohne ihn kein Beleg geht", async () => {
    bestand({});
    const onStarten = vi.fn();
    render(<ErsteSchritte hatBelege={false} onStarten={onStarten} />);

    await waitFor(() => expect(screen.getByText("Erste Schritte")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Kunden anlegen" }));
    expect(onStarten).toHaveBeenCalledWith("kunde");
  });

  it("zeigt genau einen Knopf — den für den nächsten offenen Schritt", async () => {
    // Vier Knöpfe wären eine Auswahl statt eines Weges, und zwei davon führten
    // ins Leere: Ein Beleg ohne Kunde und Artikel lässt sich nicht anlegen.
    bestand({});
    render(<ErsteSchritte hatBelege={false} onStarten={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Erste Schritte")).toBeTruthy());
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("rückt den Knopf weiter, sobald ein Schritt erledigt ist", async () => {
    bestand({ kunden: true });
    render(<ErsteSchritte hatBelege={false} onStarten={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Artikel anlegen" })).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Kunden anlegen" })).toBeNull();
  });

  it("zählt die offenen Schritte und beugt dabei richtig", async () => {
    bestand({ kunden: true, artikel: true });
    render(<ErsteSchritte hatBelege={false} onStarten={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Noch 1 Schritt bis/)).toBeTruthy());
  });

  it("verschwindet, sobald alles steht", async () => {
    bestand({ kunden: true, artikel: true });
    const { container } = render(<ErsteSchritte hatBelege={true} onStarten={vi.fn()} />);

    // Abwarten, bis der Bestand geladen ist — sonst prüfte der Test nur, dass
    // vor dem Laden nichts da ist, und das gilt immer.
    await waitFor(() => expect(api.kunden.list).toHaveBeenCalled());
    expect(container.querySelector(".erste-schritte")).toBeNull();
  });

  it("nennt den Stand jedes Schritts auch ohne das Häkchen", async () => {
    // Das ✓ ist `aria-hidden`; ohne den zusätzlichen Text unterschiede eine
    // Vorlesehilfe erledigte und offene Schritte nicht.
    bestand({ kunden: true });
    render(<ErsteSchritte hatBelege={false} onStarten={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Erste Schritte")).toBeTruthy());
    const kunde = screen.getByText("Ersten Kunden anlegen").closest("li");
    expect(kunde).toHaveTextContent("erledigt");
    const artikel = screen.getByText("Ersten Artikel anlegen").closest("li");
    expect(artikel).toHaveTextContent("offen");
  });

  it("bleibt still, wenn der Bestand nicht zu laden ist", async () => {
    // Die Übersicht meldet denselben Fehler bereits an prominenterer Stelle;
    // eine zweite Fehlerbox darüber hilft niemandem.
    vi.mocked(api.kunden.list).mockRejectedValue(new Error("weg"));
    vi.mocked(api.artikel.list).mockResolvedValue([]);
    const { container } = render(<ErsteSchritte hatBelege={false} onStarten={vi.fn()} />);

    await waitFor(() => expect(api.kunden.list).toHaveBeenCalled());
    expect(container.querySelector(".erste-schritte")).toBeNull();
  });
});
