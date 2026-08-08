import { useEffect } from "react";
import type { ReactNode } from "react";

interface SpeicherRueckmeldungProps {
  art: "gelungen" | "fehlgeschlagen";
  children: ReactNode;
  /** Wird gerufen, wenn die Meldung von selbst verschwinden soll. */
  onAbgelaufen: () => void;
}

/** Wie lange die Meldung neben dem Knopf stehen bleibt. */
const DAUER_MS = 4000;

/**
 * Kurze Rückmeldung neben dem Speichern-Knopf: hat es geklappt oder nicht.
 *
 * `role="status"` statt `role="alert"` auch im Fehlerfall: Die Meldung sagt
 * nur, dass etwas schiefging. Die eigentliche Begründung steht am betroffenen
 * Feld und wird dort bereits mit `role="alert"` angekündigt — zweimal
 * dazwischenreden hilft niemandem.
 */
export function SpeicherRueckmeldung({ art, children, onAbgelaufen }: SpeicherRueckmeldungProps) {
  useEffect(() => {
    const timeout = setTimeout(onAbgelaufen, DAUER_MS);
    return () => clearTimeout(timeout);
    // Nur beim Einhängen starten. `onAbgelaufen` wird bei jedem Rendern neu
    // erzeugt; stünde es in der Liste, begänne die Zeit immer wieder von vorn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span className={`speicher-rueckmeldung ${art}`} role="status">
      {art === "gelungen" ? (
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4.5 10.5 8 14l7.5-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="10" cy="10" r="7.25" />
          <path d="M10 6.2v4.6" strokeLinecap="round" />
          <circle cx="10" cy="13.6" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      )}
      {children}
    </span>
  );
}
