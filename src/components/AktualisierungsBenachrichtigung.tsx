import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { useAktualisierung } from "../hooks/useAktualisierung";
import { Dialog } from "./Dialog";
import { Aenderungstext } from "./Aenderungstext";

/**
 * Meldet eine gefundene Aktualisierung, egal welche Seite gerade offen ist.
 *
 * Vorher steckte die Suche „beim Programmstart" in der Aktualisierung-
 * Komponente, die nur innerhalb der Einstellungen gemountet wird — sie lief
 * also erst, wenn jemand dorthin navigierte, nicht beim tatsächlichen Start.
 * Wer nichts einstellte und nie in die Einstellungen ging, bekam von einer
 * verfügbaren Aktualisierung nie etwas mit.
 *
 * Bleibt still, solange nur gesucht wird, alles aktuell ist oder die Suche
 * scheitert (Programmstart ist kein Ereignis, über das der Nutzer ungefragt
 * etwas erfahren müsste — dafür gibt es „Nach Aktualisierung suchen" in den
 * Einstellungen). Sichtbar wird sie erst, wenn tatsächlich etwas zu tun ist.
 */
export function AktualisierungsBenachrichtigung() {
  const { stand, installieren } = useAktualisierung();
  const [ausgeblendet, setAusgeblendet] = useState(false);

  // Eine neue Suche (z. B. der manuelle Knopf in den Einstellungen) soll den
  // Hinweis wieder zeigen dürfen, auch wenn er zuvor weggeklickt wurde.
  useEffect(() => {
    if (stand.art === "sucht") setAusgeblendet(false);
  }, [stand.art]);

  if (ausgeblendet) return null;

  if (stand.art === "verfuegbar") {
    return (
      <Dialog
        titel={`Version ${stand.update.version} ist verfügbar`}
        breit
        onSchliessen={() => setAusgeblendet(true)}
        aktionen={
          <>
            <button type="button" className="btn" onClick={() => setAusgeblendet(true)}>
              Später
            </button>
            <button
              type="button"
              className="btn btn-primaer"
              onClick={() => installieren(stand.update)}
            >
              Jetzt aktualisieren
            </button>
          </>
        }
      >
        {stand.update.body && <Aenderungstext text={stand.update.body} />}
        <p>
          Die Aktualisierung wird geladen, geprüft und eingespielt. Danach startet die
          Anwendung neu. Deine Daten bleiben dabei unverändert — sie liegen außerhalb
          des Programms.
        </p>
      </Dialog>
    );
  }

  if (stand.art === "laedt") {
    return (
      <Dialog titel="Aktualisierung wird eingespielt" onSchliessen={() => {}} aktionen={null}>
        <p role="status">
          {stand.anteil === null
            ? "Aktualisierung wird geladen …"
            : `Aktualisierung wird geladen … ${stand.anteil} %`}
        </p>
      </Dialog>
    );
  }

  if (stand.art === "bereit") {
    return (
      <Dialog
        titel="Die Aktualisierung ist eingespielt"
        onSchliessen={() => setAusgeblendet(true)}
        aktionen={
          <button type="button" className="btn btn-primaer" onClick={() => relaunch()}>
            Jetzt neu starten
          </button>
        }
      >
        <p>Sie wird mit dem nächsten Start wirksam.</p>
      </Dialog>
    );
  }

  return null;
}
