import { useEffect, useLayoutEffect, useState } from "react";

export interface FuehrungsSchritt {
  /** CSS-Selektor des hervorgehobenen Elements. */
  ziel: string;
  titel: string;
  text: string;
}

interface FuehrungProps {
  schritte: FuehrungsSchritt[];
  onBeenden: () => void;
}

/** Abstand des hervorhebenden Rings zum Element. */
const RAND = 8;
/** Feste Breite des Tooltips — reicht für die deutschen Erklärtexte, ohne
    auf schmalen Fenstern über den Rand zu laufen. */
const TOOLTIP_BREITE = 340;

/**
 * Rundgang durch eine Seite: hebt nacheinander Elemente hervor und erklärt
 * sie kurz.
 *
 * Kein fertiges Overlay-Paket, sondern von Hand gebaut wie der Rest der
 * Bedienoberfläche (siehe Dialog.tsx) — eine Bibliothek brächte eigenes
 * Theming in die Tauri-Webview mit und deckte nur einen Teil dessen ab, was
 * ohnehin selbst geschrieben werden müsste: die deutschen Texte und die
 * Positionierung.
 *
 * Ein fehlendes Ziel (etwa die Kleinunternehmergrenzen bei
 * Regelbesteuerung, wo das Backend sie gar nicht erst liefert) überspringt
 * den Schritt, statt den Rundgang abzubrechen.
 */
export function Fuehrung({ schritte, onBeenden }: FuehrungProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    let uebersprungen = false;
    function aktualisieren() {
      const ziel = document.querySelector<HTMLElement>(schritte[index].ziel);
      if (!ziel) {
        uebersprungen = true;
        if (index < schritte.length - 1) setIndex(index + 1);
        else onBeenden();
        return;
      }
      ziel.scrollIntoView({ block: "center" });
      setRect(ziel.getBoundingClientRect());
    }
    aktualisieren();
    if (uebersprungen) return;
    window.addEventListener("resize", aktualisieren);
    // capture: true, damit auch das Scrollen innerhalb von .app-main erfasst
    // wird, nicht nur ein Scrollen des Fensters selbst.
    window.addEventListener("scroll", aktualisieren, true);
    return () => {
      window.removeEventListener("resize", aktualisieren);
      window.removeEventListener("scroll", aktualisieren, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, schritte]);

  function weiter() {
    if (index < schritte.length - 1) setIndex(index + 1);
    else onBeenden();
  }
  function zurueck() {
    if (index > 0) setIndex(index - 1);
  }

  useEffect(() => {
    function aufTaste(e: KeyboardEvent) {
      if (e.key === "Escape") onBeenden();
      if (e.key === "ArrowRight") weiter();
      if (e.key === "ArrowLeft") zurueck();
    }
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!rect) return null;

  const schritt = schritte[index];
  // Unten, wenn genug Platz ist — sonst darüber, wenn dort mehr Platz wäre.
  const platzUnten = window.innerHeight - rect.bottom;
  const unten = platzUnten > 220 || platzUnten > rect.top;
  const links = Math.min(Math.max(rect.left, 16), window.innerWidth - TOOLTIP_BREITE - 16);

  return (
    <div className="fuehrung-abdunklung" onClick={onBeenden} role="dialog" aria-modal="true">
      <div
        className="fuehrung-ring"
        style={{
          top: rect.top - RAND,
          left: rect.left - RAND,
          width: rect.width + RAND * 2,
          height: rect.height + RAND * 2,
        }}
      />
      <div
        className="fuehrung-tooltip"
        style={{
          top: unten ? rect.bottom + RAND + 8 : undefined,
          bottom: unten ? undefined : window.innerHeight - rect.top + RAND + 8,
          left: links,
          width: TOOLTIP_BREITE,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="fuehrung-schritt">
          {index + 1} von {schritte.length}
        </p>
        <h3>{schritt.titel}</h3>
        <p>{schritt.text}</p>
        <div className="aktionen aktionen-rechts">
          <button type="button" className="btn btn-leise" onClick={onBeenden}>
            Beenden
          </button>
          {index > 0 && (
            <button type="button" className="btn" onClick={zurueck}>
              Zurück
            </button>
          )}
          <button type="button" className="btn btn-primaer" onClick={weiter}>
            {index < schritte.length - 1 ? "Weiter" : "Fertig"}
          </button>
        </div>
      </div>
    </div>
  );
}
