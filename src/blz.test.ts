import { describe, expect, it } from "vitest";
import blzDatei from "./daten/blz-bic.txt?raw";
import { bicZurIban, blzDatenLesen } from "./blz";

describe("blzDatenLesen", () => {
  it("liest Abstände in Basis 36 und übernimmt den vorigen BIC bei leerer Zeile", () => {
    const v = blzDatenLesen(["# Kopf", "5yjru\tPBNKDEFFXXX", "1", "2h\tTESTDEB1XXX", ""].join("\n"));
    expect(v.get("10010010")).toBe("PBNKDEFFXXX");
    expect(v.get("10010011")).toBe("PBNKDEFFXXX");
    expect(v.get("10010100")).toBe("TESTDEB1XXX");
    expect(v.size).toBe(3);
  });
});

describe("bicZurIban", () => {
  const v = blzDatenLesen(["5yjru\tPBNKDEFFXXX", ""].join("\n"));

  it("nimmt die BLZ aus Stelle 5 bis 12 einer deutschen IBAN", () => {
    // Prüfziffer passend zu BLZ 10010010, Konto 0000000001.
    expect(bicZurIban(v, "DE36 1001 0010 0000 0000 01")).toBe("PBNKDEFFXXX");
  });

  it("liefert nichts bei unbekannter BLZ, anderem Land oder falscher Prüfziffer", () => {
    expect(bicZurIban(v, "DE02 1203 0000 0000 2020 51")).toBeNull();
    expect(bicZurIban(v, "AT61 1904 3002 3457 3201")).toBeNull();
    expect(bicZurIban(v, "DE37 1001 0010 0000 0000 01")).toBeNull();
    expect(bicZurIban(v, "DE36 1001 0010")).toBeNull();
  });
});

describe("mitgelieferte Zuordnung", () => {
  const text = blzDatei;
  const v = blzDatenLesen(text);

  it("kennt bekannte Banken mit ihrem BIC", () => {
    expect(v.get("12030000")).toBe("BYLADEM1001");
    expect(v.get("50010517")).toBe("INGDDEFFXXX");
    expect(v.get("10010010")).toBe("PBNKDEFFXXX");
  });

  it("nennt die Quelle im Kopf und bleibt klein", () => {
    expect(text).toMatch(/^# .*\n# Quelle: Deutsche Bundesbank/);
    expect(new TextEncoder().encode(text).length).toBeLessThan(150 * 1024);
    expect(v.size).toBeGreaterThan(3000);
  });
});
