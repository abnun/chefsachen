import { Fragment, useEffect, useState } from "react";
import {
  api,
  istValidierungsfehler,
  type AppFehler,
  type Artikel as ArtikelTyp,
  type Einheit,
  type Kunde,
  type Kundenpreis,
} from "../api";
import { Fehler } from "../components/Fehler";
import { Hinweis } from "../components/Hinweis";
import { formatCent, parseEuro } from "../geld";

const ARTIKEL_NEU_LEER = {
  bezeichnung: "",
  beschreibung: "",
  einheit_id: "",
  standardpreis_cent: 0,
};

/**
 * Artikelliste mit Formular zum Anlegen/Bearbeiten sowie einem aufklappbaren
 * Kundenpreise-Bereich je Artikel. Preise werden im Formular als deutsch
 * formatierter Text erfasst (Komma statt Punkt) und über geld.ts in Cent
 * konvertiert.
 */
interface ArtikelProps {
  zeigeFormularBeimStart?: boolean;
  onFormularUebernommen?: () => void;
  onZuKundenWechseln?: () => void;
}

export function Artikel({ zeigeFormularBeimStart, onFormularUebernommen, onZuKundenWechseln }: ArtikelProps) {
  const [artikel, setArtikel] = useState<ArtikelTyp[]>([]);
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(zeigeFormularBeimStart ?? false);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [form, setForm] = useState(ARTIKEL_NEU_LEER);
  const [preisText, setPreisText] = useState("");
  const [preisFehlerText, setPreisFehlerText] = useState<string | null>(null);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);
  const [aufgeklappt, setAufgeklappt] = useState<string | null>(null);
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const [zeigtKundenHinweis, setZeigtKundenHinweis] = useState(false);

  useEffect(() => {
    if (zeigeFormularBeimStart) {
      onFormularUebernommen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ladeArtikel() {
    api.artikel
      .list()
      .then((liste) => {
        setArtikel(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(() => {
    ladeArtikel();
    api.einheiten.list().then(setEinheiten).catch((e) => setFehler(e as AppFehler));
    api.kunden.list().then(setKunden).catch((e) => setFehler(e as AppFehler));
  }, []);

  function einheitKuerzel(einheitId: string): string {
    return einheiten.find((e) => e.id === einheitId)?.kuerzel ?? "";
  }

  function neuFormular() {
    setBearbeiteId(null);
    setForm(ARTIKEL_NEU_LEER);
    setPreisText("");
    setPreisFehlerText(null);
    setFormFehler(null);
    setZeigeFormular(true);
  }

  function bearbeiten(a: ArtikelTyp) {
    setBearbeiteId(a.id);
    setForm({
      bezeichnung: a.bezeichnung,
      beschreibung: a.beschreibung,
      einheit_id: a.einheit_id,
      standardpreis_cent: a.standardpreis_cent,
    });
    setPreisText(formatCent(a.standardpreis_cent).replace(" €", ""));
    setPreisFehlerText(null);
    setFormFehler(null);
    setZeigeFormular(true);
  }

  async function speichern() {
    const cent = parseEuro(preisText);
    if (cent === null) {
      setPreisFehlerText("Bitte einen gültigen Preis eingeben, z. B. 95,50");
      return;
    }
    setPreisFehlerText(null);
    setFormFehler(null);
    try {
      if (bearbeiteId) {
        await api.artikel.update({
          id: bearbeiteId,
          artikelnummer: artikel.find((a) => a.id === bearbeiteId)?.artikelnummer ?? "",
          kundenpreise_anzahl: artikel.find((a) => a.id === bearbeiteId)?.kundenpreise_anzahl ?? 0,
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
      } else {
        await api.artikel.create({
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
        if (kunden.length === 0) {
          setZeigtKundenHinweis(true);
        }
      }
      setZeigeFormular(false);
      ladeArtikel();
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  const feldFehler = (feld: string) =>
    formFehler && istValidierungsfehler(formFehler) && formFehler.feld === feld
      ? formFehler.meldung
      : null;

  return (
    <div>
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />

      {zeigtKundenHinweis && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtKundenHinweis(false)}>
          Artikel angelegt —{" "}
          <button type="button" className="btn btn-leise" onClick={() => onZuKundenWechseln?.()}>
            jetzt auch einen Kunden anlegen?
          </button>
        </Hinweis>
      )}

      <button type="button" className="btn btn-primaer" onClick={neuFormular}>
        Neuer Artikel
      </button>

      {zeigeFormular && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          {formFehler && !istValidierungsfehler(formFehler) && <Fehler fehler={formFehler} />}
          <div className="feld">
            <label>
              Bezeichnung
              <input
                value={form.bezeichnung}
                onChange={(e) => setForm({ ...form, bezeichnung: e.currentTarget.value })}
              />
            </label>
            {feldFehler("bezeichnung") && <div className="feld-fehler" role="alert">{feldFehler("bezeichnung")}</div>}
          </div>
          <div className="feld">
            <label>
              Beschreibung
              <textarea
                value={form.beschreibung}
                onChange={(e) => setForm({ ...form, beschreibung: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              Einheit
              <select
                value={form.einheit_id}
                onChange={(e) => setForm({ ...form, einheit_id: e.currentTarget.value })}
              >
                <option value="">–</option>
                {einheiten.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.kuerzel})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="feld">
            <label>
              Standardpreis (€)
              <input value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
            </label>
            {preisFehlerText && <div className="feld-fehler" role="alert">{preisFehlerText}</div>}
          </div>
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      )}

      {artikel.length === 0 && !leerHinweisVersteckt && (
        <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
          Noch keine Artikel oder Leistungen — leg direkt los.
        </Hinweis>
      )}

      <table className="tabelle">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Bezeichnung</th>
            <th>Einheit</th>
            <th>Preis</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {artikel.map((a) => (
            <Fragment key={a.id}>
              <tr>
                <td className="tabelle-num">{a.artikelnummer}</td>
                <td>{a.bezeichnung}</td>
                <td>{einheitKuerzel(a.einheit_id)}</td>
                <td>{formatCent(a.standardpreis_cent)}</td>
                <td>
                  <button type="button" className="btn" onClick={() => bearbeiten(a)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn btn-leise"
                    onClick={() => setAufgeklappt(aufgeklappt === a.id ? null : a.id)}
                  >
                    {a.kundenpreise_anzahl === 0 ? "Kundenpreise" : `Kundenpreise (${a.kundenpreise_anzahl})`}
                  </button>
                </td>
              </tr>
              {aufgeklappt === a.id && (
                <tr>
                  <td colSpan={5}>
                    <KundenpreiseBereich artikelId={a.id} kunden={kunden} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface KundenpreiseBereichProps {
  artikelId: string;
  kunden: Kunde[];
}

function KundenpreiseBereich({ artikelId, kunden }: KundenpreiseBereichProps) {
  const [kundenpreise, setKundenpreise] = useState<Kundenpreis[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [kundeId, setKundeId] = useState("");
  const [preisText, setPreisText] = useState("");
  const [preisFehlerText, setPreisFehlerText] = useState<string | null>(null);
  const [gueltigAb, setGueltigAb] = useState("");

  function laden() {
    api.artikel
      .kundenpreise(artikelId)
      .then((liste) => {
        setKundenpreise(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [artikelId]);

  async function speichern() {
    const cent = parseEuro(preisText);
    if (cent === null) {
      setPreisFehlerText("Bitte einen gültigen Preis eingeben, z. B. 95,50");
      return;
    }
    setPreisFehlerText(null);
    setFehler(null);
    try {
      await api.artikel.kundenpreisSave({
        id: "",
        artikel_id: artikelId,
        kunde_id: kundeId,
        preis_cent: cent,
        gueltig_ab: gueltigAb || null,
      });
      setKundeId("");
      setPreisText("");
      setGueltigAb("");
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function kundeName(id: string): string {
    return kunden.find((k) => k.id === id)?.name ?? id;
  }

  return (
    <div className="karte">
      <h3>Kundenpreise</h3>
      <Fehler fehler={fehler} />
      <table className="tabelle">
        <thead>
          <tr>
            <th>Kunde</th>
            <th>Preis</th>
            <th>Gültig ab</th>
          </tr>
        </thead>
        <tbody>
          {kundenpreise.map((kp) => (
            <tr key={kp.id}>
              <td>{kundeName(kp.kunde_id)}</td>
              <td>{formatCent(kp.preis_cent)}</td>
              <td>{kp.gueltig_ab ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label className="feld">
          Kunde
          <select value={kundeId} onChange={(e) => setKundeId(e.currentTarget.value)}>
            <option value="">–</option>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <label className="feld">
          Preis (€)
          <input value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
        </label>
        {preisFehlerText && <div className="feld-fehler" role="alert">{preisFehlerText}</div>}
        <label className="feld">
          Gültig ab
          <input type="date" value={gueltigAb} onChange={(e) => setGueltigAb(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">Speichern</button>
      </form>
    </div>
  );
}
