import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useErfolgsHinweis } from "./useErfolgsHinweis";

afterEach(cleanup);

function TestKomponente() {
  const { zeigen, hinweis } = useErfolgsHinweis();
  return (
    <div>
      {hinweis}
      <button type="button" onClick={() => zeigen("Erster Text")}>
        Erster Text zeigen
      </button>
      <button type="button" onClick={() => zeigen("Zweiter Text")}>
        Zweiter Text zeigen
      </button>
    </div>
  );
}

describe("useErfolgsHinweis", () => {
  it("zeigt den per zeigen() übergebenen Text", () => {
    render(<TestKomponente />);
    fireEvent.click(screen.getByRole("button", { name: "Erster Text zeigen" }));
    expect(screen.getByText("Erster Text")).toBeTruthy();
  });

  it("blendet den Banner nach 4000ms automatisch aus", () => {
    vi.useFakeTimers();
    render(<TestKomponente />);
    fireEvent.click(screen.getByRole("button", { name: "Erster Text zeigen" }));
    expect(screen.getByText("Erster Text")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByText("Erster Text")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Erster Text")).toBeNull();
    vi.useRealTimers();
  });

  it("startet den Auto-Dismiss-Timer neu, wenn zeigen() erneut aufgerufen wird, während der vorherige Banner noch sichtbar ist", () => {
    vi.useFakeTimers();
    render(<TestKomponente />);
    fireEvent.click(screen.getByRole("button", { name: "Erster Text zeigen" }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Zweiter Text zeigen" }));
    expect(screen.getByText("Zweiter Text")).toBeTruthy();
    // Der ERSTE Timer wäre spätestens 4000ms nach SEINEM Start verschwunden,
    // also 1000ms nach diesem zweiten Klick (3000+1000=4000). Würde der Timer
    // beim zweiten zeigen()-Aufruf NICHT neu starten, wäre der (jetzt zweite)
    // Banner an dieser Stelle schon weg. Da der Timer aber neu zählt, ist er
    // nach diesen 1000ms noch da.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Zweiter Text")).toBeTruthy();
    // Erst nach vollen 4000ms AB DEM ZWEITEN Aufruf (hier: 1000+2999+1=4000)
    // verschwindet er.
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByText("Zweiter Text")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Zweiter Text")).toBeNull();
    vi.useRealTimers();
  });
});
