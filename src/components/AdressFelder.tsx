import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { api, type Adressvorschlag } from "../api";
import { useOnlineAdressvorschlaege } from "../hooks/useOnlineAdressvorschlaege";
import {
  istDeutschland,
  orteZurPlz,
  ortVorschlaege,
  plzBekannt,
  plzVerzeichnisLaden,
  type OrtVorschlag,
  type PlzVerzeichnis,
} from "../plz";
import { Combobox, type ComboboxOption } from "./Combobox";
import { PflichtMarker } from "./PflichtMarker";

/** Unter drei Zeichen wäre jede Anfrage an komoot nur Rauschen. */
const STRASSE_MINDESTLAENGE = 3;
/** Erst fragen, wenn eine Tipppause entsteht, nicht bei jedem Buchstaben. */
const STRASSE_ENTPRELLEN_MS = 300;

export interface AdressAenderung {
  strasse?: string;
  plz?: string;
  ort?: string;
}

interface AdressFelderProps {
  strasse: string;
  plz: string;
  ort: string;
  /** Ohne Angabe gilt Deutschland, wie in der Einrichtung ohne Landfeld. */
  land?: string;
  /**
   * Bekommt je Ereignis genau eine Änderung, auch wenn sie mehrere Felder
   * betrifft. Die Formulare setzen ihren Zustand mit `{ ...alt, ...änderung }`
   * aus dem letzten Render; zwei Aufrufe hintereinander überschrieben sich.
   */
  onAendern: (aenderung: AdressAenderung) => void;
  feldFehler: (feld: string) => string | null;
}

/**
 * Straße, PLZ und Ort mit Vorschlägen. Gemeinsam für Firmendaten
 * (Einrichtung, Einstellungen) und Kundenadressen, damit alle drei sich
 * gleich verhalten.
 *
 * PLZ und Ort kommen offline aus der mitgelieferten Liste: Fünf Ziffern in
 * der PLZ tragen den Ort ein, wenn es genau einen gibt, und bieten sonst die
 * Orte zur Wahl an. Ein Ort, den jemand selbst geschrieben hat, wird dabei
 * nie überschrieben. Einen, den die PLZ eben erst eingetragen hat, schon:
 * Wer sich bei der PLZ vertippt und sie korrigiert, soll nicht auch noch den
 * Ort von Hand richten müssen.
 *
 * Straßen gibt es nur online und nur, wenn der Nutzer das in den
 * Einstellungen eingeschaltet hat. Ohne Einwilligung bleibt das Straßenfeld
 * ein schlichtes Textfeld, und keine Eingabe verlässt den Rechner.
 */
