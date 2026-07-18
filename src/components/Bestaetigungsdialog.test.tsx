import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Bestaetigungsdialog } from "./Bestaetigungsdialog";

afterEach(cleanup);

describe("Bestaetigungsdialog", () => {
  it("zeigt den übergebenen Text", () => {
    render(
      <Bestaetigungsdialog text='Adresse „Testadresse" löschen?' onAbbrechen={() => {}} onBestaetigen={() => {}} />,
    );
    expect(screen.getByText('Adresse „Testadresse" löschen?')).toBeTruthy();
  });

  it("ruft onAbbrechen bei Klick auf Abbrechen auf", () => {
    const onAbbrechen = vi.fn();
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={onAbbrechen} onBestaetigen={() => {}} />);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(onAbbrechen).toHaveBeenCalledTimes(1);
  });

  it("ruft onAbbrechen bei Klick auf den Hintergrund auf", () => {
    const onAbbrechen = vi.fn();
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={onAbbrechen} onBestaetigen={() => {}} />);
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onAbbrechen).toHaveBeenCalledTimes(1);
  });

  it("ruft onAbbrechen bei Escape auf", () => {
    const onAbbrechen = vi.fn();
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={onAbbrechen} onBestaetigen={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAbbrechen).toHaveBeenCalledTimes(1);
  });

  it("ruft onBestaetigen bei Klick auf Löschen auf", () => {
    const onBestaetigen = vi.fn();
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={() => {}} onBestaetigen={onBestaetigen} />);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    expect(onBestaetigen).toHaveBeenCalledTimes(1);
  });
});
