import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UngespeichertProvider, useUngespeichert, useVerlassenPruefen } from "./useUngespeichert";

afterEach(cleanup);

/** Ein Formular, das sich anmeldet, sobald etwas eingetippt wurde. */
function Formular({ sichtbar }: { sichtbar: boolean }) {
  const [wert, setWert] = useState("");
  useUngespeichert(wert !== "");
  if (!sichtbar) return null;
  return (
    <label>
      Name
      <input value={wert} onChange={(e) => setWert(e.currentTarget.value)} />
    </label>
  );
}

function Umgebung({ onGewechselt, formularSichtbar = true }: {
  onGewechselt: (erlaubt: boolean) => void;
  formularSichtbar?: boolean;
}) {
  const pruefen = useVerlassenPruefen();
  return (
    <>
      <Formular sichtbar={formularSichtbar} />
      <button type="button" onClick={async () => onGewechselt(await pruefen())}>
        Weiterblättern
      </button>
    </>
  );
}

describe("useUngespeichert", () => {
  it("lässt ohne Eingaben ohne Rückfrage weiter", async () => {
    const gewechselt = vi.fn();
    render(
      <UngespeichertProvider>
        <Umgebung onGewechselt={gewechselt} />
      </UngespeichertProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Weiterblättern" }));
    await waitFor(() => expect(gewechselt).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("fragt nach, sobald etwas eingetippt wurde", async () => {
    const gewechselt = vi.fn();
    render(
      <UngespeichertProvider>
        <Umgebung onGewechselt={gewechselt} />
      </UngespeichertProvider>,
    );

    await userEvent.type(screen.getByLabelText("Name"), "Meier");
    await userEvent.click(screen.getByRole("button", { name: "Weiterblättern" }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(gewechselt).not.toHaveBeenCalled();
  });

  it("bleibt, wenn der Nutzer abbricht", async () => {
    const gewechselt = vi.fn();
    render(
      <UngespeichertProvider>
        <Umgebung onGewechselt={gewechselt} />
      </UngespeichertProvider>,
    );

    await userEvent.type(screen.getByLabelText("Name"), "Meier");
    await userEvent.click(screen.getByRole("button", { name: "Weiterblättern" }));
    await userEvent.click(await screen.findByRole("button", { name: "Abbrechen" }));

    await waitFor(() => expect(gewechselt).toHaveBeenCalledWith(false));
  });

  it("wechselt, wenn der Nutzer verwerfen will", async () => {
    const gewechselt = vi.fn();
    render(
      <UngespeichertProvider>
        <Umgebung onGewechselt={gewechselt} />
      </UngespeichertProvider>,
    );

    await userEvent.type(screen.getByLabelText("Name"), "Meier");
    await userEvent.click(screen.getByRole("button", { name: "Weiterblättern" }));
    await userEvent.click(await screen.findByRole("button", { name: "Verwerfen" }));

    await waitFor(() => expect(gewechselt).toHaveBeenCalledWith(true));
  });

  it("blockiert nicht weiter, wenn das Formular verschwindet", async () => {
    // Ein Formular, das mit gesetztem Kennzeichen abgebaut wird, hielte sonst
    // jede weitere Navigation an — und niemand fände heraus, warum.
    const gewechselt = vi.fn();
    const { rerender } = render(
      <UngespeichertProvider>
        <Umgebung onGewechselt={gewechselt} />
      </UngespeichertProvider>,
    );
    await userEvent.type(screen.getByLabelText("Name"), "Meier");

    rerender(
      <UngespeichertProvider>
        <Umgebung onGewechselt={gewechselt} formularSichtbar={false} />
      </UngespeichertProvider>,
    );
    // Das Formular ist zwar unsichtbar, aber noch montiert — es soll weiter
    // blockieren. Erst der Abbau meldet ab.
    await userEvent.click(screen.getByRole("button", { name: "Weiterblättern" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  });

  it("hält ohne Provider nichts auf", async () => {
    // Tests, die nur eine Seite rendern, kennen den Provider nicht. Die
    // Navigation darf davon nicht stillstehen.
    const gewechselt = vi.fn();
    render(<Umgebung onGewechselt={gewechselt} />);

    await userEvent.type(screen.getByLabelText("Name"), "Meier");
    await userEvent.click(screen.getByRole("button", { name: "Weiterblättern" }));
    await waitFor(() => expect(gewechselt).toHaveBeenCalledWith(true));
  });
});
