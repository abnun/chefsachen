/**
 * Datumsangaben für die Oberfläche.
 *
 * Die Anwendung führt Daten durchgängig im ISO-Format (`2026-09-01`), weil das
 * sortierbar ist und keine Zeitzonenumrechnung braucht. Angezeigt gehört es in
 * deutscher Schreibweise — die ISO-Form wird von Nutzern leicht als
 * Tag-Monat-Verdreher gelesen.
 *
 * Diese Umwandlung stand vorher in mehreren Seiten je einmal, und jede neue
 * Ansicht vergaß sie erneut. Deshalb hier an einer Stelle.
 */

/** `2026-09-01` → `01.09.2026`. Unerwartete Eingaben bleiben unverändert. */
export function datumDeutsch(iso: string): string {
  const teile = iso.split("-");
  if (teile.length !== 3 || teile[0].length !== 4) return iso;
  return `${teile[2]}.${teile[1]}.${teile[0]}`;
}

/** Wie `datumDeutsch`, gibt aber für leere Werte einen Ersatztext zurück. */
export function datumDeutschOder(iso: string | null | undefined, ersatz: string): string {
  return iso ? datumDeutsch(iso) : ersatz;
}

/** Heutiges Datum im ISO-Format — für Vergleiche mit gespeicherten Daten. */
export function heuteIso(): string {
  return new Date().toISOString().slice(0, 10);
}
