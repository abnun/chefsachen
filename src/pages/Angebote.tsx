import { BelegAnlegen } from "../components/BelegAnlegen";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { StatusMarke } from "../components/StatusMarke";
import { ANGEBOT_STATUS, statusAuswahl } from "../belegStatus";
import { datumDeutsch } from "../datum";
import { formatCent } from "../geld";
import { useBelegListe } from "../hooks/useBelegListe";

interface AngeboteProps {
  onOeffnen: (id: string) => void;
}

export function Angebote({ onOeffnen }: AngeboteProps) {
  const liste = useBelegListe("angebot", onOeffnen);

  return (
    <div>
      <h1 className="seiten-kopf">Angebote</h1>
      {liste.fehler && <Fehler fehler={liste.fehler} />}
      <div className="werkzeugleiste">
        <label className="feld">
          Status
          <select
            value={liste.statusFilter}
            onChange={(e) => liste.setStatusFilter(e.currentTarget.value)}
          >
            <option value="">Alle</option>
            {statusAuswahl(ANGEBOT_STATUS).map(([wert, label]) => (
              <option key={wert} value={wert}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!liste.geladen && <Laden was="Angebote" />}

      {liste.geladen && liste.belege.length === 0 && (
        <p>
          {liste.statusFilter
            ? "Keine Angebote mit diesem Status."
            : "Noch keine Angebote — leg oben eines an."}
        </p>
      )}

      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {liste.belege.map((a) => (
            <tr key={a.id} onClick={() => onOeffnen(a.id)}>
              <td className="tabelle-num nicht-umbrechen">{a.nummer ?? "Entwurf"}</td>
              <td>{liste.kundeName(a)}</td>
              <td className="nicht-umbrechen">{datumDeutsch(a.datum)}</td>
              <td>
                <StatusMarke status={a.status} />
              </td>
              <td className="nicht-umbrechen">{formatCent(a.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {liste.zeigeFormular ? (
        <BelegAnlegen
          kunden={liste.kunden}
          kundeId={liste.kundeId}
          onKundeId={liste.setKundeId}
          datum={liste.datum}
          onDatum={liste.setDatum}
          fehler={liste.formFehler}
          onAnlegen={liste.anlegen}
        />
      ) : (
        <button
          type="button"
          className="btn btn-primaer"
          onClick={() => liste.setZeigeFormular(true)}
        >
          Neues Angebot
        </button>
      )}
    </div>
  );
}
