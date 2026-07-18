import { useEffect, useState } from "react";
import { api, type AppFehler, type Beleg, type Kunde } from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent } from "../geld";

interface RechnungenProps {
  onOeffnen: (id: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  gestellt: "Gestellt",
  storniert: "Storniert",
};

const STATUS_KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  gestellt: "status-gestellt",
  storniert: "status-storniert",
};

export function Rechnungen({ onOeffnen }: RechnungenProps) {
  const [rechnungen, setRechnungen] = useState<Beleg[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [kundeId, setKundeId] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.belege
      .list("rechnung", statusFilter || undefined)
      .then((liste) => {
        setRechnungen(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [statusFilter]);
  useEffect(() => {
    api.kunden.list().then(setKunden).catch(() => {});
  }, []);

  async function anlegen() {
    setFormFehler(null);
    const kunde = kunden.find((k) => k.id === kundeId);
    if (!kunde) {
      setFormFehler({ typ: "validation", feld: "kunde_id", meldung: "Bitte einen Kunden wählen" });
      return;
    }
    try {
      const fusstext = (await api.einstellungen.get("text.rechnung.fuss")) ?? "";
      const beleg = await api.belege.create({
        typ: "rechnung",
        kunde_id: kundeId,
        datum,
        leistungsdatum: datum,
        zahlungsziel_tage: kunde.zahlungsziel_tage,
        kopftext: "",
        fusstext,
      });
      setZeigeFormular(false);
      onOeffnen(beleg.id);
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  return (
    <div>
      <h1 className="seiten-kopf">Rechnungen</h1>
      {fehler && <Fehler fehler={fehler} />}
      <div className="werkzeugleiste">
        <label className="feld">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.currentTarget.value)}>
            <option value="">Alle</option>
            {Object.entries(STATUS_LABEL).map(([wert, label]) => (
              <option key={wert} value={wert}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
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
          {rechnungen.map((r) => (
            <tr key={r.id} onClick={() => onOeffnen(r.id)}>
              <td className="tabelle-num">{r.nummer ?? "Entwurf"}</td>
              <td>{r.kunde_snapshot_name ?? kunden.find((k) => k.id === r.kunde_id)?.name ?? r.kunde_id}</td>
              <td>{r.datum}</td>
              <td>
                <span className={`status ${STATUS_KLASSE[r.status] ?? "status-entwurf"}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td>{formatCent(r.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {zeigeFormular ? (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && <Fehler fehler={formFehler} />}
          <label className="feld">
            Kunde
            <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
              <option value="">– wählen –</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="feld">
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
          </label>
          <button type="submit" className="btn btn-primaer">Anlegen</button>
        </form>
      ) : (
        <button type="button" className="btn btn-primaer" onClick={() => setZeigeFormular(true)}>
          Neue Rechnung
        </button>
      )}
    </div>
  );
}
