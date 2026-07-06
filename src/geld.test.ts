import { describe, expect, it } from "vitest";
import { formatCent, parseEuro } from "./geld";

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
