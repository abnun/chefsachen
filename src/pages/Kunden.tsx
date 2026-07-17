import { useEffect, useState } from "react";
import { api, istValidierungsfehler, type AppFehler, type Kunde, type KundeNeu } from "../api";
import { Fehler } from "../components/Fehler";
import { Hinweis } from "../components/Hinweis";
import type { Reiter } from "./KundeDetail";

interface KundenProps {
  onOeffnen: (id: string, startReiter?: Reiter) => void;
  zeigeFormularBeimStart?: boolean;
  onFormularUebernommen?: () => void;
  onZuArtikelWechseln?: () => void;
}

const KUNDE_TYP_LABEL: Record<string, string> = {
  firma: "Firma",
  privat: "Privat",
};

const WARNUNG_ICON = (
  <svg className="warnung-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6.5v4.5" strokeLinecap="round" />
    <circle cx="10" cy="13.5" r="0.4" fill="currentColor" stroke="none" />
  </svg>
);

const KUNDE_NEU_LEER: KundeNeu = {
  typ: "firma",
  name: "",
  zahlungsziel_tage: 14,
  notizen: "",
  ust_idnr: "",
  email: "",
  leitweg_id: "",
  kaeuferreferenz: "",
};

/**
 * Kundenliste mit Suche und Formular zum Anlegen neuer Kunden. Klick auf
 * eine Zeile ruft `onOeffnen(id)` — die eigentliche Detail-Navigation ist
 * Aufgabe der Eltern-Komponente (App.tsx), nicht dieser Seite.
 */
export function Kunden({
  onOeffnen,
  zeigeFormularBeimStart,
  onFormularUebernommen,
  onZuArtikelWechseln,
}: KundenProps) {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [suche, setSuche] = useState("");
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const [neuerKundeId, setNeuerKundeId] = useState<string | null>(null);
  const [zeigtAdressHinweis, setZeigtAdressHinweis] = useState(false);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(zeigeFormularBeimStart ?? false);
  const [neuerKunde, setNeuerKunde] = useState<KundeNeu>(KUNDE_NEU_LEER);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);
  const [artikelLeer, setArtikelLeer] = useState(false);
  const [zeigtArtikelHinweis, setZeigtArtikelHinweis] = useState(false);

  useEffect(() => {
    if (zeigeFormularBeimStart) {
      onFormularUebernommen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.artikel.list().then((liste) => setArtikelLeer(liste.length === 0)).catch(() => {});
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      api.kunden
        .list(suche || undefined)
        .then((liste) => {
          setKunden(liste);
          setFehler(null);
        })
        .catch((e) => setFehler(e as AppFehler));
    }, 300);
    return () => clearTimeout(timeout);
  }, [suche]);

  async function anlegen() {
    setFormFehler(null);
    try {
      const erstellt = await api.kunden.create(neuerKunde);
      setZeigeFormular(false);
      setNeuerKunde(KUNDE_NEU_LEER);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
      setNeuerKundeId(erstellt.id);
      setZeigtAdressHinweis(true);
      if (artikelLeer) {
        setZeigtArtikelHinweis(true);
      }
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
      <h1 className="seiten-kopf">Kunden</h1>
      <Fehler fehler={fehler} />

      {zeigtAdressHinweis && neuerKundeId && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtAdressHinweis(false)}>
          Kunde angelegt —{" "}
          <button
            type="button"
            className="btn btn-leise"
            onClick={() => onOeffnen(neuerKundeId, "adressen")}
          >
            jetzt Adresse und Ansprechpartner ergänzen?
          </button>
        </Hinweis>
      )}

      {zeigtArtikelHinweis && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtArtikelHinweis(false)}>
          Kunde angelegt —{" "}
          <button type="button" className="btn btn-leise" onClick={() => onZuArtikelWechseln?.()}>
            jetzt auch einen Artikel anlegen?
          </button>
        </Hinweis>
      )}

      <div className="werkzeugleiste">
        <input
          type="search"
          placeholder="Suche…"
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          aria-label="Kunden suchen"
        />
        <button type="button" className="btn btn-primaer" onClick={() => setZeigeFormular((v) => !v)}>
          Neuer Kunde
        </button>
      </div>

      {zeigeFormular && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && !istValidierungsfehler(formFehler) && <Fehler fehler={formFehler} />}
          <div className="feld">
            <label>
              Typ
              <select
                value={neuerKunde.typ}
                onChange={(e) =>
                  setNeuerKunde({ ...neuerKunde, typ: e.currentTarget.value as "firma" | "privat" })
                }
              >
                <option value="firma">Firma</option>
                <option value="privat">Privat</option>
              </select>
            </label>
          </div>
          <div className="feld">
            <label>
              Name
              <input
                value={neuerKunde.name}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, name: e.currentTarget.value })}
              />
            </label>
            {feldFehler("name") && <div className="feld-fehler" role="alert">{feldFehler("name")}</div>}
          </div>
          <div className="feld">
            <label>
              Zahlungsziel (Tage)
              <input
                type="number"
                value={neuerKunde.zahlungsziel_tage}
                onChange={(e) =>
                  setNeuerKunde({ ...neuerKunde, zahlungsziel_tage: Number(e.currentTarget.value) })
                }
              />
            </label>
          </div>
          <div className="feld">
            <label>
              Notizen
              <textarea
                value={neuerKunde.notizen}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, notizen: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              USt-IdNr.
              <input
                value={neuerKunde.ust_idnr}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, ust_idnr: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              E-Mail
              <input
                value={neuerKunde.email}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, email: e.currentTarget.value })}
              />
            </label>
            {feldFehler("email") && <div className="feld-fehler" role="alert">{feldFehler("email")}</div>}
          </div>
          <div className="feld">
            <label>
              Leitweg-ID
              <input
                value={neuerKunde.leitweg_id}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, leitweg_id: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              Käuferreferenz
              <input
                value={neuerKunde.kaeuferreferenz}
                onChange={(e) =>
                  setNeuerKunde({ ...neuerKunde, kaeuferreferenz: e.currentTarget.value })
                }
              />
            </label>
          </div>
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      )}

      {kunden.length === 0 && suche === "" && !leerHinweisVersteckt && (
        <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
          Noch keine Kunden — leg direkt los.
        </Hinweis>
      )}

      {kunden.length === 0 && suche !== "" && <p>Keine Kunden gefunden für „{suche}".</p>}

      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Name</th>
            <th>Typ</th>
          </tr>
        </thead>
        <tbody>
          {kunden.map((kunde) => (
            <tr key={kunde.id} onClick={() => onOeffnen(kunde.id)}>
              <td className="tabelle-num">{kunde.kundennummer}</td>
              <td>
                {kunde.name}
                {!kunde.hat_adresse && (
                  <span title="Keine Adresse hinterlegt">{WARNUNG_ICON}</span>
                )}
              </td>
              <td>{KUNDE_TYP_LABEL[kunde.typ] ?? kunde.typ}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
