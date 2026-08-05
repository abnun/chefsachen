import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type Jahresauswertung } from "../api";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { formatCent, formatCentZahl } from "../geld";
import { datumDeutsch } from "../datum";
import { zuCsv } from "../csv";
import { type FuehrungsSchritt } from "../components/Fuehrung";
import { SeitenkopfMitRundgang } from "../components/SeitenkopfMitRundgang";

/**
 * Statisch außerhalb der Komponente, wie auf der Übersicht: Ein je Rendern
 * neues Array ließe den Positionierungs-Effekt der Führung durchdrehen.
 */
const RUNDGANG_SCHRITTE: FuehrungsSchritt[] = [
  {
    ziel: "[data-tour='titel']",
    titel: "Auswertung",
    text: "Die Zuarbeit für den Jahresabschluss: alle vereinnahmten Zahlungen eines Jahres, mit Beleg und Kunde. Gezählt wird nach Zufluss (§ 19 Abs. 2 UStG) — wann das Geld kam, nicht wann die Rechnung gestellt wurde.",
  },
  {
    ziel: "[data-tour='jahr']",
    titel: "Jahresauswahl",
    text: "Zur Wahl stehen alle Jahre, in denen Zahlungen eingegangen sind — auch zurückliegende, etwa für eine nachträgliche Steuerberater-Anfrage.",
  },
  {
    ziel: "[data-tour='csv']",
    titel: "Als CSV exportieren",
    text: "Erzeugt eine Datei für Excel und die Steuerberater-Zuarbeit: deutsches Dezimalkomma, Semikolon als Trenner, Erstattungen als negative Beträge.",
  },
  {
    ziel: "[data-tour='tabelle']",
    titel: "Die Zahlungsliste",
    text: "Jede Zeile ist ein Zahlungseingang mit Datum, Rechnungsnummer und Kunde. Die Summe unten entspricht dem vereinnahmten Umsatz der Übersicht für dasselbe Jahr.",
  },
];

/**
 * Auswertung für den Jahresabschluss: vereinnahmte Zahlungen eines Jahres,
 * mit Beleg und Kunde, als Liste — und als CSV zum Weitergeben.
 *
 * Kein Steuerformular und keine EÜR-Anlage. Diese Seite tut nur die Zuarbeit:
 * die Zahlen auflisten, die sonst mühsam aus den einzelnen Rechnungen
 * zusammengesucht werden müssten. Ohne sie stand spätestens im Januar jeder
 * Nutzer vor derselben Frage, ohne eine Antwort in der Anwendung zu finden.
 */
export function Auswertung() {
  const [jahre, setJahre] = useState<number[] | null>(null);
  const [jahr, setJahr] = useState<number | null>(null);
  const [daten, setDaten] = useState<Jahresauswertung | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  useEffect(() => {
    api.auswertung
      .verfuegbareJahre()
      .then((verfuegbar) => {
        // Das laufende Jahr ist immer wählbar, auch ohne Zahlungen — sonst
        // ließe sich das Jahr nicht ansehen, solange noch nichts einging.
        const heuer = new Date().getFullYear();
        const alle = verfuegbar.includes(heuer)
          ? verfuegbar
          : [heuer, ...verfuegbar].sort((a, b) => b - a);
        setJahre(alle);
        setJahr(alle[0]);
      })
      .catch((e) => setFehler(e as AppFehler));
  }, []);

  useEffect(() => {
    if (jahr === null) return;
    api.auswertung
      .jahresauswertung(jahr)
      .then((d) => {
        setDaten(d);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }, [jahr]);

  async function csvExportieren() {
    if (!daten) return;
    setFehler(null);
    try {
      const csv = zuCsv(
        ["Datum", "Rechnung", "Kunde", "Betrag"],
        daten.vereinnahmungen.map((v) => [
          datumDeutsch(v.datum),
          v.rechnung_nummer,
          v.kunde_name,
          formatCentZahl(v.betrag_cent),
        ]),
      );
      const ziel = await save({
        defaultPath: `Auswertung-${daten.jahr}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!ziel) return;
      await writeFile(ziel, new TextEncoder().encode(csv));
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <div>
      <SeitenkopfMitRundgang titel="Auswertung" schritte={RUNDGANG_SCHRITTE} />
      <Fehler fehler={fehler} />

      <Werkzeugleiste
        filter={
          jahre && jahr !== null ? (
            <label className="feld" data-tour="jahr">
              Jahr
              <select value={jahr} onChange={(e) => setJahr(Number(e.currentTarget.value))}>
                {jahre.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
        aktion={
          <button
            type="button"
            className="btn btn-primaer"
            data-tour="csv"
            disabled={!daten || daten.vereinnahmungen.length === 0}
            onClick={csvExportieren}
          >
            Als CSV exportieren
          </button>
        }
      />

      {!daten ? (
        // Kein `was`: „die Auswertung werden geladen" wäre grammatisch falsch
        // (Laden ist auf den Plural zugeschnitten, „Rechnungen", „Kunden").
        <Laden />
      ) : (
        <>
          <p className="feld-hinweis hinweis-absatz">
            Vereinnahmte Zahlungen nach § 19 Abs. 2 UStG — maßgeblich ist, wann das Geld
            geflossen ist, nicht wann die Rechnung gestellt wurde. Das ersetzt keine
            EÜR-Anlage, nur die Zuarbeit dafür.
          </p>

          {daten.vereinnahmungen.length === 0 ? (
            <p>Keine vereinnahmten Zahlungen in {daten.jahr}.</p>
          ) : (
            <table className="tabelle" data-tour="tabelle">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Rechnung</th>
                  <th>Kunde</th>
                  <th>Betrag</th>
                </tr>
              </thead>
              <tbody>
                {daten.vereinnahmungen.map((v, i) => (
                  <tr key={`${v.datum}-${v.rechnung_nummer}-${i}`}>
                    <td>{datumDeutsch(v.datum)}</td>
                    <td>{v.rechnung_nummer}</td>
                    <td>{v.kunde_name}</td>
                    <td className="tabelle-num">{formatCent(v.betrag_cent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="beleg-summe">Summe: {formatCent(daten.summe_cent)}</p>
        </>
      )}
    </div>
  );
}
