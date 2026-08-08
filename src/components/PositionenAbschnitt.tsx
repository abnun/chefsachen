import { useEffect, useState } from "react";
import { api, type AppFehler, type Artikel, type Belegposition } from "../api";
import { ArtikelAuswahl } from "./ArtikelAuswahl";
import { Fehler } from "./Fehler";
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useBestaetigung } from "../hooks/useBestaetigung";
import { formatCent, formatMenge, parseEuro, parseMenge } from "../geld";

interface PositionenAbschnittProps {
  belegId: string;
  /** Kunde und Datum bestimmen, welcher Preis für einen Artikel gilt. */
  kundeId: string;
  belegdatum: string;
  positionen: Belegposition[];
  artikelListe: Artikel[];
  bearbeitbar: boolean;
  onGeaendert: () => void;
  onLoeschen: (id: string) => void;
}

export function PositionenAbschnitt({
  belegId,
  kundeId,
  belegdatum,
  artikelListe,
  positionen,
  bearbeitbar,
  onGeaendert,
  onLoeschen,
}: PositionenAbschnittProps) {
  const [artikelId, setArtikelId] = useState("");
  const [freitext, setFreitext] = useState(false);
  const [bezeichnung, setBezeichnung] = useState("");
  const [einheitKuerzel, setEinheitKuerzel] = useState("");
  const [einzelpreis, setEinzelpreis] = useState("");
  const [menge, setMenge] = useState("1");
  /** Steuersatz für Freitextpositionen; Artikelpositionen erben ihn im Backend vom Artikel. */
  const [ustSatz, setUstSatz] = useState(19);
  /** Id der Position, die gerade bearbeitet wird; leer beim Anlegen. */
  const [bearbeiteId, setBearbeiteId] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  /**
   * Der Preis, der für den gewählten Artikel gilt — beim Kunden, am Belegdatum.
   *
   * Bisher stand hier „Preis wird beim Speichern ermittelt": Ob ein Kundenpreis
   * greift, erfuhr man erst, nachdem die Position schon in der Liste stand. Der
   * Befehl dafür gab es längst, er wurde nur nirgends aufgerufen.
   */
  const [geltenderPreis, setGeltenderPreis] = useState<number | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  const gewaehlterArtikel = artikelListe.find((a) => a.id === artikelId);

  useEffect(() => {
    if (freitext || !artikelId || !kundeId) {
      setGeltenderPreis(null);
      return;
    }
    let abgebaut = false;
    api.artikel
      .preisErmitteln(artikelId, kundeId, belegdatum)
      .then((cent) => {
        if (!abgebaut) setGeltenderPreis(cent);
      })
      // Scheitert die Abfrage, bleibt es beim bisherigen Verhalten: Der Preis
      // entsteht beim Speichern. Eine Fehlermeldung an dieser Stelle wäre
      // lauter als der Nutzen.
      .catch(() => {
        if (!abgebaut) setGeltenderPreis(null);
      });
    return () => {
      abgebaut = true;
    };
  }, [artikelId, kundeId, belegdatum, freitext]);

  /**
   * Weicht der geltende Preis vom Standardpreis des Artikels ab, greift ein
   * Kundenpreis. Der Vergleich ist verlässlich, weil beide Zahlen aus derselben
   * Quelle stammen — der Artikelliste und der Preisermittlung des Backends.
   */
  const kundenpreisGreift =
    geltenderPreis !== null &&
    gewaehlterArtikel !== undefined &&
    geltenderPreis !== gewaehlterArtikel.standardpreis_cent;

  function formularLeeren() {
    setBearbeiteId("");
    setFreitext(false);
    setBezeichnung("");
    setEinheitKuerzel("");
    setEinzelpreis("");
    setMenge("1");
    setUstSatz(19);
    setArtikelId("");
    setFehler(null);
  }

  function bearbeiten(p: Belegposition) {
    setBearbeiteId(p.id);
    setFreitext(p.artikel_id === null);
    setBezeichnung(p.bezeichnung);
    setEinheitKuerzel(p.einheit_kuerzel);
    setEinzelpreis((p.einzelpreis_cent / 100).toFixed(2).replace(".", ","));
    setMenge(formatMenge(p.menge));
    setUstSatz(p.ust_satz_prozent);
    setArtikelId(p.artikel_id ?? "");
    setFehler(null);
  }

  /**
   * Summe der Eingabe, noch bevor gespeichert wird.
   *
   * Ohne sie erfährt man den Betrag erst nach dem Absenden — und bei einem
   * Vertipper in der Menge auch erst dann. Für Artikel ohne überschriebenen
   * Preis lässt sich hier nichts sagen: Der gültige Preis kann ein Kundenpreis
   * sein, und den kennt nur das Backend. Dann bleibt es bei einem Hinweis
   * statt einer erfundenen Zahl.
   */
  const vorschau = (() => {
    const mengeX1000 = parseMenge(menge);
    const preisCent = einzelpreis.trim() === "" ? null : parseEuro(einzelpreis);
    if (mengeX1000 === null) return { text: "Menge unklar", betrag: null };
    if (preisCent === null) {
      if (einzelpreis.trim() === "" && !freitext) {
        return geltenderPreis === null
          ? { text: "Preis wird beim Speichern ermittelt", betrag: null }
          : { text: "", betrag: Math.round((mengeX1000 * geltenderPreis) / 1000) };
      }
      return { text: "Preis unklar", betrag: null };
    }
    return { text: "", betrag: Math.round((mengeX1000 * preisCent) / 1000) };
  })();

  async function speichern() {
    setFehler(null);
    const mengeX1000 = parseMenge(menge);
    if (mengeX1000 === null) {
      setFehler({ typ: "validation", feld: "menge", meldung: "Ungültige Menge" });
      return;
    }
    const einzelpreisCent = einzelpreis.trim() === "" ? null : parseEuro(einzelpreis);
    if (einzelpreis.trim() !== "" && einzelpreisCent === null) {
      setFehler({ typ: "validation", feld: "einzelpreis_cent", meldung: "Ungültiger Preis" });
      return;
    }
    try {
      await api.belege.positionSave({
        id: bearbeiteId,
        beleg_id: belegId,
        artikel_id: freitext ? null : artikelId || null,
        bezeichnung: freitext ? bezeichnung : "",
        einheit_kuerzel: freitext ? einheitKuerzel : "",
        einzelpreis_cent: einzelpreisCent,
        menge: mengeX1000,
        ust_satz_prozent: freitext ? ustSatz : null,
      });
      const geaendert = bearbeiteId !== "";
      formularLeeren();
      onGeaendert();
      zeigen(geaendert ? "Position geändert" : "Position hinzugefügt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function verschieben(id: string, richtung: "hoch" | "runter") {
    setFehler(null);
    try {
      await api.belege.positionVerschieben(id, richtung);
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschenBestaetigen(id: string, bezeichnung: string) {
    if (!(await bestaetigen(`Position „${bezeichnung}" löschen?`))) return;
    if (id === bearbeiteId) formularLeeren();
    onLoeschen(id);
  }

  return (
    <section className="karte">
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th>Menge</th>
            <th>Einheit</th>
            <th>Einzelpreis</th>
            <th>Summe</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positionen.map((p, i) => (
            <tr key={p.id} className={p.id === bearbeiteId ? "zeile-bearbeitet" : undefined}>
              <td>{p.bezeichnung}</td>
              <td>{formatMenge(p.menge)}</td>
              <td>{p.einheit_kuerzel}</td>
              <td>{formatCent(p.einzelpreis_cent)}</td>
              <td>{formatCent(p.positionssumme_cent)}</td>
              <td className="aktionen">
                {bearbeitbar && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`„${p.bezeichnung}" nach oben`}
                      disabled={i === 0}
                      onClick={() => verschieben(p.id, "hoch")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`„${p.bezeichnung}" nach unten`}
                      disabled={i === positionen.length - 1}
                      onClick={() => verschieben(p.id, "runter")}
                    >
                      ↓
                    </button>
                    <button type="button" className="btn" onClick={() => bearbeiten(p)}>
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="btn btn-gefahr"
                      onClick={() => loeschenBestaetigen(p.id, p.bezeichnung)}
                    >
                      Löschen
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bearbeitbar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          <h3>{bearbeiteId ? "Position ändern" : "Position hinzufügen"}</h3>
          <label className="feld-checkbox">
            <input
              type="checkbox"
              checked={freitext}
              onChange={(e) => setFreitext(e.currentTarget.checked)}
            />
            Freitextposition
          </label>
          {freitext ? (
            <>
              <label className="feld">
                <PflichtMarker art="pflicht">Bezeichnung</PflichtMarker>
                <input value={bezeichnung} onChange={(e) => setBezeichnung(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einheit
                <input value={einheitKuerzel} onChange={(e) => setEinheitKuerzel(e.currentTarget.value)} />
              </label>
              <label className="feld">
                <PflichtMarker art="pflicht">Einzelpreis</PflichtMarker>
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="95,00" />
              </label>
              <label className="feld">
                Umsatzsteuersatz
                <select value={ustSatz} onChange={(e) => setUstSatz(Number(e.currentTarget.value))}>
                  <option value={19}>19 % (Regelsatz)</option>
                  <option value={7}>7 % (ermäßigt)</option>
                  <option value={0}>0 % (steuerfrei)</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <ArtikelAuswahl
                artikelListe={artikelListe}
                artikelId={artikelId}
                onArtikelId={setArtikelId}
              />
              {/* Welcher Preis gilt — und ob er vom Standardpreis abweicht.
                  Ohne diese Zeile erfuhr man einen Kundenpreis erst, wenn die
                  Position schon in der Liste stand. */}
              {geltenderPreis !== null && gewaehlterArtikel && (
                <p className={kundenpreisGreift ? "preis-herkunft kundenpreis" : "preis-herkunft"}>
                  {kundenpreisGreift ? (
                    <>
                      <strong>Kundenpreis {formatCent(geltenderPreis)}</strong> statt{" "}
                      {formatCent(gewaehlterArtikel.standardpreis_cent)} — für diesen Kunden
                      hinterlegt.
                    </>
                  ) : (
                    <>Standardpreis {formatCent(geltenderPreis)} — kein Kundenpreis hinterlegt.</>
                  )}
                </p>
              )}
              <label className="feld">
                Preis überschreiben (optional)
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="automatisch" />
              </label>
            </>
          )}
          <label className="feld">
            <PflichtMarker art="pflicht">Menge</PflichtMarker>
            <input value={menge} onChange={(e) => setMenge(e.currentTarget.value)} />
          </label>

          <p className="positions-vorschau" aria-live="polite">
            {vorschau.betrag === null ? vorschau.text : `Positionssumme: ${formatCent(vorschau.betrag)}`}
          </p>

          <PflichtLegende />
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">
              {bearbeiteId ? "Änderung speichern" : "Position hinzufügen"}
            </button>
            {bearbeiteId && (
              <button type="button" className="btn" onClick={formularLeeren}>
                Abbrechen
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
