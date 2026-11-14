import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { XRechnungHilfeDialog } from "../components/XRechnungHilfeDialog";

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
 * Zeigt beim Aufruf von `zeigen()` die Erklärung zur XRechnung als Blatt über
 * der Anwendung. Der Anbieter sitzt in `main.tsx` außerhalb von `App`, damit
 * auch die Ersteinrichtung, die außerhalb des normalen Layouts liegt, darauf
 * verlinken kann.
 *
 * Die Anwendung bleibt dabei eingehängt. Früher stand hier ein früher
 * `return` ohne `children`: React baute damit den gesamten Baum ab und mit ihm
 * jeden Zustand, der noch nicht gespeichert war. Wer in der Ersteinrichtung
 * das halbe Formular ausgefüllt hatte, fand nach der Hilfe alle Felder leer.
 */
export function XRechnungHilfeProvider({ children }: { children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  // Ohne `useMemo` bekäme jeder Verbraucher bei jedem Rendern des Anbieters
  // ein neues Objekt und würde mit neu zeichnen, und das ist hier der ganze
  // Anwendungsbaum.
  const api = useMemo(() => ({ zeigen: () => setOffen(true) }), []);

  return (
    <Kontext.Provider value={api}>
      {children}
      {offen && <XRechnungHilfeDialog onSchliessen={() => setOffen(false)} />}
    </Kontext.Provider>
  );
}

export function useXRechnungHilfe(): XRechnungHilfeApi {
  return useContext(Kontext);
}
