import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Kontrastprüfung der Farbtoken nach WCAG 2.1.
 *
 * Der Anlass: `--text-leiser` lag bei rund 3,1:1 und wurde für
 * Tabellenköpfe, Belegnummern und Datumszusätze verwendet, also für
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

/** Farbe als sRGB-Kanäle zwischen 0 und 1, dazu die Deckkraft. */
interface Farbe {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Liest den Rohwert eines Tokens aus dem hellen oder dunklen Block. */
function token(name: string, modus: "hell" | "dunkel"): string {
  // Der dunkle Block steht in einer @media-Regel; alles davor ist hell.
  const grenze = TOKENS.indexOf("@media (prefers-color-scheme: dark)");
  const bereich = modus === "hell" ? TOKENS.slice(0, grenze) : TOKENS.slice(grenze);
  const treffer = bereich.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6}|oklch\\([^)]*\\))`));
  if (!treffer) throw new Error(`Token ${name} im Modus ${modus} nicht gefunden`);
  return treffer[1];
}

/** Lineares Licht nach sRGB-Kodierung; Werte außerhalb werden abgeschnitten. */
function srgbKodieren(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/**
 * OKLCH → OKLab → lineares sRGB → sRGB, nach Björn Ottosson.
 *
 * Abgeschnitten wird erst am Ende, wie es auch der Browser beim Zeichnen
 * tut: Eine Farbe außerhalb des sRGB-Raums erscheint als nächstliegende
 * darstellbare, und an der muss sich der Kontrast messen lassen.
 */
export function oklchNachSrgb(l: number, c: number, h: number): [number, number, number] {
  const winkel = (h * Math.PI) / 180;
  const a = c * Math.cos(winkel);
  const b = c * Math.sin(winkel);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    srgbKodieren(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    srgbKodieren(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    srgbKodieren(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/** Versteht `#rrggbb` und `oklch(L C H)` bzw. `oklch(L C H / a)`. */
export function farbeLesen(wert: string): Farbe {
  if (wert.startsWith("#")) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(wert.slice(i, i + 2), 16) / 255);
    return { r, g, b, a: 1 };
  }
  const teile = wert.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)/);
  if (!teile) throw new Error(`Unbekanntes Farbformat: ${wert}`);
  const [r, g, b] = oklchNachSrgb(Number(teile[1]), Number(teile[2]), Number(teile[3]));
  return { r, g, b, a: teile[4] === undefined ? 1 : Number(teile[4]) };
}

/** Legt eine (teil)durchsichtige Farbe auf eine deckende, wie der Browser. */
function ueberlagern(oben: Farbe, unten: Farbe): Farbe {
  const misch = (o: number, u: number) => o * oben.a + u * (1 - oben.a);
  return { r: misch(oben.r, unten.r), g: misch(oben.g, unten.g), b: misch(oben.b, unten.b), a: 1 };
}