export function AdressFelder({ strasse, plz, ort, land, onAendern, feldFehler }: AdressFelderProps) {
  const id = useId();
  const de = istDeutschland(land);
  const [online] = useOnlineAdressvorschlaege();
  const [verzeichnis, setVerzeichnis] = useState<PlzVerzeichnis | null>(null);

  const [ortListe, setOrtListe] = useState<OrtVorschlag[]>([]);
  const [ortOffen, setOrtOffen] = useState(false);
  const [strassenListe, setStrassenListe] = useState<Adressvorschlag[]>([]);
  const [strasseOffen, setStrasseOffen] = useState(false);

  /** Der Ort, den zuletzt die PLZ eingetragen hat; null, wenn von Hand. */
  const automatischerOrt = useRef<string | null>(null);
  const strassenZeitgeber = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Zählt Anfragen, damit eine verspätete Antwort keine neuere überschreibt. */
  const strassenAnfrage = useRef(0);

  useEffect(() => {
    let aktuell = true;
    plzVerzeichnisLaden()
      .then((v) => {
        if (aktuell) setVerzeichnis(v);
      })
      .catch(() => {});
    return () => {
      aktuell = false;
      if (strassenZeitgeber.current) clearTimeout(strassenZeitgeber.current);
    };
  }, []);

  const ortSchliessen = useCallback(() => setOrtOffen(false), []);
  const strasseSchliessen = useCallback(() => setStrasseOffen(false), []);

  const ortOptionen = useMemo<ComboboxOption[]>(
    () =>
      ortListe.map((o) => ({
        schluessel: `${o.ort}|${o.ortsteil}|${o.plz}`,
        text: o.ortsteil ? `${o.ort}, ${o.ortsteil}` : o.ort,
        zusatz: `(${o.plz || "mehrere PLZ"})`,
      })),
    [ortListe],
  );
  const strassenOptionen = useMemo<ComboboxOption[]>(
    () =>
      strassenListe.map((s, i) => ({
        schluessel: `${i}|${s.strasse}|${s.hausnummer}|${s.plz}`,
        text: strasseMitNummer(s),
        zusatz: `${s.plz} ${s.ort}`,
      })),
    [strassenListe],
  );

  function plzAendern(neu: string) {
    const wert = neu.trim();
    if (!de || !verzeichnis || !/^\d{5}$/.test(wert)) {
      onAendern({ plz: neu });
      return;
    }
    const ortFrei = ort.trim() === "" || ort === automatischerOrt.current;
    if (!ortFrei) {
      onAendern({ plz: neu });
      return;
    }
    const orte = orteZurPlz(verzeichnis, wert);
    if (orte.length === 1) {
      automatischerOrt.current = orte[0];
      setOrtOffen(false);
      onAendern({ plz: neu, ort: orte[0] });
    } else if (orte.length > 1) {
      // Ein Ort, den die vorige PLZ eingetragen hat, passt jetzt nicht mehr
      // sicher. Stehen lassen hieße, einen Fehler hinzuschreiben.
      automatischerOrt.current = null;
      setOrtListe(ortVorschlaege(verzeichnis, "", wert));
      setOrtOffen(true);
      onAendern({ plz: neu, ort: "" });
    } else {
      onAendern({ plz: neu });
    }
  }

  function ortAendern(neu: string) {
    automatischerOrt.current = null;
    onAendern({ ort: neu });
    if (!de || !verzeichnis) return;
    const liste = ortVorschlaege(verzeichnis, neu, plz);
    setOrtListe(liste);
    setOrtOffen(liste.length > 0);
  }

  function ortWaehlen(index: number) {
    const o = ortListe[index];
    if (!o) return;
    automatischerOrt.current = null;
    setOrtOffen(false);
    onAendern(o.plz && plz.trim() === "" ? { ort: o.ort, plz: o.plz } : { ort: o.ort });
  }

  function strasseAendern(neu: string) {
    onAendern({ strasse: neu });
    if (!online || !de) return;
    if (strassenZeitgeber.current) clearTimeout(strassenZeitgeber.current);
    const nummer = ++strassenAnfrage.current;
    if (neu.trim().length < STRASSE_MINDESTLAENGE) {
      setStrasseOffen(false);
      return;
    }
    strassenZeitgeber.current = setTimeout(() => {
      api.adressen
        .vorschlagen(neu, plz.trim() || null, ort.trim() || null)
        .then((liste) => {
          if (nummer !== strassenAnfrage.current) return;
          setStrassenListe(liste);
          setStrasseOffen(liste.length > 0);
        })
        // Kein Vorschlag ist hier die ehrliche Antwort: Eine Fehlermeldung
        // mitten im Tippen störte mehr, als ein fehlender Vorschlag hilft.
        .catch(() => {
          if (nummer === strassenAnfrage.current) setStrasseOffen(false);
        });
    }, STRASSE_ENTPRELLEN_MS);
  }

  function strasseWaehlen(index: number) {
    const s = strassenListe[index];
    if (!s) return;
    // Eine noch ausstehende Anfrage öffnete die Liste sonst gleich wieder.
    strassenAnfrage.current++;
    automatischerOrt.current = null;
    setStrasseOffen(false);
    onAendern({ strasse: strasseMitNummer(s), plz: s.plz, ort: s.ort });
  }

  const plzWert = plz.trim();
  const plzUnbekannt = de && verzeichnis !== null && /^\d{5}$/.test(plzWert) && !plzBekannt(verzeichnis, plzWert);
  const hinweisId = `${id}-plz-hinweis`;

  return (
    <>
      <div className="feld">
        <label htmlFor={`${id}-strasse`}>
          <PflichtMarker art="pflicht">Straße</PflichtMarker>
        </label>
        {online && de ? (
          <Combobox
            id={`${id}-strasse`}
            value={strasse}
            onWertAendern={strasseAendern}
            optionen={strassenOptionen}
            offen={strasseOffen}
            onOeffnen={() => setStrasseOffen(true)}
            onSchliessen={strasseSchliessen}
            onAuswahl={strasseWaehlen}
            listenBeschriftung="Vorschläge für die Straße"
          />
        ) : (
          <input
            id={`${id}-strasse`}
            autoComplete="off"
            value={strasse}
            onChange={(e) => strasseAendern(e.currentTarget.value)}
          />
        )}
        {feldFehler("strasse") && <div className="feld-fehler" role="alert">{feldFehler("strasse")}</div>}
      </div>
      <div className="felder-reihe felder-plz-ort">
        <div className="feld">
          <label>
            <PflichtMarker art="pflicht">PLZ</PflichtMarker>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={plz}
              aria-describedby={plzUnbekannt ? hinweisId : undefined}
              onChange={(e) => plzAendern(e.currentTarget.value)}
            />
          </label>
          {plzUnbekannt && (
            <p className="feld-hinweis" id={hinweisId}>
              Diese PLZ ist nicht bekannt.
            </p>
          )}
          {feldFehler("plz") && <div className="feld-fehler" role="alert">{feldFehler("plz")}</div>}
        </div>
        <div className="feld">
          <label htmlFor={`${id}-ort`}>
            <PflichtMarker art="pflicht">Ort</PflichtMarker>
          </label>
          {de ? (
            <Combobox
              id={`${id}-ort`}
              value={ort}
              onWertAendern={ortAendern}
              optionen={ortOptionen}
              offen={ortOffen}
              onOeffnen={() => setOrtOffen(true)}
              onSchliessen={ortSchliessen}
              onAuswahl={ortWaehlen}
              listenBeschriftung="Vorschläge für den Ort"
            />
          ) : (
            <input
              id={`${id}-ort`}
              autoComplete="off"
              value={ort}
              onChange={(e) => ortAendern(e.currentTarget.value)}
            />
          )}
          {feldFehler("ort") && <div className="feld-fehler" role="alert">{feldFehler("ort")}</div>}
        </div>
      </div>
    </>
  );
}

function strasseMitNummer(s: Adressvorschlag): string {
  return s.hausnummer ? `${s.strasse} ${s.hausnummer}` : s.strasse;
}
