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

/** Eine Zeile der Beschriftung-Wert-Liste; leere Angaben entfallen. */
function Feld({ label, wert }: { label: string; wert: string }) {
  if (!wert) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{wert}</dd>
    </>
  );
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
        <section>
          <h3>Rechnungssteller</h3>
          <dl className="angaben">
            <Feld label="Anschrift" wert={verkaeuferAdresse} />
            <Feld label="Steuernummer/USt-IdNr." wert={p.verkaeufer_steuernummer} />
            <Feld label="E-Mail" wert={p.verkaeufer_email} />
            <Feld label="Lieferantennummer" wert={p.lieferantennummer} />
          </dl>
        </section>
      )}
      {zeigtRechnungsempfaenger && (
        <section>
          <h3>Rechnungsempfänger</h3>
          <dl className="angaben">
            <Feld label="Name" wert={p.kaeufer_name} />
            <Feld label="Anschrift" wert={kaeuferAdresse} />
          </dl>
        </section>
      )}
      {zeigtZahlung && (
        <section>
          <h3>Zahlung</h3>
          <dl className="angaben">
            <Feld label="Zahlungsbedingungen" wert={p.zahlungsbedingungen} />
            <Feld label="Fälligkeitsdatum" wert={p.faelligkeitsdatum} />
            <Feld label="IBAN" wert={p.iban} />
            <Feld label="BIC" wert={p.bic} />
            <Feld label="Bank" wert={p.bankname} />
          </dl>
        </section>
      )}
      {zeigtReferenzen && (
        <section>
          <h3>Referenzen</h3>
          <dl className="angaben">
            <Feld label="Bestellnummer" wert={p.bestellnummer} />
            <Feld label="Leitweg-ID" wert={p.leitweg_id} />
          </dl>
        </section>
      )}
      {zeigtLeistungsdatum && (
        <section>
          <h3>Liefer-/Leistungsdatum</h3>
          <dl className="angaben">
            <Feld label="Datum" wert={p.leistungsdatum} />
          </dl>
        </section>
      )}
      {zeigtSteuern && (
        <section>
          <h3>Steuern</h3>
          <table className="tabelle">
            <thead>
              <tr>
                <th className="zahl">Netto</th>
                <th className="zahl">Satz</th>
                <th className="zahl">Steuerbetrag</th>
              </tr>
            </thead>
            <tbody>
              {p.steuerzeilen.map((s, i) => (
                <tr key={i}>
                  <td className="zahl">{formatCentMitWaehrung(s.nettobetrag_cent, p.waehrung)}</td>
                  <td className="zahl">{(s.steuersatz_promille / 10).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</td>
                  <td className="zahl">{formatCentMitWaehrung(s.steuerbetrag_cent, p.waehrung)}</td>
                </tr>
              ))}
            </tbody>
          </table>        </section>
      )}
    </>
  );
}
