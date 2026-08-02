import { useEffect, useId, useRef } from "react";

interface BestaetigungsdialogProps {
  text: string;
  bestaetigenLabel?: string;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
}

/** Elemente, die den Fokus aufnehmen können. */
const FOKUSSIERBAR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Zentriertes Bestätigungs-Modal für destruktive Aktionen. Escape und Klick
 * auf den abgedunkelten Hintergrund brechen ab, wie ein Klick auf
 * "Abbrechen". Rendert nichts von sich aus dauerhaft — die aufrufende Seite
 * (über useBestaetigung) steuert die Sichtbarkeit per bedingtem
 * Rendering, diese Komponente merkt sich nichts.
 *
 * Der Dialog hält den Fokus bei sich. Ohne das führt der zweite
 * Tabulatorschritt hinter den Dialog auf die Seite, die gerade nicht bedient
 * werden soll — der Nutzer verliert den Dialog aus den Augen, und ein
 * Screenreader liest Inhalte vor, die das Overlay verdeckt (WCAG 2.4.3).
 * Beim Schließen geht der Fokus dorthin zurück, wo er herkam.
 */
export function Bestaetigungsdialog({ text, bestaetigenLabel, onAbbrechen, onBestaetigen }: BestaetigungsdialogProps) {
  const karte = useRef<HTMLDivElement>(null);
  const abbrechenKnopf = useRef<HTMLButtonElement>(null);
  const textId = useId();

  useEffect(() => {
    function aufTaste(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onAbbrechen();
        return;
      }
      if (e.key !== "Tab" || !karte.current) return;

      const ziele = Array.from(karte.current.querySelectorAll<HTMLElement>(FOKUSSIERBAR));
      if (ziele.length === 0) return;
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];

      // Am Rand angekommen auf die andere Seite springen, statt den Dialog zu
      // verlassen. Der Browser würde sonst zum nächsten Element der Seite
      // dahinter wechseln.
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
  }, [onAbbrechen]);

  useEffect(() => {
    // Wer den Dialog von einem Löschen-Knopf aus geöffnet hat, soll danach
    // wieder dort stehen und nicht am Seitenanfang.
    //
    // Der Fokus wird hier gesetzt statt über `autoFocus`: Das Attribut greift
    // beim Einhängen ins Dokument, also *vor* diesem Effekt — der Dialog
    // merkte sich dann seinen eigenen Knopf als Rücksprungziel, und der ist
    // beim Schließen fort.
    const vorher = document.activeElement as HTMLElement | null;
    abbrechenKnopf.current?.focus();
    return () => vorher?.focus?.();
  }, []);

  return (
    <div className="bestaetigung-overlay" onClick={onAbbrechen}>
      <div
        ref={karte}
        className="bestaetigung-karte"
        role="dialog"
        aria-modal="true"
        aria-labelledby={textId}
        onClick={(e) => e.stopPropagation()}
      >
        <p id={textId}>{text}</p>
        <div className="bestaetigung-aktionen">
          <button type="button" className="btn" ref={abbrechenKnopf} onClick={onAbbrechen}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-gefahr" onClick={onBestaetigen}>
            {bestaetigenLabel ?? "Löschen"}
          </button>
        </div>
      </div>
    </div>
  );
}
