import { describe, expect, it } from "vitest";
import { zuCsv } from "./csv";

describe("zuCsv", () => {
  it("trennt Felder mit Semikolon", () => {
    // Deutsches Excel liest eine Zahlenspalte mit Komma als Trenner sonst als
    // eine einzige Textspalte ein — das Komma ist dort der Dezimaltrenner.
    const csv = zuCsv(["Datum", "Betrag"], [["01.01.2026", "95,50"]]);
    expect(csv).toContain("Datum;Betrag");
    expect(csv).toContain("01.01.2026;95,50");
  });

  it("beginnt mit einem Byte Order Mark", () => {
    // Ohne das hält Excel eine UTF-8-Datei mit Umlauten für eine andere
    // Kodierung und zeigt „MÃ¼ller" statt „Müller".
    const csv = zuCsv(["Kunde"], [["Müller"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("schützt ein Feld mit Semikolon in Anführungszeichen", () => {
    const csv = zuCsv(["Kunde"], [["Müller & Schmidt; GbR"]]);
    expect(csv).toContain('"Müller & Schmidt; GbR"');
  });

  it("verdoppelt Anführungszeichen innerhalb eines geschützten Felds", () => {
    const csv = zuCsv(["Kunde"], [['Der "Meister" GmbH']]);
    expect(csv).toContain('"Der ""Meister"" GmbH"');
  });

  it("schützt ein Feld mit Zeilenumbruch", () => {
    const csv = zuCsv(["Notiz"], [["Zeile eins\nZeile zwei"]]);
    expect(csv).toContain('"Zeile eins\nZeile zwei"');
  });

  it("lässt ein unauffälliges Feld unverändert", () => {
    const csv = zuCsv(["Kunde"], [["ACME GmbH"]]);
    expect(csv).toContain("ACME GmbH");
    expect(csv).not.toContain('"ACME GmbH"');
  });

  it("endet jede Zeile mit CRLF", () => {
    // Windows-Zeilenumbrüche sind für Excel und für die Zielplattform der
    // meisten Steuerberater-Software die sicherere Wahl.
    const csv = zuCsv(["a"], [["1"], ["2"]]);
    expect(csv).toMatch(/a\r\n1\r\n2\r\n$/);
  });

  it("kommt ohne Datenzeilen zurecht", () => {
    const csv = zuCsv(["Datum", "Betrag"], []);
    expect(csv).toContain("Datum;Betrag");
  });
});
