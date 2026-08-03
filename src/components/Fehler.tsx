import { useEffect, useRef } from "react";
import type { AppFehler } from "../api";

interface FehlerProps {
  fehler: AppFehler | null;
}

/**
 * Zeigt einen AppFehler als rote Meldung an. Rendert nichts, wenn `fehler`
 * null ist. Die Platzierung neben dem betroffenen Formularfeld bei
 * Validierungsfehlern ist Aufgabe des aufrufenden Formulars — diese
 * Komponente stellt nur die Meldung selbst dar.
 *
 * Die Meldung holt sich selbst ins Sichtfeld. Sie steht auf den meisten Seiten
 * ganz oben unter der Überschrift; wer weiter unten auf „Stellen" drückt, sah
 * bisher gar nichts und musste raten, ob der Klick überhaupt angekommen ist.
 * Eine Fehlermeldung, die niemand sieht, ist keine.
 */
export function Fehler({ fehler }: FehlerProps) {
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fehler) return;
    // `nearest` statt `center`: Steht die Meldung ohnehin im Bild, soll die
    // Seite nicht springen.
    kasten.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [fehler]);

  if (fehler === null) {
    return null;
  }

  if (fehler.typ === "technisch") {
    return (
      <div className="fehler-box" role="alert" ref={kasten}>
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
    <div className="fehler-box" role="alert" ref={kasten}>
      {fehler.meldung}
    </div>
  );
}
