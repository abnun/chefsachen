import { useEffect } from "react";

interface ListenTastenkuerzelOptionen {
  /** ⌘N / Strg+N — legt einen neuen Eintrag an. */
  neu?: () => void;
  /** ⌘F / Strg+F — springt ins Suchfeld. */
  sucheFokussieren?: () => void;
}

/**
 * ⌘N/⌘F auf Listenseiten (Kunden, Artikel, Angebote, Rechnungen).
 *
 * Ein Dialog fängt Escape/Tab bereits selbst ab (siehe `Dialog.tsx`), aber
 * keine Buchstabentasten — ohne die Sperre hier würde ⌘N hinter einer
 * offenen Rückfrage unbemerkt ein neues Formular aufklappen.
 */
export function useListenTastenkuerzel({ neu, sucheFokussieren }: ListenTastenkuerzelOptionen) {
  useEffect(() => {
    function aufTaste(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (document.querySelector('[role="dialog"]')) return;

      const taste = e.key.toLowerCase();
      if (taste === "n" && neu) {
        e.preventDefault();
        neu();
      } else if (taste === "f" && sucheFokussieren) {
        e.preventDefault();
        sucheFokussieren();
      }
    }
    window.addEventListener("keydown", aufTaste);
    return () => window.removeEventListener("keydown", aufTaste);
  }, [neu, sucheFokussieren]);
}
