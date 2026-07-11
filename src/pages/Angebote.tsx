import { useEffect, useState } from "react";
import { api, type AppFehler, type Beleg, type Kunde } from "../api";
import { Fehler } from "../components/Fehler";
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

export function Angebote({ onOeffnen }: AngeboteProps) {
  const [angebote, setAngebote] = useState<Beleg[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
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
      <h1>Angebote</h1>
      {fehler && <Fehler fehler={fehler} />}
      <label>
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
      <table>
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
            <tr key={a.id} onClick={() => onOeffnen(a.id)} style={{ cursor: "pointer" }}>
              <td>{a.nummer ?? "Entwurf"}</td>
              <td>{kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id}</td>
              <td>{a.datum}</td>
              <td>{STATUS_LABEL[a.status] ?? a.status}</td>
              <td>{formatCent(a.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {zeigeFormular ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && <Fehler fehler={formFehler} />}
          <label>
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
          <label>
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
          </label>
          <button type="submit">Anlegen</button>
        </form>
      ) : (
        <button type="button" onClick={() => setZeigeFormular(true)}>
          Neues Angebot
        </button>
      )}
    </div>
  );
}
