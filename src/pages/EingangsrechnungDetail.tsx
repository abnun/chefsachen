import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type EingangsrechnungAenderung, type EingangsrechnungDetail as EingangsrechnungDetailTyp } from "../api";
import { EingangsrechnungZusatzfelder } from "../components/EingangsrechnungZusatzfelder";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { datumDeutsch, zeitpunktDeutsch } from "../datum";
import { formatCentMitWaehrung, formatMenge, parseEuro } from "../geld";

/**
 * Bereitet einen protokollierten Wert für die Anzeige auf.
 *
 * Im Protokoll stehen die Rohwerte, wie sie in der Datenbank lagen — Beträge
 * also in Cent und Daten im ISO-Format. Unaufbereitet gelesen wäre „9500 →
 * 12000" bei einer Betragskorrektur schlicht irreführend.
 */
function protokollWert(feld: string, wert: string, waehrung: string): string {
  if (feld === "Betrag") {
    const cent = Number(wert);
    return Number.isNaN(cent) ? wert : formatCentMitWaehrung(cent, waehrung);
  }
  if (feld === "Rechnungsdatum") return datumDeutsch(wert);
  return wert === "" ? "(leer)" : wert;
}

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
  const [protokoll, setProtokoll] = useState<EingangsrechnungAenderung[]>([]);

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
    api.eingangsrechnungen
      .aenderungen(id)
      .then(setProtokoll)
      // Ein fehlendes Protokoll darf die Rechnung nicht unzugänglich machen —
      // die Rechnungsdaten selbst sind das Wichtigere.
      .catch(() => setProtokoll([]));
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

  const zurueck = onZurueck && { beschriftung: "Zurück zur Liste", onClick: onZurueck };

  if (!detail) {
    return (
      <div>
        <Werkzeugleiste titel="Eingangsrechnung" zurueck={zurueck} />
        <Fehler fehler={fehler} />
        {!fehler && <Laden />}
      </div>
    );
  }

  return (
    <div>
      {/* Bearbeiten und Export stehen in der Leiste, wie die Aktionen eines
          Belegs. Während der Korrektur verschwinden sie: Speichern und
          Abbrechen stehen dann am Formular. */}
      <Werkzeugleiste
        titel="Eingangsrechnung"
        zurueck={zurueck}
        aktion={
          !bearbeitenModus && (
            <>
              <button type="button" className="btn" onClick={() => setBearbeitenModus(true)}>
                Bearbeiten
              </button>
              <button type="button" className="btn" onClick={originalExportieren}>
                Original-Datei exportieren
              </button>
            </>
          )
        }
      />
      <div className="inhalt-schmal">
        <Fehler fehler={fehler} />

        {bearbeitenModus ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              speichern();
            }}
          >
            <div className="gruppe">
              <label className="feld">
                Rechnungssteller
                <input value={rechnungsstellerName} onChange={(e) => setRechnungsstellerName(e.currentTarget.value)} />
              </label>
              <div className="felder-reihe">
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
              </div>
            </div>
            <div className="aktionen aktionen-formular">
              <button type="submit" className="btn btn-primaer">Speichern</button>
              <button type="button" className="btn" onClick={bearbeitenAbbrechen}>Abbrechen</button>
            </div>
          </form>
        ) : (
          <dl className="angaben">
            <dt>Rechnungssteller</dt>
            <dd>{detail.eingangsrechnung.rechnungssteller_name}</dd>
            <dt>Nummer</dt>
            <dd>{detail.eingangsrechnung.rechnungsnummer}</dd>
            <dt>Datum</dt>
            <dd>{datumDeutsch(detail.eingangsrechnung.rechnungsdatum)}</dd>
            <dt>Betrag</dt>
            <dd>{formatCentMitWaehrung(detail.eingangsrechnung.betrag_cent, detail.eingangsrechnung.waehrung)}</dd>
          </dl>
        )}

        <section className="abschnitt">
          <h2>Positionen</h2>
          <table className="tabelle">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th className="zahl">Menge</th>
                <th className="zahl">Einzelpreis</th>
                <th className="zahl">Summe</th>
              </tr>
            </thead>
            <tbody>
              {detail.positionen.map((p, i) => (
                <tr key={i}>
                  <td>{p.bezeichnung}</td>
                  <td className="zahl">{formatMenge(p.menge)}</td>
                  <td className="zahl nicht-umbrechen">{formatCentMitWaehrung(p.einzelpreis_cent, detail.eingangsrechnung.waehrung)}</td>
                  <td className="zahl nicht-umbrechen">{formatCentMitWaehrung(p.positionssumme_cent, detail.eingangsrechnung.waehrung)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

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

        {/* Die Rohdatei bleibt unverändert archiviert; die daraus übernommenen
            Felder lassen sich korrigieren. Damit nachvollziehbar bleibt, was
            ursprünglich in der Rechnung stand (GoBD), wird jede Korrektur hier
            mit altem und neuem Wert festgehalten. */}
        {protokoll.length > 0 && (
          <section>
            <h2>Änderungshistorie</h2>
            <p>
              Diese Angaben wurden nach dem Import von Hand korrigiert. Die importierte
              Original-Datei ist davon unberührt und lässt sich oben exportieren.
            </p>
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Feld</th>
                  <th>Vorher</th>
                  <th>Nachher</th>
                </tr>
              </thead>
              <tbody>
                {protokoll.map((a, i) => (
                  <tr key={i}>
                    <td>{zeitpunktDeutsch(a.geaendert_am)}</td>
                    <td>{a.feld}</td>
                    <td>{protokollWert(a.feld, a.alt, detail.eingangsrechnung.waehrung)}</td>
                    <td>{protokollWert(a.feld, a.neu, detail.eingangsrechnung.waehrung)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
