import { useEffect, useState } from "react";
import { api, type AppFehler, type Eingangsrechnung } from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent } from "../geld";

const FORMAT_LABEL: Record<string, string> = {
  xrechnung: "XRechnung",
  zugferd: "ZUGFeRD",
};

export function Eingangsrechnungen() {
  const [liste, setListe] = useState<Eingangsrechnung[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.eingangsrechnungen
      .list()
      .then((l) => {
        setListe(l);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  return (
    <div>
      <h1 className="seiten-kopf">Eingangsrechnungen</h1>
      <Fehler fehler={fehler} />

      <div className="werkzeugleiste">
        <button type="button" className="btn btn-primaer">
          Importieren
        </button>
      </div>

      <table className="tabelle">
        <thead>
          <tr>
            <th>Rechnungssteller</th>
            <th>Nummer</th>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Format</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((e) => (
            <tr key={e.id}>
              <td>{e.rechnungssteller_name}</td>
              <td className="tabelle-num">{e.rechnungsnummer}</td>
              <td>{e.rechnungsdatum}</td>
              <td>{formatCent(e.betrag_cent)}</td>
              <td>{FORMAT_LABEL[e.format] ?? e.format}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
