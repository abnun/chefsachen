import { useState } from "react";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";

/**
 * Promise-basierte Lösch-Bestätigung. Jede Komponente, die eine destruktive
 * Aktion bestätigen lassen will, ruft diesen Hook eigenständig auf (kein
 * globaler State, analog useErfolgsHinweis).
 *
 * `bestaetigen(text)` zeigt den Dialog und löst sich auf `true` (Löschen
 * bestätigt) oder `false` (abgebrochen — Abbrechen-Button, Hintergrund-Klick
 * oder Escape) auf.
 */
export function useLoeschBestaetigung() {
  const [anfrage, setAnfrage] = useState<{
    text: string;
    aufloesen: (ergebnis: boolean) => void;
  } | null>(null);

  function bestaetigen(text: string): Promise<boolean> {
    return new Promise((aufloesen) => setAnfrage({ text, aufloesen }));
  }

  const dialog = anfrage && (
    <Bestaetigungsdialog
      text={anfrage.text}
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
