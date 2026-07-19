import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type Eingangsrechnung, type EingangsrechnungFelderNeu, type EingangsrechnungVorschau } from "../api";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";
import { Fehler } from "../components/Fehler";
import { formatCent, formatMenge } from "../geld";

const FORMAT_LABEL: Record<string, string> = {
  xrechnung: "XRechnung",
  zugferd: "ZUGFeRD",
};

interface EingangsrechnungenProps {
  onOeffnen: (id: string) => void;
}

export function Eingangsrechnungen({ onOeffnen }: EingangsrechnungenProps) {
  const [liste, setListe] = useState<Eingangsrechnung[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [vorschau, setVorschau] = useState<EingangsrechnungVorschau | null>(null);
  const [dateiBytes, setDateiBytes] = useState<number[]>([]);
  const [dateiname, setDateiname] = useState("");
  const [bearbeitenModus, setBearbeitenModus] = useState(false);
  const [zeigeDuplikatWarnung, setZeigeDuplikatWarnung] = useState(false);

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

  async function dateiImportierenAuswaehlen() {
    const pfad = await open({ multiple: false, filters: [{ name: "E-Rechnung", extensions: ["xml", "pdf"] }] });
    if (!pfad || typeof pfad !== "string") return;
    const bytes = Array.from(await readFile(pfad));
    setDateiBytes(bytes);
    setDateiname(pfad.split(/[/\\]/).pop() ?? pfad);
    setFehler(null);
    try {
      const v = await api.eingangsrechnungen.importVorschau(bytes);
      setVorschau(v);
      setBearbeitenModus(false);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function feldAendern<K extends keyof EingangsrechnungFelderNeu>(feld: K, wert: EingangsrechnungFelderNeu[K]) {
    if (!vorschau) return;
    setVorschau({ ...vorschau, felder: { ...vorschau.felder, [feld]: wert } });
  }

  async function speichernAusfuehren() {
    if (!vorschau) return;
    setFehler(null);
    try {
      await api.eingangsrechnungen.speichern(dateiBytes, dateiname, vorschau.felder);
      setVorschau(null);
      setZeigeDuplikatWarnung(false);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function speichernKlick() {
    if (vorschau?.ist_duplikat) {
      setZeigeDuplikatWarnung(true);
      return;
    }
    speichernAusfuehren();
  }

  return (
    <div>
      <h1 className="seiten-kopf">Eingangsrechnungen</h1>
      <Fehler fehler={fehler} />

      {zeigeDuplikatWarnung && (
        <Bestaetigungsdialog
          text={`Rechnung Nr. „${vorschau?.felder.rechnungsnummer}" von „${vorschau?.felder.rechnungssteller_name}" wurde bereits importiert. Trotzdem importieren?`}
          bestaetigenLabel="Trotzdem importieren"
          onAbbrechen={() => setZeigeDuplikatWarnung(false)}
          onBestaetigen={speichernAusfuehren}
        />
      )}

      <div className="werkzeugleiste">
        <button type="button" className="btn btn-primaer" onClick={dateiImportierenAuswaehlen}>
          Importieren
        </button>
      </div>

      {vorschau && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichernKlick();
          }}
        >
          {!vorschau.geparst && (
            <p role="alert">Konnte nicht automatisch gelesen werden — bitte Felder von Hand eintragen.</p>
          )}
          {vorschau.ist_duplikat && !zeigeDuplikatWarnung && (
            <p>Diese Rechnung wurde möglicherweise bereits importiert.</p>
          )}

          {vorschau.geparst && !bearbeitenModus ? (
            <>
              <p>Rechnungssteller: <span>{vorschau.felder.rechnungssteller_name}</span></p>
              <p>Nummer: <span>{vorschau.felder.rechnungsnummer}</span></p>
              <p>Datum: <span>{vorschau.felder.rechnungsdatum}</span></p>
              <p>Betrag: <span>{formatCent(vorschau.felder.betrag_cent)}</span></p>
              <button type="button" className="btn" onClick={() => setBearbeitenModus(true)}>
                Bearbeiten
              </button>
            </>
          ) : (
            <>
              <label className="feld">
                Rechnungssteller
                <input
                  value={vorschau.felder.rechnungssteller_name}
                  onChange={(e) => feldAendern("rechnungssteller_name", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Nummer
                <input
                  value={vorschau.felder.rechnungsnummer}
                  onChange={(e) => feldAendern("rechnungsnummer", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Datum
                <input
                  type="date"
                  value={vorschau.felder.rechnungsdatum}
                  onChange={(e) => feldAendern("rechnungsdatum", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Betrag (Cent)
                <input
                  type="number"
                  value={vorschau.felder.betrag_cent}
                  onChange={(e) => feldAendern("betrag_cent", Number(e.currentTarget.value))}
                />
              </label>
            </>
          )}

          {vorschau.felder.positionen.length > 0 && (
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
                {vorschau.felder.positionen.map((p, i) => (
                  <tr key={i}>
                    <td>{p.bezeichnung}</td>
                    <td>{formatMenge(p.menge)}</td>
                    <td>{formatCent(p.einzelpreis_cent)}</td>
                    <td>{formatCent(p.positionssumme_cent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      )}

      <table className="tabelle tabelle-klickbar">
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
            <tr key={e.id} onClick={() => onOeffnen(e.id)}>
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
