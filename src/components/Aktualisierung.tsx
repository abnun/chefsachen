import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "../api";
import { useAktualisierung } from "../hooks/useAktualisierung";
import { Aenderungstext } from "./Aenderungstext";

/**
 * Suche nach neuen Programmversionen — die Bedienoberfläche dazu.
 *
 * Die eigentliche Suche (auch die beim Programmstart) sitzt im
 * `AktualisierungProvider` in App.tsx, damit sie unabhängig davon läuft, ob
 * diese Seite gerade angezeigt wird. Diese Komponente zeigt Stand und
 * Bedienung dafür sowie den Protokollpfad.
 *
 * Die Anwendung ist nicht signiert, ein automatisches Einspielen im
 * Hintergrund wäre deshalb heikel — der Nutzer entscheidet selbst, wann er
 * aktualisiert. Heruntergeladen und geprüft wird in Rust: Das Paket muss mit
 * dem privaten Schlüssel signiert sein, dessen öffentliche Hälfte in
 * `tauri.conf.json` steht; ein manipuliertes Paket wird abgelehnt, bevor es
 * installiert wird.
 */
export function Aktualisierung() {
  const { version, autoSuche, stand, suchen, installieren, autoSucheUmschalten } = useAktualisierung();
  const [protokollPfad, setProtokollPfad] = useState("");

  useEffect(() => {
    api.protokoll.pfad().then(setProtokollPfad).catch(() => setProtokollPfad(""));
  }, []);

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
