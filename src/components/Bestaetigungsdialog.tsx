import { useEffect } from "react";

interface BestaetigungsdialogProps {
  text: string;
  bestaetigenLabel?: string;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
}

/**
 * Zentriertes Bestätigungs-Modal für destruktive Aktionen. Escape und Klick
 * auf den abgedunkelten Hintergrund brechen ab, wie ein Klick auf
 * "Abbrechen". Rendert nichts von sich aus dauerhaft — die aufrufende Seite
 * (über useLoeschBestaetigung) steuert die Sichtbarkeit per bedingtem
 * Rendering, diese Komponente merkt sich nichts.
 */
export function Bestaetigungsdialog({ text, bestaetigenLabel, onAbbrechen, onBestaetigen }: BestaetigungsdialogProps) {
  useEffect(() => {
    function aufTaste(e: KeyboardEvent) {
      if (e.key === "Escape") onAbbrechen();
    }
    document.addEventListener("keydown", aufTaste);
    return () => document.removeEventListener("keydown", aufTaste);
  }, [onAbbrechen]);

  return (
    <div className="bestaetigung-overlay" onClick={onAbbrechen}>
      <div className="bestaetigung-karte" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="bestaetigung-aktionen">
          <button type="button" className="btn" autoFocus onClick={onAbbrechen}>
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
