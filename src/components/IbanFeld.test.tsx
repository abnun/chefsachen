import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Ein fester kleiner Ausschnitt statt der echten Bundesbank-Datei: Die Tests
// prüfen das Verhalten, nicht den Stand der Bankleitzahlen.
vi.mock("../blz", async (original) => {
  const echt = await original<typeof import("../blz")>();
  const v = new Map([
    ["12030000", "BYLADEM1001"],
    ["10010010", "PBNKDEFFXXX"],
  ]);
  return { ...echt, blzVerzeichnisLaden: () => Promise.resolve(v) };
});

import { IbanFeld } from "./IbanFeld";

interface Werte {
  iban: string;
  bic: string;
}

function Formular({ start, onWerte }: { start?: Partial<Werte>; onWerte?: (w: Werte) => void }) {
  const [w, setW] = useState<Werte>({ iban: "", bic: "", ...start });
  return (
    <IbanFeld
      iban={w.iban}
      bic={w.bic}
      onAendern={(a) =>
        setW((alt) => {
          const neu = { ...alt, ...a };
          onWerte?.(neu);
          return neu;
        })
      }
      feldFehler={() => null}
    />
  );
}

const ibanFeld = () => screen.getByLabelText("IBAN") as HTMLInputElement;
const bicFeld = () => screen.getByLabelText("BIC") as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IbanFeld: Eingabe", () => {
  it("gruppiert beim Tippen in Viererblöcke und schreibt groß", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ibanFeld(), "de02120300000000202051");
    expect(ibanFeld()).toHaveValue("DE02 1203 0000 0000 2020 51");
  });

  it("nimmt eine eingefügte IBAN mit Leerzeichen an", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.click(ibanFeld());
    await user.paste("DE02 1203 0000 0000 2020 51");
    expect(ibanFeld()).toHaveValue("DE02 1203 0000 0000 2020 51");
  });

  it("lässt den Cursor beim Einfügen in der Mitte hinter dem neuen Zeichen", async () => {
    // Ohne Nachführen sprang er ans Ende, sobald sich die Leerzeichen
    // verschoben, und das nächste Zeichen landete an der falschen Stelle.
    const user = userEvent.setup();
    render(<Formular start={{ iban: "DE02 1203 0000" }} />);
    await user.type(ibanFeld(), "9", { initialSelectionStart: 7, initialSelectionEnd: 7 });
    expect(ibanFeld()).toHaveValue("DE02 1290 3000 0");
    expect(ibanFeld().selectionStart).toBe(8);
  });

  it("zeigt eine IBAN, die schon ungruppiert gespeichert war, gruppiert an", () => {
    render(<Formular start={{ iban: "DE02120300000000202051" }} />);
    expect(ibanFeld()).toHaveValue("DE02 1203 0000 0000 2020 51");
  });
});

describe("IbanFeld: Prüfziffer", () => {
  it("weist leise auf eine falsche Prüfziffer hin, ohne zu blockieren", async () => {
    const user = userEvent.setup();
    const onWerte = vi.fn();
    render(<Formular onWerte={onWerte} />);
    await user.type(ibanFeld(), "DE02120300000000202015");
    const hinweis = await screen.findByText(/Prüfziffer der IBAN passt nicht/);
    expect(ibanFeld()).toHaveAttribute("aria-describedby", hinweis.id);
    // Der Wert kommt trotzdem an; verbindlich prüft das Backend beim Speichern.
    expect(onWerte).toHaveBeenLastCalledWith(expect.objectContaining({ iban: "DE02 1203 0000 0000 2020 15" }));
  });

  it("zeigt keinen Hinweis, solange die IBAN unvollständig ist", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ibanFeld(), "DE0212030000");
    expect(screen.queryByText(/Prüfziffer/)).toBeNull();
  });

  it("nennt die übliche Länge, wenn eine IBAN zu lang ist", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ibanFeld(), "DE021203000000002020511");
    expect(await screen.findByText(/hat 22 Stellen/)).toBeTruthy();
  });
});

describe("IbanFeld: BIC aus der Bankleitzahl", () => {
  it("trägt bei gültiger deutscher IBAN und leerem Feld den BIC ein", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ibanFeld(), "DE02120300000000202051");
    await waitFor(() => expect(bicFeld()).toHaveValue("BYLADEM1001"));
  });

  it("überschreibt einen von Hand eingetragenen BIC nie", async () => {
    const user = userEvent.setup();
    render(<Formular start={{ bic: "HANDDEFFXXX" }} />);
    await user.type(ibanFeld(), "DE02120300000000202051");
    // Kurz warten, damit ein verspätetes Eintragen auffiele.
    await new Promise((r) => setTimeout(r, 20));
    expect(bicFeld()).toHaveValue("HANDDEFFXXX");
  });

  it("lässt den BIC bei unbekannter Bankleitzahl leer, ohne Hinweis", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    // Gültige Prüfziffer, aber BLZ 50010517 fehlt im Ausschnitt.
    await user.type(ibanFeld(), "DE89370400440532013000");
    await new Promise((r) => setTimeout(r, 20));
    expect(bicFeld()).toHaveValue("");
    expect(screen.queryByText(/Prüfziffer|Bankleitzahl/)).toBeNull();
  });

  it("ersetzt einen selbst eingetragenen BIC, wenn die IBAN auf eine andere Bank wechselt", async () => {
    // Wie der Ort an der PLZ: Wer die IBAN korrigiert, soll den BIC, den das
    // Programm eingetragen hat, nicht von Hand nachziehen müssen.
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ibanFeld(), "DE02120300000000202051");
    await waitFor(() => expect(bicFeld()).toHaveValue("BYLADEM1001"));
    await user.clear(ibanFeld());
    await user.type(ibanFeld(), "DE36100100100000000001");
    await waitFor(() => expect(bicFeld()).toHaveValue("PBNKDEFFXXX"));
  });

  it("nimmt den selbst eingetragenen BIC zurück, sobald die IBAN wieder unvollständig ist", async () => {
    // Sonst stünde der BIC der eben gelöschten Bankleitzahl neben einer IBAN,
    // zu der er vielleicht gar nicht gehört.
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ibanFeld(), "DE02120300000000202051");
    await waitFor(() => expect(bicFeld()).toHaveValue("BYLADEM1001"));
    await user.type(ibanFeld(), "{Backspace}");
    expect(bicFeld()).toHaveValue("");
  });

  it("lässt einen von Hand eingetragenen BIC stehen, auch wenn die IBAN unvollständig wird", async () => {
    const user = userEvent.setup();
    render(<Formular start={{ bic: "HANDDEFFXXX" }} />);
    await user.type(ibanFeld(), "DE02120300000000202051{Backspace}{Backspace}");
    expect(bicFeld()).toHaveValue("HANDDEFFXXX");
  });

  it("lässt den BIC in Ruhe, wenn er nach dem Eintragen von Hand geändert wurde", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ibanFeld(), "DE02120300000000202051");
    await waitFor(() => expect(bicFeld()).toHaveValue("BYLADEM1001"));
    await user.clear(bicFeld());
    await user.type(bicFeld(), "EIGENDEFXXX");
    await user.clear(ibanFeld());
    await user.type(ibanFeld(), "DE36100100100000000001");
    await new Promise((r) => setTimeout(r, 20));
    expect(bicFeld()).toHaveValue("EIGENDEFXXX");
  });
});
