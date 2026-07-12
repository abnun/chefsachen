import type { AppFehler } from "../api";

interface FehlerProps {
  fehler: AppFehler | null;
}

/**
 * Zeigt einen AppFehler als rote Meldung an. Rendert nichts, wenn `fehler`
 * null ist. Die Platzierung neben dem betroffenen Formularfeld bei
 * Validierungsfehlern ist Aufgabe des aufrufenden Formulars — diese
 * Komponente stellt nur die Meldung selbst dar.
 */
export function Fehler({ fehler }: FehlerProps) {
  if (fehler === null) {
    return null;
  }

  if (fehler.typ === "technisch") {
    return (
      <div className="fehler-box" role="alert">
        <p>Ein technischer Fehler ist aufgetreten</p>
        <details>
          <summary>Details</summary>
          <pre>{fehler.meldung}</pre>
        </details>
      </div>
    );
  }

  // validation und nicht_gefunden: Meldung direkt anzeigen
  return (
    <div className="fehler-box" role="alert">
      {fehler.meldung}
    </div>
  );
}
