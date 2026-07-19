import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type EingangsrechnungDetail as EingangsrechnungDetailTyp } from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent, formatMenge } from "../geld";

interface EingangsrechnungDetailProps {
  id: string;
}

export function EingangsrechnungDetail({ id }: EingangsrechnungDetailProps) {
  const [detail, setDetail] = useState<EingangsrechnungDetailTyp | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [bearbeitenModus, setBearbeitenModus] = useState(false);
  const [rechnungsstellerName, setRechnungsstellerName] = useState("");
  const [rechnungsnummer, setRechnungsnummer] = useState("");
  const [rechnungsdatum, setRechnungsdatum] = useState("");
  const [betragCent, setBetragCent] = useState(0);
  const [waehrung, setWaehrung] = useState("EUR");

  function laden() {
    api.eingangsrechnungen
      .get(id)
      .then((d) => {
        setDetail(d);
        setRechnungsstellerName(d.eingangsrechnung.rechnungssteller_name);
        setRechnungsnummer(d.eingangsrechnung.rechnungsnummer);
        setRechnungsdatum(d.eingangsrechnung.rechnungsdatum);
        setBetragCent(d.eingangsrechnung.betrag_cent);
        setWaehrung(d.eingangsrechnung.waehrung);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [id]);

  async function speichern() {
    setFehler(null);
    try {
      await api.eingangsrechnungen.update({
        id, rechnungssteller_name: rechnungsstellerName, rechnungsnummer,
        rechnungsdatum, betrag_cent: betragCent, waehrung,
      });
      setBearbeitenModus(false);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function originalExportieren() {
    setFehler(null);
    try {
      const original = await api.eingangsrechnungen.originalExportieren(id);
      const ziel = await save({ defaultPath: original.dateiname });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(original.bytes));
      }
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  if (!detail) {
    return (
      <div>
        <Fehler fehler={fehler} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="seiten-kopf">Eingangsrechnung</h1>
      <Fehler fehler={fehler} />

      {bearbeitenModus ? (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          <label className="feld">
            Rechnungssteller
            <input value={rechnungsstellerName} onChange={(e) => setRechnungsstellerName(e.currentTarget.value)} />
          </label>
          <label className="feld">
            Nummer
            <input value={rechnungsnummer} onChange={(e) => setRechnungsnummer(e.currentTarget.value)} />
          </label>
          <label className="feld">
            Datum
            <input type="date" value={rechnungsdatum} onChange={(e) => setRechnungsdatum(e.currentTarget.value)} />
          </label>
          <label className="feld">
            Betrag (Cent)
            <input type="number" value={betragCent} onChange={(e) => setBetragCent(Number(e.currentTarget.value))} />
          </label>
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      ) : (
        <div className="karte">
          <p>Rechnungssteller: <span>{detail.eingangsrechnung.rechnungssteller_name}</span></p>
          <p>Nummer: <span>{detail.eingangsrechnung.rechnungsnummer}</span></p>
          <p>Datum: <span>{detail.eingangsrechnung.rechnungsdatum}</span></p>
          <p>Betrag: <span>{formatCent(detail.eingangsrechnung.betrag_cent)}</span></p>
          <button type="button" className="btn" onClick={() => setBearbeitenModus(true)}>
            Bearbeiten
          </button>
          <button type="button" className="btn" onClick={originalExportieren}>
            Original-Datei exportieren
          </button>
        </div>
      )}

      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th>Menge</th>
            <th>Einzelpreis</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {detail.positionen.map((p, i) => (
            <tr key={i}>
              <td>{p.bezeichnung}</td>
              <td>{formatMenge(p.menge)}</td>
              <td>{formatCent(p.einzelpreis_cent)}</td>
              <td>{formatCent(p.positionssumme_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
