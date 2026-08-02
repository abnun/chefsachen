import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Suche nach neuen Programmversionen.
 *
 * Die Anwendung ist nicht signiert, ein automatisches Einspielen im
 * Hintergrund wäre deshalb heikel — der Nutzer entscheidet selbst, wann er
 * aktualisiert. Beim Start wird nur *gesucht*; findet sich nichts oder ist der
 * Rechner offline, bleibt die Suche stumm. Eine Fehlermeldung bekommt nur, wer
 * selbst auf „Nach Aktualisierung suchen" geklickt hat.
 *
 * Heruntergeladen und geprüft wird in Rust. Das Paket muss mit dem privaten
 * Schlüssel signiert sein, dessen öffentliche Hälfte in `tauri.conf.json`
 * steht; ein manipuliertes Paket wird abgelehnt, bevor es installiert wird.
 */
type Stand =
  | { art: "unbekannt" }
  | { art: "sucht" }
  | { art: "aktuell" }
  | { art: "verfuegbar"; update: Update }
  | { art: "laedt"; anteil: number | null }
  | { art: "bereit" }
  | { art: "fehler"; meldung: string };

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function Aktualisierung() {
  const [version, setVersion] = useState("");
  const [stand, setStand] = useState<Stand>({ art: "unbekannt" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);

  const suchen = useCallback(async (manuell: boolean) => {
    setStand({ art: "sucht" });
    try {
      const update = await check();
      setStand(update ? { art: "verfuegbar", update } : { art: "aktuell" });
    } catch (e) {
      // Ohne Netz schlägt die Suche fehl. Beim Programmstart ist das kein
      // Ereignis, über das der Nutzer etwas erfahren müsste.
      setStand(manuell ? { art: "fehler", meldung: fehlertext(e) } : { art: "unbekannt" });
    }
  }, []);

  useEffect(() => {
    suchen(false);
  }, [suchen]);

  async function installieren(update: Update) {
    setStand({ art: "laedt", anteil: null });
    try {
      let gesamt = 0;
      let geladen = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") {
          gesamt = e.data.contentLength ?? 0;
        } else if (e.event === "Progress") {
          geladen += e.data.chunkLength;
          // Ohne Content-Length lässt sich kein Anteil bilden — dann bleibt es
          // bei „wird geladen" statt einer erfundenen Prozentzahl.
          setStand({ art: "laedt", anteil: gesamt > 0 ? Math.round((geladen / gesamt) * 100) : null });
        }
      });
      setStand({ art: "bereit" });
    } catch (e) {
      setStand({ art: "fehler", meldung: fehlertext(e) });
    }
  }

  return (
    <section>
      <h2>Programmversion</h2>
      <p>Installiert: Version {version || "unbekannt"}</p>

      {stand.art === "sucht" && <p role="status">Es wird nach einer Aktualisierung gesucht …</p>}

      {stand.art === "aktuell" && <p role="status">Die Anwendung ist auf dem neuesten Stand.</p>}

      {stand.art === "verfuegbar" && (
        <div className="hinweis-karte">
          <h3>Version {stand.update.version} ist verfügbar</h3>
          {stand.update.body && <p>{stand.update.body}</p>}
          <p>
            Die Aktualisierung wird geladen, geprüft und eingespielt. Danach startet die
            Anwendung neu. Deine Daten bleiben dabei unverändert — sie liegen außerhalb
            des Programms.
          </p>
          <button type="button" className="btn btn-primaer" onClick={() => installieren(stand.update)}>
            Jetzt aktualisieren
          </button>
        </div>
      )}

      {stand.art === "laedt" && (
        <p role="status">
          {stand.anteil === null
            ? "Aktualisierung wird geladen …"
            : `Aktualisierung wird geladen … ${stand.anteil} %`}
        </p>
      )}

      {stand.art === "bereit" && (
        <div className="hinweis-karte">
          <h3>Die Aktualisierung ist eingespielt</h3>
          <p>Sie wird mit dem nächsten Start wirksam.</p>
          <button type="button" className="btn btn-primaer" onClick={() => relaunch()}>
            Jetzt neu starten
          </button>
        </div>
      )}

      {stand.art === "fehler" && (
        <p role="alert">
          Die Suche nach einer Aktualisierung ist fehlgeschlagen: {stand.meldung}
        </p>
      )}

      {stand.art !== "sucht" && stand.art !== "laedt" && (
        <button type="button" className="btn" onClick={() => suchen(true)}>
          Nach Aktualisierung suchen
        </button>
      )}
    </section>
  );
}
