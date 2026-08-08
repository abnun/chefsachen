import { createContext, useContext, useState, type ReactNode } from "react";
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
 * Ersetzt beim Aufruf von `zeigen()` die gesamte Anwendung durch die
 * Erklärseite zur XRechnung, mit einem "Zurück"-Link. Als eigene Seite statt
 * als Dialog, damit auch von der Ersteinrichtung aus verlinkt werden kann,
 * die außerhalb des normalen Layouts mit Seitenleiste liegt.
 */
export function XRechnungHilfeProvider({ children }: { children: ReactNode }) {
  const [offen, setOffen] = useState(false);

  if (offen) {
    return <XRechnungHilfeSeite onZurueck={() => setOffen(false)} />;
  }

  return <Kontext.Provider value={{ zeigen: () => setOffen(true) }}>{children}</Kontext.Provider>;
}

export function useXRechnungHilfe(): XRechnungHilfeApi {
  return useContext(Kontext);
}
