import { useState } from "react";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";

/**
 * Promise-basierte Rückfrage vor einer nicht umkehrbaren Aktion. Jede
 * Komponente ruft diesen Hook eigenständig auf (kein globaler State, analog
 * useErfolgsHinweis).
 *
 * `bestaetigen(text)` zeigt den Dialog und löst sich auf `true` (bestätigt)
 * oder `false` (abgebrochen — Abbrechen-Button, Hintergrund-Klick oder Escape)
 * auf. Über `bestaetigenLabel` lässt sich die Beschriftung des bestätigenden
 * Knopfes setzen; ohne Angabe steht dort „Löschen", weil das der häufigste
 * Fall ist. Für Aktionen wie „Rechnung stellen" ist das Label anzugeben —
 * sonst steht auf dem Knopf etwas anderes als das, was er tut.
 */
export function useBestaetigung() {
  const [anfrage, setAnfrage] = useState<{
    text: string;
    bestaetigenLabel?: string;
    aufloesen: (ergebnis: boolean) => void;
  } | null>(null);

  function bestaetigen(text: string, bestaetigenLabel?: string): Promise<boolean> {
    return new Promise((aufloesen) => setAnfrage({ text, bestaetigenLabel, aufloesen }));
  }

  const dialog = anfrage && (
    <Bestaetigungsdialog
      text={anfrage.text}
      bestaetigenLabel={anfrage.bestaetigenLabel}
      onAbbrechen={() => {
        anfrage.aufloesen(false);
        setAnfrage(null);
      }}
      onBestaetigen={() => {
        anfrage.aufloesen(true);
        setAnfrage(null);
      }}
    />
  );

  return { bestaetigen, dialog };
}
