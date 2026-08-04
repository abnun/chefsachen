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

/**
 * Beginnt das Feld mit einem Zeichen, das Excel als Formel deutet?
 *
 * Ein Kundenname wie `=HYPERLINK(…)` würde beim Öffnen als Formel ausgeführt
 * — und die Datei ist ausdrücklich zum Weitergeben gedacht (Steuerberater).
 * Ein führendes Minus bleibt erlaubt, wenn eine Zahl folgt: Die eigenen
 * Betragsspalten führen Erstattungen als `-45,00`, und die sollen in Excel
 * Zahlen bleiben. `-cmd…` und Ähnliches wird dagegen entschärft.
 */
function siehtAusWieFormel(wert: string): boolean {
  if (/^[=+@\t]/.test(wert)) return true;
  return wert.startsWith("-") && !/^-\d/.test(wert);
}

/** Ein Feld für eine CSV-Zeile, mit Anführungszeichen gesichert, falls nötig. */
function feld(wert: string): string {
  // Der Apostroph ist Excels eigenes „das ist Text"-Zeichen; es wird in der
  // Zelle nicht angezeigt. Quoting allein verhindert die Formelauswertung
  // beim Import nicht.
  const sicher = siehtAusWieFormel(wert) ? `'${wert}` : wert;
  if (sicher.includes(TRENNER) || sicher.includes('"') || sicher.includes("\n") || sicher.includes("\r")) {
    return `"${sicher.replace(/"/g, '""')}"`;
  }
  return sicher;
}

/** Baut eine CSV-Datei aus Kopfzeile und Datenzeilen. */
export function zuCsv(kopfzeile: string[], zeilen: string[][]): string {
  const alle = [kopfzeile, ...zeilen];
  const text = alle.map((zeile) => zeile.map(feld).join(TRENNER)).join("\r\n");
  return `${BOM}${text}\r\n`;
}
