import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type Eingangsrechnung, type EingangsrechnungFelderNeu, type EingangsrechnungVorschau } from "../api";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";
import { EingangsrechnungZusatzfelder } from "../components/EingangsrechnungZusatzfelder";
import { Fehler } from "../components/Fehler";
import { formatCentMitWaehrung, formatMenge, parseEuro } from "../geld";

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
  const [betragText, setBetragText] = useState("");

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
      setBetragText((v.felder.betrag_cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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
    const betragCent = parseEuro(betragText);
    if (betragCent === null) {
      setFehler({ typ: "validation", feld: "betrag", meldung: "Bitte einen gültigen Betrag eingeben" });
      setZeigeDuplikatWarnung(false);
      return;
    }
    setFehler(null);
    try {
      await api.eingangsrechnungen.speichern(dateiBytes, dateiname, { ...vorschau.felder, betrag_cent: betragCent });
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
              <p>Betrag: <span>{formatCentMitWaehrung(vorschau.felder.betrag_cent, vorschau.felder.waehrung)}</span></p>
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
                Betrag ({vorschau.felder.waehrung})
                <input value={betragText} onChange={(e) => setBetragText(e.currentTarget.value)} placeholder="95,00" />
              </label>
              {vorschau.geparst && (
                <button type="button" className="btn" onClick={() => setBearbeitenModus(false)}>
                  Abbrechen
                </button>
              )}
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
                    <td>{formatCentMitWaehrung(p.einzelpreis_cent, vorschau.felder.waehrung)}</td>
                    <td>{formatCentMitWaehrung(p.positionssumme_cent, vorschau.felder.waehrung)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {vorschau.geparst && (
            <EingangsrechnungZusatzfelder
              kaeufer_name={vorschau.felder.kaeufer_name}
              kaeufer_strasse={vorschau.felder.kaeufer_strasse}
              kaeufer_plz={vorschau.felder.kaeufer_plz}
              kaeufer_ort={vorschau.felder.kaeufer_ort}
              kaeufer_land={vorschau.felder.kaeufer_land}
              verkaeufer_strasse={vorschau.felder.verkaeufer_strasse}
              verkaeufer_plz={vorschau.felder.verkaeufer_plz}
              verkaeufer_ort={vorschau.felder.verkaeufer_ort}
              verkaeufer_land={vorschau.felder.verkaeufer_land}
              verkaeufer_steuernummer={vorschau.felder.verkaeufer_steuernummer}
              verkaeufer_email={vorschau.felder.verkaeufer_email}
              zahlungsbedingungen={vorschau.felder.zahlungsbedingungen}
              faelligkeitsdatum={vorschau.felder.faelligkeitsdatum}
              iban={vorschau.felder.iban}
              bic={vorschau.felder.bic}
              bankname={vorschau.felder.bankname}
              bestellnummer={vorschau.felder.bestellnummer}
              leitweg_id={vorschau.felder.leitweg_id}
              lieferantennummer={vorschau.felder.lieferantennummer}
              leistungsdatum={vorschau.felder.leistungsdatum}
              waehrung={vorschau.felder.waehrung}
              steuerzeilen={vorschau.felder.steuerzeilen}
            />
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
              <td>{formatCentMitWaehrung(e.betrag_cent, e.waehrung)}</td>
              <td>{FORMAT_LABEL[e.format] ?? e.format}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
