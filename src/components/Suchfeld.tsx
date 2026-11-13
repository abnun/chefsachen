import { type Ref } from "react";

interface SuchfeldProps {
  wert: string;
  onAendern: (wert: string) => void;
  platzhalter: string;
  /** Für ⌘F (Strg+F) aus `useListenTastenkuerzel`. */
  ref?: Ref<HTMLInputElement>;
  /** Anker für den Rundgang. */
  dataTour?: string;
}

/**
 * Suchfeld der Werkzeugleiste, mit Lupe wie im Finder.
 *
 * Ohne sichtbare Beschriftung darüber: Die Lupe und der Platzhalter sagen
 * genug, und eine Zeile „Suche" über dem Feld machte die Leiste doppelt so
 * hoch. Für Vorlesehilfen heißt das Feld weiterhin „Suche".
 */
export function Suchfeld({ wert, onAendern, platzhalter, ref, dataTour }: SuchfeldProps) {
  return (
    <span className="suchfeld" data-tour={dataTour}>
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="7" cy="7" r="4.75" />
        <path d="m10.5 10.5 3.5 3.5" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="search"
        aria-label="Suche"
        placeholder={platzhalter}
        value={wert}
        onChange={(e) => onAendern(e.currentTarget.value)}
      />
    </span>
  );
}
