import { useEffect, useState } from "react";
import { api } from "../api";
import { Dialog } from "./Dialog";

/** Fälligkeitszeitpunkt der nächsten Erinnerung, als ISO-Datum. */
const SCHLUESSEL_NAECHSTE_ERINNERUNG = "spende.naechste_erinnerung";

// "/5" ist nur ein Vorschlag: paypal.me füllt den Betrag damit vor, der
// Zahlende kann ihn vor dem Absenden trotzdem ändern.
export const PAYPAL_LINK = "https://paypal.me/markusmueller1981/5";

/** Vier bis sechs Wochen ab jetzt, als ISO-Datum. */
function neuerTermin(): string {
  const wochen = 4 + Math.random() * 2;
  const termin = new Date(Date.now() + wochen * 7 * 24 * 60 * 60 * 1000);
  return termin.toISOString();
}

/**
 * Erinnert sporadisch (alle vier bis sechs Wochen) daran, dass eine Spende
 * möglich ist — nie häufiger, nie aufdringlich.
 *
 * Wie `VersionsHinweis`: Beim allerersten Start ist noch kein Termin
 * gespeichert. Dann wird nur der erste Termin vermerkt, ohne sofort zu
 * stören — eine frisch eingerichtete App soll nicht mit einer Spendenbitte
 * begrüßen.
 */
export function SpendenHinweis() {
  const [zeigen, setZeigen] = useState(false);

  useEffect(() => {
    let abgebaut = false;

    async function pruefen() {
      try {
        const termin = await api.einstellungen.get(SCHLUESSEL_NAECHSTE_ERINNERUNG);
        if (termin === null) {
          await api.einstellungen.set(SCHLUESSEL_NAECHSTE_ERINNERUNG, neuerTermin());
          return;
        }
        if (!abgebaut && new Date(termin).getTime() <= Date.now()) {
          setZeigen(true);
        }
      } catch {
        // Ohne Tauri-Umgebung oder bei einem Fehler bleibt es beim stillen
        // Start — ein Hinweis ist keine Funktion, für die sich eine
        // Fehlermeldung lohnt.
      }
    }

    pruefen();
    return () => {
      abgebaut = true;
    };
  }, []);

  function schliessen() {
    setZeigen(false);
    // Sofort neu würfeln, nicht erst beim nächsten Start berechnen — sonst
    // bliebe der abgelaufene Termin stehen und das Popup käme bei jedem
    // weiteren Start erneut, bis die App neu gestartet wird.
    api.einstellungen.set(SCHLUESSEL_NAECHSTE_ERINNERUNG, neuerTermin()).catch(() => {});
  }

  if (!zeigen) return null;

  return (
    <Dialog
      titel="Gefällt dir Chefsachen?"
      onSchliessen={schliessen}
      aktionen={
        <>
          <button type="button" className="btn" onClick={schliessen}>
            Vielleicht später
          </button>
          <a
            href={PAYPAL_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primaer"
            onClick={schliessen}
          >
            Über PayPal unterstützen
          </a>
        </>
      }
    >
      <p>Über eine kleine Unterstützung würde ich mich freuen — muss aber nicht.</p>
      <p>
        Eine freiwillige Zuwendung ohne Gegenleistung — keine Spende im steuerlichen Sinn, nicht
        absetzbar, und ohne Einfluss auf den Funktionsumfang.
      </p>
    </Dialog>
  );
}
