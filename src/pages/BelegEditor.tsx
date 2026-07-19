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
  type Zahlung,
} from "../api";
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useLoeschBestaetigung } from "../hooks/useLoeschBestaetigung";
import { formatCent, formatMenge, parseEuro, parseMenge } from "../geld";

interface BelegEditorProps {
  id: string;
  onGeaendert?: () => void;
  onRechnungErstellt?: (rechnungId: string) => void;
}

const ANGEBOT_ABSCHLUSS_STATUS = [
  { wert: "angenommen", label: "Angenommen" },
  { wert: "abgelehnt", label: "Abgelehnt" },
  { wert: "abgelaufen", label: "Abgelaufen" },
];

const BELEGEDITOR_STATUS_KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  abgelaufen: "status-entwurf",
  versendet: "status-gestellt",
  gestellt: "status-gestellt",
  angenommen: "status-bezahlt",
  abgelehnt: "status-storniert",
  storniert: "status-storniert",
};

/**
 * Editor für Angebote und Rechnungen — beide teilen sich Datenmodell,
 * Status-Workflow (Entwurf → gestellt) und Positions-Verwaltung, daher eine
 * gemeinsame Komponente statt zweier Kopien.
 */
export function BelegEditor({ id, onGeaendert, onRechnungErstellt }: BelegEditorProps) {
  const [detail, setDetail] = useState<BelegDetail | null>(null);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [artikelListe, setArtikelListe] = useState<Artikel[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

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
    return <main>{fehler && <Fehler fehler={fehler} />}</main>;
  }

  const { beleg, positionen, zahlungen, offener_betrag_cent } = detail;
  const istEntwurf = beleg.status === "entwurf";

  async function stammdatenSpeichern(felder: {
    datum: string;
    leistungsdatum: string;
    zahlungsziel_tage: number;
    kopftext: string;
    fusstext: string;
  }) {
    setFehler(null);
    try {
      await api.belege.update({ id: beleg.id, kunde_id: beleg.kunde_id, ...felder });
      laden();
      zeigen(beleg.typ === "angebot" ? "Angebot gespeichert" : "Rechnung gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function stellen() {
    setFehler(null);
    try {
      await api.belege.stellen(beleg.id);
      laden();
      onGeaendert?.();
      zeigen(beleg.typ === "angebot" ? "Angebot versendet" : "Rechnung gestellt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function angebotStatus(status: string) {
    setFehler(null);
    try {
      await api.belege.angebotStatusSetzen(beleg.id, status);
      laden();
      zeigen("Status aktualisiert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function inRechnungUeberfuehren() {
    setFehler(null);
    try {
      const rechnung = await api.belege.angebotInRechnungUeberfuehren(beleg.id);
      laden();
      onGeaendert?.();
      onRechnungErstellt?.(rechnung.id);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function stornieren() {
    setFehler(null);
    try {
      await api.belege.rechnungStornieren(beleg.id);
      laden();
      onGeaendert?.();
      zeigen("Rechnung storniert");
    } catch (e) {
      setFehler(e as AppFehler);
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
      <h1 className="seiten-kopf">
        {beleg.typ === "angebot" ? "Angebot" : "Rechnung"} {beleg.nummer ?? "(Entwurf)"}
      </h1>
      <p>
        Status:{" "}
        <span className={`status ${BELEGEDITOR_STATUS_KLASSE[beleg.status] ?? "status-entwurf"}`}>
          {beleg.status}
        </span>
      </p>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}

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

      <p>Summe: {formatCent(beleg.summe_cent)}</p>

      {beleg.status !== "entwurf" && (
        <button type="button" className="btn btn-leise" onClick={pdfExportieren}>
          Als PDF exportieren
        </button>
      )}
      {beleg.typ === "rechnung" && beleg.status !== "entwurf" && (
        <>
          <button type="button" className="btn btn-leise" onClick={xrechnungExportieren}>
            Als XRechnung (XML) exportieren
          </button>
          <button type="button" className="btn btn-leise" onClick={zugferdExportieren}>
            Als ZUGFeRD-Rechnung exportieren
          </button>
        </>
      )}

      {istEntwurf && (
        <button type="button" className="btn btn-primaer" disabled={positionen.length === 0} onClick={stellen}>
          Stellen
        </button>
      )}

      {beleg.typ === "angebot" && beleg.status === "versendet" && (
        <section>
          <h2>Abschluss</h2>
          {ANGEBOT_ABSCHLUSS_STATUS.map((s) => (
            <button key={s.wert} type="button" className="btn" onClick={() => angebotStatus(s.wert)}>
              {s.label}
            </button>
          ))}
        </section>
      )}

      {beleg.typ === "angebot" && ["versendet", "angenommen"].includes(beleg.status) && (
        <button type="button" className="btn btn-primaer" onClick={inRechnungUeberfuehren}>
          In Rechnung überführen
        </button>
      )}

      {beleg.typ === "rechnung" && beleg.status === "gestellt" && (
        <button type="button" className="btn btn-gefahr" onClick={stornieren}>
          Stornieren
        </button>
      )}
      {beleg.typ === "rechnung" && beleg.status === "storniert" && <p>Diese Rechnung wurde storniert.</p>}

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
    datum: string;
    leistungsdatum: string;
    zahlungsziel_tage: number;
    kopftext: string;
    fusstext: string;
  }) => void;
}

function StammdatenAbschnitt({ beleg, kunden, bearbeitbar, onSpeichern }: StammdatenAbschnittProps) {
  const [datum, setDatum] = useState(beleg.datum);
  const [leistungsdatum, setLeistungsdatum] = useState(beleg.leistungsdatum);
  const [zahlungszielTage, setZahlungszielTage] = useState(beleg.zahlungsziel_tage);
  const [kopftext, setKopftext] = useState(beleg.kopftext);
  const [fusstext, setFusstext] = useState(beleg.fusstext);

  useEffect(() => {
    setDatum(beleg.datum);
    setLeistungsdatum(beleg.leistungsdatum);
    setZahlungszielTage(beleg.zahlungsziel_tage);
    setKopftext(beleg.kopftext);
    setFusstext(beleg.fusstext);
  }, [beleg]);

  const kunde = kunden.find((k) => k.id === beleg.kunde_id);

  if (!bearbeitbar) {
    return (
      <section className="karte">
        <h2>Stammdaten</h2>
        <p>Kunde: {beleg.kunde_snapshot_name ?? kunde?.name ?? beleg.kunde_id}</p>
        <p>Datum: {beleg.datum}</p>
        <p>Leistungsdatum: {beleg.leistungsdatum}</p>
        <p>Zahlungsziel: {beleg.zahlungsziel_tage} Tage</p>
      </section>
    );
  }

  return (
    <section className="karte">
      <h2>Stammdaten</h2>
      <p>Kunde: {beleg.kunde_snapshot_name ?? kunde?.name ?? beleg.kunde_id}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSpeichern({ datum, leistungsdatum, zahlungsziel_tage: zahlungszielTage, kopftext, fusstext });
        }}
      >
        <label className="feld">
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Leistungsdatum
          <input type="date" value={leistungsdatum} onChange={(e) => setLeistungsdatum(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Zahlungsziel (Tage)
          <input
            type="number"
            value={zahlungszielTage}
            onChange={(e) => setZahlungszielTage(Number(e.currentTarget.value))}
          />
        </label>
        <label className="feld">
          Kopftext
          <textarea value={kopftext} onChange={(e) => setKopftext(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Fußtext
          <textarea value={fusstext} onChange={(e) => setFusstext(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">Speichern</button>
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
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useLoeschBestaetigung();

  async function hinzufuegen() {
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
        id: "",
        beleg_id: belegId,
        artikel_id: freitext ? null : artikelId || null,
        bezeichnung: freitext ? bezeichnung : "",
        einheit_kuerzel: freitext ? einheitKuerzel : "",
        einzelpreis_cent: einzelpreisCent,
        menge: mengeX1000,
      });
      setBezeichnung("");
      setEinheitKuerzel("");
      setEinzelpreis("");
      setMenge("1");
      setArtikelId("");
      onGeaendert();
      zeigen("Position hinzugefügt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschenBestaetigen(id: string, bezeichnung: string) {
    if (!(await bestaetigen(`Position „${bezeichnung}" löschen?`))) return;
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
          {positionen.map((p) => (
            <tr key={p.id}>
              <td>{p.bezeichnung}</td>
              <td>{formatMenge(p.menge)}</td>
              <td>{p.einheit_kuerzel}</td>
              <td>{formatCent(p.einzelpreis_cent)}</td>
              <td>{formatCent(p.positionssumme_cent)}</td>
              <td>
                {bearbeitbar && (
                  <button
                    type="button"
                    className="btn btn-gefahr"
                    onClick={() => loeschenBestaetigen(p.id, p.bezeichnung)}
                  >
                    Löschen
                  </button>
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
            hinzufuegen();
          }}
        >
          <label className="feld-checkbox">
            <input type="checkbox" checked={freitext} onChange={(e) => setFreitext(e.currentTarget.checked)} />
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
              <label className="feld">
                Artikel
                <select value={artikelId} onChange={(e) => setArtikelId(e.currentTarget.value)}>
                  <option value="">– wählen –</option>
                  {artikelListe.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bezeichnung}
                    </option>
                  ))}
                </select>
              </label>
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
          <button type="submit" className="btn btn-primaer">Position hinzufügen</button>
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
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function erfassen() {
    setFehler(null);
    const betragCent = parseEuro(betrag);
    if (betragCent === null) {
      setFehler({ typ: "validation", feld: "betrag_cent", meldung: "Ungültiger Betrag" });
      return;
    }
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
    }
  }

  return (
    <section className="karte">
      <h2>Zahlungen</h2>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      <p>Offener Betrag: {formatCent(offenerBetragCent)}</p>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Notiz</th>
          </tr>
        </thead>
        <tbody>
          {zahlungen.map((z) => (
            <tr key={z.id}>
              <td>{z.datum}</td>
              <td>{formatCent(z.betrag_cent)}</td>
              <td>{z.notiz}</td>
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
        <button type="submit" className="btn btn-primaer">Zahlung erfassen</button>
      </form>
    </section>
  );
}
