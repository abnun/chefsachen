import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Bestaetigungsdialog } from "./Bestaetigungsdialog";

// Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
// Ein Test, der Aufrufe zählt, hängt dann an der Reihenfolge und an allem, was
// in den Tests davor geschah — genau so entstand ein Ausfall, der nur in der CI
// auftrat. `clearAllMocks` löscht die Aufrufe, nicht die hinterlegten Antworten.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Umgebung(props: { onAbbrechen?: () => void; onBestaetigen?: () => void }) {
  return (
    <>
      <button type="button">Knopf dahinter</button>
      <Bestaetigungsdialog
        text="Wirklich löschen?"
        onAbbrechen={props.onAbbrechen ?? (() => {})}
        onBestaetigen={props.onBestaetigen ?? (() => {})}
      />
    </>
  );
}


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

  it("zeigt ein eigenes Bestätigen-Label, wenn übergeben", () => {
    render(
      <Bestaetigungsdialog
        text="Trotzdem importieren?"
        bestaetigenLabel="Trotzdem importieren"
        onAbbrechen={() => {}}
        onBestaetigen={() => {}}
      />,
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Trotzdem importieren" }),
    ).toBeTruthy();
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Löschen" })).toBeNull();
  });

  it('zeigt weiterhin „Löschen" als Standard-Label ohne bestaetigenLabel', () => {
    render(<Bestaetigungsdialog text="Löschen?" onAbbrechen={() => {}} onBestaetigen={() => {}} />);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" })).toBeTruthy();
  });

  it("hält den Fokus im Dialog, statt ihn nach hinten wandern zu lassen", async () => {
    // Ohne Fokusfalle landet man nach zwei Tabulatorschritten auf der Seite
    // hinter dem Dialog — dort, wo man gerade nichts bedienen soll und wo
    // Screenreader nichts mehr vom Dialog wissen.
    render(<Umgebung />);
    const abbrechen = screen.getByRole("button", { name: "Abbrechen" });
    const bestaetigen = screen.getByRole("button", { name: "Löschen" });

    expect(abbrechen).toHaveFocus();
    await userEvent.tab();
    expect(bestaetigen).toHaveFocus();
    await userEvent.tab();
    expect(abbrechen).toHaveFocus();
  });

  it("läuft rückwärts genauso im Kreis", async () => {
    render(<Umgebung />);
    const abbrechen = screen.getByRole("button", { name: "Abbrechen" });
    const bestaetigen = screen.getByRole("button", { name: "Löschen" });

    expect(abbrechen).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(bestaetigen).toHaveFocus();
  });

  it("gibt den Fokus zurück, wo er herkam", async () => {
    // Wer den Dialog von einem Löschen-Knopf aus geöffnet hat, soll danach
    // wieder dort stehen und nicht am Seitenanfang.
    const { rerender } = render(<button type="button">Auslöser</button>);
    screen.getByRole("button", { name: "Auslöser" }).focus();

    rerender(
      <>
        <button type="button">Auslöser</button>
        <Bestaetigungsdialog text="?" onAbbrechen={() => {}} onBestaetigen={() => {}} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Abbrechen" })).toHaveFocus();

    rerender(<button type="button">Auslöser</button>);
    expect(screen.getByRole("button", { name: "Auslöser" })).toHaveFocus();
  });

  it("benennt sich über seinen Text", async () => {
    render(<Umgebung />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Wirklich löschen?");
  });

});
