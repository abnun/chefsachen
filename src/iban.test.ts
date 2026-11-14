import { describe, expect, it } from "vitest";
import { ibanBefund, ibanGruppieren, ibanKompakt, ibanPruefsummeStimmt, IBAN_LAENGEN } from "./iban";

describe("ibanKompakt", () => {
  it("entfernt Leerzeichen und macht Großbuchstaben", () => {
    expect(ibanKompakt(" de02 1203 0000 0000 2020 51 ")).toBe("DE02120300000000202051");
  });

  it("verträgt eingefügte Trennzeichen aus Briefen und Webseiten", () => {
    expect(ibanKompakt("DE02-1203-0000.0000 2020 51")).toBe("DE02120300000000202051");
  });
});

describe("ibanGruppieren", () => {
  it("setzt nach je vier Zeichen ein Leerzeichen, ohne eins am Ende", () => {
    expect(ibanGruppieren("DE02120300000000202051")).toBe("DE02 1203 0000 0000 2020 51");
    expect(ibanGruppieren("de021203")).toBe("DE02 1203");
    expect(ibanGruppieren("")).toBe("");
  });
});

describe("ibanPruefsummeStimmt", () => {
  it("nimmt gültige Beispiel-IBANs mehrerer Länder an", () => {
    for (const iban of [
      "DE02120300000000202051",
      "AT611904300234573201",
      "CH9300762011623852957",
      "NL91ABNA0417164300",
      "BE68539007547034",
      "FR1420041010050500013M02606",
      "IT60X0542811101000000123456",
      "ES9121000418450200051332",
      "LU280019400644750000",
    ]) {
      expect(ibanPruefsummeStimmt(iban), iban).toBe(true);
    }
  });

  it("erkennt einen Zahlendreher", () => {
    expect(ibanPruefsummeStimmt("DE02120300000000202015")).toBe(false);
  });
});

describe("IBAN_LAENGEN", () => {
  it("kennt mindestens die Länder aus der Spezifikation", () => {
    expect(IBAN_LAENGEN).toMatchObject({ DE: 22, AT: 20, CH: 21, NL: 18, BE: 16, FR: 27, IT: 27, ES: 24, LU: 20 });
  });
});

describe("ibanBefund", () => {
  it("meldet nichts, solange getippt wird", () => {
    expect(ibanBefund("")).toBe("leer");
    expect(ibanBefund("DE02 1203")).toBe("unvollstaendig");
  });

  it("meldet eine vollständige IBAN als gültig oder mit falscher Prüfziffer", () => {
    expect(ibanBefund("DE02 1203 0000 0000 2020 51")).toBe("gueltig");
    expect(ibanBefund("DE02 1203 0000 0000 2020 15")).toBe("pruefziffer");
  });

  it("meldet eine zu lange IBAN eines bekannten Landes", () => {
    expect(ibanBefund("DE02 1203 0000 0000 2020 512")).toBe("zu-lang");
  });

  it("prüft bei einem unbekannten Land erst, wenn nichts mehr kommen kann", () => {
    // Ohne bekannte Länge lässt sich nicht sagen, wann die Eingabe fertig ist.
    // Eine Prüfziffer, die vor dem letzten Zeichen falsch ist, wäre kein Befund.
    expect(ibanBefund("GR16 0110 1250 0000 0001 2300 695")).toBe("unvollstaendig");
  });
});
