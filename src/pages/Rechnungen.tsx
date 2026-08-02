import { BelegAnlegen } from "../components/BelegAnlegen";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { StatusMarke } from "../components/StatusMarke";
import { RECHNUNG_STATUS, statusAuswahl } from "../belegStatus";
import { datumDeutsch, heuteIso } from "../datum";
import { formatCent } from "../geld";
import { useBelegListe } from "../hooks/useBelegListe";
import { type Zahlungsstand } from "../api";

interface RechnungenProps {
  onOeffnen: (id: string) => void;
}

const ZAHLUNGSSTAND_LABEL: Record<Zahlungsstand, string> = {
  offen: "Offen",
  teilbezahlt: "Teilbezahlt",
  bezahlt: "Bezahlt",
  ueberzahlt: "Überzahlt",
};

/**
 * Bei einem Stornobeleg fließt Geld zurück, nicht hin. „Offen" hieße dort
 * fälschlich, der Kunde schulde etwas — tatsächlich steht eine Erstattung aus.
 */
const GUTSCHRIFT_LABEL: Record<Zahlungsstand, string> = {
  offen: "Erstattung offen",
  teilbezahlt: "Teilerstattet",
  bezahlt: "Erstattet",
  ueberzahlt: "Übererstattet",
};

const ZAHLUNGSSTAND_KLASSE: Record<Zahlungsstand, string> = {
  offen: "status-gestellt",
  teilbezahlt: "status-gestellt",
  bezahlt: "status-bezahlt",
  ueberzahlt: "status-storniert",
};

/**
 * Fälligkeit als Text, überfällige Rechnungen als solche gekennzeichnet.
 * Der Vergleich läuft über die ISO-Schreibweise, die sich lexikografisch
 * sortieren lässt — eine Zeitzonenumrechnung wäre hier nur Fehlerquelle.
 */
function faelligkeit(faellig_am: string | null | undefined, stand: Zahlungsstand | null | undefined) {
  if (!faellig_am) return { text: "—", ueberfaellig: false };
  const heute = heuteIso();
  const offen = stand === "offen" || stand === "teilbezahlt";
  return { text: datumDeutsch(faellig_am), ueberfaellig: offen && faellig_am < heute };
}

export function Rechnungen({ onOeffnen }: RechnungenProps) {
  const liste = useBelegListe("rechnung", onOeffnen);

  return (
    <div>
      <h1 className="seiten-kopf">Rechnungen</h1>
      {liste.fehler && <Fehler fehler={liste.fehler} />}
      <div className="werkzeugleiste">
        <label className="feld">
          Status
          <select
            value={liste.statusFilter}
            onChange={(e) => liste.setStatusFilter(e.currentTarget.value)}
          >
            <option value="">Alle</option>
            {statusAuswahl(RECHNUNG_STATUS).map(([wert, label]) => (
              <option key={wert} value={wert}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!liste.geladen && <Laden was="Rechnungen" />}

      {liste.geladen && liste.belege.length === 0 && (
        <p>
          {liste.statusFilter
            ? "Keine Rechnungen mit diesem Status."
            : "Noch keine Rechnungen — leg oben eine an."}
        </p>
      )}

      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Kunde</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Zahlung</th>
            <th>Fällig</th>
            <th>Summe</th>
            <th>Offen</th>
          </tr>
        </thead>
        <tbody>
          {liste.belege.map((r) => (
            <tr key={r.id} onClick={() => onOeffnen(r.id)}>
              <td className="tabelle-num nicht-umbrechen">{r.nummer ?? "Entwurf"}</td>
              <td>{liste.kundeName(r)}</td>
              <td className="nicht-umbrechen">{datumDeutsch(r.datum)}</td>
              <td>
                <StatusMarke status={r.status} />
                {r.storno_von_id && <span className="marke">Storno</span>}
              </td>
              <td>
                {r.zahlungsstand ? (
                  <span className={`status ${ZAHLUNGSSTAND_KLASSE[r.zahlungsstand]}`}>
                    {(r.storno_von_id ? GUTSCHRIFT_LABEL : ZAHLUNGSSTAND_LABEL)[r.zahlungsstand]}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              {(() => {
                const f = faelligkeit(r.faellig_am, r.zahlungsstand);
                return (
                  <td className={`nicht-umbrechen ${f.ueberfaellig ? "ueberfaellig" : ""}`}>{f.text}</td>
                );
              })()}
              <td className="nicht-umbrechen">{formatCent(r.summe_cent)}</td>
              <td className="nicht-umbrechen">
                {r.zahlungsstand && r.zahlungsstand !== "bezahlt"
                  ? formatCent(r.summe_cent - (r.bezahlt_cent ?? 0))
                  : "—"}
              </td>
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
          Neue Rechnung
        </button>
      )}
    </div>
  );
}
