import { describe, expect, it } from "vitest";
import { downloadAdresse, kompaktSchreiben, zuordnungAusBundesbank } from "./blz-daten.mjs";

/**
 * Ein Datensatz im Aufbau der Bankleitzahlendatei (feste Spaltenbreiten,
 * 168 Zeichen): BLZ 1-8, Merkmal 9, Bezeichnung 10-67, PLZ 68-72, Ort 73-107,
 * Kurzbezeichnung 108-134, PAN 135-139, BIC 140-150, danach Prüfziffer-
 * methode, Datensatznummer, Änderungskennzeichen, Löschung, Nachfolge-BLZ.
 */
function satz(blz, merkmal, bic, bezeichnung = "Testbank") {
  return [
    blz,
    merkmal,
    bezeichnung.padEnd(58),
    "10115",
    "Berlin".padEnd(35),
    bezeichnung.padEnd(27),
    "12345",
    bic.padEnd(11),
    "09",
    "000001",
    "U",
    "0",
    "00000000",
  ].join("");
}

describe("zuordnungAusBundesbank", () => {
  it("liest BLZ und BIC an den festen Spaltenpositionen", () => {
    const text = [satz("12030000", "1", "BYLADEM1001"), satz("50010517", "1", "INGDDEFFXXX")].join("\r\n");
    expect(zuordnungAusBundesbank(text)).toEqual([
      { blz: "12030000", bic: "BYLADEM1001" },
      { blz: "50010517", bic: "INGDDEFFXXX" },
    ]);
  });

  it("nimmt je BLZ den BIC der Hauptstelle, nicht den einer Filiale", () => {
    // Die Deutsche Bank führt unter einer BLZ Dutzende Filial-BIC. Gemeint
    // ist für eine Überweisung der BIC des Datensatzes mit Merkmal 1.
    const text = [
      satz("12070000", "2", "DEUTDEBB161"),
      satz("12070000", "1", "DEUTDEBB160"),
      satz("12070000", "2", "DEUTDEBB162"),
    ].join("\n");
    expect(zuordnungAusBundesbank(text)).toEqual([{ blz: "12070000", bic: "DEUTDEBB160" }]);
  });

  it("greift auf eine Filiale zurück, wenn die Hauptstelle keinen BIC hat", () => {
    const text = [satz("70000000", "1", ""), satz("70000000", "2", "TESTDEM1XXX")].join("\n");
    expect(zuordnungAusBundesbank(text)).toEqual([{ blz: "70000000", bic: "TESTDEM1XXX" }]);
  });

  it("lässt Bankleitzahlen ohne jeden BIC weg", () => {
    const text = [satz("60050009", "1", ""), satz("60050009", "2", "")].join("\n");
    expect(zuordnungAusBundesbank(text)).toEqual([]);
  });

  it("sortiert nach BLZ, auch wenn die Datei es nicht täte", () => {
    const text = [satz("50010517", "1", "INGDDEFFXXX"), satz("10010010", "1", "PBNKDEFFXXX")].join("\n");
    expect(zuordnungAusBundesbank(text).map((e) => e.blz)).toEqual(["10010010", "50010517"]);
  });
});

describe("kompaktSchreiben", () => {
  it("schreibt Abstände in Basis 36 und lässt einen wiederholten BIC weg", () => {
    const text = kompaktSchreiben(
      [
        { blz: "10010010", bic: "PBNKDEFFXXX" },
        { blz: "10010011", bic: "PBNKDEFFXXX" },
        { blz: "10010100", bic: "TESTDEB1XXX" },
      ],
      ["Kopf"],
    );
    expect(text).toBe(["# Kopf", "5yjru\tPBNKDEFFXXX", "1", "2h\tTESTDEB1XXX", ""].join("\n"));
  });
});

describe("downloadAdresse", () => {
  it("findet die aktuelle TXT-Datei auf der Seite der Bundesbank", () => {
    // Die Adresse enthält Kennungen, die mit jedem Stand wechseln. Fest
    // eingetragen, läge das Skript nach einem Quartal daneben.
    const html =
      '<a href="/resource/blob/1/aa/BB/blz-neu-txt-data.txt">neu</a>' +
      '<a href="/resource/blob/602632/3a97/472B/blz-aktuell-txt-data.txt">aktuell</a>';
    expect(downloadAdresse(html)).toBe("https://www.bundesbank.de/resource/blob/602632/3a97/472B/blz-aktuell-txt-data.txt");
  });

  it("bricht ab, wenn die Seite keine passende Datei nennt", () => {
    expect(() => downloadAdresse("<html></html>")).toThrow(/nicht gefunden/);
  });
});
