/**
 * Bankleitzahl und BIC, damit das IBAN-Feld den BIC selbst eintragen kann.
 * Läuft vollständig offline: Die Zuordnung liegt dem Programm bei
 * (src/daten/blz-bic.txt, erzeugt von scripts/blz-daten.mjs aus der
 * Bankleitzahlendatei der Deutschen Bundesbank).
 *
 * Nur für deutsche IBANs. Andere Länder haben keine BLZ an fester Stelle,
 * und eine falsche Vermutung wäre schlimmer als ein leeres Feld.
 */

import { ibanBefund, ibanKompakt } from "./iban";

/** BLZ (achtstellig) → BIC. */
export type BlzVerzeichnis = Map<string, string>;

/**
 * Liest das kompakte Format von scripts/blz-daten.mjs: je Zeile der Abstand
 * zur vorigen BLZ in Basis 36, ein Tabulator und der BIC. Eine Zeile nur mit
 * Abstand hat denselben BIC wie die vorige.
 */
export function blzDatenLesen(text: string): BlzVerzeichnis {
  const v: BlzVerzeichnis = new Map();
  let blz = 0;
  let bic = "";
  for (const zeile of text.split("\n")) {
    if (zeile === "" || zeile.startsWith("#")) continue;
    const tab = zeile.indexOf("\t");
    blz += parseInt(tab < 0 ? zeile : zeile.slice(0, tab), 36);
    if (tab >= 0) bic = zeile.slice(tab + 1);
    v.set(String(blz).padStart(8, "0"), bic);
  }
  return v;
}

/**
 * Der BIC zu einer vollständigen, gültigen deutschen IBAN, sonst null.
 *
 * Erst bei stimmender Prüfziffer: Bei einem Tippfehler in der BLZ träfe die
 * Suche sonst womöglich eine andere Bank, und deren BIC stünde dann
 * unauffällig neben einer falschen IBAN.
 */
export function bicZurIban(v: BlzVerzeichnis, iban: string): string | null {
  const kompakt = ibanKompakt(iban);
  if (!kompakt.startsWith("DE") || ibanBefund(kompakt) !== "gueltig") return null;
  return v.get(kompakt.slice(4, 12)) ?? null;
}

let geladen: Promise<BlzVerzeichnis> | null = null;

/**
 * Lädt die Zuordnung beim ersten Bedarf, als eigener Teil des Bündels: Sie
 * wird erst gebraucht, wenn ein Formular mit IBAN offen ist.
 */
export function blzVerzeichnisLaden(): Promise<BlzVerzeichnis> {
  geladen ??= import("./daten/blz-bic.txt?raw").then((m) => blzDatenLesen(m.default));
  return geladen;
}
