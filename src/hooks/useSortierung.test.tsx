import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSortierung } from "./useSortierung";

interface Zeile {
  name: string;
  betrag: number;
}

const ZEILEN: Zeile[] = [
  { name: "Zypern", betrag: 30 },
  { name: "Österreich", betrag: 10 },
  { name: "Andorra", betrag: 20 },
];

const WERTE = {
  name: (z: Zeile) => z.name,
  betrag: (z: Zeile) => z.betrag,
};

function namen(zeilen: Zeile[]) {
  return zeilen.map((z) => z.name);
}

describe("useSortierung", () => {
  it("sortiert Zeichenketten nach deutscher Ordnung", () => {
    // Rein nach Zeichenwert stünde „Österreich" hinter „Zypern" — Umlaute
    // liegen im Unicode hinter Z.
    const { result } = renderHook(() => useSortierung(ZEILEN, WERTE, "name"));
    expect(namen(result.current.sortiert)).toEqual(["Andorra", "Österreich", "Zypern"]);
  });

  it("kehrt die Richtung um, wenn dieselbe Spalte erneut gewählt wird", () => {
    const { result } = renderHook(() => useSortierung(ZEILEN, WERTE, "name"));
    act(() => result.current.sortieren("name"));
    expect(result.current.sortierung.richtung).toBe("ab");
    expect(namen(result.current.sortiert)).toEqual(["Zypern", "Österreich", "Andorra"]);
  });

  it("beginnt bei einer neuen Spalte aufsteigend", () => {
    const { result } = renderHook(() => useSortierung(ZEILEN, WERTE, "name", "ab"));
    act(() => result.current.sortieren("betrag"));
    expect(result.current.sortierung).toEqual({ spalte: "betrag", richtung: "auf" });
    expect(namen(result.current.sortiert)).toEqual(["Österreich", "Andorra", "Zypern"]);
  });

  it("vergleicht Zahlen als Zahlen, nicht als Text", () => {
    // Als Text sortiert stünde 100 vor 20.
    const viele = [{ name: "a", betrag: 100 }, { name: "b", betrag: 20 }];
    const { result } = renderHook(() => useSortierung(viele, WERTE, "betrag"));
    expect(result.current.sortiert.map((z) => z.betrag)).toEqual([20, 100]);
  });

  it("lässt die Reihenfolge unangetastet, wenn die Spalte unbekannt ist", () => {
    const { result } = renderHook(() => useSortierung(ZEILEN, WERTE, "gibtsnicht"));
    expect(namen(result.current.sortiert)).toEqual(namen(ZEILEN));
  });

  it("verändert die übergebene Liste nicht", () => {
    // sort() arbeitet sonst auf der Vorlage und damit auf fremdem Zustand.
    const vorlage = [...ZEILEN];
    renderHook(() => useSortierung(vorlage, WERTE, "name"));
    expect(namen(vorlage)).toEqual(["Zypern", "Österreich", "Andorra"]);
  });
});
