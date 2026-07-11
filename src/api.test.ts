import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
import { invoke } from "@tauri-apps/api/core";
import { api, istValidierungsfehler } from "./api";

describe("api", () => {
  it("ruft einheit_list per invoke auf", async () => {
    await api.einheiten.list();
    expect(invoke).toHaveBeenCalledWith("einheit_list");
  });
  it("erkennt Validierungsfehler", () => {
    expect(istValidierungsfehler({ typ: "validation", feld: "name", meldung: "x" })).toBe(true);
    expect(istValidierungsfehler({ typ: "technisch", meldung: "x" })).toBe(false);
  });
  it("ruft beleg_list per invoke auf", async () => {
    await api.belege.list();
    expect(invoke).toHaveBeenCalledWith("beleg_list", { typ: null, status: null });
  });
});
