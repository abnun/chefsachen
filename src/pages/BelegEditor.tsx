import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import {
  api,
  type AppFehler,
  type Artikel,
  type Beleg,
  type BelegDetail,
  type Belegposition,
  type Kunde,
  type KundeDetail as KundeDetailTyp,
  type Zahlung,
} from "../api";
import { ArtikelAuswahl } from "../components/ArtikelAuswahl";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { StatusMarke } from "../components/StatusMarke";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useBestaetigung } from "../hooks/useBestaetigung";
import { useUngespeichert } from "../hooks/useUngespeichert";
import { formatCent, formatMenge, parseEuro, parseMenge } from "../geld";
import { datumDeutsch } from "../datum";

interface BelegEditorProps {
  id: string;
  onGeaendert?: () => void;
  onRechnungErstellt?: (rechnungId: string) => void;
  /** Wird nach dem Löschen eines Entwurfs gerufen, damit die Seite zurückgeht. */
  onGeloescht?: () => void;
  /** Zurück zur Liste. Ohne diesen Weg kommt man nur über die Navigation raus. */
  onZurueck?: () => void;
}

const ANGEBOT_ABSCHLUSS_STATUS = [
  { wert: "angenommen", label: "Angenommen" },
  { wert: "abgelehnt", label: "Abgelehnt" },
  { wert: "abgelaufen", label: "Abgelaufen" },
];


/**
 * Editor für Angebote und Rechnungen — beide teilen sich Datenmodell,
 * Status-Workflow (Entwurf → gestellt) und Positions-Verwaltung, daher eine
 * gemeinsame Komponente statt zweier Kopien.
 */
