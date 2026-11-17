import { useEffect, useState } from "react";
import { api, type Beleg, type Kunde, type KundeDetail as KundeDetailTyp } from "../api";
import { useUngespeichert } from "../hooks/useUngespeichert";
import { datumDeutsch, datumPlusTage } from "../datum";
import { formatCent, parseEuro } from "../geld";

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
    gesamtauftragswert_cent: number | null;
  }) => Promise<boolean>;
  /** Ein anderer Teil des Belegs (die Positionen) speichert gerade. */
  fremdSpeichert?: boolean;
  /** Zählt die erfolgreich beendeten Speichervorgänge der Positionen. */
  fremdFertig?: number;
}

/** So lange bleibt der drehende Ring mindestens sichtbar. */
export const MINDESTDAUER_SPEICHERN_MS = 600;

export function StammdatenAbschnitt({ beleg, kunden, bearbeitbar, onSpeichern, fremdSpeichert = false, fremdFertig = 0 }: StammdatenAbschnittProps) {
  const [kundeId, setKundeId] = useState(beleg.kunde_id);
  const [datum, setDatum] = useState(beleg.datum);
  const [leistungsdatum, setLeistungsdatum] = useState(beleg.leistungsdatum);
  const [leistungsdatumBis, setLeistungsdatumBis] = useState(beleg.leistungsdatum_bis ?? "");
  const [gueltigBis, setGueltigBis] = useState(beleg.gueltig_bis ?? "");
  // Leistungsdatum und Gültigkeit folgen dem Belegdatum, solange sie nicht
  // bewusst davon abweichen. Der Anfangswert ergibt sich aus dem gespeicherten
  // Beleg: Steht das Leistungsdatum auf dem Belegdatum, folgt es weiter.
  const [leistungFolgt, setLeistungFolgt] = useState(
    beleg.leistungsdatum === beleg.datum && !beleg.leistungsdatum_bis,
  );
  const [gueltigFolgt, setGueltigFolgt] = useState(false);
  // Frist neuer Angebote in Tagen (Einstellungen); null, bis sie geladen ist.
  const [gueltigkeitTage, setGueltigkeitTage] = useState<number | null>(null);
  const [zahlungszielTage, setZahlungszielTage] = useState(beleg.zahlungsziel_tage);
  const [kopftext, setKopftext] = useState(beleg.kopftext);
  const [fusstext, setFusstext] = useState(beleg.fusstext);
  const [adresseId, setAdresseId] = useState(beleg.adresse_id ?? "");
  const [ansprechpartnerId, setAnsprechpartnerId] = useState(beleg.ansprechpartner_id ?? "");
  const [gesamtauftragswertText, setGesamtauftragswertText] = useState(
    beleg.gesamtauftragswert_cent != null ? formatCent(beleg.gesamtauftragswert_cent).replace(" €", "") : "",
  );
  const gesamtauftragswertCent =
    gesamtauftragswertText.trim() === "" ? null : parseEuro(gesamtauftragswertText);
  /** Adressen und Ansprechpartner des gewählten Kunden. */
  const [kundeDetail, setKundeDetail] = useState<KundeDetailTyp | null>(null);

  // Kein Reset-Effekt auf `beleg`: Beim Wechsel auf einen anderen Beleg sorgt
  // der Eltern-key (BelegEditor setzt key={beleg.id}) für einen Remount mit
  // frischem Zustand. Ein Effekt, der bei jeder neuen Objektidentität
  // zurücksetzt, würde dagegen auch bei jedem laden() feuern — und damit
  // ungespeicherte Eingaben verwerfen, sobald nebenan eine Position
  // gespeichert wird.

  const istAngebotEntwurf = bearbeitbar && beleg.typ === "angebot";
  useEffect(() => {
    if (!istAngebotEntwurf) return;
    let aktuell = true;
    // Wie im Backend: Ein unbrauchbarer Wert ergibt 30 Tage.
    Promise.resolve(api.einstellungen.get("vorlage.angebot_gueltigkeit_tage"))
      .catch(() => null)
      .then((w) => {
        if (!aktuell) return;
        const t = Number.parseInt((w ?? "").trim(), 10);
        const tage = Number.isFinite(t) && t >= 0 ? t : 30;
        setGueltigkeitTage(tage);
        // Ein Ablaufdatum, das genau der Regel entspricht (oder fehlt), folgt
        // weiter dem Datum; ein bewusst gesetztes bleibt, wie es ist.
        setGueltigFolgt(!beleg.gueltig_bis || beleg.gueltig_bis === datumPlusTage(beleg.datum, tage));
      });
    return () => {
      aktuell = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [istAngebotEntwurf]);

  function datumAendern(neu: string) {
    setDatum(neu);
    if (!neu) return;
    if (leistungFolgt && leistungsdatumBis === "") setLeistungsdatum(neu);
    if (gueltigFolgt && gueltigkeitTage !== null) setGueltigBis(datumPlusTage(neu, gueltigkeitTage) ?? "");
  }

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
      ansprechpartnerId !== (beleg.ansprechpartner_id ?? "") ||
      gesamtauftragswertCent !== (beleg.gesamtauftragswert_cent ?? null));
  useUngespeichert(geaendert);

  const gesamtauftragswertGueltig = gesamtauftragswertText.trim() === "" || gesamtauftragswertCent !== null;
  const felder = {
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
    gesamtauftragswert_cent: gesamtauftragswertCent,
  };
  // Der Beleg speichert sich selbst: kurz nach der letzten Eingabe, nicht erst
  // auf einen Knopf. Wer Datum oder Kunde ändert und gleich darunter eine
  // Position hinzufügt, bekäme sonst deren Preis noch zum alten Datum.
  const [speicherStatus, setSpeicherStatus] = useState<"ruhe" | "speichert" | "gespeichert" | "fehler">("ruhe");
  const feldSchluessel = JSON.stringify(felder);
  async function speichernJetzt() {
    if (!geaendert || !gesamtauftragswertGueltig) return;
    setSpeicherStatus("speichert");
    const start = Date.now();
    const ok = await onSpeichern(felder);
    // Eine lokale Datenbank speichert in wenigen Millisekunden. Ohne Mindestdauer
    // blitzte der Ring so kurz auf, dass man nie sah, dass überhaupt etwas
    // geschah, und nur das fertige Häkchen blieb.
    const rest = MINDESTDAUER_SPEICHERN_MS - (Date.now() - start);
    if (rest > 0) await new Promise((r) => setTimeout(r, rest));
    setSpeicherStatus(ok ? "gespeichert" : "fehler");
  }
  useEffect(() => {
    if (!geaendert || !gesamtauftragswertGueltig) return;
    const timer = setTimeout(speichernJetzt, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feldSchluessel]);

  // Ein Speichervorgang der Positionen zählt wie ein eigener: Die Leiste steht
  // für den ganzen Entwurf, nicht nur für die Felder darüber.
  useEffect(() => {
    if (fremdFertig > 0) setSpeicherStatus((alt) => (alt === "fehler" ? alt : "gespeichert"));
  }, [fremdFertig]);

  const zustand: "ruhe" | "wartet" | "speichert" | "gespeichert" | "fehler" =
    speicherStatus === "speichert" || fremdSpeichert
      ? "speichert"
      : !gesamtauftragswertGueltig
      ? "fehler"
      : geaendert && speicherStatus === "fehler"
      ? "fehler"
      : geaendert
      ? "wartet"
      : speicherStatus === "gespeichert"
      ? "gespeichert"
      : "ruhe";
  const statusText = {
    ruhe: "Änderungen werden automatisch gespeichert.",
    wartet: "Änderungen werden gleich gespeichert …",
    speichert: "Wird gespeichert …",
    gespeichert: "Alle Änderungen gespeichert",
    fehler: !gesamtauftragswertGueltig
      ? "Noch nicht gespeichert: Der Gesamt-Auftragswert ist unklar."
      : "Nicht gespeichert, siehe Meldung oben.",
  }[zustand];

  const kunde = kunden.find((k) => k.id === beleg.kunde_id);

  if (!bearbeitbar) {
    // Festgeschrieben: eine Liste aus Beschriftung und Wert statt loser
    // Absätze. Die Beschriftung tritt zurück, gelesen wird der Wert.
    return (
      <section className="abschnitt">
        <h2>Stammdaten</h2>
        <dl className="angaben">
          <dt>Kunde</dt>
          <dd>{beleg.kunde_snapshot_name ?? kunde?.name ?? beleg.kunde_id}</dd>
          <dt>Datum</dt>
          <dd>{datumDeutsch(beleg.datum)}</dd>
          <dt>{beleg.leistungsdatum_bis ? "Leistungszeitraum" : "Leistungsdatum"}</dt>
          <dd>
            {beleg.leistungsdatum_bis
              ? `${datumDeutsch(beleg.leistungsdatum)} – ${datumDeutsch(beleg.leistungsdatum_bis)}`
              : datumDeutsch(beleg.leistungsdatum)}
          </dd>
          {beleg.typ === "angebot" && (
            <>
              <dt>Gültig bis</dt>
              <dd>{beleg.gueltig_bis ? datumDeutsch(beleg.gueltig_bis) : "unbefristet"}</dd>
            </>
          )}
          <dt>Zahlungsziel</dt>
          <dd>{beleg.zahlungsziel_tage} Tage</dd>
          {beleg.gesamtauftragswert_cent != null && (
            <>
              <dt>Gesamt-Auftragswert</dt>
              <dd>{formatCent(beleg.gesamtauftragswert_cent)}</dd>
            </>
          )}
        </dl>
      </section>
    );
  }

  return (
    <section className="abschnitt">
      <h2>Stammdaten</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichernJetzt();
        }}
      >
        <div className="gruppe">
          <div className="felder-reihe">
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
          </div>
          <div className="felder-reihe">
            <label className="feld">
              Datum
              <input type="date" value={datum} onChange={(e) => datumAendern(e.currentTarget.value)} />
            </label>
            <label className="feld">
              {leistungsdatumBis === "" ? "Leistungsdatum" : "Leistung von"}
              <input
                type="date"
                value={leistungsdatum}
                onChange={(e) => {
                  const neu = e.currentTarget.value;
                  setLeistungsdatum(neu);
                  // Wer das Datum wieder angleicht, will, dass es mitläuft.
                  setLeistungFolgt(neu === datum);
                }}
              />
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
          </div>
          <div className="felder-reihe">
            {/* Nur bei Angeboten: Der Fußtext versprach bisher eine Frist ("Dieses
                Angebot ist 30 Tage gültig"), ohne dass ein Datum dazu existierte —
                die Übersicht führte Angebote deshalb unbefristet als „offen". Der
                Wert kommt beim Anlegen automatisch aus einer Einstellung, lässt
                sich hier aber jederzeit verlängern oder verkürzen. */}
            {beleg.typ === "angebot" && (
              <div>
                <label className="feld">
                  Gültig bis
                  <input
                    type="date"
                    min={datum}
                    value={gueltigBis}
                    onChange={(e) => {
                      const neu = e.currentTarget.value;
                      setGueltigBis(neu);
                      setGueltigFolgt(gueltigkeitTage !== null && neu === datumPlusTage(datum, gueltigkeitTage));
                    }}
                  />
                </label>
                {gueltigFolgt && gueltigkeitTage !== null && (
                  <p className="feld-hinweis">Datum plus {gueltigkeitTage} Tage (Einstellungen).</p>
                )}
              </div>
            )}
            <div>
              <label className="feld feld-schmal">
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
            </div>
          </div>
          <label className="feld">
            Kopftext
            <textarea value={kopftext} onChange={(e) => setKopftext(e.currentTarget.value)} />
          </label>
          <label className="feld">
            Fußtext
            <textarea value={fusstext} onChange={(e) => setFusstext(e.currentTarget.value)} />
          </label>
          <label className="feld feld-mittel">
            Gesamt-Auftragswert (€)
            <input
              value={gesamtauftragswertText}
              onChange={(e) => setGesamtauftragswertText(e.currentTarget.value)}
              placeholder="nur bei Abschlagsrechnungen"
            />
          </label>
          {!gesamtauftragswertGueltig && (
            <div className="feld-fehler" role="alert">Bitte einen gültigen Betrag eingeben, z. B. 1.470,00</div>
          )}
          <p className="feld-hinweis">
            Nur für Abschlagsrechnungen: weist auf dem Beleg zusätzlich auf den Gesamtwert des
            Auftrags hin, aus dem sich diese Teilrechnung ergibt.
          </p>
        </div>
        {/* Auto-Speichern und Knopf nebeneinander: Die Leiste sagt, was mit den
            Eingaben geschieht, der Knopf erlaubt, es sofort zu erzwingen. Wer
            die Anwendung kennt, vertraut dem Automatismus; wer sie nicht kennt,
            sucht zuerst den Knopf. */}
        <div className="speicherleiste" data-zustand={zustand}>
          <p className="speicher-status" role="status">
            <span className="speicher-symbol" aria-hidden="true">
              {zustand === "speichert" ? "" : zustand === "fehler" ? "!" : zustand === "wartet" ? "…" : "✓"}
            </span>
            {statusText}
          </p>
          <button type="submit" className="btn btn-primaer" disabled={!geaendert || !gesamtauftragswertGueltig || speicherStatus === "speichert"}>
            Speichern
          </button>
        </div>
      </form>
    </section>
  );
}
