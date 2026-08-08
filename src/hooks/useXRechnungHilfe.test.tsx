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
    expect(screen.getByRole("heading", { name: "Was ist die XRechnung?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "← Zurück" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Musterfirma");
  });

  /*
   * Verborgen heißt auch für Tastatur und Vorleseprogramme verborgen — sonst
   * ließe sich hinter der Hilfeseite weiter im Formular herumspringen.
   */
  it("verbirgt die Anwendung, solange die Hilfe offen ist", () => {
    render(
      <XRechnungHilfeProvider>
        <Formular />
      </XRechnungHilfeProvider>,
    );

    const feld = screen.getByLabelText("Name");
    const umschlag = feld.closest("[hidden]");
    expect(umschlag).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Was ist die XRechnung?" }));
    expect(feld.closest("[hidden]")).not.toBeNull();
  });
});
