import { describe, expect, it } from "vitest";
import { formatCent, formatCentMitWaehrung, formatMenge, parseEuro, parseMenge } from "./geld";

describe("parseEuro", () => {
  it("parst zwei Nachkommastellen", () => {
    expect(parseEuro("95,50")).toBe(9550);
  });
  it("parst ganze Euro ohne Komma", () => {
    expect(parseEuro("95")).toBe(9500);
  });
  it("parst eine Nachkommastelle als Zehntel", () => {
    expect(parseEuro("95,5")).toBe(9550);
  });
  it("parst Tausenderpunkt", () => {
    expect(parseEuro("1.095,50")).toBe(109550);
  });
  it("lehnt leere Eingabe ab", () => {
    expect(parseEuro("")).toBeNull();
  });
  it("lehnt nicht-numerische Eingabe ab", () => {
    expect(parseEuro("abc")).toBeNull();
  });
  it("lehnt mehr als zwei Nachkommastellen ab", () => {
    expect(parseEuro("95,555")).toBeNull();
  });
});

describe("formatCent", () => {
  it("formatiert Cent als deutschen Euro-Betrag", () => {
    expect(formatCent(9550)).toBe("95,50 €");
  });
});

describe("formatCentMitWaehrung", () => {
  it("zeigt bei EUR das €-Zeichen wie formatCent", () => {
    expect(formatCentMitWaehrung(9550, "EUR")).toBe("95,50 €");
  });
  it("hängt bei anderen Währungen den ISO-Code statt € an", () => {
    expect(formatCentMitWaehrung(9550, "USD")).toBe("95,50 USD");
    expect(formatCentMitWaehrung(9550, "CHF")).toBe("95,50 CHF");
  });
});

describe("parseMenge", () => {
  it("parst ganze und Komma-Mengen", () => {
    expect(parseMenge("2")).toBe(2000);
    expect(parseMenge("2,5")).toBe(2500);
    expect(parseMenge("1,333")).toBe(1333);
  });
  it("lehnt ungültige Eingaben ab", () => {
    expect(parseMenge("")).toBeNull();
    expect(parseMenge("abc")).toBeNull();
    expect(parseMenge("1,2345")).toBeNull();
  });
});

describe("formatMenge", () => {
  it("formatiert Tausendstel als deutsche Dezimalzahl", () => {
    expect(formatMenge(2500)).toBe("2,5");
    expect(formatMenge(1000)).toBe("1");
    expect(formatMenge(1333)).toBe("1,333");
  });
});
