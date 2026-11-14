import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { XRechnungHilfeProvider, useXRechnungHilfe } from "./useXRechnungHilfe";

afterEach(() => {
  cleanup();
});

/** Ein Formular mit eigenem Zustand, wie ihn die Ersteinrichtung führt. */
function Formular() {
  const { zeigen } = useXRechnungHilfe();
  const [wert, setWert] = useState("");
  return (
    <>
      <label>
        Name
        <input value={wert} onChange={(e) => setWert(e.currentTarget.value)} />
      </label>
      <button type="button" onClick={zeigen}>
        Was ist die XRechnung?
      </button>
    </>
  );
}

describe("XRechnungHilfeProvider", () => {
  /*
   * Der Anbieter hängte die Anwendung beim Öffnen der Hilfe komplett aus. Wer
   * in der Ersteinrichtung das halbe Formular ausgefüllt hatte und zurückkam,
   * fand alle Felder leer.
   */
  it("behält den Formularzustand über den Ausflug in die Hilfe hinweg", () => {
    render(
      <XRechnungHilfeProvider>
        <Formular />
      </XRechnungHilfeProvider>,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Musterfirma" } });
    fireEvent.click(screen.getByRole("button", { name: "Was ist die XRechnung?" }));
    expect(screen.getByRole("dialog", { name: "Was ist die XRechnung?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("Musterfirma");
  });

  /*
   * Als Blatt über der Anwendung statt als eigene Seite: Die Seite stand ohne
   * Seitenleiste mit dem Zurück-Knopf gedrängt neben den Ampelknöpfen. Ein
   * Dialog hält den Fokus ohnehin bei sich, die Anwendung dahinter muss dafür
   * nicht verborgen werden.
   */
  it("zeigt die Hilfe als Dialog über der Anwendung und schließt mit Escape", () => {
    render(
      <XRechnungHilfeProvider>
        <Formular />
      </XRechnungHilfeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Was ist die XRechnung?" }));
    expect(screen.getByRole("dialog", { name: "Was ist die XRechnung?" })).toBeTruthy();
    expect(screen.getByText(/Leitweg-ID/, { selector: "dt" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
