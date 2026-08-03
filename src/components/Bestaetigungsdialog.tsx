import { type ReactNode } from "react";
import { Dialog } from "./Dialog";

interface BestaetigungsdialogProps {
  text: string;
  /**
   * Was der Schritt betrifft, zum Nachsehen vor der Zusage.
   *
   * Eine Rückfrage, die nur „Wirklich?" fragt, prüft nur die Entschlossenheit.
   * Bei einem Schritt, der etwas unveränderbar macht, ist die eigentliche
   * Frage aber, ob der Inhalt stimmt — und den hat man in dem Moment nicht vor
   * Augen.
   */
  zusatz?: ReactNode;
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
  zusatz,
  bestaetigenLabel,
  onAbbrechen,
  onBestaetigen,
}: BestaetigungsdialogProps) {
  return (
    <Dialog
      titel={text}
      breit={Boolean(zusatz)}
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
      {zusatz}
    </Dialog>
  );
}
