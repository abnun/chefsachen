import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.1.0") }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn().mockResolvedValue(undefined),
  warn: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../api", () => ({
  api: {
    einstellungen: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { AktualisierungProvider } from "../hooks/useAktualisierung";
import { AktualisierungsBenachrichtigung } from "./AktualisierungsBenachrichtigung";

/** Minimales Update-Objekt; nur die genutzten Felder sind belegt. */
function update(overrides: Record<string, unknown> = {}) {
  return {
    version: "0.2.0",
    body: "Fehler in der Rechnungsnummer behoben",
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function Seite() {
  return (
    <AktualisierungProvider>
      <AktualisierungsBenachrichtigung />
      <p>Restliche Anwendung</p>
    </AktualisierungProvider>
  );
}

beforeEach(() => {
  vi.mocked(check).mockReset();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AktualisierungsBenachrichtigung", () => {
  it("meldet eine gefundene Aktualisierung, ohne dass die Einstellungen-Seite geöffnet sein muss", async () => {
    // Das war der eigentliche Fehler: Die Suche „beim Programmstart" lief
    // bisher nur, wenn zufällig die Einstellungen-Seite gemountet war.
    vi.mocked(check).mockResolvedValue(update());
    render(<Seite />);
    await waitFor(() => expect(screen.getByText("Version 0.2.0 ist verfügbar")).toBeTruthy());
    expect(screen.getByText("Fehler in der Rechnungsnummer behoben")).toBeTruthy();
    expect(screen.getByText("Restliche Anwendung")).toBeTruthy();
  });

  it("bleibt still, solange nur gesucht wird oder alles aktuell ist", async () => {
    vi.mocked(check).mockResolvedValue(null);
    render(<Seite />);
    await waitFor(() => expect(check).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("bleibt beim Programmstart still, wenn die Suche fehlschlägt", async () => {
    vi.mocked(check).mockImplementation(async () => { throw new Error("kein Netz"); });
    render(<Seite />);
    await waitFor(() => expect(check).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lässt sich mit dem Später-Knopf wegklicken", async () => {
    vi.mocked(check).mockResolvedValue(update());
    render(<Seite />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Später" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("installiert und bietet nach dem Einspielen den Neustart an", async () => {
    const downloadAndInstall = vi.fn(async (fortschritt: (e: unknown) => void) => {
      fortschritt({ event: "Started", data: { contentLength: 100 } });
      fortschritt({ event: "Progress", data: { chunkLength: 100 } });
    });
    vi.mocked(check).mockResolvedValue(update({ downloadAndInstall }));
    render(<Seite />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Jetzt aktualisieren" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Jetzt aktualisieren" }));
    await waitFor(() => expect(screen.getByText("Die Aktualisierung ist eingespielt")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Jetzt neu starten" }));
    expect(relaunch).toHaveBeenCalled();
  });
});
