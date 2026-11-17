import { describe, expect, it } from "vitest";
import { zahlungszielAusEinstellung } from "./zahlungsziel";

describe("zahlungszielAusEinstellung", () => {
  it("liest gültige Werte, auch 0 für sofort", () => {
    expect(zahlungszielAusEinstellung("30")).toBe(30);
    expect(zahlungszielAusEinstellung("0")).toBe(0);
    expect(zahlungszielAusEinstellung(" 7 ")).toBe(7);
  });

  it("nimmt 14 Tage, wenn nichts oder Unbrauchbares gespeichert ist", () => {
    expect(zahlungszielAusEinstellung(null)).toBe(14);
    expect(zahlungszielAusEinstellung("")).toBe(14);
    expect(zahlungszielAusEinstellung("bald")).toBe(14);
    expect(zahlungszielAusEinstellung("-3")).toBe(14);
  });
});
