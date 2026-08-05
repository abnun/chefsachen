import { useEffect, useState } from "react";
import { api, type AppFehler, type Artikel, type BelegDetail, type Kunde } from "../api";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { StatusMarke } from "../components/StatusMarke";
import { StammdatenAbschnitt } from "../components/StammdatenAbschnitt";
import { PositionenAbschnitt } from "../components/PositionenAbschnitt";
import { ZahlungenAbschnitt } from "../components/ZahlungenAbschnitt";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useBestaetigung } from "../hooks/useBestaetigung";
import { belegExportFunktionen } from "../belegExport";
import { formatCent } from "../geld";
import { datumDeutsch, heuteIso } from "../datum";

interface BelegEditorProps {
  id: string;
  onGeaendert?: () => void;
  onRechnungErstellt?: (rechnungId: string) => void;
  /** Wird nach dem Löschen eines Entwurfs gerufen, damit die Seite zurückgeht. */
  onGeloescht?: () => void;
  /**
   * Wird nach dem Duplizieren mit der Id der Kopie gerufen — der Beleg bleibt
   * derselben Art (Angebot bleibt Angebot, Rechnung bleibt Rechnung), nur die
   * angezeigte Kennung wechselt auf den neuen Entwurf.
   */
  onDupliziert?: (kopieId: string) => void;
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
export function BelegEditor({ id, onZurueck, onGeaendert, onRechnungErstellt, onGeloescht, onDupliziert }: BelegEditorProps) {
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

  const { beleg, positionen, zahlungen, offener_betrag_cent, steuerzeilen } = detail;
  const istEntwurf = beleg.status === "entwurf";

  async function stammdatenSpeichern(felder: {
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
        {steuerzeilen.length > 0 && (
          <>
            <dt>Enthaltene USt</dt>
            <dd>
              {steuerzeilen
                .map((z) => `${z.satz_prozent} %: ${formatCent(z.ust_cent)}`)
                .join(", ")}
            </dd>
          </>
        )}
        {istAngebot && (
          <>
            <dt>Gültig bis</dt>
            <dd>{beleg.gueltig_bis ? datumDeutsch(beleg.gueltig_bis) : "unbefristet"}</dd>
          </>
        )}
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

  /**
   * Legt eine Kopie als neuen Entwurf an — Kunde, Texte und Positionen
   * übernommen, Datum auf heute.
   *
   * Funktioniert bei jedem Status, gerade auch bei einem festgeschriebenen
   * Beleg: Wer jeden Monat eine fast gleiche Rechnung stellt, tippte sie
   * bisher jedes Mal neu, und genau der fertige Beleg eignet sich als
   * Vorlage — er selbst lässt sich aber nicht mehr ändern.
   */
  async function duplizieren() {
    setFehler(null);
    setLaeuft(true);
    try {
      const kopie = await api.belege.duplizieren(beleg.id);
      onGeaendert?.();
      onDupliziert?.(kopie.id);
      zeigen(beleg.typ === "angebot" ? "Angebot dupliziert" : "Rechnung dupliziert");
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

  const { pdfExportieren, xrechnungExportieren, zugferdExportieren, zahlungserinnerungExportieren } =
    belegExportFunktionen(beleg, setFehler, zeigen);

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

          {/* Verfügbar bei jedem Status: Gerade ein festgeschriebener Beleg
              eignet sich als Vorlage — er selbst lässt sich nur nicht mehr
              ändern. */}
          <button type="button" className="btn" disabled={laeuft} onClick={duplizieren}>
            Als Kopie anlegen
          </button>

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

          {/* Nur solange noch etwas offen ist — für eine vollständig bezahlte
              Rechnung gibt es nichts zu erinnern. Und erst ab dem Tag nach der
              Fälligkeit: Vorher ist der Kunde nicht im Verzug, und der Brief
              wiese eine negative Überfälligkeit aus. */}
          {beleg.typ === "rechnung" && beleg.status === "gestellt" && offener_betrag_cent > 0 &&
            beleg.faellig_am != null && beleg.faellig_am < heuteIso() && (
            <button type="button" className="btn" onClick={zahlungserinnerungExportieren}>
              Zahlungserinnerung
            </button>
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

      {/* key={beleg.id}: Beim Wechsel auf einen anderen Beleg (etwa nach „Als
          Kopie anlegen") bleibt der Editor gemountet, nur die Id wechselt.
          Ohne Remount behielten die Abschnitte ihren Formularzustand — im
          schlimmsten Fall stand noch eine Position des *vorherigen* Belegs im
          Bearbeiten-Modus, und „Speichern" hätte sie über die Beleggrenze
          hinweg geändert. */}
      <StammdatenAbschnitt
        key={beleg.id}
        beleg={beleg}
        kunden={kunden}
        bearbeitbar={istEntwurf}
        onSpeichern={stammdatenSpeichern}
      />

      <PositionenAbschnitt
        key={`${beleg.id}-positionen`}
        belegId={beleg.id}
        kundeId={beleg.kunde_id}
        belegdatum={beleg.datum}
        positionen={positionen}
        artikelListe={artikelListe}
        bearbeitbar={istEntwurf}
        onGeaendert={laden}
        onLoeschen={positionLoeschen}
      />

      <p className="beleg-summe">Summe: {formatCent(beleg.summe_cent)}</p>
      {/* Aufschlüsselung nur bei Regelbesteuerung — bei Kleinunternehmer-Belegen
          liefert das Backend keine Steuerzeilen. Die Beträge stehen so schon im
          Editor, nicht erst auf dem exportierten PDF. */}
      {steuerzeilen.map((z) => (
        <p key={z.satz_prozent} className="beleg-steuerzeile">
          Enthaltene USt {z.satz_prozent} % (aus Nettobetrag {formatCent(z.netto_cent)}):{" "}
          {formatCent(z.ust_cent)}
        </p>
      ))}

      {beleg.typ === "rechnung" && beleg.storno_von_id !== null && (
        <p>Dies ist ein Stornobeleg.</p>
      )}
      {beleg.typ === "rechnung" && beleg.status === "storniert" && (
        <p>Diese Rechnung wurde storniert.</p>
      )}

      {beleg.typ === "rechnung" && ["gestellt", "storniert"].includes(beleg.status) && (
        <ZahlungenAbschnitt
          key={`${beleg.id}-zahlungen`}
          rechnungId={beleg.id}
          zahlungen={zahlungen}
          offenerBetragCent={offener_betrag_cent}
          onGeaendert={laden}
        />
      )}
    </main>
  );
}