export function BelegEditor({ id, onZurueck, onGeaendert, onRechnungErstellt, onGeloescht }: BelegEditorProps) {
  const [detail, setDetail] = useState<BelegDetail | null>(null);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [artikelListe, setArtikelListe] = useState<Artikel[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  // Sperrt die nicht umkehrbaren Aktionen, solange eine davon läuft. Ohne das
  // erzeugt ein Doppelklick zwei Vorgänge und verbraucht zwei Belegnummern.
  const [laeuft, setLaeuft] = useState(false);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  function laden() {
    api.belege
      .get(id)
      .then((d) => {
        setDetail(d);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [id]);
  useEffect(() => {
    api.kunden.list().then(setKunden).catch(() => {});
    api.artikel.list().then(setArtikelListe).catch(() => {});
  }, []);

  if (!detail) {
    return <main>{fehler ? <Fehler fehler={fehler} /> : <Laden />}</main>;
  }

  const { beleg, positionen, zahlungen, offener_betrag_cent } = detail;
  const istEntwurf = beleg.status === "entwurf";

  async function stammdatenSpeichern(felder: {
    kunde_id: string;
    datum: string;
    leistungsdatum: string;
    leistungsdatum_bis: string | null;
    zahlungsziel_tage: number;
    kopftext: string;
    fusstext: string;
    adresse_id: string | null;
    ansprechpartner_id: string | null;
  }) {
    setFehler(null);
    try {
      await api.belege.update({ id: beleg.id, ...felder });
      laden();
      // Nicht „Angebot gespeichert": Der Knopf gehört zur Karte „Stammdaten"
      // und speichert genau die. Der Beleg als Ganzes ist damit weder fertig
      // noch festgeschrieben — die Positionen darunter haben ihre eigenen
      // Knöpfe, und das Festschreiben ist ein eigener Schritt.
      zeigen("Stammdaten gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  /**
   * Schreibt den Beleg fest.
   *
   * Die Beschriftung sagt ausdrücklich, dass nichts verschickt wird. „Angebot
   * versenden?" ließ genau das offen — die Anwendung kennt weder Postfach noch
   * Mailkonto, sie hält nur fest, dass *du* es verschickt hast.
   */
  async function stellen() {
    const istAngebot = beleg.typ === "angebot";
    const frage = istAngebot
      ? "Angebot festschreiben? Es bekommt eine Nummer und lässt sich danach nicht mehr " +
        "ändern. Verschickt wird nichts — dafür exportierst du es als PDF und schickst es selbst."
      : "Rechnung stellen? Sie erhält eine feste Nummer und ist danach nicht mehr änderbar — " +
        "eine Korrektur ist nur noch per Storno möglich. Verschickt wird nichts.";
    // Was gleich unveränderbar wird, gehört vor die Zusage. Gerade die Texte
    // sieht man beim Klick nicht — sie stehen weiter oben oder sind
    // weggescrollt, und in einer überführten Rechnung stand früher der
    // Wortlaut des Angebots.
    const vorschau = (
      <dl className="festschreiben-vorschau">
        <dt>Kunde</dt>
        <dd>{kunden.find((k) => k.id === beleg.kunde_id)?.name ?? beleg.kunde_id}</dd>
        <dt>Positionen</dt>
        <dd>
          {positionen.length}, Summe {formatCent(beleg.summe_cent)}
        </dd>
        <dt>Kopftext</dt>
        <dd>{beleg.kopftext.trim() || <em>leer</em>}</dd>
        <dt>Fußtext</dt>
        <dd>{beleg.fusstext.trim() || <em>leer</em>}</dd>
      </dl>
    );
    if (!(await bestaetigen(frage, istAngebot ? "Festschreiben" : "Stellen", vorschau))) return;
    setFehler(null);
    setLaeuft(true);
    try {
      await api.belege.stellen(beleg.id);
      laden();
      onGeaendert?.();
      zeigen(istAngebot ? "Angebot festgeschrieben" : "Rechnung gestellt");
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setLaeuft(false);
    }
  }

  async function angebotStatus(status: string) {
    // „Angenommen" führt den Normalweg fort und bleibt ohne Rückfrage.
    // „Abgelehnt"/„Abgelaufen" versperren dagegen dauerhaft die Überführung in
    // eine Rechnung — das Backend lässt einen Statuswechsel nur aus
    // „festgeschrieben" zu.
    if (status !== "angenommen") {
      const label = status === "abgelehnt" ? "Abgelehnt" : "Abgelaufen";
      const frage = `Angebot als „${label}" markieren? Es lässt sich danach nicht mehr in eine Rechnung überführen.`;
      if (!(await bestaetigen(frage, label))) return;
    }
    setFehler(null);
    setLaeuft(true);
    try {
      await api.belege.angebotStatusSetzen(beleg.id, status);
      laden();
      zeigen("Status aktualisiert");
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setLaeuft(false);
    }
  }

  async function inRechnungUeberfuehren() {
    setFehler(null);
    setLaeuft(true);
    try {
      const rechnung = await api.belege.angebotInRechnungUeberfuehren(beleg.id);
      laden();
      onGeaendert?.();
      onRechnungErstellt?.(rechnung.id);
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setLaeuft(false);
    }
  }

  async function stornieren() {
    const frage =
      "Rechnung stornieren? Es entsteht ein eigener Stornobeleg mit neuer Nummer. " +
      "Das lässt sich nicht rückgängig machen.";
    if (!(await bestaetigen(frage, "Stornieren"))) return;
    setFehler(null);
    setLaeuft(true);
    try {
      await api.belege.rechnungStornieren(beleg.id);
      laden();
      onGeaendert?.();
      zeigen("Rechnung storniert");
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setLaeuft(false);
    }
  }

  async function entwurfLoeschen() {
    const was = beleg.typ === "angebot" ? "Angebot" : "Rechnung";
    if (!(await bestaetigen(`${was}sentwurf endgültig löschen?`, "Löschen"))) return;
    setFehler(null);
    setLaeuft(true);
    try {
      await api.belege.delete(beleg.id);
      onGeaendert?.();
      onGeloescht?.();
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setLaeuft(false);
    }
  }

  async function positionLoeschen(positionId: string) {
    setFehler(null);
    try {
      await api.belege.positionDelete(positionId);
      laden();
      zeigen("Position gelöscht");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function pdfExportieren() {
    setFehler(null);
    try {
      const bytes = await api.belege.pdfExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
        zeigen("PDF exportiert");
      }
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function xrechnungExportieren() {
    setFehler(null);
    try {
      const bytes = await api.belege.xrechnungExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}.xml`, filters: [{ name: "XML", extensions: ["xml"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
        zeigen("XRechnung exportiert");
      }
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function zugferdExportieren() {
    setFehler(null);
    try {
      const bytes = await api.belege.zugferdExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}-zugferd.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
        zeigen("ZUGFeRD-Rechnung exportiert");
      }
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <main>
      {onZurueck && (
        <button type="button" className="btn btn-leise" onClick={onZurueck}>
          ← Zurück zur Liste
        </button>
      )}
      <h1 className="seiten-kopf">
        {beleg.typ === "angebot" ? "Angebot" : "Rechnung"} {beleg.nummer ?? "(Entwurf)"}
      </h1>
      {/* Die Aktionen stehen beim Status, nicht am Seitenende. Ein Beleg mit
          vielen Positionen ist lang; „Stellen" war dort erst nach mehrmaligem
          Scrollen zu finden — und daneben lagen Löschen und Stornieren. */}
      <div className="beleg-kopfleiste">
        <span className="beleg-status">
          Status: <StatusMarke status={beleg.status} />
        </span>

        <div className="aktionen">
          {istEntwurf && (
            <button
              type="button"
              className="btn btn-primaer"
              disabled={positionen.length === 0 || laeuft}
              title={positionen.length === 0 ? "Erst eine Position hinzufügen" : undefined}
              onClick={stellen}
            >
              {beleg.typ === "angebot" ? "Festschreiben" : "Stellen"}
            </button>
          )}

          {beleg.typ === "angebot" && ["festgeschrieben", "angenommen"].includes(beleg.status) && (
            <button
              type="button"
              className="btn btn-primaer"
              disabled={laeuft}
              onClick={inRechnungUeberfuehren}
            >
              In Rechnung überführen
            </button>
          )}

          {beleg.status !== "entwurf" && (
            /* Sichtbar kurz, damit die Leiste nicht ausufert; der zugängliche
               Name nennt die ganze Handlung. Er enthält das sichtbare Wort,
               wie WCAG 2.5.3 es verlangt. */
            <button
              type="button"
              className="btn"
              aria-label="Als PDF exportieren"
              onClick={pdfExportieren}
            >
              PDF
            </button>
          )}
          {beleg.typ === "rechnung" && beleg.status !== "entwurf" && (
            <>
              <button
                type="button"
                className="btn"
                aria-label="Als XRechnung (XML) exportieren"
                onClick={xrechnungExportieren}
              >
                XRechnung
              </button>
              <button
                type="button"
                className="btn"
                aria-label="Als ZUGFeRD-Rechnung exportieren"
                onClick={zugferdExportieren}
              >
                ZUGFeRD
              </button>
            </>
          )}

          {beleg.typ === "angebot" && beleg.status === "festgeschrieben" &&
            ANGEBOT_ABSCHLUSS_STATUS.map((z) => (
              <button
                key={z.wert}
                type="button"
                className="btn"
                disabled={laeuft}
                onClick={() => angebotStatus(z.wert)}
              >
                {z.label}
              </button>
            ))}

          {/* Ohne diese Möglichkeit bleibt ein versehentlich angelegter Entwurf
              für immer stehen — und blockiert zusätzlich das Löschen seines
              Kunden. */}
          {istEntwurf && (
            <button
              type="button"
              className="btn btn-gefahr"
              disabled={laeuft}
              onClick={entwurfLoeschen}
            >
              Entwurf löschen
            </button>
          )}

          {/* Ein Stornobeleg ist selbst eine gestellte Rechnung. Ohne die
              Prüfung auf storno_von_id ließe er sich erneut stornieren — das
              erzeugt eine Kaskade aus Gegenbelegen und verbraucht bei jedem
              Schritt eine Rechnungsnummer. */}
          {beleg.typ === "rechnung" && beleg.status === "gestellt" &&
            beleg.storno_von_id === null && (
              <button
                type="button"
                className="btn btn-gefahr"
                disabled={laeuft}
                onClick={stornieren}
              >
                Stornieren
              </button>
            )}
        </div>
      </div>

      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}

      <StammdatenAbschnitt
        beleg={beleg}
        kunden={kunden}
        bearbeitbar={istEntwurf}
        onSpeichern={stammdatenSpeichern}
      />

      <PositionenAbschnitt
        belegId={beleg.id}
        positionen={positionen}
        artikelListe={artikelListe}
        bearbeitbar={istEntwurf}
        onGeaendert={laden}
        onLoeschen={positionLoeschen}
      />

      <p className="beleg-summe">Summe: {formatCent(beleg.summe_cent)}</p>

      {beleg.typ === "rechnung" && beleg.storno_von_id !== null && (
        <p>Dies ist ein Stornobeleg.</p>
      )}
      {beleg.typ === "rechnung" && beleg.status === "storniert" && (
        <p>Diese Rechnung wurde storniert.</p>
      )}

      {beleg.typ === "rechnung" && ["gestellt", "storniert"].includes(beleg.status) && (
        <ZahlungenAbschnitt
          rechnungId={beleg.id}
          zahlungen={zahlungen}
          offenerBetragCent={offener_betrag_cent}
          onGeaendert={laden}
        />
      )}
    </main>
  );
}

interface StammdatenAbschnittProps {
  beleg: Beleg;
  kunden: Kunde[];
  bearbeitbar: boolean;
  onSpeichern: (felder: {
    kunde_id: string;
    datum: string;
    leistungsdatum: string;
    leistungsdatum_bis: string | null;
    zahlungsziel_tage: number;
    kopftext: string;
    fusstext: string;
    adresse_id: string | null;
    ansprechpartner_id: string | null;
  }) => void;
}

function StammdatenAbschnitt({ beleg, kunden, bearbeitbar, onSpeichern }: StammdatenAbschnittProps) {
  const [kundeId, setKundeId] = useState(beleg.kunde_id);
  const [datum, setDatum] = useState(beleg.datum);
  const [leistungsdatum, setLeistungsdatum] = useState(beleg.leistungsdatum);
  const [leistungsdatumBis, setLeistungsdatumBis] = useState(beleg.leistungsdatum_bis ?? "");
  const [zahlungszielTage, setZahlungszielTage] = useState(beleg.zahlungsziel_tage);
  const [kopftext, setKopftext] = useState(beleg.kopftext);
  const [fusstext, setFusstext] = useState(beleg.fusstext);
  const [adresseId, setAdresseId] = useState(beleg.adresse_id ?? "");
  const [ansprechpartnerId, setAnsprechpartnerId] = useState(beleg.ansprechpartner_id ?? "");
  /** Adressen und Ansprechpartner des gewählten Kunden. */
  const [kundeDetail, setKundeDetail] = useState<KundeDetailTyp | null>(null);

  useEffect(() => {
    setKundeId(beleg.kunde_id);
    setDatum(beleg.datum);
    setLeistungsdatum(beleg.leistungsdatum);
    setLeistungsdatumBis(beleg.leistungsdatum_bis ?? "");
    setZahlungszielTage(beleg.zahlungsziel_tage);
    setKopftext(beleg.kopftext);
    setFusstext(beleg.fusstext);
    setAdresseId(beleg.adresse_id ?? "");
    setAnsprechpartnerId(beleg.ansprechpartner_id ?? "");
  }, [beleg]);

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

interface PositionenAbschnittProps {
  belegId: string;
  positionen: Belegposition[];
  artikelListe: Artikel[];
  bearbeitbar: boolean;
  onGeaendert: () => void;
  onLoeschen: (id: string) => void;
}

function PositionenAbschnitt({
  belegId,
  artikelListe,
  positionen,
  bearbeitbar,
  onGeaendert,
  onLoeschen,
}: PositionenAbschnittProps) {
  const [artikelId, setArtikelId] = useState("");
  const [freitext, setFreitext] = useState(false);
  const [bezeichnung, setBezeichnung] = useState("");
  const [einheitKuerzel, setEinheitKuerzel] = useState("");
  const [einzelpreis, setEinzelpreis] = useState("");
  const [menge, setMenge] = useState("1");
  /** Id der Position, die gerade bearbeitet wird; leer beim Anlegen. */
  const [bearbeiteId, setBearbeiteId] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  function formularLeeren() {
    setBearbeiteId("");
    setFreitext(false);
    setBezeichnung("");
    setEinheitKuerzel("");
    setEinzelpreis("");
    setMenge("1");
    setArtikelId("");
    setFehler(null);
  }

  function bearbeiten(p: Belegposition) {
    setBearbeiteId(p.id);
    setFreitext(p.artikel_id === null);
    setBezeichnung(p.bezeichnung);
    setEinheitKuerzel(p.einheit_kuerzel);
    setEinzelpreis((p.einzelpreis_cent / 100).toFixed(2).replace(".", ","));
    setMenge(formatMenge(p.menge));
    setArtikelId(p.artikel_id ?? "");
    setFehler(null);
  }

  /**
   * Summe der Eingabe, noch bevor gespeichert wird.
   *
   * Ohne sie erfährt man den Betrag erst nach dem Absenden — und bei einem
   * Vertipper in der Menge auch erst dann. Für Artikel ohne überschriebenen
   * Preis lässt sich hier nichts sagen: Der gültige Preis kann ein Kundenpreis
   * sein, und den kennt nur das Backend. Dann bleibt es bei einem Hinweis
   * statt einer erfundenen Zahl.
   */
  const vorschau = (() => {
    const mengeX1000 = parseMenge(menge);
    const preisCent = einzelpreis.trim() === "" ? null : parseEuro(einzelpreis);
    if (mengeX1000 === null) return { text: "Menge unklar", betrag: null };
    if (preisCent === null) {
      return einzelpreis.trim() === "" && !freitext
        ? { text: "Preis wird beim Speichern ermittelt", betrag: null }
        : { text: "Preis unklar", betrag: null };
    }
    return { text: "", betrag: Math.round((mengeX1000 * preisCent) / 1000) };
  })();

  async function speichern() {
    setFehler(null);
    const mengeX1000 = parseMenge(menge);
    if (mengeX1000 === null) {
      setFehler({ typ: "validation", feld: "menge", meldung: "Ungültige Menge" });
      return;
    }
    const einzelpreisCent = einzelpreis.trim() === "" ? null : parseEuro(einzelpreis);
    if (einzelpreis.trim() !== "" && einzelpreisCent === null) {
      setFehler({ typ: "validation", feld: "einzelpreis_cent", meldung: "Ungültiger Preis" });
      return;
    }
    try {
      await api.belege.positionSave({
        id: bearbeiteId,
        beleg_id: belegId,
        artikel_id: freitext ? null : artikelId || null,
        bezeichnung: freitext ? bezeichnung : "",
        einheit_kuerzel: freitext ? einheitKuerzel : "",
        einzelpreis_cent: einzelpreisCent,
        menge: mengeX1000,
      });
      const geaendert = bearbeiteId !== "";
      formularLeeren();
      onGeaendert();
      zeigen(geaendert ? "Position geändert" : "Position hinzugefügt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function verschieben(id: string, richtung: "hoch" | "runter") {
    setFehler(null);
    try {
      await api.belege.positionVerschieben(id, richtung);
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschenBestaetigen(id: string, bezeichnung: string) {
    if (!(await bestaetigen(`Position „${bezeichnung}" löschen?`))) return;
    if (id === bearbeiteId) formularLeeren();
    onLoeschen(id);
  }

  return (
    <section className="karte">
      <h2>Positionen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th>Menge</th>
            <th>Einheit</th>
            <th>Einzelpreis</th>
            <th>Summe</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positionen.map((p, i) => (
            <tr key={p.id} className={p.id === bearbeiteId ? "zeile-bearbeitet" : undefined}>
              <td>{p.bezeichnung}</td>
              <td>{formatMenge(p.menge)}</td>
              <td>{p.einheit_kuerzel}</td>
              <td>{formatCent(p.einzelpreis_cent)}</td>
              <td>{formatCent(p.positionssumme_cent)}</td>
              <td className="aktionen">
                {bearbeitbar && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`„${p.bezeichnung}" nach oben`}
                      disabled={i === 0}
                      onClick={() => verschieben(p.id, "hoch")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`„${p.bezeichnung}" nach unten`}
                      disabled={i === positionen.length - 1}
                      onClick={() => verschieben(p.id, "runter")}
                    >
                      ↓
                    </button>
                    <button type="button" className="btn" onClick={() => bearbeiten(p)}>
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="btn btn-gefahr"
                      onClick={() => loeschenBestaetigen(p.id, p.bezeichnung)}
                    >
                      Löschen
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bearbeitbar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          <h3>{bearbeiteId ? "Position ändern" : "Position hinzufügen"}</h3>
          <label className="feld-checkbox">
            <input
              type="checkbox"
              checked={freitext}
              onChange={(e) => setFreitext(e.currentTarget.checked)}
            />
            Freitextposition
          </label>
          {freitext ? (
            <>
              <label className="feld">
                Bezeichnung
                <input value={bezeichnung} onChange={(e) => setBezeichnung(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einheit
                <input value={einheitKuerzel} onChange={(e) => setEinheitKuerzel(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einzelpreis
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="95,00" />
              </label>
            </>
          ) : (
            <>
              <ArtikelAuswahl
                artikelListe={artikelListe}
                artikelId={artikelId}
                onArtikelId={setArtikelId}
              />
              <label className="feld">
                Preis überschreiben (optional)
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="automatisch" />
              </label>
            </>
          )}
          <label className="feld">
            Menge
            <input value={menge} onChange={(e) => setMenge(e.currentTarget.value)} />
          </label>

          <p className="positions-vorschau" aria-live="polite">
            {vorschau.betrag === null ? vorschau.text : `Positionssumme: ${formatCent(vorschau.betrag)}`}
          </p>

          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">
              {bearbeiteId ? "Änderung speichern" : "Position hinzufügen"}
            </button>
            {bearbeiteId && (
              <button type="button" className="btn" onClick={formularLeeren}>
                Abbrechen
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

interface ZahlungenAbschnittProps {
  rechnungId: string;
  zahlungen: Zahlung[];
  offenerBetragCent: number;
  onGeaendert: () => void;
}

function ZahlungenAbschnitt({ rechnungId, zahlungen, offenerBetragCent, onGeaendert }: ZahlungenAbschnittProps) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [betrag, setBetrag] = useState("");
  const [erstattung, setErstattung] = useState(false);
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  // Ohne Sperre legt ein Doppelklick zwei Zahlungen an.
  const [laeuft, setLaeuft] = useState(false);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  async function zahlungLoeschen(zahlungId: string, betragCent: number) {
    const frage = `Zahlung über ${formatCent(betragCent)} löschen? Der offene Betrag der Rechnung erhöht sich entsprechend.`;
    if (!(await bestaetigen(frage, "Löschen"))) return;
    setFehler(null);
    try {
      await api.belege.zahlungDelete(zahlungId);
      onGeaendert();
      zeigen("Zahlung gelöscht");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function erfassen() {
    if (laeuft) return;
    setFehler(null);
    const betragCent = parseEuro(betrag);
    if (betragCent === null) {
      setFehler({ typ: "validation", feld: "betrag_cent", meldung: "Ungültiger Betrag" });
      return;
    }
    setLaeuft(true);
    try {
      await api.belege.zahlungErfassen({
        rechnung_id: rechnungId,
        datum,
        betrag_cent: erstattung ? -betragCent : betragCent,
        notiz,
      });
      setBetrag("");
      setNotiz("");
      onGeaendert();
      zeigen("Zahlung erfasst");
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className="karte">
      <h2>Zahlungen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <p>Offener Betrag: {formatCent(offenerBetragCent)}</p>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Notiz</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {zahlungen.map((z) => (
            <tr key={z.id}>
              <td>{z.datum}</td>
              <td>{formatCent(z.betrag_cent)}</td>
              <td>{z.notiz}</td>
              <td>
                {/* Ohne diese Möglichkeit wäre eine vertippte Zahlung nur über
                    eine gegenläufige Erstattung zu heilen — die den
                    Zahlungsverlauf dauerhaft verfälscht. */}
                <button
                  type="button"
                  className="btn btn-leise"
                  onClick={() => zahlungLoeschen(z.id, z.betrag_cent)}
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          erfassen();
        }}
      >
        <label className="feld">
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Betrag
          <input value={betrag} onChange={(e) => setBetrag(e.currentTarget.value)} placeholder="95,00" />
        </label>
        <label className="feld-checkbox">
          <input type="checkbox" checked={erstattung} onChange={(e) => setErstattung(e.currentTarget.checked)} />
          Erstattung (negativer Betrag)
        </label>
        <label className="feld">
          Notiz
          <input value={notiz} onChange={(e) => setNotiz(e.currentTarget.value)} />
        </label>
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer" disabled={laeuft}>
            Zahlung erfassen
          </button>
        </div>
      </form>
    </section>
  );
}
