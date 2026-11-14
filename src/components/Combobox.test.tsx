import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "./Combobox";

afterEach(cleanup);

const OPTIONEN: ComboboxOption[] = [
  { schluessel: "a", text: "Heilbronn", zusatz: "74076" },
  { schluessel: "b", text: "Heidelberg", zusatz: "69117" },
  { schluessel: "c", text: "Heide", zusatz: "25746" },
];

/** Bindet die Combobox so ein wie die Adressfelder: Wert und Offen-Zustand außen. */
function Aufbau({ onAuswahl = vi.fn(), onSubmit = vi.fn() }: { onAuswahl?: (i: number) => void; onSubmit?: () => void }) {
  const [wert, setWert] = useState("");
  const [offen, setOffen] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="ort">Ort</label>
      <Combobox
        id="ort"
        value={wert}
        onWertAendern={(w) => {
          setWert(w);
          setOffen(w.length > 0);
        }}
        optionen={OPTIONEN}
        offen={offen}
        onOeffnen={() => setOffen(true)}
        onSchliessen={() => setOffen(false)}
        onAuswahl={(i) => {
          setWert(OPTIONEN[i].text);
          setOffen(false);
          onAuswahl(i);
        }}
        listenBeschriftung="Vorschläge für den Ort"
      />
      <button type="button">Danach</button>
    </form>
  );
}

describe("Combobox", () => {
  it("folgt dem ARIA-Muster: Rolle, geschlossen, ohne Browser-Vervollständigung", () => {
    render(<Aufbau />);
    const feld = screen.getByRole("combobox", { name: "Ort" });
    expect(feld).toHaveAttribute("aria-expanded", "false");
    expect(feld).toHaveAttribute("aria-autocomplete", "list");
    expect(feld).toHaveAttribute("autocomplete", "off");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("öffnet die Liste und verknüpft sie mit dem Feld", async () => {
    const user = userEvent.setup();
    render(<Aufbau />);
    const feld = screen.getByRole("combobox", { name: "Ort" });
    await user.type(feld, "He");
    const liste = screen.getByRole("listbox", { name: "Vorschläge für den Ort" });
    expect(feld).toHaveAttribute("aria-expanded", "true");
    expect(feld).toHaveAttribute("aria-controls", liste.id);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(feld).not.toHaveAttribute("aria-activedescendant");
  });

  it("wandert mit den Pfeiltasten und meldet die aktive Option", async () => {
    const user = userEvent.setup();
    render(<Aufbau />);
    const feld = screen.getByRole("combobox", { name: "Ort" });
    await user.type(feld, "He");
    await user.keyboard("{ArrowDown}");
    const erste = screen.getByRole("option", { name: /Heilbronn/ });
    expect(feld).toHaveAttribute("aria-activedescendant", erste.id);
    expect(erste).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    // Nach der letzten geht es wieder oben los.
    expect(feld).toHaveAttribute("aria-activedescendant", erste.id);
    await user.keyboard("{ArrowUp}");
    expect(feld).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /Heide 25746/ }).id);
  });

  it("übernimmt mit Enter, ohne das Formular abzuschicken", async () => {
    const user = userEvent.setup();
    const onAuswahl = vi.fn();
    const onSubmit = vi.fn();
    render(<Aufbau onAuswahl={onAuswahl} onSubmit={onSubmit} />);
    const feld = screen.getByRole("combobox", { name: "Ort" });
    await user.type(feld, "He");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onAuswahl).toHaveBeenCalledWith(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(feld).toHaveValue("Heidelberg");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("schickt mit Enter ab, wenn keine Option aktiv ist", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Aufbau onSubmit={onSubmit} />);
    await user.type(screen.getByRole("combobox", { name: "Ort" }), "He{Enter}");
    expect(onSubmit).toHaveBeenCalled();
  });

  it("schließt mit Escape, ohne zu übernehmen", async () => {
    const user = userEvent.setup();
    const onAuswahl = vi.fn();
    render(<Aufbau onAuswahl={onAuswahl} />);
    const feld = screen.getByRole("combobox", { name: "Ort" });
    await user.type(feld, "He");
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onAuswahl).not.toHaveBeenCalled();
    expect(feld).toHaveValue("He");
  });

  it("verlässt das Feld mit Tab ohne Übernahme", async () => {
    const user = userEvent.setup();
    const onAuswahl = vi.fn();
    render(<Aufbau onAuswahl={onAuswahl} />);
    await user.type(screen.getByRole("combobox", { name: "Ort" }), "He");
    await user.keyboard("{ArrowDown}{Tab}");
    expect(onAuswahl).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Danach" })).toHaveFocus();
  });

  it("übernimmt per Mausklick", async () => {
    const user = userEvent.setup();
    const onAuswahl = vi.fn();
    render(<Aufbau onAuswahl={onAuswahl} />);
    await user.type(screen.getByRole("combobox", { name: "Ort" }), "He");
    await user.click(screen.getByRole("option", { name: /Heide 25746/ }));
    expect(onAuswahl).toHaveBeenCalledWith(2);
  });

  it("öffnet mit Pfeil nach unten, wenn Vorschläge da sind", async () => {
    const user = userEvent.setup();
    render(<Aufbau />);
    const feld = screen.getByRole("combobox", { name: "Ort" });
    feld.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("schließt bei einem Klick daneben", async () => {
    const user = userEvent.setup();
    render(<Aufbau />);
    await user.type(screen.getByRole("combobox", { name: "Ort" }), "He");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
