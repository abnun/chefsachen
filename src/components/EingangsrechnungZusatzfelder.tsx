import type { EingangsrechnungSteuerzeile } from "../api";
import { formatCentMitWaehrung } from "../geld";

export interface EingangsrechnungZusatzfelderProps {
  kaeufer_name: string;
  kaeufer_strasse: string;
  kaeufer_plz: string;
  kaeufer_ort: string;
  kaeufer_land: string;
  verkaeufer_strasse: string;
  verkaeufer_plz: string;
  verkaeufer_ort: string;
  verkaeufer_land: string;
  verkaeufer_steuernummer: string;
  verkaeufer_email: string;
  zahlungsbedingungen: string;
  faelligkeitsdatum: string;
  iban: string;
  bic: string;
  bankname: string;
  bestellnummer: string;
  leitweg_id: string;
  lieferantennummer: string;
  leistungsdatum: string;
  waehrung: string;
  steuerzeilen: EingangsrechnungSteuerzeile[];
}

function Feld({ label, wert }: { label: string; wert: string }) {
  if (!wert) return null;
  return <p>{label}: <span>{wert}</span></p>;
}

function formatAdresse(strasse: string, plz: string, ort: string, land: string): string {
  const zeile1 = strasse;
  const zeile2 = [plz, ort].filter(Boolean).join(" ");
  return [zeile1, zeile2, land].filter(Boolean).join(", ");
}

export function EingangsrechnungZusatzfelder(p: EingangsrechnungZusatzfelderProps) {
  const verkaeuferAdresse = formatAdresse(p.verkaeufer_strasse, p.verkaeufer_plz, p.verkaeufer_ort, p.verkaeufer_land);
  const kaeuferAdresse = formatAdresse(p.kaeufer_strasse, p.kaeufer_plz, p.kaeufer_ort, p.kaeufer_land);

  const zeigtRechnungssteller = !!(verkaeuferAdresse || p.verkaeufer_steuernummer || p.verkaeufer_email || p.lieferantennummer);
  const zeigtRechnungsempfaenger = !!(p.kaeufer_name || kaeuferAdresse);
  const zeigtZahlung = !!(p.zahlungsbedingungen || p.faelligkeitsdatum || p.iban || p.bic || p.bankname);
  const zeigtReferenzen = !!(p.bestellnummer || p.leitweg_id);
  const zeigtLeistungsdatum = !!p.leistungsdatum;
  const zeigtSteuern = p.steuerzeilen.length > 0;

  return (
    <>
      {zeigtRechnungssteller && (
        <div className="karte">
          <h3>Rechnungssteller</h3>
          <Feld label="Anschrift" wert={verkaeuferAdresse} />
          <Feld label="Steuernummer/USt-IdNr." wert={p.verkaeufer_steuernummer} />
          <Feld label="E-Mail" wert={p.verkaeufer_email} />
          <Feld label="Lieferantennummer" wert={p.lieferantennummer} />
        </div>
      )}
      {zeigtRechnungsempfaenger && (
        <div className="karte">
          <h3>Rechnungsempfänger</h3>
          <Feld label="Name" wert={p.kaeufer_name} />
          <Feld label="Anschrift" wert={kaeuferAdresse} />
        </div>
      )}
      {zeigtZahlung && (
        <div className="karte">
          <h3>Zahlung</h3>
          <Feld label="Zahlungsbedingungen" wert={p.zahlungsbedingungen} />
          <Feld label="Fälligkeitsdatum" wert={p.faelligkeitsdatum} />
          <Feld label="IBAN" wert={p.iban} />
          <Feld label="BIC" wert={p.bic} />
          <Feld label="Bank" wert={p.bankname} />
        </div>
      )}
      {zeigtReferenzen && (
        <div className="karte">
          <h3>Referenzen</h3>
          <Feld label="Bestellnummer" wert={p.bestellnummer} />
          <Feld label="Leitweg-ID" wert={p.leitweg_id} />
        </div>
      )}
      {zeigtLeistungsdatum && (
        <div className="karte">
          <h3>Liefer-/Leistungsdatum</h3>
          <Feld label="Datum" wert={p.leistungsdatum} />
        </div>
      )}
      {zeigtSteuern && (
        <div className="karte">
          <h3>Steuern</h3>
          <table className="tabelle">
            <thead>
              <tr>
                <th>Netto</th>
                <th>Satz</th>
                <th>Steuerbetrag</th>
              </tr>
            </thead>
            <tbody>
              {p.steuerzeilen.map((s, i) => (
                <tr key={i}>
                  <td>{formatCentMitWaehrung(s.nettobetrag_cent, p.waehrung)}</td>
                  <td>{(s.steuersatz_promille / 10).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</td>
                  <td>{formatCentMitWaehrung(s.steuerbetrag_cent, p.waehrung)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
