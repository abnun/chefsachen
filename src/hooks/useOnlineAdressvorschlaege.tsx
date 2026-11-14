import { useEffect, useState } from "react";
import { api } from "../api";

/** Derselbe Schlüssel, den das Backend vor jeder Anfrage prüft. */
export const SCHLUESSEL_ONLINE_VORSCHLAEGE = "adressen.online_vorschlaege";

/**
 * Alle gerade eingehängten Nutzer der Einstellung. Schaltet jemand sie um,
 * erfahren es die anderen sofort; sonst bliebe das Firmenformular in den
 * Einstellungen beim alten Stand, bis man die Seite neu öffnet.
 */
const hoerer = new Set<(an: boolean) => void>();

/**
 * Ob Straßenvorschläge aus dem Internet eingeschaltet sind, und wie man es
 * ändert.
 *
 * Bis die Antwort da ist, gilt „aus". Ein Fehler beim Lesen gilt ebenfalls
 * als „aus": Im Zweifel bleibt der Rechner still. Die eigentliche Sperre
 * sitzt ohnehin im Backend, das hier ist nur die Anzeige dazu.
 */
export function useOnlineAdressvorschlaege(): [boolean, (an: boolean) => Promise<void>] {
  const [an, setAn] = useState(false);

  useEffect(() => {
    let aktuell = true;
    // Über ein Promise, damit auch ein fehlender Eintrag in einer
    // Test-Attrappe zum „aus" wird statt zum Absturz.
    Promise.resolve()
      .then(() => api.einstellungen.get(SCHLUESSEL_ONLINE_VORSCHLAEGE))
      .then((wert) => {
        if (aktuell) setAn(wert === "true");
      })
      .catch(() => {});
    hoerer.add(setAn);
    return () => {
      aktuell = false;
      hoerer.delete(setAn);
    };
  }, []);

  async function setzen(neu: boolean) {
    await api.einstellungen.set(SCHLUESSEL_ONLINE_VORSCHLAEGE, neu ? "true" : "false");
    for (const h of hoerer) h(neu);
  }

  return [an, setzen];
}
