import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.2.1") }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../api", () => ({
  api: { einstellungen: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) } },
}));

import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../api";
import { VersionsHinweis } from "./VersionsHinweis";

beforeEach(() => {
  vi.mocked(api.einstellungen.get).mockReset();
  vi.mocked(api.einstellungen.set).mockClear();
});
afterEach(cleanup);

describe("VersionsHinweis", () => {
  it("meldet den Wechsel und zeigt, was sich geändert hat", async () => {
    // Nach einer Aktualisierung startet die Anwendung neu und läuft weiter —
    // ohne Hinweis merkt niemand, dass etwas passiert ist.
    vi.mocked(api.einstellungen.get)
      .mockResolvedValueOnce("0.2.0")
      .mockResolvedValueOnce("Fehler in der Rechnungsnummer behoben");
    render(<VersionsHinweis />);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText(/Aktualisiert auf Version 0.2.1/)).toBeTruthy();
    expect(screen.getByText("Fehler in der Rechnungsnummer behoben")).toBeTruthy();
  });

  it("führt zur Veröffentlichung der laufenden Version", async () => {
    vi.mocked(api.einstellungen.get).mockResolvedValueOnce("0.2.0").mockResolvedValueOnce("");
    render(<VersionsHinweis />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Was ist neu?" }));
    expect(openUrl).toHaveBeenCalledWith(
      "https://github.com/abnun/kleinunternehmer-verwaltung/releases/tag/v0.2.1",
    );
  });

  it("lässt sich schließen", async () => {
    vi.mocked(api.einstellungen.get).mockResolvedValueOnce("0.2.0").mockResolvedValueOnce("");
    render(<VersionsHinweis />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("schweigt beim allerersten Start", async () => {
    // Ein Neuling soll nicht mit „Aktualisiert auf 0.2.1" begrüßt werden.
    vi.mocked(api.einstellungen.get).mockResolvedValue(null);
    const { container } = render(<VersionsHinweis />);

    await waitFor(() => expect(api.einstellungen.set).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("schweigt, wenn sich nichts geändert hat", async () => {
    vi.mocked(api.einstellungen.get).mockResolvedValue("0.2.1");
    const { container } = render(<VersionsHinweis />);

    await waitFor(() => expect(api.einstellungen.set).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("vermerkt die laufende Version, bevor der Hinweis erscheint", async () => {
    // Sonst käme er nach einem Absturz beim nächsten Start noch einmal.
    vi.mocked(api.einstellungen.get).mockResolvedValueOnce("0.2.0").mockResolvedValueOnce("");
    render(<VersionsHinweis />);

    await waitFor(() =>
      expect(api.einstellungen.set).toHaveBeenCalledWith("version.zuletzt_gesehen", "0.2.1"),
    );
  });

  it("bleibt still, wenn die Einstellungen nicht lesbar sind", async () => {
    // Ein Hinweis ist keine Funktion, für die sich eine Fehlermeldung lohnt.
    vi.mocked(api.einstellungen.get).mockRejectedValue(new Error("keine Datenbank"));
    const { container } = render(<VersionsHinweis />);

    await waitFor(() => expect(api.einstellungen.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
