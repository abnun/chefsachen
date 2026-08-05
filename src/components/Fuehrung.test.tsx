import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Fuehrung, type FuehrungsSchritt } from "./Fuehrung";

afterEach(() => {
  cleanup();
});

const SCHRITTE: FuehrungsSchritt[] = [
  { ziel: "#a", titel: "Erstes", text: "Text eins" },
  { ziel: "#b", titel: "Zweites", text: "Text zwei" },
  { ziel: "#c", titel: "Drittes", text: "Text drei" },
];

function Seite({ onBeenden }: { onBeenden: () => void }) {
  return (
    <div>
      <div id="a">A</div>
      <div id="b">B</div>
      <div id="c">C</div>
      <Fuehrung schritte={SCHRITTE} onBeenden={onBeenden} />
    </div>
  );
}

describe("Fuehrung", () => {
  it("zeigt den ersten Schritt ohne Zurück-Knopf", () => {
    render(<Seite onBeenden={vi.fn()} />);
    expect(screen.getByText("Erstes")).toBeTruthy();
    expect(screen.getByText("Text eins")).toBeTruthy();
    expect(screen.getByText("1 von 3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Zurück" })).toBeNull();
  });

  it("blättert mit Weiter und Zurück", () => {
    render(<Seite onBeenden={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText("Zweites")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
    expect(screen.getByText("Erstes")).toBeTruthy();
  });

  it("zeigt beim letzten Schritt den Fertig-Knopf statt Weiter und beendet damit", () => {
    const onBeenden = vi.fn();
    render(<Seite onBeenden={onBeenden} />);
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText("Drittes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Weiter" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(onBeenden).toHaveBeenCalledTimes(1);
  });

  it("beendet über den Beenden-Knopf, unabhängig vom Schritt", () => {
    const onBeenden = vi.fn();
    render(<Seite onBeenden={onBeenden} />);
    fireEvent.click(screen.getByRole("button", { name: "Beenden" }));
    expect(onBeenden).toHaveBeenCalledTimes(1);
  });

  it("beendet mit der Escape-Taste", () => {
    const onBeenden = vi.fn();
    render(<Seite onBeenden={onBeenden} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onBeenden).toHaveBeenCalledTimes(1);
  });

  it("beendet bei Klick außerhalb des Tooltips (auf der Abdunklung)", () => {
    const onBeenden = vi.fn();
    render(<Seite onBeenden={onBeenden} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onBeenden).toHaveBeenCalledTimes(1);
  });

  it("schließt nicht bei Klick innerhalb des Tooltips", () => {
    const onBeenden = vi.fn();
    render(<Seite onBeenden={onBeenden} />);
    fireEvent.click(screen.getByText("Erstes"));
    expect(onBeenden).not.toHaveBeenCalled();
  });

  /**
   * Ein Ziel kann fehlen, etwa die Kleinunternehmergrenzen bei
   * Regelbesteuerung — dann überspringt der Rundgang den Schritt, statt
   * abzubrechen.
   */
  it("überspringt einen Schritt, dessen Ziel im Dokument fehlt", () => {
    const schritte: FuehrungsSchritt[] = [
      { ziel: "#fehlt", titel: "Geist", text: "wird nie gezeigt" },
      { ziel: "#a", titel: "Erstes", text: "Text eins" },
    ];
    render(
      <div>
        <div id="a">A</div>
        <Fuehrung schritte={schritte} onBeenden={vi.fn()} />
      </div>,
    );
    expect(screen.getByText("Erstes")).toBeTruthy();
    expect(screen.queryByText("Geist")).toBeNull();
  });

  it("beendet von selbst, wenn auch das letzte Ziel fehlt", () => {
    const onBeenden = vi.fn();
    const schritte: FuehrungsSchritt[] = [{ ziel: "#fehlt", titel: "Geist", text: "..." }];
    render(<Fuehrung schritte={schritte} onBeenden={onBeenden} />);
    expect(onBeenden).toHaveBeenCalledTimes(1);
  });
});
