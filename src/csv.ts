/**
 * Baut eine CSV-Datei für deutsches Excel.
 *
 * Deutsches Excel erwartet standardmäßig Semikolon als Trennzeichen — mit
 * Komma liest es eine Zahlenspalte als eine einzige Textspalte ein, weil das
 * Komma dort der Dezimaltrenner ist. Ein Semikolon vermeidet die Verwechslung
 * von vornherein.
 */
const TRENNER = ";";

/**
 * Byte Order Mark, vorangestellt. Ohne sie hält Excel eine UTF-8-Datei mit
 * Umlauten für eine in einer anderen Kodierung und zeigt „MÃ¼ller" statt
 * „Müller". Als Escape geschrieben statt als unsichtbares Zeichen im
 * Quelltext — sonst wäre ein späteres versehentliches Löschen unbemerkbar.
 */
const BOM = "\uFEFF";

/** Ein Feld für eine CSV-Zeile, mit Anführungszeichen gesichert, falls nötig. */
function feld(wert: string): string {
  if (wert.includes(TRENNER) || wert.includes('"') || wert.includes("\n") || wert.includes("\r")) {
    return `"${wert.replace(/"/g, '""')}"`;
  }
  return wert;
}

/** Baut eine CSV-Datei aus Kopfzeile und Datenzeilen. */
export function zuCsv(kopfzeile: string[], zeilen: string[][]): string {
  const alle = [kopfzeile, ...zeilen];
  const text = alle.map((zeile) => zeile.map(feld).join(TRENNER)).join("\r\n");
  return `${BOM}${text}\r\n`;
}
