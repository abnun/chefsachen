import { useMemo, useState } from "react";
import { type Richtung } from "../components/SortierKopf";

/**
 * Sortierung einer Tabelle.
 *
 * Herausgelöst aus `useBelegListe`, als die zweite und dritte Tabelle sortierbar
 * werden sollte. Dieselbe Logik ein weiteres Mal abzuschreiben ist in diesem
 * Projekt schon zweimal schiefgegangen — die Statustabellen und die
 * Beleglisten liefen auf genau diesem Weg auseinander.
 *
 * `werte` ordnet jeder sortierbaren Spalte eine Funktion zu, die den Wert
 * liefert, nach dem verglichen wird. Zeichenketten werden dabei mit
 * `localeCompare` verglichen — sonst stünde „Österreich" hinter „Zypern", weil
 * Umlaute in der reinen Zeichenordnung hinten liegen.
 */
export function useSortierung<T>(
  eintraege: T[],
  werte: Record<string, (e: T) => string | number>,
  anfangsSpalte: string,
  anfangsRichtung: Richtung = "auf",
) {
  const [sortierung, setSortierung] = useState<{ spalte: string; richtung: Richtung }>({
    spalte: anfangsSpalte,
    richtung: anfangsRichtung,
  });

  /** Klick auf einen Spaltenkopf: gleiche Spalte kehrt um, neue beginnt aufsteigend. */
  function sortieren(spalte: string) {
    setSortierung((vorher) =>
      vorher.spalte === spalte
        ? { spalte, richtung: vorher.richtung === "auf" ? "ab" : "auf" }
        : { spalte, richtung: "auf" },
    );
  }

  const sortiert = useMemo(() => {
    const wert = werte[sortierung.spalte];
    if (!wert) return eintraege;
    const richtung = sortierung.richtung === "auf" ? 1 : -1;
    // Kopie: sort() arbeitet auf der Vorlage und würde den Zustand verändern.
    return [...eintraege].sort((a, b) => {
      const x = wert(a);
      const y = wert(b);
      if (typeof x === "string" && typeof y === "string") {
        return x.localeCompare(y, "de") * richtung;
      }
      if (x === y) return 0;
      return (x < y ? -1 : 1) * richtung;
    });
    // `werte` wird bei jedem Rendern neu gebaut; es als Abhängigkeit zu führen
    // hieße, bei jedem Rendern neu zu sortieren. Die Funktionen darin hängen
    // an denselben Daten wie `eintraege`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eintraege, sortierung]);

  return { sortiert, sortierung, sortieren };
}
