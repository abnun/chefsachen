import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const einstellungGet = vi.fn();
const vorschlagen = vi.fn();
vi.mock("../api", () => ({
  api: {
    einstellungen: { get: (...a: unknown[]) => einstellungGet(...a), set: vi.fn().mockResolvedValue(undefined) },
    adressen: { vorschlagen: (...a: unknown[]) => vorschlagen(...a) },
  },
}));

// Ein kleiner, fester Ausschnitt statt der echten Liste: Die Tests sollen
// das Verhalten prüfen, nicht davon abhängen, was GeoNames gerade führt.
vi.mock("../plz", async (original) => {
  const echt = await original<typeof import("../plz")>();
  const v = echt.plzDatenLesen(
    [
      "tn\tDresden|>Innere Altstadt",
      `${(15848 - 1067).toString(36)}\tBeeskow|Tauche`,
      `${(74076 - 15848).toString(36)}\tHeilbronn`,
      `${(74172 - 74076).toString(36)}\tNeckarsulm`,
    ].join("\n"),
  );
  return { ...echt, plzVerzeichnisLaden: () => Promise.resolve(v) };
});

import { AdressFelder } from "./AdressFelder";

interface Werte {
  strasse: string;
  plz: string;
  ort: string;
  land: string;
}

function Formular({ start, onWerte }: { start?: Partial<Werte>; onWerte?: (w: Werte) => void }) {
  const [w, setW] = useState<Werte>({ strasse: "", plz: "", ort: "", land: "DE", ...start });
  return (
    <AdressFelder
      strasse={w.strasse}
      plz={w.plz}
      ort={w.ort}
      land={w.land}
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

const plzFeld = () => screen.getByLabelText(/^PLZ/, { selector: "input" });
const ortFeld = () => screen.getByLabelText(/^Ort/, { selector: "input" });

beforeEach(() => {
  einstellungGet.mockResolvedValue(null);
  vorschlagen.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("AdressFelder: PLZ und Ort offline", () => {
  it("trägt bei genau einem Ort diesen ein", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(plzFeld(), "74076");
    await waitFor(() => expect(ortFeld()).toHaveValue("Heilbronn"));
  });

  it("bietet bei mehreren Orten eine Liste am Ortsfeld an", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(plzFeld(), "15848");
    const liste = await screen.findByRole("listbox", { name: "Vorschläge für den Ort" });
    expect(liste).toHaveTextContent("Beeskow");
    expect(liste).toHaveTextContent("Tauche");
    expect(ortFeld()).toHaveValue("");
    await user.click(screen.getByRole("option", { name: /Tauche/ }));
    expect(ortFeld()).toHaveValue("Tauche");
  });

  it("überschreibt einen von Hand eingetragenen Ort nie", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ortFeld(), "Sontheim");
    await user.keyboard("{Escape}");
    await user.type(plzFeld(), "74076");
    // Der Vorschlag hätte Zeit genug gehabt.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(ortFeld()).toHaveValue("Sontheim");
  });

  it("passt einen selbst eingetragenen Ort an, wenn die PLZ sich ändert", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(plzFeld(), "74076");
    await waitFor(() => expect(ortFeld()).toHaveValue("Heilbronn"));
    await user.clear(plzFeld());
    await user.type(plzFeld(), "74172");
    await waitFor(() => expect(ortFeld()).toHaveValue("Neckarsulm"));
  });

  it("weist leise auf eine unbekannte PLZ hin, ohne zu blockieren", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(plzFeld(), "99999");
    expect(await screen.findByText("Diese PLZ ist nicht bekannt.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(plzFeld()).toHaveAccessibleDescription("Diese PLZ ist nicht bekannt.");
    expect(plzFeld()).toHaveValue("99999");
  });

  it("schlägt im Ortsfeld ab zwei Zeichen Orte mit PLZ vor und füllt die leere PLZ", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(ortFeld(), "Ne");
    expect(await screen.findByRole("option", { name: "Neckarsulm (74172)" })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(ortFeld()).toHaveValue("Neckarsulm");
    expect(plzFeld()).toHaveValue("74172");
  });

  it("lässt eine schon eingetragene PLZ bei der Ortswahl stehen", async () => {
    const user = userEvent.setup();
    render(<Formular start={{ plz: "74000" }} />);
    await user.type(ortFeld(), "Heil");
    await user.click(await screen.findByRole("option", { name: /Heilbronn/ }));
    expect(plzFeld()).toHaveValue("74000");
  });

  it("macht außerhalb Deutschlands keine Vorschläge", async () => {
    const user = userEvent.setup();
    render(<Formular start={{ land: "AT" }} />);
    await user.type(plzFeld(), "74076");
    await user.type(ortFeld(), "He");
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(ortFeld()).toHaveValue("He");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByText("Diese PLZ ist nicht bekannt.")).toBeNull();
  });
});

