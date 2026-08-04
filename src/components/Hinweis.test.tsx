import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hinweis } from "./Hinweis";

// Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
// Ein Test, der Aufrufe zählt, hängt dann an der Reihenfolge und an allem, was
// in den Tests davor geschah — genau so entstand ein Ausfall, der nur in der CI
// auftrat. `clearAllMocks` löscht die Aufrufe, nicht die hinterlegten Antworten.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Hinweis", () => {
  it("zeigt den übergebenen Inhalt", () => {
    render(<Hinweis onSchliessen={() => {}}>Testtext</Hinweis>);
    expect(screen.getByText("Testtext")).toBeTruthy();
  });

  it("ruft onSchliessen bei Klick auf × auf (manueller Modus, kein autoDismissMs)", () => {
    const onSchliessen = vi.fn();
    render(<Hinweis onSchliessen={onSchliessen}>Testtext</Hinweis>);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it("zeigt keinen Schließen-Button und ruft onSchliessen nach autoDismissMs automatisch auf", () => {
    vi.useFakeTimers();
    const onSchliessen = vi.fn();
    render(
      <Hinweis onSchliessen={onSchliessen} autoDismissMs={4000}>
        Testtext
      </Hinweis>,
    );
    expect(screen.queryByRole("button", { name: "Hinweis schließen" })).toBeNull();
    expect(onSchliessen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3999);
    expect(onSchliessen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSchliessen).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
