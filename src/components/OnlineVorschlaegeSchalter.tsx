import { useState } from "react";
import type { AppFehler } from "../api";
import { useOnlineAdressvorschlaege } from "../hooks/useOnlineAdressvorschlaege";
import { Fehler } from "./Fehler";

export const KOMOOT_DATENSCHUTZ = "https://www.komoot.com/de-de/privacy";

interface OnlineVorschlaegeSchalterProps {
  /** Die Beschriftung des Häkchens; in der Einrichtung knapper als in den Einstellungen. */
  beschriftung: string;
  /**
   * In der Einrichtung zusätzlich der Hinweis, wo man es wieder abschaltet.
   * In den Einstellungen steht man schon davor.
   */
  abschaltenHinweis?: boolean;
}

/**
 * Die Einwilligung in Straßenvorschläge über das Internet, gemeinsam für die
 * Einstellungen und die Ersteinrichtung. Ein Bauteil statt zweier Texte,
 * damit die Beschreibung der Folgen an beiden Stellen dieselbe bleibt: Läuft
 * sie auseinander, stimmt eine der beiden irgendwann nicht mehr.
 *
 * Das Häkchen ist nach der Installation aus und wird nur durch den Nutzer
 * gesetzt (Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO, keine Vorauswahl).
 * Gespeichert wird sofort beim Umschalten: Ein eigener Speichern-Knopf für
 * ein einziges Häkchen wäre ein Schritt, den man vergisst. Alle Adressfelder,
 * die gerade offen sind, erfahren es über denselben Hook sofort.
 */
export function OnlineVorschlaegeSchalter({ beschriftung, abschaltenHinweis = false }: OnlineVorschlaegeSchalterProps) {
  const [online, setzen] = useOnlineAdressvorschlaege();
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  async function umschalten(an: boolean) {
    setFehler(null);
    try {
      await setzen(an);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <>
      <Fehler fehler={fehler} />
      <label className="feld-checkbox">
        <input type="checkbox" checked={online} onChange={(e) => umschalten(e.currentTarget.checked)} />
        {beschriftung}
      </label>
      <p className="feld-hinweis">
        Schlägt beim Tippen auch Straßen vor. Dazu geht, was du ins Straßenfeld tippst, an den
        Dienst Photon von komoot (komoot GmbH, Deutschland), zusammen mit PLZ und Ort, sofern sie
        schon eingetragen sind. Dabei erfährt komoot auch deine IP-Adresse. Das gilt ebenso für
        Kundenadressen: Deren Straße, PLZ und Ort gehen dann auch an komoot. Ausgeschaltet wird
        nichts übertragen.
        {abschaltenHinweis && " Abschalten kannst du es jederzeit in den Einstellungen unter „Adressvorschläge“."}{" "}
        Mehr dazu in der{" "}
        <a href={KOMOOT_DATENSCHUTZ} target="_blank" rel="noopener noreferrer">
          Datenschutzerklärung von komoot
        </a>
        .
      </p>
    </>
  );
}
