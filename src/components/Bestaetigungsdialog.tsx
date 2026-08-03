import { Dialog } from "./Dialog";

interface BestaetigungsdialogProps {
  text: string;
  bestaetigenLabel?: string;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
}

/**
 * Rückfrage vor einer Aktion, die sich nicht zurücknehmen lässt.
 *
 * Escape und ein Klick auf den abgedunkelten Hintergrund brechen ab, wie ein
 * Klick auf „Abbrechen". Rendert nichts von sich aus dauerhaft — die aufrufende
 * Seite (über `useBestaetigung`) steuert die Sichtbarkeit, diese Komponente
 * merkt sich nichts.
 *
 * Overlay, Fokusfalle und Escape stecken in [`Dialog`]; hier bleiben nur die
 * beiden Schaltflächen.
 */
export function Bestaetigungsdialog({
  text,
  bestaetigenLabel,
  onAbbrechen,
  onBestaetigen,
}: BestaetigungsdialogProps) {
  return (
    <Dialog
      titel={text}
      onSchliessen={onAbbrechen}
      aktionen={
        <>
          <button type="button" className="btn" onClick={onAbbrechen}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-gefahr" onClick={onBestaetigen}>
            {bestaetigenLabel ?? "Löschen"}
          </button>
        </>
      }
    >
      {null}
    </Dialog>
  );
}
