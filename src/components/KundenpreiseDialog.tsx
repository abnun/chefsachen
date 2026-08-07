import { useEffect, useState } from "react";
import { api, type AppFehler, type Kunde, type Kundenpreis } from "../api";
import { Dialog } from "./Dialog";
import { Fehler } from "./Fehler";
import { formatCent, parseEuro } from "../geld";
import { datumDeutsch } from "../datum";
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";

interface KundenpreiseDialogProps {
  artikelId: string;
  artikelBezeichnung: string;
  standardpreisCent: number;
  kunden: Kunde[];
  /** Nach jeder Änderung, damit die Artikelliste ihre Zählung nachführt. */
  onAenderung: () => void;
  onSchliessen: () => void;
}

/**
 * Abweichung eines Kundenpreises vom Standardpreis, in Prozent.
 *
 * Bei einem Standardpreis von 0 € ist jede Abweichung unendlich — dann lieber
 * gar keine Angabe als „+∞ %".
 */
function abweichung(
  standardpreisCent: number,
  kundenpreisCent: number,
): { text: string; klasse: "guenstiger" | "teurer" } | null {
  if (standardpreisCent === 0) return null;
  const prozent = Math.round(((kundenpreisCent - standardpreisCent) / standardpreisCent) * 100);
  // Gleichstand zählt als „teurer": Es ist schlicht keine Verbilligung, und
  // eine dritte Farbe für diesen seltenen Fall lohnt sich nicht.
  const klasse = prozent < 0 ? "guenstiger" : "teurer";
  return { text: `${prozent < 0 ? "−" : "+"}${Math.abs(prozent)} %`, klasse };
}

/**
 * Kundenpreise eines Artikels: Ausnahmen vom Standardpreis, ansehen und pflegen.
 *
 * Vorher klappte dieser Bereich mitten in der Artikeltabelle auf — eine Zeile
 * mit `colSpan` über alle Spalten, in der eine zweite Auflistung und ein
 * dauerhaft offenes Formular steckten. Das zerriss die Tabelle, und das
 * Formular war größer als die Liste, die es ergänzen sollte.
 *
 * Als Dialog bleibt die Tabelle heil, und der Inhalt hat Platz. Das Formular
 * erscheint erst auf Verlangen: Wer nur nachsehen will, was hinterlegt ist,
 * soll nicht durch ein leeres Eingabeformular scrollen.
 */
