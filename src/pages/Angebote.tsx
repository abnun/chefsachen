import { useEffect, useState } from "react";
import { api, type AppFehler, type Beleg, type Kunde } from "../api";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { formatCent } from "../geld";

interface AngeboteProps {
  onOeffnen: (id: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  versendet: "Versendet",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  abgelaufen: "Abgelaufen",
};

const STATUS_KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  abgelaufen: "status-entwurf",
  versendet: "status-gestellt",
  angenommen: "status-bezahlt",
  abgelehnt: "status-storniert",
};

export function Angebote({ onOeffnen }: AngeboteProps) {
  const [angebote, setAngebote] = useState<Beleg[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  // Eine leere Liste und eine noch ausstehende Antwort sehen sonst gleich aus.
  const [geladen, setGeladen] = useState(false);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [kundeId, setKundeId] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.belege
      .list("angebot", statusFilter || undefined)
      .then((liste) => {
        setAngebote(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler))
      .finally(() => setGeladen(true));
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
      const fusstext = (await api.einstellungen.get("text.angebot.fuss")) ?? "";
      const beleg = await api.belege.create({
        typ: "angebot",
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
      <h1 className="seiten-kopf">Angebote</h1>
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
      {!geladen && <Laden was="Angebote" />}

      {geladen && angebote.length === 0 && (
        <p>
          {statusFilter
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
          {angebote.map((a) => (
            <tr key={a.id} onClick={() => onOeffnen(a.id)}>
              <td className="tabelle-num">{a.nummer ?? "Entwurf"}</td>
              <td>{a.kunde_snapshot_name ?? kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id}</td>
              <td>{a.datum}</td>
              <td>
                <span className={`status ${STATUS_KLASSE[a.status] ?? "status-entwurf"}`}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </td>
              <td>{formatCent(a.summe_cent)}</td>
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
          Neues Angebot
        </button>
      )}
    </div>
  );
}
