import { useState } from "react";
import { api, type AppFehler, type Zahlung } from "../api";
import { Fehler } from "./Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useBestaetigung } from "../hooks/useBestaetigung";
import { formatCent, parseEuro } from "../geld";
import { heuteIso } from "../datum";
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";

interface ZahlungenAbschnittProps {
  rechnungId: string;
  zahlungen: Zahlung[];
  offenerBetragCent: number;
  onGeaendert: () => void;
}

export function ZahlungenAbschnitt({ rechnungId, zahlungen, offenerBetragCent, onGeaendert }: ZahlungenAbschnittProps) {
  const [datum, setDatum] = useState(heuteIso);
  const [betrag, setBetrag] = useState("");
  const [erstattung, setErstattung] = useState(false);
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  // Ohne Sperre legt ein Doppelklick zwei Zahlungen an.
  const [laeuft, setLaeuft] = useState(false);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  async function zahlungLoeschen(zahlungId: string, betragCent: number) {
    const frage = `Zahlung über ${formatCent(betragCent)} löschen? Der offene Betrag der Rechnung erhöht sich entsprechend.`;
    if (!(await bestaetigen(frage, "Löschen"))) return;
    setFehler(null);
    try {
      await api.belege.zahlungDelete(zahlungId);
      onGeaendert();
      zeigen("Zahlung gelöscht");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function erfassen() {
    if (laeuft) return;
    setFehler(null);
    const betragCent = parseEuro(betrag);
    if (betragCent === null) {
      setFehler({ typ: "validation", feld: "betrag_cent", meldung: "Ungültiger Betrag" });
      return;
    }
    setLaeuft(true);
    try {
      await api.belege.zahlungErfassen({
        rechnung_id: rechnungId,
        datum,
        betrag_cent: erstattung ? -betragCent : betragCent,
        notiz,
      });
      setBetrag("");
      setNotiz("");
      onGeaendert();
      zeigen("Zahlung erfasst");
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className="karte">
      <h2>Zahlungen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <p>Offener Betrag: {formatCent(offenerBetragCent)}</p>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Notiz</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {zahlungen.map((z) => (
            <tr key={z.id}>
              <td>{z.datum}</td>
              <td>{formatCent(z.betrag_cent)}</td>
              <td>{z.notiz}</td>
              <td>
                {/* Ohne diese Möglichkeit wäre eine vertippte Zahlung nur über
                    eine gegenläufige Erstattung zu heilen — die den
                    Zahlungsverlauf dauerhaft verfälscht. */}
                <button
                  type="button"
                  className="btn btn-leise"
                  onClick={() => zahlungLoeschen(z.id, z.betrag_cent)}
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          erfassen();
        }}
      >
        <label className="feld">
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label className="feld">
          <PflichtMarker art="pflicht">Betrag</PflichtMarker>
          <input value={betrag} onChange={(e) => setBetrag(e.currentTarget.value)} placeholder="95,00" />
        </label>
        <label className="feld-checkbox">
          <input type="checkbox" checked={erstattung} onChange={(e) => setErstattung(e.currentTarget.checked)} />
          Erstattung (negativer Betrag)
        </label>
        <label className="feld">
          Notiz
          <input value={notiz} onChange={(e) => setNotiz(e.currentTarget.value)} />
        </label>
        <PflichtLegende />
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer" disabled={laeuft}>
            Zahlung erfassen
          </button>
        </div>
      </form>
    </section>
  );
}
