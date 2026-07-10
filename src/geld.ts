/**
 * Parst eine deutsch formatierte Geldeingabe ("95,50", "1.095,50", "95")
 * in ganzzahlige Cent. Gibt `null` zurück, wenn die Eingabe kein gültiger
 * Geldbetrag ist (leer, nicht-numerisch, mehr als zwei Nachkommastellen
 * oder mehrere Kommas).
 *
 * Regel für eine einzelne Nachkommastelle: "95,5" wird als Zehntel gelesen,
 * also 95,50 € (9550 Cent) — nicht 95,05 €.
 */
export function parseEuro(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }

  // Erlaubt: optionale Tausenderpunkte, optional ein Komma mit 1-2 Nachkommastellen.
  const muster = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/;
  if (!muster.test(trimmed)) {
    return null;
  }

  const [ganzzahlTeilRoh, nachkommaRoh] = trimmed.split(",");
  const ganzzahlTeil = ganzzahlTeilRoh.replace(/\./g, "");
  if (!/^\d+$/.test(ganzzahlTeil)) {
    return null;
  }

  let nachkomma = nachkommaRoh ?? "";
  if (nachkomma.length === 1) {
    nachkomma = nachkomma + "0";
  }
  if (nachkomma === "") {
    nachkomma = "00";
  }
  if (nachkomma.length !== 2) {
    return null;
  }

  return parseInt(ganzzahlTeil, 10) * 100 + parseInt(nachkomma, 10);
}

/**
 * Formatiert ganzzahlige Cent als deutschen Euro-Betrag, z. B. 9550 -> "95,50 €".
 */
export function formatCent(cents: number): string {
  const euro = cents / 100;
  return (
    euro.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
  );
}
