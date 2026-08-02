import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Laden } from "./Laden";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Laden", () => {
  it("zeigt zunächst nichts", () => {
    // Die Datenbank liegt auf derselben Festplatte; die allermeisten Abrufe
    // sind in wenigen Millisekunden zurück. Ein sofort erscheinender Hinweis
    // würde nur aufblitzen und wäre unruhiger als gar keiner.
    const { container } = render(<Laden />);
    expect(container).toBeEmptyDOMElement();
  });

  it("meldet sich, wenn es länger dauert", () => {
    render(<Laden />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("nennt, worauf gewartet wird", () => {
    render(<Laden was="Rechnungen" />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Rechnungen werden geladen");
  });

  it("verschweigt einen Abruf, der vor der Frist zurück ist", () => {
    const { unmount } = render(<Laden />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    unmount();
    // Nach dem Abbau darf kein Zeitgeber mehr feuern und in den Zustand einer
    // abgebauten Komponente schreiben.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
