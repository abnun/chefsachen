import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZeilenKnopf } from "./ZeilenKnopf";

// Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
// Ein Test, der Aufrufe zählt, hängt dann an der Reihenfolge und an allem, was
// in den Tests davor geschah — genau so entstand ein Ausfall, der nur in der CI
// auftrat. `clearAllMocks` löscht die Aufrufe, nicht die hinterlegten Antworten.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Tabelle({ onOeffnen }: { onOeffnen: () => void }) {
  return (
    <table>
      <tbody>
        <tr onClick={onOeffnen}>
          <td>
            <ZeilenKnopf onOeffnen={onOeffnen}>RE-2026-0001</ZeilenKnopf>
          </td>
          <td>ACME GmbH</td>
        </tr>
      </tbody>
    </table>
  );
}

describe("ZeilenKnopf", () => {
  it("ist mit der Tastatur erreichbar", async () => {
    const onOeffnen = vi.fn();
    render(<Tabelle onOeffnen={onOeffnen} />);

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "RE-2026-0001" })).toHaveFocus();
  });

  it("öffnet den Datensatz mit der Eingabetaste", async () => {
    const onOeffnen = vi.fn();
    render(<Tabelle onOeffnen={onOeffnen} />);

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onOeffnen).toHaveBeenCalledTimes(1);
  });

  it("löst beim Mausklick nur einmal aus", async () => {
    // Die Zeile bleibt für Mausnutzer klickbar. Ohne Unterbrechung der
    // Ereigniskette liefe der Klick auf den Knopf zusätzlich über die Zeile
    // und öffnete den Datensatz zweimal.
    const onOeffnen = vi.fn();
    render(<Tabelle onOeffnen={onOeffnen} />);

    await userEvent.click(screen.getByRole("button", { name: "RE-2026-0001" }));
    expect(onOeffnen).toHaveBeenCalledTimes(1);
  });
});
