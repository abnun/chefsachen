import { useEffect, useId, useRef, type ReactNode } from "react";

/** Elemente, die den Fokus aufnehmen können. */
const FOKUSSIERBAR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  /** Überschrift; dient zugleich als Name des Dialogs für Screenreader. */
  titel: string;
  children: ReactNode;
  /** Die Schaltflächen am Fuß. */
  aktionen: ReactNode;
  /** Escape, Klick auf den Hintergrund. */
  onSchliessen: () => void;
}

/**
 * Modaler Dialog: Overlay, Fokusfalle, Escape.
 *
 * Herausgelöst, als der zweite Dialog dazukam. Die Fokusbehandlung ein zweites
 * Mal abzuschreiben wäre in diesem Projekt schon zweimal schiefgegangen — die
 * Statustabellen und die Belegliste liefen auf genau diesem Weg auseinander.
 *
 * Der Dialog hält den Fokus bei sich. Ohne das führt der Tabulator hinter den
 * Dialog auf die Seite, die gerade nicht bedient werden soll; ein Screenreader
 * liest dann Inhalte vor, die das Overlay verdeckt (WCAG 2.4.3). Beim Schließen
 * geht der Fokus dorthin zurück, wo er herkam.
 */
export function Dialog({ titel, children, aktionen, onSchliessen }: DialogProps) {
  const karte = useRef<HTMLDivElement>(null);
  const erstesZiel = useRef<HTMLButtonElement>(null);
  const titelId = useId();

  useEffect(() => {
    function aufTaste(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onSchliessen();
        return;
      }
      if (e.key !== "Tab" || !karte.current) return;

      const ziele = Array.from(karte.current.querySelectorAll<HTMLElement>(FOKUSSIERBAR));
      if (ziele.length === 0) return;
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];

      // Am Rand auf die andere Seite springen, statt den Dialog zu verlassen.
      if (e.shiftKey && document.activeElement === erstes) {
        e.preventDefault();
        letztes.focus();
      } else if (!e.shiftKey && document.activeElement === letztes) {
        e.preventDefault();
        erstes.focus();
      }
    }
    document.addEventListener("keydown", aufTaste);
    return () => document.removeEventListener("keydown", aufTaste);
  }, [onSchliessen]);

  useEffect(() => {
    /*
     * Scrollen sperren, solange der Dialog offen ist.
     *
     * Nicht nur der Ordnung halber: In der WebKit-Webview der Anwendung wurde
     * ein `position: fixed`-Overlay über einer *gescrollten* Seite zwar an der
     * richtigen Stelle gezeichnet, der Klick aber gegen eine veraltete Position
     * geprüft. Die Trefferfläche lag um den Scrollbetrag verschoben — der
     * Dialog war sichtbar und keiner seiner Knöpfe reagierte, ohne jede
     * Meldung. Ganz oben auf der Seite trat es nicht auf, in Chrome nie.
     *
     * Steht die Seite still, kann die Trefferfläche nicht verrutschen. Und der
     * Hintergrund soll sich ohnehin nicht bewegen, während jemand eine
     * Rückfrage beantwortet.
     */
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = vorher;
    };
  }, []);

  useEffect(() => {
    // Der Fokus wird hier gesetzt statt über `autoFocus`: Das Attribut greift
    // beim Einhängen ins Dokument, also *vor* diesem Effekt — der Dialog merkte
    // sich sonst seinen eigenen Knopf als Rücksprungziel, und der ist beim
    // Schließen fort.
    const vorher = document.activeElement as HTMLElement | null;
    const ziel =
      erstesZiel.current ?? karte.current?.querySelector<HTMLElement>(FOKUSSIERBAR) ?? null;
    ziel?.focus();
    return () => vorher?.focus?.();
  }, []);

  return (
    <div className="bestaetigung-overlay" onClick={onSchliessen}>
      <div
        ref={karte}
        className="bestaetigung-karte"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        onClick={(e) => e.stopPropagation()}
      >
        <p id={titelId}>{titel}</p>
        {children}
        <div className="bestaetigung-aktionen">{aktionen}</div>
      </div>
    </div>
  );
}
