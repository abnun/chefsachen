import { describe, expect, it } from "vitest";
import plzDatei from "./daten/plz-de.txt?raw";
import {
  istDeutschland,
  orteZurPlz,
  ortVorschlaege,
  plzBekannt,
  plzDatenLesen,
  vorschlagText,
} from "./plz";

/**
 * Ausschnitt im Format von scripts/plz-daten.mjs. Abstände in Basis 36:
 * 01067 = „tn", danach +2 = 01069, +1 = 01070 (nur Abstand: dieselben Orte
 * wie die vorige Zeile), dann 15848 mit mehreren Orten und eine
 * Großkunden-PLZ ohne Ort.
 */
const BEISPIEL = [
  "# Kopfzeile wird übersprungen",
  "tn\tDresden|>Friedrichstadt|>Innere Altstadt",
  "2\tDresden",
  "1",
  `${(15848 - 1070).toString(36)}\tBeeskow|Rietz-Neuendorf>Ahrensdorf|Tauche`,
  `${(15849 - 15848).toString(36)}\t`,
  `${(74076 - 15849).toString(36)}\tHeilbronn`,
  `${(74172 - 74076).toString(36)}\tNeckarsulm`,
].join("\n");

describe("plzDatenLesen", () => {
  const v = plzDatenLesen(BEISPIEL);

  it("liest Abstände, Ortsteile und Wiederholungen", () => {
    expect(orteZurPlz(v, "01067")).toEqual(["Dresden"]);
    expect(orteZurPlz(v, "01069")).toEqual(["Dresden"]);
    expect(orteZurPlz(v, "01070")).toEqual(["Dresden"]);
    expect(orteZurPlz(v, "15848")).toEqual(["Beeskow", "Rietz-Neuendorf", "Tauche"]);
  });

  it("kennt eine Großkunden-PLZ, ohne ihr einen Ort zuzuschreiben", () => {
    expect(plzBekannt(v, "15849")).toBe(true);
    expect(orteZurPlz(v, "15849")).toEqual([]);
  });

  it("weiß, welche PLZ es nicht gibt", () => {
    expect(plzBekannt(v, "99999")).toBe(false);
    expect(plzBekannt(v, "0106")).toBe(false);
  });
});

describe("ortVorschlaege", () => {
  const v = plzDatenLesen(BEISPIEL);

  it("schlägt ab zwei Zeichen Orte vor, Groß- und Kleinschreibung egal", () => {
    expect(ortVorschlaege(v, "h")).toEqual([]);
    const liste = ortVorschlaege(v, "he");
    expect(liste.map(vorschlagText)).toEqual(["Heilbronn (74076)"]);
    expect(liste[0]).toMatchObject({ ort: "Heilbronn", plz: "74076" });
  });

  it("fasst einen Ort mit mehreren PLZ zusammen und lässt die PLZ dann offen", () => {
    const liste = ortVorschlaege(v, "dres");
    expect(liste[0]).toMatchObject({ ort: "Dresden", ortsteil: "", plz: "" });
    expect(vorschlagText(liste[0])).toBe("Dresden (mehrere PLZ)");
  });

  it("findet Ortsteile und nennt sie mit Ort und PLZ", () => {
    const liste = ortVorschlaege(v, "inne");
    expect(liste.map(vorschlagText)).toEqual(["Dresden, Innere Altstadt (01067)"]);
    expect(liste[0]).toMatchObject({ ort: "Dresden", ortsteil: "Innere Altstadt", plz: "01067" });
  });

  it("findet Umlaute auch in Umschreibung", () => {
    const v2 = plzDatenLesen("1ekr\tMünchen");
    expect(ortVorschlaege(v2, "muen").map((o) => o.ort)).toEqual(["München"]);
  });

  it("grenzt auf eine schon eingetragene PLZ ein", () => {
    const liste = ortVorschlaege(v, "dr", "01069");
    expect(liste.map(vorschlagText)).toEqual(["Dresden (01069)"]);
  });

  it("bietet alle Orte einer PLZ an, wenn der Ort noch leer ist", () => {
    const liste = ortVorschlaege(v, "", "15848");
    expect(liste.map(vorschlagText)).toEqual([
      "Beeskow (15848)",
      "Rietz-Neuendorf (15848)",
      "Tauche (15848)",
    ]);
  });

  it("sucht ohne PLZ-Grenze weiter, wenn darin nichts passt", () => {
    expect(ortVorschlaege(v, "heil", "01067").map((o) => o.ort)).toEqual(["Heilbronn"]);
  });

  it("stellt bei gleicher Passung größere Orte (mehr PLZ) nach vorn", () => {
    const v2 = plzDatenLesen(["1\tHeilbach", "1\tHeilbronn", "1\tHeilbronn"].join("\n"));
    expect(ortVorschlaege(v2, "heil").map((o) => o.ort)).toEqual(["Heilbronn", "Heilbach"]);
  });

  it("begrenzt die Liste", () => {
    const viele = plzDatenLesen(
      Array.from({ length: 20 }, (_, i) => `1\tOrt${String(i).padStart(2, "0")}`).join("\n"),
    );
    expect(ortVorschlaege(viele, "or")).toHaveLength(8);
  });
});

describe("istDeutschland", () => {
  it("nimmt leere Angabe, DE und Deutschland als Deutschland", () => {
    expect(istDeutschland("")).toBe(true);
    expect(istDeutschland("DE")).toBe(true);
    expect(istDeutschland(" de ")).toBe(true);
    expect(istDeutschland("Deutschland")).toBe(true);
    expect(istDeutschland("AT")).toBe(false);
  });
});

describe("mitgelieferte Liste", () => {
  const v = plzDatenLesen(plzDatei);

  it("kennt Stichproben aus allen Teilen Deutschlands", () => {
    expect(orteZurPlz(v, "01067")).toEqual(["Dresden"]);
    expect(orteZurPlz(v, "10115")).toEqual(["Berlin"]);
    expect(orteZurPlz(v, "20095")).toEqual(["Hamburg"]);
    expect(orteZurPlz(v, "74076")).toEqual(["Heilbronn"]);
    expect(orteZurPlz(v, "80331")).toEqual(["München"]);
  });

  it("führt Großkunden nicht als Ort", () => {
    // 10877 ist eine Großkunden-PLZ der Commerzbank.
    expect(orteZurPlz(v, "10877")).toEqual([]);
    expect(plzBekannt(v, "10877")).toBe(true);
  });

  it("bleibt klein genug für das Bündel", () => {
    expect(new TextEncoder().encode(plzDatei).length).toBeLessThan(300_000);
  });
});
