/**
 * Vorgabe für das Zahlungsziel neuer Kunden.
 *
 * Das Zahlungsziel steht je Kunde (und lässt sich im einzelnen Beleg ändern);
 * diese Einstellung ist nur der Wert, den ein neu angelegter Kunde bekommt.
 * 0 Tage heißen „sofort zahlbar".
 */
export const SCHLUESSEL_ZAHLUNGSZIEL = "beleg.zahlungsziel_tage";
export const ZAHLUNGSZIEL_STANDARD = 14;

/** Die gängigen Fristen als Auswahl; alles andere ist „Anderes". */
export const ZAHLUNGSZIEL_AUSWAHL: { tage: number; label: string }[] = [
  { tage: 0, label: "Sofort" },
  { tage: 7, label: "7 Tage" },
  { tage: 14, label: "14 Tage" },
  { tage: 30, label: "30 Tage" },
];

/** Unbrauchbare Werte (leer, Text, negativ) ergeben den Standard, nie einen Fehler. */
export function zahlungszielAusEinstellung(wert: string | null | undefined): number {
  const t = Number.parseInt((wert ?? "").trim(), 10);
  return Number.isFinite(t) && t >= 0 ? t : ZAHLUNGSZIEL_STANDARD;
}
