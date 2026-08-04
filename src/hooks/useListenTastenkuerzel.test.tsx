import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useListenTastenkuerzel } from "./useListenTastenkuerzel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function TestSeite({ neu, zeigeDialog }: { neu: () => void; zeigeDialog?: boolean }) {
  const sucheRef = useRef<HTMLInputElement>(null);
  useListenTastenkuerzel({ neu, sucheFokussieren: () => sucheRef.current?.focus() });
  return (
    <div>
      <input ref={sucheRef} aria-label="Suche" />
      {zeigeDialog && (
        <div role="dialog" aria-modal="true">
          <button type="button">Löschen</button>
        </div>
      )}
    </div>
  );
}

describe("useListenTastenkuerzel", () => {
  it("ruft neu() bei ⌘N (metaKey) auf", () => {
    const neu = vi.fn();
    render(<TestSeite neu={neu} />);
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(neu).toHaveBeenCalledTimes(1);
  });

  it("ruft neu() bei Strg+N (ctrlKey) auf", () => {
    const neu = vi.fn();
    render(<TestSeite neu={neu} />);
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(neu).toHaveBeenCalledTimes(1);
  });

  it("fokussiert das Suchfeld bei ⌘F", () => {
    render(<TestSeite neu={vi.fn()} />);
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(document.activeElement).toBe(screen.getByLabelText("Suche"));
  });

  it("reagiert nicht auf n oder f ohne gedrückte Zusatztaste", () => {
    const neu = vi.fn();
    render(<TestSeite neu={neu} />);
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "f" });
    expect(neu).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(screen.getByLabelText("Suche"));
  });

  it("löst ⌘N nicht aus, solange ein Dialog offen ist", () => {
    const neu = vi.fn();
    render(<TestSeite neu={neu} zeigeDialog />);
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(neu).not.toHaveBeenCalled();
  });
});
