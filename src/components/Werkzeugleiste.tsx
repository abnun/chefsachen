import { type ReactNode } from "react";

/**
 * Kopfleiste einer Listenseite: links Suche und Filter, rechts die Hauptaktion.
 *
 * Vorher stand der Knopf auf jeder Seite woanders — bei Kunden neben der Suche,
 * bei Artikeln allein über der Tabelle, bei Angeboten und Rechnungen darunter.
 * Wer die Seite wechselt, sucht ihn dann jedes Mal neu.
 *
 * Rechts, weil die Hauptaktion nicht zwischen den Filtern verschwinden soll,
 * und oben, weil man sie sonst erst am Ende einer langen Tabelle findet.
 */
export function Werkzeugleiste({ filter, aktion }: { filter?: ReactNode; aktion?: ReactNode }) {
  return (
    <div className="werkzeugleiste">
      <div className="werkzeugleiste-filter">{filter}</div>
      {aktion && <div className="werkzeugleiste-aktion">{aktion}</div>}
    </div>
  );
}
