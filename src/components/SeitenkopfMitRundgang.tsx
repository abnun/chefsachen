import { useState, type ReactNode } from "react";
import { Fuehrung, type FuehrungsSchritt } from "./Fuehrung";

interface SeitenkopfMitRundgangProps {
  titel: ReactNode;
  schritte: FuehrungsSchritt[];
}

/**
 * Seitentitel mit dem „Rundgang"-Knopf daneben.
 *
 * Herausgelöst, als der Rundgang von der Übersicht auf die übrigen Seiten
 * kam: Zustand, Knopf und Einbindung der Führung ein weiteres Mal
 * abzuschreiben ist in diesem Projekt schon mehrfach schiefgegangen — die
 * Kopien liefen auseinander.
 *
 * Der Titel trägt `data-tour="titel"`, damit jede Schrittliste ihren
 * Einstieg an derselben Stelle nehmen kann. Das ist eindeutig, weil immer
 * nur eine Seite gemountet ist (App.tsx rendert exklusiv).
 */
export function SeitenkopfMitRundgang({ titel, schritte }: SeitenkopfMitRundgangProps) {
  const [zeigtRundgang, setZeigtRundgang] = useState(false);

  return (
    <>
      <div className="seiten-kopf-zeile">
        <h1 className="seiten-kopf" data-tour="titel">{titel}</h1>
        <button type="button" className="btn" onClick={() => setZeigtRundgang(true)}>
          Rundgang
        </button>
      </div>
      {zeigtRundgang && (
        <Fuehrung schritte={schritte} onBeenden={() => setZeigtRundgang(false)} />
      )}
    </>
  );
}
