import type { AppFehler } from "../api";

interface FehlerProps {
  fehler: AppFehler | null;
}

const boxStyle: React.CSSProperties = {
  color: "#7a1212",
  background: "#fdecea",
  border: "1px solid #f5c2c0",
  borderRadius: "4px",
  padding: "0.75rem 1rem",
  margin: "0.5rem 0",
};

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
      <div style={boxStyle} role="alert">
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
    <div style={boxStyle} role="alert">
      {fehler.meldung}
    </div>
  );
}
