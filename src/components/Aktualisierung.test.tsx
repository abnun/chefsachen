import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.1.0") }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../api", () => ({
  api: { protokoll: { pfad: vi.fn().mockResolvedValue("/Users/test/Library/Logs/app/app.log") } },
}));

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "../api";
import { Aktualisierung } from "./Aktualisierung";

/** Minimales Update-Objekt; nur die genutzten Felder sind belegt. */
function update(overrides: Record<string, unknown> = {}) {
  return {
    version: "0.2.0",
    body: "Fehler in der Rechnungsnummer behoben",
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// Block-Körper, kein Kurzschreibweise-Return: Ein zurückgegebenes Mock-Objekt
// wertet Vitest als Rückgabewert des Hooks aus, was hier zu einem Fehler
// führte, der wie eine geworfene Ausnahme des Tests aussah.
beforeEach(() => {
  vi.mocked(check).mockReset();
});
afterEach(cleanup);

describe("Aktualisierung", () => {
  it("zeigt die installierte Version", async () => {
    vi.mocked(check).mockResolvedValue(null);
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Installiert: Version 0.1.0")).toBeTruthy());
  });

  it("meldet, wenn keine neue Version vorliegt", async () => {
    vi.mocked(check).mockResolvedValue(null);
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Die Anwendung ist auf dem neuesten Stand.")).toBeTruthy());
  });

  it("bietet eine gefundene Version mit Änderungshinweis zur Installation an", async () => {
    vi.mocked(check).mockResolvedValue(update());
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Version 0.2.0 ist verfügbar")).toBeTruthy());
    expect(screen.getByText("Fehler in der Rechnungsnummer behoben")).toBeTruthy();
  });

  it("schweigt, wenn die Suche beim Start fehlschlägt", async () => {
    // Ein Rechner ohne Netz ist der Normalfall, kein Fehler, über den der
    // Nutzer ungefragt eine Meldung bekommen sollte.
    vi.mocked(check).mockImplementation(async () => { throw new Error("Network unreachable"); });
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Installiert: Version 0.1.0")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("meldet den Fehlschlag, wenn der Nutzer selbst gesucht hat", async () => {
    vi.mocked(check).mockImplementation(async () => { throw new Error("Network unreachable"); });
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Nach Aktualisierung suchen")).toBeTruthy());

    fireEvent.click(screen.getByText("Nach Aktualisierung suchen"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Network unreachable"));
  });

  it("installiert, zeigt den Fortschritt und bietet den Neustart an", async () => {
    const downloadAndInstall = vi.fn(async (fortschritt: (e: unknown) => void) => {
      fortschritt({ event: "Started", data: { contentLength: 200 } });
      fortschritt({ event: "Progress", data: { chunkLength: 50 } });
    });
    vi.mocked(check).mockResolvedValue(update({ downloadAndInstall }));
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Jetzt aktualisieren")).toBeTruthy());

    fireEvent.click(screen.getByText("Jetzt aktualisieren"));
    await waitFor(() => expect(screen.getByText("Die Aktualisierung ist eingespielt")).toBeTruthy());

    fireEvent.click(screen.getByText("Jetzt neu starten"));
    expect(relaunch).toHaveBeenCalled();
  });

  it("erfindet keinen Fortschritt ohne bekannte Gesamtgröße", async () => {
    let melden: ((e: unknown) => void) | null = null;
    const downloadAndInstall = vi.fn(
      (f: (e: unknown) => void) =>
        new Promise<void>(() => {
          melden = f;
        }),
    );
    vi.mocked(check).mockResolvedValue(update({ downloadAndInstall }));
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Jetzt aktualisieren")).toBeTruthy());
    fireEvent.click(screen.getByText("Jetzt aktualisieren"));

    await waitFor(() => expect(melden).not.toBeNull());
    melden!({ event: "Started", data: { contentLength: null } });
    melden!({ event: "Progress", data: { chunkLength: 50 } });

    await waitFor(() => expect(screen.getByText("Aktualisierung wird geladen …")).toBeTruthy());
  });

  it("meldet einen Fehlschlag beim Installieren", async () => {
    const downloadAndInstall = vi.fn(async () => { throw new Error("Signatur ungültig"); });
    vi.mocked(check).mockResolvedValue(update({ downloadAndInstall }));
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Jetzt aktualisieren")).toBeTruthy());

    fireEvent.click(screen.getByText("Jetzt aktualisieren"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Signatur ungültig"));
  });

  it("zeigt den Pfad der Protokolldatei und öffnet ihren Ordner", async () => {
    vi.mocked(check).mockResolvedValue(null);
    render(<Aktualisierung />);
    await waitFor(() =>
      expect(screen.getByText("/Users/test/Library/Logs/app/app.log")).toBeTruthy(),
    );

    fireEvent.click(screen.getByText("Protokolldatei im Ordner zeigen"));
    expect(revealItemInDir).toHaveBeenCalledWith("/Users/test/Library/Logs/app/app.log");
  });

  it("verspricht keine Protokolldatei, deren Pfad unbekannt ist", async () => {
    vi.mocked(check).mockResolvedValue(null);
    vi.mocked(api.protokoll.pfad).mockImplementationOnce(async () => {
      throw new Error("kein Protokollordner");
    });
    render(<Aktualisierung />);
    await waitFor(() => expect(screen.getByText("Installiert: Version 0.1.0")).toBeTruthy());
    expect(screen.queryByText("Protokolldatei im Ordner zeigen")).toBeNull();
  });
});
