import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { XRechnungHilfeSeite } from "../pages/XRechnungHilfeSeite";

interface XRechnungHilfeApi {
  zeigen: () => void;
}

// Ohne Anbieter (etwa in einem Komponententest, der die Seite ohne main.tsx
// rendert) tut der Link schlicht nichts, statt den Test mit einer Ausnahme
// abzubrechen — anders als bei den übrigen Kontexten dieser Anwendung wäre
// das Erzwingen des Anbieters in jedem betroffenen Test (halb Kunden-,
// Kundendetail-, Einrichtungs- und Einstellungen-Tests) für einen reinen
// Hilfetext-Link unverhältnismäßig.
const STANDARD_API: XRechnungHilfeApi = { zeigen: () => {} };

const Kontext = createContext<XRechnungHilfeApi>(STANDARD_API);

/**
 * Legt beim Aufruf von `zeigen()` die Erklärseite zur XRechnung über die
 * Anwendung, mit einem „Zurück"-Link. Als eigene Seite statt als Dialog, damit
 * auch von der Ersteinrichtung aus verlinkt werden kann, die außerhalb des
 * normalen Layouts mit Seitenleiste liegt.
 *
 * Die Anwendung wird dabei **verborgen, nicht abgehängt**. Vorher stand hier
 * ein früher `return` ohne `children`: React baute damit den gesamten Baum ab
 * und mit ihm jeden Zustand, der noch nicht gespeichert war. Wer in der
 * Ersteinrichtung das halbe Formular ausgefüllt hatte, auf „Was ist die
 * XRechnung?" klickte und zurückkam, fand alle Felder leer.
 */
export function XRechnungHilfeProvider({ children }: { children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  // Ohne `useMemo` bekäme jeder Verbraucher bei jedem Rendern des Anbieters
  // ein neues Objekt und würde mit neu zeichnen — das ist hier der ganze
  // Anwendungsbaum.
  const api = useMemo(() => ({ zeigen: () => setOffen(true) }), []);

  return (
    <Kontext.Provider value={api}>
      {/* `hidden` statt Ausbauen: nimmt das Fenster aus Darstellung,
          Tabulator-Reihenfolge und Vorlesebaum, lässt die Komponenten darunter
          aber mitsamt ihrem Zustand am Leben. */}
      <div hidden={offen}>{children}</div>
      {offen && <XRechnungHilfeSeite onZurueck={() => setOffen(false)} />}
    </Kontext.Provider>
  );
}

export function useXRechnungHilfe(): XRechnungHilfeApi {
  return useContext(Kontext);
}
