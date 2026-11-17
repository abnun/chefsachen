import { describe, expect, it, vi } from "vitest";
import { datumDeutsch, datumDeutschOder, datumPlusTage, heuteIso } from "./datum";

describe("datumDeutsch", () => {
  it("wandelt ISO in die deutsche Schreibweise", () => {
    expect(datumDeutsch("2026-09-01")).toBe("01.09.2026");
    expect(datumDeutsch("2026-12-31")).toBe("31.12.2026");
  });

  /// Ein unerwartetes Format ist kein Grund, die Anzeige scheitern zu lassen.
  it("lässt unerwartete Eingaben unverändert", () => {
    expect(datumDeutsch("")).toBe("");
    expect(datumDeutsch("01.09.2026")).toBe("01.09.2026");
    expect(datumDeutsch("2026-09")).toBe("2026-09");
    expect(datumDeutsch("26-09-01")).toBe("26-09-01");
  });

  it("ersetzt leere Werte durch den angegebenen Text", () => {
    expect(datumDeutschOder(null, "—")).toBe("—");
    expect(datumDeutschOder(undefined, "immer")).toBe("immer");
    expect(datumDeutschOder("", "—")).toBe("—");
    expect(datumDeutschOder("2026-09-01", "—")).toBe("01.09.2026");
  });

  it("liefert heute im vergleichbaren ISO-Format", () => {
    expect(heuteIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rechnet heute in Ortszeit, nicht in UTC", () => {
    // Kurz vor Mitternacht Ortszeit: toISOString() wäre östlich von UTC schon
    // der Folgetag — das Frontend zeigte dann Knöpfe (Zahlungserinnerung),
    // die das in Ortszeit rechnende Backend ablehnt.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 7, 4, 23, 30));
      expect(heuteIso()).toBe("2026-08-04");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("datumPlusTage", () => {
  it("rechnet über Monats- und Jahresgrenzen", () => {
    expect(datumPlusTage("2026-07-10", 30)).toBe("2026-08-09");
    expect(datumPlusTage("2026-12-15", 30)).toBe("2027-01-14");
    expect(datumPlusTage("2026-02-20", 10)).toBe("2026-03-02");
  });

  it("bleibt über die Zeitumstellung exakt", () => {
    // Umstellung am 25.10.2026 (Tag mit 25 Stunden) und am 29.03.2026.
    expect(datumPlusTage("2026-10-24", 2)).toBe("2026-10-26");
    expect(datumPlusTage("2026-03-28", 2)).toBe("2026-03-30");
  });

  it("gibt bei 0 Tagen dasselbe Datum zurück und null bei unlesbarer Eingabe", () => {
    expect(datumPlusTage("2026-07-10", 0)).toBe("2026-07-10");
    expect(datumPlusTage("", 30)).toBeNull();
    expect(datumPlusTage("morgen", 30)).toBeNull();
  });
});
