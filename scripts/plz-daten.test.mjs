import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ausZip, eintraegeAusGeonames, kompaktSchreiben } from "./plz-daten.mjs";

/** Eine Zeile im Aufbau von GeoNames DE.txt (12 Spalten, Tabulator). */
function zeile(plz, name, genauigkeit = "4") {
  return ["DE", plz, name, "Land", "XX", "", "", "Kreis", "00000", "50.0", "10.0", genauigkeit].join("\t");
}

describe("eintraegeAusGeonames", () => {
  it("trennt Ortsteile ab, wenn der Wortanfang selbst ein Ort ist", () => {
    const text = [zeile("01067", "Dresden"), zeile("01067", "Dresden Innere Altstadt")].join("\n");
    expect(eintraegeAusGeonames(text)).toEqual([
      { plz: "01067", ort: "Dresden", ortsteil: "" },
      { plz: "01067", ort: "Dresden", ortsteil: "Innere Altstadt" },
    ]);
  });

  it("lässt Namenszusätze in Klammern und Kleinschreibung am Ort", () => {
    const text = [
      zeile("15230", "Frankfurt"),
      zeile("15230", "Frankfurt (Oder)"),
      zeile("66885", "Steinbach"),
      zeile("66885", "Steinbach am Glan"),
    ].join("\n");
    const orte = eintraegeAusGeonames(text).map((e) => e.ort);
    expect(orte).toContain("Frankfurt (Oder)");
    expect(orte).toContain("Steinbach am Glan");
  });

  it("nimmt Großkunden ohne Genauigkeitsangabe heraus, behält aber die PLZ", () => {
    const text = [zeile("10877", "Commerzbank AG", ""), zeile("01968", "Schipkau Hörlitz", "")].join("\n");
    expect(eintraegeAusGeonames(text)).toEqual([
      { plz: "01968", ort: "Schipkau Hörlitz", ortsteil: "" },
      { plz: "10877", ort: "", ortsteil: "" },
    ]);
  });

  it("behält Orte mit Genauigkeit, auch wenn der Name einem Muster ähnelt", () => {
    expect(eintraegeAusGeonames(zeile("71263", "Weil der Stadt"))).toEqual([
      { plz: "71263", ort: "Weil der Stadt", ortsteil: "" },
    ]);
  });
});

describe("kompaktSchreiben", () => {
  it("schreibt Abstände in Basis 36, Ortsteile und Wiederholungen kurz", () => {
    const text = kompaktSchreiben(
      [
        { plz: "01067", ort: "Dresden", ortsteil: "" },
        { plz: "01067", ort: "Dresden", ortsteil: "Innere Altstadt" },
        { plz: "01069", ort: "Dresden", ortsteil: "" },
        { plz: "01070", ort: "Dresden", ortsteil: "" },
        { plz: "01968", ort: "Schipkau", ortsteil: "Hörlitz" },
        { plz: "10877", ort: "", ortsteil: "" },
      ],
      ["Kopf"],
    );
    expect(text).toBe(
      ["# Kopf", "tn\tDresden|>Innere Altstadt", "2\tDresden", "1", "oy\tSchipkau>Hörlitz", "6vh\t", ""].join("\n"),
    );
  });
});

describe("ausZip", () => {
  it("holt eine gepackte Datei aus einem Archiv", () => {
    const inhalt = Buffer.from("DE\t01067\tDresden\n");
    const gepackt = deflateRawSync(inhalt);
    const name = Buffer.from("DE.txt");
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(8, 8);
    lokal.writeUInt32LE(gepackt.length, 18);
    lokal.writeUInt32LE(inhalt.length, 22);
    lokal.writeUInt16LE(name.length, 26);
    const zentral = Buffer.alloc(46);
    zentral.writeUInt32LE(0x02014b50, 0);
    zentral.writeUInt16LE(8, 10);
    zentral.writeUInt32LE(gepackt.length, 20);
    zentral.writeUInt32LE(inhalt.length, 24);
    zentral.writeUInt16LE(name.length, 28);
    zentral.writeUInt32LE(0, 42);
    const zentralStart = lokal.length + name.length + gepackt.length;
    const ende = Buffer.alloc(22);
    ende.writeUInt32LE(0x06054b50, 0);
    ende.writeUInt16LE(1, 8);
    ende.writeUInt16LE(1, 10);
    ende.writeUInt32LE(zentral.length + name.length, 12);
    ende.writeUInt32LE(zentralStart, 16);
    const zip = Buffer.concat([lokal, name, gepackt, zentral, name, ende]);
    expect(ausZip(zip, "DE.txt").toString("utf8")).toBe(inhalt.toString("utf8"));
  });
});
