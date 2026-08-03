import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Findet Klassen, die im Stylesheet stehen, aber nirgends mehr benutzt werden.
 *
 * Beim Zusammenfassen der vier fast gleichen Aktionsleisten blieben mehrere
 * Regeln zurück, die nichts mehr trafen — und niemand hätte es bemerkt. Totes
 * CSS ist nicht bloß Ballast: Wer später eine dieser Klassen wiederverwendet,
 * erbt Eigenschaften, die für einen ganz anderen Zweck gedacht waren.
 */

/**
 * Klassen, die im Code zusammengesetzt werden und deshalb nicht als
 * Zeichenkette auftauchen. Jede braucht eine Begründung — die Liste ist der
 * einzige Weg, an diesem Test vorbeizukommen.
 */
const ZUSAMMENGESETZT = new Set([
  // `WARN_KLASSE[stufe]` in Dashboard.tsx
  "grenze-keine",
  "grenze-annaeherung",
  "grenze-kritisch",
  "grenze-ueberschritten",
  // `statusKlasse()` in belegStatus.ts
  "status-entwurf",
  "status-gestellt",
  "status-bezahlt",
  "status-storniert",
  // `kundenpreis-badge ${klasse}` in KundenpreiseDialog.tsx
  "guenstiger",
  "teurer",
]);

function dateienUnter(verzeichnis: string, endung: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) treffer.push(...dateienUnter(pfad, endung));
    else if (eintrag.name.endsWith(endung)) treffer.push(pfad);
  }
  return treffer;
}

const QUELLE = dateienUnter("src", ".tsx")
  .filter((p) => !p.endsWith(".test.tsx"))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

describe("Stylesheets", () => {
  it.each(dateienUnter("src/styles", ".css"))("hinterlässt in %s keine toten Klassen", (pfad) => {
    // Kommentare zuerst entfernen: Sie nennen Klassen, die es nicht mehr gibt,
    // gerade weil sie erklären, was an ihre Stelle getreten ist.
    const css = readFileSync(pfad, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const klassen = new Set(
      [...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
    );

    const tot = [...klassen].filter(
      (k) => !ZUSAMMENGESETZT.has(k) && !QUELLE.includes(k),
    );
    expect(tot).toEqual([]);
  });
});
