import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("1.0.0") }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn().mockResolvedValue(undefined),
  warn: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../api", () => ({
  api: {
    vertriebsweg: vi.fn(),
    einstellungen: {
      // Ein längst fälliger Spendentermin: Zeigt die GitHub-Fassung den
      // Hinweis, darf die Store-Fassung ihn trotzdem nicht zeigen.
      get: vi.fn().mockResolvedValue("2000-01-01T00:00:00.000Z"),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { api } from "../api";
import { AktualisierungProvider } from "./useAktualisierung";
import { VertriebswegProvider, useVertriebsweg } from "./useVertriebsweg";
import { AktualisierungsBenachrichtigung } from "../components/AktualisierungsBenachrichtigung";
import { SpendenHinweis } from "../components/SpendenHinweis";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Der Aufbau aus main.tsx, beschränkt auf das, was vom Vertriebsweg abhängt. */
function Anwendung() {
  return (
    <VertriebswegProvider>
      <AktualisierungProvider>
        <AktualisierungsBenachrichtigung />
        <SpendenHinweis />
      </AktualisierungProvider>
    </VertriebswegProvider>
  );
}

function Anzeige() {
  return <p>Weg: {String(useVertriebsweg())}</p>;
}

describe("useVertriebsweg", () => {
  it("gilt ohne Anbieter als GitHub-Fassung", () => {
    render(<Anzeige />);
    expect(screen.getByText("Weg: github")).toBeTruthy();
  });

  it("ist unbekannt, bis der Rust-Teil geantwortet hat", async () => {
    let antworten: (w: string) => void = () => {};
    vi.mocked(api.vertriebsweg).mockReturnValueOnce(
      new Promise((r) => {
        antworten = r;
      }) as never,
    );
    render(
      <VertriebswegProvider>
        <Anzeige />
      </VertriebswegProvider>,
    );
    expect(screen.getByText("Weg: null")).toBeTruthy();
    await act(async () => antworten("microsoft_store"));
    expect(screen.getByText("Weg: microsoft_store")).toBeTruthy();
  });

  it("fällt bei einer unbrauchbaren Antwort auf die GitHub-Fassung zurück", async () => {
    vi.mocked(api.vertriebsweg).mockResolvedValueOnce(undefined as never);
    render(
      <VertriebswegProvider>
        <Anzeige />
      </VertriebswegProvider>,
    );
    expect(await screen.findByText("Weg: github")).toBeTruthy();
  });
});

describe("Vertriebsweg in der Anwendung", () => {
  it("sucht in der GitHub-Fassung beim Start und zeigt den fälligen Spendenhinweis", async () => {
    vi.mocked(api.vertriebsweg).mockResolvedValueOnce("github");
    render(<Anwendung />);

    await waitFor(() => expect(check).toHaveBeenCalled());
    expect(await screen.findByText(/Gefällt dir Chefsachen/)).toBeTruthy();
    expect(listen).toHaveBeenCalledWith("menue:aktualisierung", expect.any(Function));
  });

  it("sucht in der Store-Fassung nie und bittet nicht um Spenden", async () => {
    vi.mocked(api.vertriebsweg).mockResolvedValueOnce("mac_app_store");
    const { container } = render(<Anwendung />);

    await waitFor(() => expect(api.vertriebsweg).toHaveBeenCalled());
    // Einen Takt warten, damit ein fälschlich gestarteter Effekt Zeit hätte.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(check).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    expect(api.einstellungen.get).not.toHaveBeenCalledWith("spende.naechste_erinnerung");
    expect(container).toBeEmptyDOMElement();
  });
});
