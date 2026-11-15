import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { bicZurIban, blzVerzeichnisLaden, type BlzVerzeichnis } from "../blz";
import { IBAN_LAENGEN, ibanBefund, ibanGruppieren, ibanKompakt } from "../iban";

export interface BankAenderung {
  iban?: string;
  bic?: string;
}

interface IbanFeldProps {
  iban: string;
  bic: string;
  /**
   * Bekommt je Ereignis genau eine Änderung, auch wenn sie IBAN und BIC
   * zugleich betrifft. Wie bei den Adressfeldern setzen die Formulare ihren
   * Zustand mit `{ ...alt, ...änderung }`; zwei Aufrufe hintereinander
   * überschrieben sich.
   */
  onAendern: (aenderung: BankAenderung) => void;
  feldFehler: (feld: string) => string | null;
}

/** Wie viele Buchstaben und Ziffern vor einer Stelle im Text stehen. */
function zeichenVor(text: string, stelle: number): number {
  return ibanKompakt(text.slice(0, stelle)).length;
}

/** Die Stelle im gruppierten Text, hinter der `anzahl` Zeichen stehen. */
function stelleNach(gruppiert: string, anzahl: number): number {
  if (anzahl === 0) return 0;
  let gezaehlt = 0;
  for (let i = 0; i < gruppiert.length; i++) {
    if (gruppiert[i] !== " ") gezaehlt++;
    if (gezaehlt === anzahl) return i + 1;
  }
  return gruppiert.length;
}

function hinweisText(iban: string): string | null {
  const befund = ibanBefund(iban);
  if (befund === "pruefziffer") {
    return "Die Prüfziffer der IBAN passt nicht. Vermutlich ein Tippfehler oder Zahlendreher.";
  }
  if (befund === "zu-lang") {
    const land = ibanKompakt(iban).slice(0, 2);
    return `Eine IBAN aus ${land} hat ${IBAN_LAENGEN[land]} Stellen.`;
  }
  return null;
}

/**
 * IBAN und BIC nebeneinander, gemeinsam für die Firmendaten in Einrichtung
 * und Einstellungen.
 *
 * Die IBAN wird beim Tippen in Viererblöcke gesetzt, wie sie gedruckt wird;
 * so lässt sie sich mit dem Kontoauszug vergleichen. Gespeichert wird diese
 * gruppierte Form, wie zuvor alles, was jemand von Hand eingab. Das Backend
 * entfernt die Leerzeichen überall, wo sie stören würden (Girocode,
 * XRechnung), und gruppiert für das PDF selbst.
 *
 * Bei einer vollständigen deutschen IBAN mit stimmender Prüfziffer trägt das
 * Feld den BIC aus der mitgelieferten Bankleitzahlendatei ein, aber nur in
 * ein leeres BIC-Feld oder über einen BIC, den es selbst eingetragen hat.
 * Einen von Hand geschriebenen überschreibt es nie. Wird die IBAN wieder
 * unvollständig, nimmt es den selbst eingetragenen BIC zurück. Bei unbekannter BLZ
 * bleibt das Feld leer; ein Hinweis brächte nichts, weil der BIC bei
 * Inlandsüberweisungen ohnehin entbehrlich ist.
 */
export function IbanFeld({ iban, bic, onAendern, feldFehler }: IbanFeldProps) {
  const id = useId();
  const hinweisId = `${id}-hinweis`;
  const feld = useRef<HTMLInputElement>(null);
  const [verzeichnis, setVerzeichnis] = useState<BlzVerzeichnis | null>(null);
  /** Der BIC, den zuletzt die IBAN eingetragen hat; null, wenn von Hand. */
  const automatischerBic = useRef<string | null>(null);
  /** Wohin der Cursor nach dem nächsten Rendern soll. */
  const cursorZiel = useRef<number | null>(null);

  useEffect(() => {
    let aktuell = true;
    blzVerzeichnisLaden()
      .then((v) => {
        if (aktuell) setVerzeichnis(v);
      })
      // Ohne Zuordnung bleibt das BIC-Feld ein schlichtes Textfeld.
      .catch(() => {});
    return () => {
      aktuell = false;
    };
  }, []);

  const angezeigt = ibanGruppieren(iban);

  // Erst nach dem Rendern, wenn der neue Wert im Feld steht: Vorher setzte
  // React den Cursor beim Zuweisen des Werts wieder ans Ende.
  useLayoutEffect(() => {
    if (cursorZiel.current === null || !feld.current) return;
    if (document.activeElement === feld.current) {
      feld.current.setSelectionRange(cursorZiel.current, cursorZiel.current);
    }
    cursorZiel.current = null;
  });

  function ibanAendern(e: ChangeEvent<HTMLInputElement>) {
    const roh = e.currentTarget.value;
    const cursor = e.currentTarget.selectionStart ?? roh.length;
    const neu = ibanGruppieren(roh);
    cursorZiel.current = stelleNach(neu, zeichenVor(roh, cursor));

    const bicFrei = bic.trim() === "" || bic === automatischerBic.current;
    if (!bicFrei || !verzeichnis) {
      onAendern({ iban: neu });
      return;
    }
    // Der BIC folgt der IBAN, auch zu „leer": bei unbekannter Bankleitzahl,
    // bei falscher Prüfziffer und sobald die IBAN wieder unvollständig ist.
    // Sonst stünde der BIC einer Bank da, zu der die IBAN nicht mehr gehört.
    const gefunden = bicZurIban(verzeichnis, neu) ?? "";
    automatischerBic.current = gefunden || null;
    onAendern({ iban: neu, bic: gefunden });
  }

  const hinweis = hinweisText(iban);

  return (
    <div className="felder-reihe felder-breit-schmal">
      <div className="feld">
        <label>
          IBAN
          <input
            ref={feld}
            className="iban-eingabe"
            value={angezeigt}
            onChange={ibanAendern}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hinweis ? hinweisId : undefined}
          />
        </label>
        {hinweis && (
          <p className="feld-hinweis" id={hinweisId}>
            {hinweis}
          </p>
        )}
        {feldFehler("iban") && <div role="alert" className="feld-fehler">{feldFehler("iban")}</div>}
      </div>
      <div className="feld">
        <label>
          BIC
          <input
            className="iban-eingabe"
            value={bic}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              automatischerBic.current = null;
              onAendern({ bic: e.currentTarget.value.toUpperCase().replace(/\s/g, "") });
            }}
          />
        </label>
        {feldFehler("bic") && <div role="alert" className="feld-fehler">{feldFehler("bic")}</div>}
      </div>
    </div>
  );
}
