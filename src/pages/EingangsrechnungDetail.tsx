import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type EingangsrechnungDetail as EingangsrechnungDetailTyp } from "../api";
import { EingangsrechnungZusatzfelder } from "../components/EingangsrechnungZusatzfelder";
import { Fehler } from "../components/Fehler";
import { formatCentMitWaehrung, formatMenge, parseEuro } from "../geld";

interface EingangsrechnungDetailProps {
  id: string;
  onZurueck?: () => void;
}

export function EingangsrechnungDetail({ id, onZurueck }: EingangsrechnungDetailProps) {
  const [detail, setDetail] = useState<EingangsrechnungDetailTyp | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [bearbeitenModus, setBearbeitenModus] = useState(false);
  const [rechnungsstellerName, setRechnungsstellerName] = useState("");
  const [rechnungsnummer, setRechnungsnummer] = useState("");
  const [rechnungsdatum, setRechnungsdatum] = useState("");
  const [betrag, setBetrag] = useState("");
  const [waehrung, setWaehrung] = useState("EUR");

  function felderAusDetailUebernehmen(d: EingangsrechnungDetailTyp) {
    setRechnungsstellerName(d.eingangsrechnung.rechnungssteller_name);
    setRechnungsnummer(d.eingangsrechnung.rechnungsnummer);
    setRechnungsdatum(d.eingangsrechnung.rechnungsdatum);
    setBetrag((d.eingangsrechnung.betrag_cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setWaehrung(d.eingangsrechnung.waehrung);
  }

  function laden() {
    api.eingangsrechnungen
      .get(id)
      .then((d) => {
        setDetail(d);
        felderAusDetailUebernehmen(d);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [id]);

  function bearbeitenAbbrechen() {
    if (detail) felderAusDetailUebernehmen(detail);
    setBearbeitenModus(false);
  }

  async function speichern() {
    const betragCent = parseEuro(betrag);
    if (betragCent === null) {
      setFehler({ typ: "validation", feld: "betrag", meldung: "Bitte einen gültigen Betrag eingeben" });
      return;
    }
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
      <button type="button" className="btn btn-leise" onClick={onZurueck}>
        ← Zurück zur Liste
      </button>
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
            Betrag ({waehrung})
            <input value={betrag} onChange={(e) => setBetrag(e.currentTarget.value)} placeholder="95,00" />
          </label>
          <button type="submit" className="btn btn-primaer">Speichern</button>
          <button type="button" className="btn" onClick={bearbeitenAbbrechen}>Abbrechen</button>
        </form>
      ) : (
        <div className="karte">
          <p>Rechnungssteller: <span>{detail.eingangsrechnung.rechnungssteller_name}</span></p>
          <p>Nummer: <span>{detail.eingangsrechnung.rechnungsnummer}</span></p>
          <p>Datum: <span>{detail.eingangsrechnung.rechnungsdatum}</span></p>
          <p>Betrag: <span>{formatCentMitWaehrung(detail.eingangsrechnung.betrag_cent, detail.eingangsrechnung.waehrung)}</span></p>
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
              <td>{formatCentMitWaehrung(p.einzelpreis_cent, detail.eingangsrechnung.waehrung)}</td>
              <td>{formatCentMitWaehrung(p.positionssumme_cent, detail.eingangsrechnung.waehrung)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <EingangsrechnungZusatzfelder
        kaeufer_name={detail.eingangsrechnung.kaeufer_name}
        kaeufer_strasse={detail.eingangsrechnung.kaeufer_strasse}
        kaeufer_plz={detail.eingangsrechnung.kaeufer_plz}
        kaeufer_ort={detail.eingangsrechnung.kaeufer_ort}
        kaeufer_land={detail.eingangsrechnung.kaeufer_land}
        verkaeufer_strasse={detail.eingangsrechnung.verkaeufer_strasse}
        verkaeufer_plz={detail.eingangsrechnung.verkaeufer_plz}
        verkaeufer_ort={detail.eingangsrechnung.verkaeufer_ort}
        verkaeufer_land={detail.eingangsrechnung.verkaeufer_land}
        verkaeufer_steuernummer={detail.eingangsrechnung.verkaeufer_steuernummer}
        verkaeufer_email={detail.eingangsrechnung.verkaeufer_email}
        zahlungsbedingungen={detail.eingangsrechnung.zahlungsbedingungen}
        faelligkeitsdatum={detail.eingangsrechnung.faelligkeitsdatum}
        iban={detail.eingangsrechnung.iban}
        bic={detail.eingangsrechnung.bic}
        bankname={detail.eingangsrechnung.bankname}
        bestellnummer={detail.eingangsrechnung.bestellnummer}
        leitweg_id={detail.eingangsrechnung.leitweg_id}
        lieferantennummer={detail.eingangsrechnung.lieferantennummer}
        leistungsdatum={detail.eingangsrechnung.leistungsdatum}
        waehrung={detail.eingangsrechnung.waehrung}
        steuerzeilen={detail.steuerzeilen}
      />
    </div>
  );
}
