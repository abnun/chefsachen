import { type ReactNode } from "react";

/** Sortierrichtung einer Spalte. */
export type Richtung = "auf" | "ab";

/**
 * Spaltenkopf, über den sich sortieren lässt.
 *
 * `aria-sort` teilt Screenreadern mit, wonach die Tabelle gerade geordnet ist —
 * ohne das ist die Sortierung eine rein optische Information, die im Pfeil
 * steckt.
 */
interface SortierKopfProps {
  /** Schlüssel dieser Spalte. */
  spalte: string;
  /** Aktuell sortierte Spalte, oder null. */
  aktiv: string | null;
  richtung: Richtung;
  onSortieren: (spalte: string) => void;
  children: ReactNode;
  /**
   * Anker für den Rundgang. Am Spaltenkopf statt an einer Zelle, weil der
   * Kopf auch bei leerer Tabelle da ist — ein Anker in einer Zeile fehlt
   * genau denen, die den Rundgang am nötigsten haben.
   */
  dataTour?: string;
}

export function SortierKopf({ spalte, aktiv, richtung, onSortieren, children, dataTour }: SortierKopfProps) {
  const istAktiv = aktiv === spalte;
  return (
    <th
      aria-sort={istAktiv ? (richtung === "auf" ? "ascending" : "descending") : "none"}
      data-tour={dataTour}
    >
      <button type="button" className="sortier-kopf" onClick={() => onSortieren(spalte)}>
        {children}
        <span aria-hidden="true" className="sortier-pfeil">
          {istAktiv ? (richtung === "auf" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}
