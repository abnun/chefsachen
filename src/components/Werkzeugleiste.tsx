import { useEffect, useRef, useState, type ReactNode } from "react";
import { Fuehrung, type FuehrungsSchritt } from "./Fuehrung";
import { aktuellePlattform } from "../plattform";

interface WerkzeugleisteProps {
  /** Seitentitel; trägt `data-tour="titel"` als Einstieg für jeden Rundgang. */
  titel: ReactNode;
  /** Schritte des Rundgangs; ohne sie gibt es keinen Hilfe-Knopf. */
  rundgang?: FuehrungsSchritt[];
  /** Suchfeld und Filter, rechts vor der Hauptaktion. */
  filter?: ReactNode;
  /** Die Hauptaktion der Seite, ganz rechts. */
  aktion?: ReactNode;
  /**
   * Rückweg zur Liste, als Chevron links vom Titel wie in den
   * Systemeinstellungen. Die Beschriftung ist der zugängliche Name.
   */
  zurueck?: { beschriftung: string; onClick: () => void };
  /** Steht direkt neben dem Titel: Status eines Belegs, Kundennummer. */
  zusatz?: ReactNode;
}

const SYMBOL_ZURUECK = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SYMBOL_HILFE = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="10" cy="10" r="7.25" />
    <path d="M7.9 7.9a2.1 2.1 0 1 1 3 1.9c-.6.3-.9.8-.9 1.4v.4" strokeLinecap="round" />
    <circle cx="10" cy="13.9" r="0.55" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Kopf jeder Seite in Höhe einer Fensterleiste: Titel links, Suche, Filter
 * und Hauptaktion rechts. So wie in Mail oder im Finder.
 *
 * Vorher waren das drei Bausteine (Seitenkopf mit Rundgang, eine eigene
 * Werkzeugleiste darunter, ein freier Titel auf der Gutschriftenseite), die
 * zusammen fast 120 px Höhe brauchten, bevor die erste Tabellenzeile kam.
 * Die Hauptaktion stand je nach Seite rechts oben oder eine Zeile tiefer.
 *
 * Die Leiste bleibt beim Scrollen stehen. Ihre Unterkante erscheint erst,
 * wenn Inhalt unter ihr durchläuft; vorher wäre die Linie nur Zierrat. Ein
 * unsichtbarer Anker direkt davor meldet über einen IntersectionObserver,
 * ob schon gescrollt wurde. Das kostet keine Arbeit je Scrollschritt.
 *
 * Detailseiten (Beleg, Kunde, Eingangsrechnung) nutzen dieselbe Leiste mit
 * einem Chevron zurück zur Liste und dem Status neben dem Titel. Vorher
 * hatten sie einen eigenen Seitenkopf, einen Textknopf „← Zurück zur Liste"
 * darüber und die Aktionen eine Zeile tiefer.
 *
 * Unter macOS ist die Leiste zugleich Ziehbereich des Fensters, weil die
 * Titelleiste dort ausgeblendet ist. Tauri zieht nur, wenn genau das
 * markierte Element getroffen wird; Knöpfe und Felder darin bleiben deshalb
 * normal bedienbar.
 */
export function Werkzeugleiste({ titel, rundgang, filter, aktion, zurueck, zusatz }: WerkzeugleisteProps) {
  const [zeigtRundgang, setZeigtRundgang] = useState(false);
  const [gescrollt, setGescrollt] = useState(false);
  const anker = useRef<HTMLDivElement>(null);
  const ziehbar = aktuellePlattform() === "mac" ? { "data-tauri-drag-region": "" } : {};

  useEffect(() => {
    const element = anker.current;
    // jsdom kennt keinen IntersectionObserver; die Linie ist dort ohne Belang.
    if (!element || typeof IntersectionObserver === "undefined") return;
    const beobachter = new IntersectionObserver(([eintrag]) => setGescrollt(!eintrag.isIntersecting));
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);

  return (
    <>
      <div ref={anker} className="werkzeugleiste-anker" aria-hidden="true" />
      <header className={gescrollt ? "werkzeugleiste gescrollt" : "werkzeugleiste"} {...ziehbar}>
        {zurueck && (
          <button
            type="button"
            className="btn-symbol werkzeugleiste-zurueck"
            aria-label={zurueck.beschriftung}
            title={zurueck.beschriftung}
            onClick={zurueck.onClick}
          >
            {SYMBOL_ZURUECK}
          </button>
        )}
        <h1 className="werkzeugleiste-titel" data-tour="titel" {...ziehbar}>
          {titel}
        </h1>
        {zusatz && <span className="werkzeugleiste-zusatz">{zusatz}</span>}
        {rundgang && (
          <button
            type="button"
            className="btn-symbol"
            aria-label="Rundgang"
            title="Rundgang"
            onClick={() => setZeigtRundgang(true)}
          >
            {SYMBOL_HILFE}
          </button>
        )}
        <div className="werkzeugleiste-rechts" {...ziehbar}>
          {filter}
          {aktion}
        </div>
      </header>
      {zeigtRundgang && rundgang && (
        <Fuehrung schritte={rundgang} onBeenden={() => setZeigtRundgang(false)} />
      )}
    </>
  );
}
