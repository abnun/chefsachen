import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Kontrastprüfung der Farbtoken nach WCAG 2.1.
 *
 * Der Anlass: `--text-leiser` lag bei rund 3,1:1 und wurde für
 * Tabellenköpfe, Belegnummern und Datumszusätze verwendet — also für
 * Inhalte, nicht für Zierrat. Unter AA sind für Text unter 18,66 pt
 * 4,5:1 verlangt.
 *
 * Als Test statt als einmalige Korrektur, weil Farben erfahrungsgemäß
 * nachjustiert werden und ein Auge den Unterschied zwischen 4,6:1 und
 * 4,2:1 nicht zuverlässig erkennt.
 */

// Der Pfad geht vom Projektwurzelverzeichnis aus; unter jsdom ist
// import.meta.url keine Datei-URL.
const TOKENS = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

/** Liest einen Farbwert aus dem hellen oder dunklen Block. */
function token(name: string, modus: "hell" | "dunkel"): string {
  // Der dunkle Block steht in einer @media-Regel; alles davor ist hell.
  const grenze = TOKENS.indexOf("@media (prefers-color-scheme: dark)");
  const bereich = modus === "hell" ? TOKENS.slice(0, grenze) : TOKENS.slice(grenze);
  const treffer = bereich.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!treffer) throw new Error(`Token ${name} im Modus ${modus} nicht gefunden`);
  return treffer[1];
}

/** Relative Helligkeit nach WCAG 2.1, Abschnitt „relative luminance". */
function helligkeit(hex: string): number {
  const kanaele = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = kanaele.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhältnis zweier Farben, zwischen 1:1 und 21:1. */
export function kontrast(vordergrund: string, hintergrund: string): number {
  const a = helligkeit(vordergrund);
  const b = helligkeit(hintergrund);
  const [hell, dunkel] = a > b ? [a, b] : [b, a];
  return (hell + 0.05) / (dunkel + 0.05);
}

/** Textfarben mit dem Untergrund, auf dem sie tatsächlich stehen. */
const PAARE: [string, string, string][] = [
  ["Fließtext auf Fläche", "--text", "--flaeche"],
  ["Fließtext auf Seitenhintergrund", "--text", "--bg"],
  ["Gedämpfter Text auf Fläche", "--text-leise", "--flaeche"],
  // Tabellenköpfe stehen auf dem gedämpften Untergrund, Belegnummern auf der Fläche.
  ["Tabellenkopf", "--text-leise", "--bg-gedaempft"],
  ["Belegnummer", "--text-leise", "--flaeche"],
  ["Fehlermeldung", "--fehler-text", "--fehler-bg"],
  ["Hinweis", "--hinweis-text", "--hinweis-bg"],
];

const AA_NORMALTEXT = 4.5;

describe("Farbkontraste", () => {
  for (const modus of ["hell", "dunkel"] as const) {
    for (const [was, vorne, hinten] of PAARE) {
      it(`${was} erfüllt AA (${modus})`, () => {
        const wert = kontrast(token(vorne, modus), token(hinten, modus));
        expect(
          wert,
          `${vorne} auf ${hinten} (${modus}): ${wert.toFixed(2)}:1, verlangt sind ${AA_NORMALTEXT}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMALTEXT);
      });
    }
  }

  it("führt keine dritte, zu leise Textstufe wieder ein", () => {
    // `--text-leiser` lag bei 2,9:1 auf dem Tabellenkopf und wurde entfernt.
    // Eine Farbe zwischen `--text-leise` und dem Untergrund kann nicht zugleich
    // heller wirken und 4,5:1 erreichen; wer sie wieder einführt, fällt hier auf.
    expect(TOKENS).not.toContain("--text-leiser");
  });
});
