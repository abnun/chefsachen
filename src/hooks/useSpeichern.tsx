import { useRef, useState } from "react";
import { SpeicherRueckmeldung } from "../components/SpeicherRueckmeldung";

type Stand =
  | { art: "ruht" }
  | { art: "laeuft" }
  | { art: "gelungen"; text: string; id: number }
  | { art: "fehlgeschlagen"; id: number };

/**
 * Rückmeldung direkt am Speichern-Knopf.
 *
 * Anders als [`useErfolgsHinweis`](./useErfolgsHinweis.tsx), das ein Banner am
 * Kopf des Abschnitts zeigt: In den langen Formularen der Einstellungen steht
 * der Knopf am Fuß, der Banner erschien also außerhalb des Bildes. Man drückte
 * Speichern und sah nichts geschehen. Für Listenseiten bleibt der Banner
 * richtig — dort steht die Aktion ohnehin oben.
 *
 * Der Knopf zeigt während des Speicherns einen eigenen Zustand. Das ist nicht
 * nur Zierde: Ohne ihn ist zwischen Klick und Rückmeldung nichts zu sehen, und
 * ein zweiter Klick löst ein zweites Speichern aus.
 *
 * `ausfuehren` reicht einen Fehler bewusst weiter, statt ihn zu schlucken. Die
 * aufrufende Seite zeigt ihn wie bisher an — am betroffenen Feld oder als
 * Banner. Hier am Knopf steht nur, *ob* es geklappt hat; das *Warum* gehört
 * dorthin, wo es sich beheben lässt.
 */
export function useSpeichern() {
  const zaehler = useRef(0);
  const [stand, setStand] = useState<Stand>({ art: "ruht" });

  async function ausfuehren<T>(aktion: () => Promise<T>, erfolgstext: string): Promise<T> {
    setStand({ art: "laeuft" });
    try {
      const ergebnis = await aktion();
      zaehler.current += 1;
      setStand({ art: "gelungen", text: erfolgstext, id: zaehler.current });
      return ergebnis;
    } catch (e) {
      zaehler.current += 1;
      setStand({ art: "fehlgeschlagen", id: zaehler.current });
      throw e;
    }
  }

  const rueckmeldung =
    stand.art === "gelungen" || stand.art === "fehlgeschlagen" ? (
      <SpeicherRueckmeldung
        // Der Zähler als React-Schlüssel: Zweimal hintereinander dasselbe
        // Ergebnis würde sonst dasselbe Element behalten, die Einblendung
        // liefe nicht erneut und der Abräum-Zeitgeber startete nicht neu.
        key={stand.id}
        art={stand.art === "gelungen" ? "gelungen" : "fehlgeschlagen"}
        onAbgelaufen={() => setStand({ art: "ruht" })}
      >
        {stand.art === "gelungen" ? stand.text : "Nicht gespeichert"}
      </SpeicherRueckmeldung>
    ) : null;

  return { laeuft: stand.art === "laeuft", rueckmeldung, ausfuehren };
}
