import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
import { invoke } from "@tauri-apps/api/core";
import { api, istValidierungsfehler } from "./api";

// Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
// Ein Test, der Aufrufe zählt, hängt dann an der Reihenfolge und an allem, was
// in den Tests davor geschah — genau so entstand ein Ausfall, der nur in der CI
// auftrat. `clearAllMocks` löscht die Aufrufe, nicht die hinterlegten Antworten.
afterEach(() => vi.clearAllMocks());

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
    expect(invoke).toHaveBeenCalledWith("beleg_list", { typ: null, status: null, suche: null });
  });
  it("ruft beleg_pdf_exportieren per invoke auf", async () => {
    await api.belege.pdfExportieren("b1");
    expect(invoke).toHaveBeenCalledWith("beleg_pdf_exportieren", { id: "b1" });
  });
  it("ruft rechnung_xrechnung_exportieren per invoke auf", async () => {
    await api.belege.xrechnungExportieren("b1");
    expect(invoke).toHaveBeenCalledWith("rechnung_xrechnung_exportieren", { id: "b1" });
  });
  it("ruft rechnung_zugferd_exportieren per invoke auf", async () => {
    await api.belege.zugferdExportieren("b1");
    expect(invoke).toHaveBeenCalledWith("rechnung_zugferd_exportieren", { id: "b1" });
  });
});
