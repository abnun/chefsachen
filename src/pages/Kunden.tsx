import { useEffect, useState } from "react";
import { api, istValidierungsfehler, type AppFehler, type Kunde, type KundeNeu } from "../api";
import { Fehler } from "../components/Fehler";

interface KundenProps {
  onOeffnen: (id: string) => void;
}

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
export function Kunden({ onOeffnen }: KundenProps) {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [suche, setSuche] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [neuerKunde, setNeuerKunde] = useState<KundeNeu>(KUNDE_NEU_LEER);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);

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
      await api.kunden.create(neuerKunde);
      setZeigeFormular(false);
      setNeuerKunde(KUNDE_NEU_LEER);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
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
      <h1>Kunden</h1>
      <Fehler fehler={fehler} />

      <input
        type="search"
        placeholder="Suche…"
        value={suche}
        onChange={(e) => setSuche(e.currentTarget.value)}
        aria-label="Kunden suchen"
      />
      <button type="button" onClick={() => setZeigeFormular((v) => !v)}>
        Neuer Kunde
      </button>

      {zeigeFormular && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          {formFehler && !istValidierungsfehler(formFehler) && <Fehler fehler={formFehler} />}
          <div>
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
          <div>
            <label>
              Name
              <input
                value={neuerKunde.name}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, name: e.currentTarget.value })}
              />
            </label>
            {feldFehler("name") && <div role="alert">{feldFehler("name")}</div>}
          </div>
          <div>
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
          <div>
            <label>
              Notizen
              <textarea
                value={neuerKunde.notizen}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, notizen: e.currentTarget.value })}
              />
            </label>
          </div>
          <div>
            <label>
              USt-IdNr.
              <input
                value={neuerKunde.ust_idnr}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, ust_idnr: e.currentTarget.value })}
              />
            </label>
          </div>
          <div>
            <label>
              E-Mail
              <input
                value={neuerKunde.email}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, email: e.currentTarget.value })}
              />
            </label>
            {feldFehler("email") && <div role="alert">{feldFehler("email")}</div>}
          </div>
          <div>
            <label>
              Leitweg-ID
              <input
                value={neuerKunde.leitweg_id}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, leitweg_id: e.currentTarget.value })}
              />
            </label>
          </div>
          <div>
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
          <button type="submit">Speichern</button>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Nummer</th>
            <th>Name</th>
            <th>Typ</th>
          </tr>
        </thead>
        <tbody>
          {kunden.map((kunde) => (
            <tr key={kunde.id} onClick={() => onOeffnen(kunde.id)} style={{ cursor: "pointer" }}>
              <td>{kunde.kundennummer}</td>
              <td>{kunde.name}</td>
              <td>{kunde.typ}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
