import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const einstellungGet = vi.fn();
const einstellungSet = vi.fn();
vi.mock("../api", () => ({
  api: {
    einstellungen: {
      get: (...a: unknown[]) => einstellungGet(...a),
      set: (...a: unknown[]) => einstellungSet(...a),
    },
  },
}));

import { useOnlineAdressvorschlaege } from "./useOnlineAdressvorschlaege";

/** Ein Promise, das der Test selbst einlöst, wann er will. */
function aufgeschoben<T>() {
  let einloesen!: (wert: T) => void;
  const promise = new Promise<T>((r) => {
    einloesen = r;
  });
  return { promise, einloesen };
}

let umschalten: (an: boolean) => Promise<void> = async () => {};

function Anzeige({ name }: { name: string }) {
  const [an, setzen] = useOnlineAdressvorschlaege();
  if (name === "a") umschalten = setzen;
  return <p data-testid={name}>{an ? "an" : "aus"}</p>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useOnlineAdressvorschlaege", () => {
  it("liest den gespeicherten Stand", async () => {
    einstellungGet.mockResolvedValue("true");
    render(<Anzeige name="a" />);
    expect(await screen.findByText("an")).toBeInTheDocument();
  });

  it("verwirft ein verspätetes erstes Laden, wenn inzwischen umgeschaltet wurde", async () => {
    // Das Häkchen ist sofort bedienbar. Kommt der gespeicherte alte Stand
    // erst nach dem Klick zurück, darf er den neuen nicht überschreiben;
    // sonst zeigte das Häkchen „aus", während das Backend „an" gespeichert hat.
    const laden = aufgeschoben<string | null>();
    einstellungGet.mockReturnValue(laden.promise);
    einstellungSet.mockResolvedValue(undefined);
    render(<Anzeige name="a" />);
    await act(() => umschalten(true));
    expect(screen.getByTestId("a")).toHaveTextContent("an");
    await act(async () => laden.einloesen("false"));
    expect(screen.getByTestId("a")).toHaveTextContent("an");
  });

  it("verwirft das verspätete Laden auch bei einem anderen Nutzer der Einstellung", async () => {
    const laden = aufgeschoben<string | null>();
    einstellungGet.mockReturnValue(laden.promise);
    einstellungSet.mockResolvedValue(undefined);
    render(
      <>
        <Anzeige name="a" />
        <Anzeige name="b" />
      </>,
    );
    await act(() => umschalten(true));
    await act(async () => laden.einloesen(null));
    expect(screen.getByTestId("a")).toHaveTextContent("an");
    expect(screen.getByTestId("b")).toHaveTextContent("an");
  });
});
