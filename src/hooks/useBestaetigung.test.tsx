import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBestaetigung } from "./useBestaetigung";

afterEach(cleanup);

function TestKomponente({ onErgebnis }: { onErgebnis: (ergebnis: boolean) => void }) {
  const { bestaetigen, dialog } = useBestaetigung();
  return (
    <div>
      {dialog}
      <button type="button" onClick={() => bestaetigen('Test „Beispiel" löschen?').then(onErgebnis)}>
        Löschen auslösen
      </button>
    </div>
  );
}

describe("useBestaetigung", () => {
  it("zeigt den Dialog mit dem übergebenen Text und löst die Promise mit true auf, wenn im Dialog bestätigt wird", async () => {
    const onErgebnis = vi.fn();
    render(<TestKomponente onErgebnis={onErgebnis} />);
    fireEvent.click(screen.getByRole("button", { name: "Löschen auslösen" }));
    expect(screen.getByText('Test „Beispiel" löschen?')).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(onErgebnis).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("löst die Promise mit false auf, wenn im Dialog abgebrochen wird", async () => {
    const onErgebnis = vi.fn();
    render(<TestKomponente onErgebnis={onErgebnis} />);
    fireEvent.click(screen.getByRole("button", { name: "Löschen auslösen" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(onErgebnis).toHaveBeenCalledWith(false));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
