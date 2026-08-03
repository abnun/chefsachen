import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../api";
import { Dialog } from "./Dialog";

/** Zuletzt gesehene Programmversion. */
const SCHLUESSEL_VERSION = "version.zuletzt_gesehen";
/** Änderungstext der zuletzt eingespielten Aktualisierung. */
export const SCHLUESSEL_NOTIZEN = "version.letzte_notizen";

/**
 * Adresse der Veröffentlichung zu einer Version.
 *
 * Steht hier und nicht in der Konfiguration, weil sie nur diesen einen Zweck
 * hat. Zieht das Projekt um, fällt sie beim Suchen nach dem Namen auf.
 */
function releaseAdresse(version: string): string {
  return `https://github.com/abnun/kleinunternehmer-verwaltung/releases/tag/v${version}`;
}

/**
 * Meldet nach einer Aktualisierung, dass sich die Version geändert hat.
 *
 * Ohne das merkt niemand etwas: Die Anwendung startet neu und läuft weiter, nur
 * eben mit anderem Inhalt. Wer wissen wollte, ob die Aktualisierung überhaupt
 * angekommen ist, musste in den Einstellungen nachsehen — und was sich geändert
 * hat, stand dort auch nicht.
 *
 * Als Dialog und nicht als Streifen am Seitenrand: Es passiert einmal nach
 * einem Neustart, und ein Hinweis, den man übersieht, hätte den Zweck verfehlt.
 *
 * Gezeigt wird nur bei einem *Wechsel*. Beim allerersten Start ist nichts
 * gespeichert; dann wird die laufende Version stillschweigend vermerkt, statt
 * einen Neuling mit „Aktualisiert auf 0.2.0" zu begrüßen.
 */
export function VersionsHinweis() {
  const [wechsel, setWechsel] = useState<{ version: string; notizen: string } | null>(null);

  useEffect(() => {
    let abgebaut = false;

    async function pruefen() {
      try {
        const laeuft = await getVersion();
        const zuletzt = await api.einstellungen.get(SCHLUESSEL_VERSION);
        // Vermerken, bevor der Dialog erscheint: Sonst käme er nach einem
        // Absturz beim nächsten Start erneut.
        await api.einstellungen.set(SCHLUESSEL_VERSION, laeuft);
        if (abgebaut || zuletzt === null || zuletzt === laeuft) return;

        const notizen = (await api.einstellungen.get(SCHLUESSEL_NOTIZEN)) ?? "";
        if (!abgebaut) setWechsel({ version: laeuft, notizen });
      } catch {
        // Ohne Tauri-Umgebung oder bei einem Fehler in den Einstellungen bleibt
        // es beim stillen Start — ein Hinweis ist keine Funktion, für die sich
        // eine Fehlermeldung lohnt.
      }
    }

    pruefen();
    return () => {
      abgebaut = true;
    };
  }, []);

  if (!wechsel) return null;

  return (
    <Dialog
      titel={`Aktualisiert auf Version ${wechsel.version}`}
      onSchliessen={() => setWechsel(null)}
      aktionen={
        <>
          <button
            type="button"
            className="btn"
            onClick={() => openUrl(releaseAdresse(wechsel.version)).catch(() => {})}
          >
            Was ist neu?
          </button>
          <button type="button" className="btn btn-primaer" onClick={() => setWechsel(null)}>
            Weiter
          </button>
        </>
      }
    >
      {wechsel.notizen ? (
        <p className="versions-notizen">{wechsel.notizen}</p>
      ) : (
        <p>Die Änderungen stehen in der Veröffentlichung auf GitHub.</p>
      )}
    </Dialog>
  );
}