/** Relative Helligkeit nach WCAG 2.1, Abschnitt „relative luminance". */
function helligkeit({ r, g, b }: Farbe): number {
  const [rl, gl, bl] = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** Kontrastverhältnis zweier Farben, zwischen 1:1 und 21:1. */
export function kontrast(vordergrund: string, hintergrund: string, unterlage?: string): number {
  // Eine durchscheinende Fläche (die Auswahl) zählt erst mit dem, was unter
  // ihr liegt; ohne Angabe ist das die Inhaltsfläche.
  const grund = farbeLesen(unterlage ?? "#ffffff");
  const hinten = ueberlagern(farbeLesen(hintergrund), grund);
  const vorne = ueberlagern(farbeLesen(vordergrund), hinten);
  const a = helligkeit(vorne);
  const b = helligkeit(hinten);
  const [hell, dunkel] = a > b ? [a, b] : [b, a];
  return (hell + 0.05) / (dunkel + 0.05);
}

/**
 * Textfarben mit dem Untergrund, auf dem sie tatsächlich stehen. Ein
 * optionales viertes Token ist die Fläche unter einem durchscheinenden
 * Untergrund.
 */
const PAARE: [string, string, string, string?][] = [
  ["Fließtext auf Fläche", "--text", "--flaeche"],
  ["Fließtext auf Seitenhintergrund", "--text", "--bg"],
  ["Gedämpfter Text auf Fläche", "--text-leise", "--flaeche"],
  ["Gedämpfter Text auf Inhaltsfläche", "--text-leise", "--bg"],
  // Tabellenköpfe und Zebrazeilen stehen auf dem gedämpften Untergrund.
  ["Tabellenkopf", "--text-leise", "--bg-gedaempft"],
  ["Gedämpfter Text auf Zebrazeile", "--text-leise", "--zebra"],
  ["Belegnummer", "--text-leise", "--flaeche"],
  ["Belegnummer auf Zebrazeile", "--text", "--zebra"],
  ["Text auf Seitenleiste", "--text", "--seitenleiste"],
  ["Gedämpfter Text auf Seitenleiste", "--text-leise", "--seitenleiste"],
  ["Text auf Auswahl in der Seitenleiste", "--text", "--akzent-leise", "--seitenleiste"],
  ["Gedämpfter Text auf Formulargruppe", "--text-leise", "--gruppe"],
  ["Akzent-Text auf Inhaltsfläche", "--akzent", "--bg"],
  ["Akzent-Text auf Seitenleiste", "--akzent", "--seitenleiste"],
  ["Schrift auf Akzentfläche", "--auf-akzent", "--akzent-flaeche"],
  ["Schrift auf Akzentfläche (Hover)", "--auf-akzent", "--akzent-flaeche-hover"],
  // Vorschlagsliste der Adressfelder: Zusatz (PLZ) leise, aktive Zeile in Akzent.
  ["Vorschlagsliste: Zusatz", "--text-leise", "--flaeche"],
  ["Vorschlagsliste: aktive Zeile", "--auf-akzent", "--akzent-flaeche"],
  ["Fehlermeldung", "--fehler-text", "--fehler-bg"],
  ["Fehlertext auf Inhaltsfläche", "--fehler-text", "--bg"],
  ["Hinweis", "--hinweis-text", "--hinweis-bg"],
  ["Warnung auf Inhaltsfläche", "--warnung-text", "--bg"],
  ["Erfolg auf Inhaltsfläche", "--erfolg-text", "--bg"],
  ["Statusmarke Entwurf", "--st-entwurf-text", "--st-entwurf-bg"],
  ["Statusmarke gestellt", "--st-gestellt-text", "--st-gestellt-bg"],
  ["Statusmarke bezahlt", "--st-bezahlt-text", "--st-bezahlt-bg"],
  ["Statusmarke storniert", "--st-storniert-text", "--st-storniert-bg"],
  ["Statusmarke Warnung", "--st-warnung-text", "--st-warnung-bg"],
  ["Kundenpreis günstiger", "--preis-guenstiger-text", "--preis-guenstiger-bg"],
  ["Kundenpreis teurer", "--preis-teurer-text", "--preis-teurer-bg"],
  ["Gefahr-Knopf", "--st-storniert-text", "--flaeche"],
];

const AA_NORMALTEXT = 4.5;

describe("Farbkontraste", () => {
  for (const modus of ["hell", "dunkel"] as const) {
    for (const [was, vorne, hinten, unten] of PAARE) {
      it(`${was} erfüllt AA (${modus})`, () => {
        const wert = kontrast(
          token(vorne, modus),
          token(hinten, modus),
          unten ? token(unten, modus) : token("--bg", modus),
        );
        expect(
          wert,
          `${vorne} auf ${hinten} (${modus}): ${wert.toFixed(2)}:1, verlangt sind ${AA_NORMALTEXT}:1`,
        ).toBeGreaterThanOrEqual(AA_NORMALTEXT);
      });
    }
  }

  it("rechnet OKLCH richtig nach sRGB um", () => {
    // Bekannte Eckpunkte: Weiß, Schwarz und das sRGB-Rot in OKLCH.
    expect(farbeLesen("oklch(1 0 0)")).toMatchObject({ r: expect.closeTo(1, 3), g: expect.closeTo(1, 3) });
    expect(farbeLesen("oklch(0 0 0)")).toMatchObject({ r: 0, g: 0, b: 0 });
    const rot = farbeLesen("oklch(0.62796 0.25768 29.2339)");
    expect(rot.r).toBeCloseTo(1, 2);
    expect(rot.g).toBeCloseTo(0, 2);
    expect(rot.b).toBeCloseTo(0, 2);
    expect(farbeLesen("oklch(0.5 0.1 290 / 0.12)").a).toBe(0.12);
  });

  it("misst Hex und OKLCH auf derselben Skala", () => {
    expect(kontrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(kontrast("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 1);
  });

  it("führt keine dritte, zu leise Textstufe wieder ein", () => {
    // `--text-leiser` lag bei 2,9:1 auf dem Tabellenkopf und wurde entfernt.
    // Eine Farbe zwischen `--text-leise` und dem Untergrund kann nicht zugleich
    // heller wirken und 4,5:1 erreichen; wer sie wieder einführt, fällt hier auf.
    expect(TOKENS).not.toContain("--text-leiser");
  });
});