describe("AdressFelder: Straßen online nur nach Einwilligung", () => {
  it("bleibt ohne Einwilligung ein schlichtes Textfeld und fragt nie", async () => {
    const user = userEvent.setup();
    render(<Formular />);
    await waitFor(() => expect(einstellungGet).toHaveBeenCalledWith("adressen.online_vorschlaege"));
    const strasse = screen.getByLabelText(/Straße/);
    expect(strasse).not.toHaveAttribute("role", "combobox");
    expect(strasse).toHaveAttribute("autocomplete", "off");
    await user.type(strasse, "Paul-Göbel");
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(vorschlagen).not.toHaveBeenCalled();
  });

  it("fragt mit Einwilligung ab drei Zeichen, entprellt, und füllt Straße, PLZ und Ort", async () => {
    einstellungGet.mockResolvedValue("true");
    vorschlagen.mockResolvedValue([{ strasse: "Paul-Göbel-Straße", hausnummer: "1", plz: "74076", ort: "Heilbronn" }]);
    const user = userEvent.setup();
    render(<Formular />);
    const strasse = await screen.findByRole("combobox", { name: /Straße/ });
    await user.type(strasse, "Pa");
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(vorschlagen).not.toHaveBeenCalled();
    await user.type(strasse, "ul");
    // Entprellt: Für „Paul" genau eine Anfrage, nicht je Tastendruck eine.
    await waitFor(() => expect(vorschlagen).toHaveBeenCalledTimes(1));
    expect(vorschlagen).toHaveBeenCalledWith("Paul", null, null);
    await user.click(await screen.findByRole("option", { name: /Paul-Göbel-Straße 1/ }));
    expect(strasse).toHaveValue("Paul-Göbel-Straße 1");
    expect(plzFeld()).toHaveValue("74076");
    expect(ortFeld()).toHaveValue("Heilbronn");
  });

  it("überschreibt von Hand eingetragene PLZ und Ort bei der Straßenwahl nicht", async () => {
    // Wie beim Ort an der PLZ: Was jemand selbst geschrieben hat, bleibt.
    // Die Straße samt Hausnummer kommt trotzdem aus dem Vorschlag.
    einstellungGet.mockResolvedValue("true");
    vorschlagen.mockResolvedValue([{ strasse: "Paul-Göbel-Straße", hausnummer: "1", plz: "74076", ort: "Heilbronn" }]);
    const user = userEvent.setup();
    render(<Formular />);
    const strasse = await screen.findByRole("combobox", { name: /Straße/ });
    await user.type(plzFeld(), "74000");
    await user.type(ortFeld(), "Sontheim");
    await user.keyboard("{Escape}");
    await user.type(strasse, "Paul");
    await user.click(await screen.findByRole("option", { name: /Paul-Göbel-Straße 1/ }));
    expect(strasse).toHaveValue("Paul-Göbel-Straße 1");
    expect(plzFeld()).toHaveValue("74000");
    expect(ortFeld()).toHaveValue("Sontheim");
  });

  it("füllt nur das leere der beiden Felder, wenn eins schon von Hand dasteht", async () => {
    einstellungGet.mockResolvedValue("true");
    vorschlagen.mockResolvedValue([{ strasse: "Paul-Göbel-Straße", hausnummer: "", plz: "74076", ort: "Heilbronn" }]);
    const user = userEvent.setup();
    render(<Formular start={{ ort: "Heilbronn-Sontheim" }} />);
    const strasse = await screen.findByRole("combobox", { name: /Straße/ });
    await user.type(strasse, "Paul");
    await user.click(await screen.findByRole("option", { name: /Paul-Göbel-Straße/ }));
    expect(plzFeld()).toHaveValue("74076");
    expect(ortFeld()).toHaveValue("Heilbronn-Sontheim");
  });

  it("ersetzt PLZ und Ort, die ein früherer Straßenvorschlag eingetragen hat", async () => {
    einstellungGet.mockResolvedValue("true");
    vorschlagen.mockResolvedValue([
      { strasse: "Paul-Göbel-Straße", hausnummer: "1", plz: "74076", ort: "Heilbronn" },
      { strasse: "Karl-Heine-Straße", hausnummer: "", plz: "04229", ort: "Leipzig" },
    ]);
    const user = userEvent.setup();
    render(<Formular />);
    const strasse = await screen.findByRole("combobox", { name: /Straße/ });
    await user.type(strasse, "Paul");
    await user.click(await screen.findByRole("option", { name: /Paul-Göbel-Straße 1/ }));
    expect(ortFeld()).toHaveValue("Heilbronn");
    await user.clear(strasse);
    await user.type(strasse, "Karl");
    await user.click(await screen.findByRole("option", { name: /Karl-Heine-Straße/ }));
    expect(plzFeld()).toHaveValue("04229");
    expect(ortFeld()).toHaveValue("Leipzig");
  });

  it("schickt eingetragene PLZ und Ort zur Eingrenzung mit", async () => {
    einstellungGet.mockResolvedValue("true");
    const user = userEvent.setup();
    render(<Formular start={{ plz: "74076", ort: "Heilbronn" }} />);
    await user.type(await screen.findByRole("combobox", { name: /Straße/ }), "Haupt");
    await waitFor(() => expect(vorschlagen).toHaveBeenCalledWith("Haupt", "74076", "Heilbronn"));
  });

  it("zeigt bei einem Fehlschlag einfach nichts", async () => {
    einstellungGet.mockResolvedValue("true");
    vorschlagen.mockRejectedValue(new Error("weg"));
    const user = userEvent.setup();
    render(<Formular />);
    await user.type(await screen.findByRole("combobox", { name: /Straße/ }), "Haupt");
    await waitFor(() => expect(vorschlagen).toHaveBeenCalled());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
