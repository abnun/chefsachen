import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { info, warn } from "@tauri-apps/plugin-log";
import { api } from "../api";
import { SCHLUESSEL_NOTIZEN } from "./VersionsHinweis";
import { Aenderungstext } from "./Aenderungstext";

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

/** Einstellungsschlüssel für die Suche beim Start. */
const SCHLUESSEL_AUTOSUCHE = "aktualisierung.beim_start_suchen";

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function Aktualisierung() {
  const [version, setVersion] = useState("");
  const [protokollPfad, setProtokollPfad] = useState("");
  /** Ob beim Start von selbst gesucht wird. `null`, solange unbekannt. */
  const [autoSuche, setAutoSuche] = useState<boolean | null>(null);
  const [stand, setStand] = useState<Stand>({ art: "unbekannt" });
  /**
   * Ob die Suche beim Start schon erledigt ist.
   *
   * Sie hängt an der gespeicherten Einstellung und läuft daher erst los,
   * nachdem diese geladen ist. Klickt der Nutzer in der Zwischenzeit selbst auf
   * „Suchen", überschrieb die nachlaufende automatische Suche dessen Ergebnis —
   * eine Fehlermeldung verschwand wieder, ohne dass etwas passiert wäre.
   */
  const startsucheErledigt = useRef(false);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
    api.protokoll.pfad().then(setProtokollPfad).catch(() => setProtokollPfad(""));
    // Voreinstellung ist „an": Wer nichts einstellt, soll von Fehlerbehebungen
    // erfahren. Nur ein ausdrückliches „nein" schaltet ab.
    api.einstellungen
      .get(SCHLUESSEL_AUTOSUCHE)
      .then((wert) => setAutoSuche(wert !== "nein"))
      .catch(() => setAutoSuche(true));
  }, []);

  const suchen = useCallback(async (manuell: boolean) => {
    startsucheErledigt.current = true;
    setStand({ art: "sucht" });
    try {
      const update = await check();
      /*
       * Das Ergebnis gehört ins Protokoll.
       *
       * „Auf dem neuesten Stand" ist die einzige Meldung der Anwendung, die
       * richtig aussieht und trotzdem falsch sein kann — etwa weil die
       * Veröffentlichung auf der Gegenseite noch nicht umgeschaltet war. Ohne
       * diese Zeile ließ sich hinterher nicht unterscheiden, ob wirklich
       * nichts da war oder ob die Abfrage etwas anderes zu sehen bekam.
       */
      // Die installierte Version steht bereits im Protokollkopf; sie hier zu
      // wiederholen hieße, sie in diese Funktion hineinzuziehen, bevor sie
      // geladen ist.
      info(
        update
          ? `Aktualisierungssuche: Version ${update.version} gefunden`
          : "Aktualisierungssuche: nichts Neueres gefunden",
      ).catch(() => {});
      setStand(update ? { art: "verfuegbar", update } : { art: "aktuell" });
    } catch (e) {
      warn(`Aktualisierungssuche fehlgeschlagen: ${fehlertext(e)}`).catch(() => {});
      // Ohne Netz schlägt die Suche fehl. Beim Programmstart ist das kein
      // Ereignis, über das der Nutzer etwas erfahren müsste.
      setStand(manuell ? { art: "fehler", meldung: fehlertext(e) } : { art: "unbekannt" });
    }
  }, []);

  useEffect(() => {
    // Erst suchen, wenn feststeht, ob überhaupt gesucht werden soll — sonst
    // liefe beim ersten Rendern eine Abfrage los, die der Nutzer abbestellt hat.
    // Und nur, solange nicht schon gesucht wurde: Ein Klick des Nutzers geht vor.
    if (autoSuche && !startsucheErledigt.current) suchen(false);
  }, [autoSuche, suchen]);

  async function autoSucheUmschalten(an: boolean) {
    setAutoSuche(an);
    try {
      await api.einstellungen.set(SCHLUESSEL_AUTOSUCHE, an ? "ja" : "nein");
    } catch (e) {
      // Die Einstellung ließ sich nicht merken — das gehört gesagt, sonst
      // steht sie beim nächsten Start wieder anders da.
      setStand({ art: "fehler", meldung: fehlertext(e) });
    }
  }

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
      // Den Änderungstext vor dem Neustart festhalten: Danach ist das Update-
      // Objekt fort, und der Hinweis nach dem Start hätte nichts zu zeigen.
      await api.einstellungen.set(SCHLUESSEL_NOTIZEN, update.body ?? "").catch(() => {});
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
          {stand.update.body && <Aenderungstext text={stand.update.body} />}
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

      <label className="feld-checkbox">
        <input
          type="checkbox"
          checked={autoSuche ?? true}
          onChange={(e) => autoSucheUmschalten(e.currentTarget.checked)}
        />
        Beim Programmstart nach einer Aktualisierung suchen
      </label>
      <p className="feld-hinweis">
        Es wird nur gesucht, nie von selbst installiert. Ohne Internetverbindung
        passiert nichts.
      </p>

      {stand.art !== "sucht" && stand.art !== "laedt" && (
        <button type="button" className="btn" onClick={() => suchen(true)}>
          Nach Aktualisierung suchen
        </button>
      )}

      {/* Geht etwas schief, ist diese Datei das Einzige, woran sich im
          Nachhinein noch etwas ablesen lässt. Sie enthält technische Vorgänge
          und Fehlertexte — keine Kunden-, Rechnungs- oder Artikeldaten. */}
      {protokollPfad && (
        <>
          <h3>Protokoll</h3>
          <p>
            Wenn etwas nicht funktioniert, hilft diese Datei bei der Suche nach der
            Ursache. Sie enthält technische Vorgänge und Fehlermeldungen, aber keine
            Kunden- oder Rechnungsdaten.
          </p>
          <p className="pfad">{protokollPfad}</p>
          <button type="button" className="btn" onClick={() => revealItemInDir(protokollPfad)}>
            Protokolldatei im Ordner zeigen
          </button>
        </>
      )}
    </section>
  );
}
