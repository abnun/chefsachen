import { useEffect } from "react";
import type { ReactNode } from "react";

interface HinweisProps {
  children: ReactNode;
  onSchliessen: () => void;
  autoDismissMs?: number;
}

/**
 * Zeigt einen informativen (nicht-roten) Hinweis. Mit `autoDismissMs`
 * verschwindet er nach der angegebenen Zeit von selbst (kein Schließen-
 * Button, da er ohnehin gleich weg ist). Ohne `autoDismissMs` zeigt er
 * einen „×"-Button, den der Nutzer aktiv anklicken muss. `onSchliessen`
 * ist in beiden Fällen Pflicht — die aufrufende Seite steuert die
 * Sichtbarkeit über eigenen State, diese Komponente merkt sich nichts.
 */
export function Hinweis({ children, onSchliessen, autoDismissMs }: HinweisProps) {
  useEffect(() => {
    if (autoDismissMs === undefined) return;
    const timeout = setTimeout(onSchliessen, autoDismissMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDismissMs]);

  return (
    <div className="hinweis-box" role="status">
      <span>{children}</span>
      {autoDismissMs === undefined && (
        <button type="button" className="hinweis-schliessen" onClick={onSchliessen} aria-label="Hinweis schließen">
          ×
        </button>
      )}
    </div>
  );
}
