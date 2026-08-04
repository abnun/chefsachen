import { useEffect, useState } from "react";
import { api, type Beleg, type Kunde, type KundeDetail as KundeDetailTyp } from "../api";
import { useUngespeichert } from "../hooks/useUngespeichert";
import { datumDeutsch } from "../datum";

interface StammdatenAbschnittProps {
  beleg: Beleg;
  kunden: Kunde[];
  bearbeitbar: boolean;
  onSpeichern: (felder: {
    kunde_id: string;
    datum: string;
    leistungsdatum: string;
    leistungsdatum_bis: string | null;
    gueltig_bis: string | null;
    zahlungsziel_tage: number;
    kopftext: string;
    fusstext: string;
    adresse_id: string | null;
    ansprechpartner_id: string | null;
  }) => void;
}

export function StammdatenAbschnitt({ beleg, kunden, bearbeitbar, onSpeichern }: StammdatenAbschnittProps) {
  const [kundeId, setKundeId] = useState(beleg.kunde_id);
  const [datum, setDatum] = useState(beleg.datum);
  const [leistungsdatum, setLeistungsdatum] = useState(beleg.leistungsdatum);
  const [leistungsdatumBis, setLeistungsdatumBis] = useState(beleg.leistungsdatum_bis ?? "");
  const [gueltigBis, setGueltigBis] = useState(beleg.gueltig_bis ?? "");
  const [zahlungszielTage, setZahlungszielTage] = useState(beleg.zahlungsziel_tage);
  const [kopftext, setKopftext] = useState(beleg.kopftext);
  const [fusstext, setFusstext] = useState(beleg.fusstext);
  const [adresseId, setAdresseId] = useState(beleg.adresse_id ?? "");
  const [ansprechpartnerId, setAnsprechpartnerId] = useState(beleg.ansprechpartner_id ?? "");
  /** Adressen und Ansprechpartner des gewählten Kunden. */
  const [kundeDetail, setKundeDetail] = useState<KundeDetailTyp | null>(null);

  // Kein Reset-Effekt auf `beleg`: Beim Wechsel auf einen anderen Beleg sorgt
  // der Eltern-key (BelegEditor setzt key={beleg.id}) für einen Remount mit
  // frischem Zustand. Ein Effekt, der bei jeder neuen Objektidentität
  // zurücksetzt, würde dagegen auch bei jedem laden() feuern — und damit
  // ungespeicherte Eingaben verwerfen, sobald nebenan eine Position
  // gespeichert wird.

  useEffect(() => {
    // Nur im Entwurf: Bei einem festgeschriebenen Beleg gibt es nichts zu
    // wählen, und die Anschrift steht ohnehin im Snapshot.
    if (!bearbeitbar || !kundeId) {
      setKundeDetail(null);
      return;
    }
    // Nach einem Kundenwechsel passen die bisherigen Auswahlen nicht mehr —
    // eine Adresse eines anderen Kunden würde das Backend ohnehin ablehnen.
    api.kunden
      .get(kundeId)
      .then((d) => {
        setKundeDetail(d);
        if (kundeId !== beleg.kunde_id) {
          setAdresseId("");
          setAnsprechpartnerId("");
        }
      })
      .catch(() => setKundeDetail(null));
  }, [bearbeitbar, kundeId, beleg.kunde_id]);

  // Abweichung vom geladenen Beleg heißt: ungespeichert. Der Vergleich läuft
  // gegen die Vorlage statt über ein „berührt"-Kennzeichen — wer einen Wert
  // ändert und wieder zurücksetzt, soll nicht gefragt werden.
  const geaendert =
    bearbeitbar &&
    (kundeId !== beleg.kunde_id ||
      datum !== beleg.datum ||
      leistungsdatum !== beleg.leistungsdatum ||
      leistungsdatumBis !== (beleg.leistungsdatum_bis ?? "") ||
      gueltigBis !== (beleg.gueltig_bis ?? "") ||
      zahlungszielTage !== beleg.zahlungsziel_tage ||
      kopftext !== beleg.kopftext ||
      fusstext !== beleg.fusstext ||
      adresseId !== (beleg.adresse_id ?? "") ||
      ansprechpartnerId !== (beleg.ansprechpartner_id ?? ""));
  useUngespeichert(geaendert);

  const kunde = kunden.find((k) => k.id === beleg.kunde_id);

  if (!bearbeitbar) {
    return (
      <section className="karte">
        <h2>Stammdaten</h2>
        <p>Kunde: {beleg.kunde_snapshot_name ?? kunde?.name ?? beleg.kunde_id}</p>
        <p>Datum: {datumDeutsch(beleg.datum)}</p>
        <p>
          {beleg.leistungsdatum_bis
            ? `Leistungszeitraum: ${datumDeutsch(beleg.leistungsdatum)} – ${datumDeutsch(beleg.leistungsdatum_bis)}`
            : `Leistungsdatum: ${datumDeutsch(beleg.leistungsdatum)}`}
        </p>
        {beleg.typ === "angebot" && (
          <p>Gültig bis: {beleg.gueltig_bis ? datumDeutsch(beleg.gueltig_bis) : "unbefristet"}</p>
        )}
        <p>Zahlungsziel: {beleg.zahlungsziel_tage} Tage</p>
      </section>
    );
  }

  return (
    <section className="karte">
      <h2>Stammdaten</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSpeichern({
            kunde_id: kundeId,
            datum,
            leistungsdatum,
            leistungsdatum_bis: leistungsdatumBis === "" ? null : leistungsdatumBis,
            gueltig_bis: gueltigBis === "" ? null : gueltigBis,
            zahlungsziel_tage: zahlungszielTage,
            kopftext,
            fusstext,
            adresse_id: adresseId === "" ? null : adresseId,
            ansprechpartner_id: ansprechpartnerId === "" ? null : ansprechpartnerId,
          });
        }}
      >
        {/* Solange der Beleg Entwurf ist, muss sich der Kunde korrigieren lassen —
            sonst bleibt bei einem Fehlgriff nur, den Entwurf zu verwerfen. */}
        <label className="feld">
          Kunde
          <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        {/* Ohne Wahl gilt die Standard-Rechnungsadresse des Kunden. Wer mehrere
            Standorte beliefert, konnte das bisher nur erzwingen, indem er den
            Standard beim Kunden umstellte — was alle künftigen Belege betrifft. */}
        <label className="feld">
          Rechnungsadresse
          <select value={adresseId} onChange={(e) => setAdresseId(e.currentTarget.value)}>
            <option value="">Standardadresse des Kunden</option>
            {(kundeDetail?.adressen ?? [])
              .filter((a) => a.typ === "rechnung")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.strasse}, {a.plz} {a.ort}
                  {a.ist_standard ? " (Standard)" : ""}
                </option>
              ))}
          </select>
        </label>

        {/* Bei größeren Kunden landet eine Rechnung ohne Namen in der
            Poststelle und von dort irgendwo. */}
        <label className="feld">
          Ansprechpartner
          <select
            value={ansprechpartnerId}
            onChange={(e) => setAnsprechpartnerId(e.currentTarget.value)}
          >
            <option value="">– keiner –</option>
            {(kundeDetail?.ansprechpartner ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.rolle ? ` (${a.rolle})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="feld">
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label className="feld">
          {leistungsdatumBis === "" ? "Leistungsdatum" : "Leistung von"}
          <input type="date" value={leistungsdatum} onChange={(e) => setLeistungsdatum(e.currentTarget.value)} />
        </label>
        {/* § 14 Abs. 4 Nr. 6 UStG lässt Zeitpunkt „oder Zeitraum" zu. Leer heißt
            Einzeldatum — der Regelfall; für Monatsabrechnungen und andere
            Dauerleistungen wäre ein Einzeldatum sachlich falsch. */}
        <label className="feld">
          Leistung bis (bei Zeitraum)
          <input
            type="date"
            min={leistungsdatum}
            value={leistungsdatumBis}
            onChange={(e) => setLeistungsdatumBis(e.currentTarget.value)}
          />
        </label>
        {/* Nur bei Angeboten: Der Fußtext versprach bisher eine Frist ("Dieses
            Angebot ist 30 Tage gültig"), ohne dass ein Datum dazu existierte —
            die Übersicht führte Angebote deshalb unbefristet als „offen". Der
            Wert kommt beim Anlegen automatisch aus einer Einstellung, lässt
            sich hier aber jederzeit verlängern oder verkürzen. */}
        {beleg.typ === "angebot" && (
          <label className="feld">
            Gültig bis
            <input
              type="date"
              min={datum}
              value={gueltigBis}
              onChange={(e) => setGueltigBis(e.currentTarget.value)}
            />
          </label>
        )}
        <label className="feld">
          Zahlungsziel (Tage)
          <input
            type="number"
            min={0}
            value={zahlungszielTage}
            onChange={(e) => setZahlungszielTage(Number(e.currentTarget.value))}
          />
        </label>
        {/* Ohne diesen Satz ist „sofort" nicht auffindbar: Man müsste raten,
            dass eine Null dafür steht. Der genaue Wortlaut auf dem Beleg steht
            hier bewusst nicht — er entsteht im Rust-Teil, und ihn hier ein
            zweites Mal zu formulieren hieße, zwei Fassungen zu pflegen. */}
        <p className="feld-hinweis">
          {zahlungszielTage === 0
            ? "Die Rechnung weist den Betrag als sofort zahlbar aus."
            : "Die Rechnung nennt daraus ein Fälligkeitsdatum. 0 Tage heißt: sofort zahlbar."}
        </p>
        <label className="feld">
          Kopftext
          <textarea value={kopftext} onChange={(e) => setKopftext(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Fußtext
          <textarea value={fusstext} onChange={(e) => setFusstext(e.currentTarget.value)} />
        </label>
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </div>
      </form>
    </section>
  );
}