export function KundenpreiseDialog({
  artikelId,
  artikelBezeichnung,
  standardpreisCent,
  kunden,
  onAenderung,
  onSchliessen,
}: KundenpreiseDialogProps) {
  const [preise, setPreise] = useState<Kundenpreis[] | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [kundeId, setKundeId] = useState("");
  const [preisText, setPreisText] = useState("");
  const [preisFehlerText, setPreisFehlerText] = useState<string | null>(null);
  const [gueltigAb, setGueltigAb] = useState("");
  // Rückfrage vor dem Entfernen — an der Zeile statt in einem zweiten Dialog.
  // Zwei übereinanderliegende Dialoge streiten sich um die Fokusfalle.
  const [entfernenId, setEntfernenId] = useState<string | null>(null);

  function laden() {
    api.artikel
      .kundenpreise(artikelId)
      .then((liste) => {
        setPreise(liste);
        setFehler(null);
      })
      .catch((e) => {
        setPreise([]);
        setFehler(e as AppFehler);
      });
  }

  useEffect(laden, [artikelId]);

  function kundeName(id: string): string {
    return kunden.find((k) => k.id === id)?.name ?? id;
  }

  async function speichern() {
    const cent = parseEuro(preisText);
    if (cent === null) {
      setPreisFehlerText("Bitte einen gültigen Preis eingeben, z. B. 95,50");
      return;
    }
    setPreisFehlerText(null);
    setFehler(null);
    try {
      await api.artikel.kundenpreisSave({
        id: "",
        artikel_id: artikelId,
        kunde_id: kundeId,
        preis_cent: cent,
        gueltig_ab: gueltigAb || null,
      });
      setKundeId("");
      setPreisText("");
      setGueltigAb("");
      setZeigeFormular(false);
      laden();
      onAenderung();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function entfernen(id: string) {
    setFehler(null);
    try {
      await api.artikel.kundenpreisDelete(id);
      setEntfernenId(null);
      laden();
      onAenderung();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <Dialog
      titel={`Kundenpreise für „${artikelBezeichnung}“`}
      breit
      onSchliessen={onSchliessen}
      aktionen={
        <button type="button" className="btn" onClick={onSchliessen}>
          Schließen
        </button>
      }
    >
      <p className="feld-hinweis hinweis-absatz">
        Standardpreis {formatCent(standardpreisCent)}. Wer hier steht, bekommt einen anderen
        Preis — alle übrigen Kunden den Standardpreis.
      </p>

      <Fehler fehler={fehler} />

      {preise && preise.length === 0 && (
        <p className="kundenpreis-leer">Noch keine Ausnahmen hinterlegt.</p>
      )}

      {preise && preise.length > 0 && (
        <table className="tabelle kundenpreis-tabelle">
          <thead>
            <tr>
              <th>Kunde</th>
              <th>Gültig ab</th>
              <th>Preis</th>
              <th>
                <span className="nur-vorlesen">Entfernen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {preise.map((kp) => {
              const ab = abweichung(standardpreisCent, kp.preis_cent);
              return (
                <tr key={kp.id}>
                  <td>{kundeName(kp.kunde_id)}</td>
                  {/* Ohne Datum gilt der Preis von Anfang an. „—" ließe offen,
                      ob er dann überhaupt gilt. */}
                  <td>{kp.gueltig_ab ? datumDeutsch(kp.gueltig_ab) : "sofort"}</td>
                  <td className="tabelle-num">
                    {formatCent(kp.preis_cent)}
                    {ab && <span className={`kundenpreis-badge ${ab.klasse}`}>{ab.text}</span>}
                  </td>
                  <td className="aktionen">
                    {entfernenId === kp.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-gefahr"
                          onClick={() => entfernen(kp.id)}
                        >
                          Wirklich entfernen
                        </button>
                        <button
                          type="button"
                          className="btn btn-leise"
                          onClick={() => setEntfernenId(null)}
                        >
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-leise"
                        aria-label={`Kundenpreis für ${kundeName(kp.kunde_id)} entfernen`}
                        onClick={() => setEntfernenId(kp.id)}
                      >
                        Entfernen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!zeigeFormular && (
        <button
          type="button"
          className="btn btn-primaer kundenpreis-hinzufuegen"
          onClick={() => setZeigeFormular(true)}
        >
          Preis hinzufügen
        </button>
      )}

      {zeigeFormular && (
        <form
          className="kundenpreis-formular"
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          <label className="feld">
            Kunde
            <PflichtMarker art="pflicht" />
            <select
              required
              value={kundeId}
              onChange={(e) => setKundeId(e.currentTarget.value)}
            >
              <option value="">–</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="feld">
            Preis (€)
            <PflichtMarker art="pflicht" />
            <input required value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
          </label>
          {preisFehlerText && (
            <div className="feld-fehler" role="alert">
              {preisFehlerText}
            </div>
          )}
          <label className="feld">
            Gültig ab
            <input type="date" value={gueltigAb} onChange={(e) => setGueltigAb(e.currentTarget.value)} />
          </label>
          {/* Ein leeres Datumsfeld zeigt „TT.MM.JJJJ" in Grau — das sieht aus
              wie ein Wert und nicht wie eine leere Angabe. Der Hinweis sagt,
              was es bedeutet, nichts einzutragen. */}
          <p className="feld-hinweis">Leer lassen heißt: gilt ab sofort.</p>

          <PflichtLegende />
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">
              Speichern
            </button>
            <button type="button" className="btn" onClick={() => setZeigeFormular(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
