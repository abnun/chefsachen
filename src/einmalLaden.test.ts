import { afterEach, describe, expect, it, vi } from "vitest";

const protokollFehler = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/plugin-log", () => ({ error: (...a: unknown[]) => protokollFehler(...a) }));

import { einmalLaden } from "./einmalLaden";

afterEach(() => {
  vi.clearAllMocks();
});

describe("einmalLaden", () => {
  it("lädt nur einmal und gibt danach dasselbe Ergebnis", async () => {
    const laden = vi.fn().mockResolvedValue("liste");
    const holen = einmalLaden("Testliste", laden);
    expect(await holen()).toBe("liste");
    expect(await holen()).toBe("liste");
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it("versucht es nach einem Fehlschlag beim nächsten Aufruf erneut", async () => {
    // Ein einmaliger Ladefehler galt sonst bis zum Neustart: Das abgelehnte
    // Promise blieb gemerkt, und jedes weitere Formular bekam es wieder.
    const laden = vi.fn().mockRejectedValueOnce(new Error("weg")).mockResolvedValueOnce("liste");
    const holen = einmalLaden("Testliste", laden);
    await expect(holen()).rejects.toThrow("weg");
    expect(await holen()).toBe("liste");
    expect(laden).toHaveBeenCalledTimes(2);
  });

  it("schreibt den Fehlschlag ins Protokoll, statt ihn zu verschlucken", async () => {
    const holen = einmalLaden("Testliste", () => Promise.reject(new Error("Datei fehlt")));
    await expect(holen()).rejects.toThrow();
    expect(protokollFehler).toHaveBeenCalledTimes(1);
    expect(protokollFehler.mock.calls[0][0]).toMatch(/Testliste.*Datei fehlt/s);
  });

  it("teilt einen laufenden Ladevorgang zwischen gleichzeitigen Aufrufen", async () => {
    const laden = vi.fn().mockResolvedValue("liste");
    const holen = einmalLaden("Testliste", laden);
    const [a, b] = await Promise.all([holen(), holen()]);
    expect([a, b]).toEqual(["liste", "liste"]);
    expect(laden).toHaveBeenCalledTimes(1);
  });
});
