import { useEffect, useState } from "react";
import {
  api,
  istValidierungsfehler,
  type AppFehler,
  type Einheit,
  type Firma,
  type Nummernkreis,
} from "../api";
import { Fehler } from "../components/Fehler";

/**
 * Einstellungsseite mit drei unabhängigen Abschnitten: Firmendaten,
 * Einheiten-Verwaltung und Nummernkreise. Jeder Abschnitt lädt und speichert
 * unabhängig von den anderen — ein Fehler in einem Abschnitt blockiert die
 * anderen nicht.
 */
export function Einstellungen() {
  return (
    <div>
      <h1>Einstellungen</h1>
      <FirmendatenAbschnitt />
      <EinheitenAbschnitt />
      <NummernkreiseAbschnitt />
    </div>
  );
}

function FirmendatenAbschnitt() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    api.firma.get().then(setFirma).catch((e) => setFehler(e as AppFehler));
  }, []);

  async function speichern() {
    if (!firma) return;
    setFehler(null);
    setGespeichert(false);
    try {
      const gespeicherteFirma = await api.firma.save(firma);
      setFirma(gespeicherteFirma);
      setGespeichert(true);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  const feldFehler = (feld: string) =>
    fehler && istValidierungsfehler(fehler) && fehler.feld === feld ? fehler.meldung : null;

  if (!firma) {
    return (
      <section>
        <h2>Firmendaten</h2>
        {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      </section>
    );
  }

  return (
    <section>
      <h2>Firmendaten</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {gespeichert && <p>Gespeichert.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div>
          <label>
            Name
            <input value={firma.name} onChange={(e) => setFirma({ ...firma, name: e.currentTarget.value })} />
          </label>
          {feldFehler("name") && <div role="alert">{feldFehler("name")}</div>}
        </div>
        <div>
          <label>
            Straße
            <input
              value={firma.strasse}
              onChange={(e) => setFirma({ ...firma, strasse: e.currentTarget.value })}
            />
          </label>
          {feldFehler("strasse") && <div role="alert">{feldFehler("strasse")}</div>}
        </div>
        <div>
          <label>
            PLZ
            <input value={firma.plz} onChange={(e) => setFirma({ ...firma, plz: e.currentTarget.value })} />
          </label>
          {feldFehler("plz") && <div role="alert">{feldFehler("plz")}</div>}
        </div>
        <div>
          <label>
            Ort
            <input value={firma.ort} onChange={(e) => setFirma({ ...firma, ort: e.currentTarget.value })} />
          </label>
          {feldFehler("ort") && <div role="alert">{feldFehler("ort")}</div>}
        </div>
        <div>
          <label>
            Land
            <input value={firma.land} onChange={(e) => setFirma({ ...firma, land: e.currentTarget.value })} />
          </label>
          {feldFehler("land") && <div role="alert">{feldFehler("land")}</div>}
        </div>
        <div>
          <label>
            Steuernummer
            <input
              value={firma.steuernummer}
              onChange={(e) => setFirma({ ...firma, steuernummer: e.currentTarget.value })}
            />
          </label>
          {feldFehler("steuernummer") && <div role="alert">{feldFehler("steuernummer")}</div>}
        </div>
        <div>
          <label>
            USt-IdNr.
            <input
              value={firma.ust_idnr}
              onChange={(e) => setFirma({ ...firma, ust_idnr: e.currentTarget.value })}
            />
          </label>
          {feldFehler("ust_idnr") && <div role="alert">{feldFehler("ust_idnr")}</div>}
        </div>
        <div>
          <label>
            IBAN
            <input value={firma.iban} onChange={(e) => setFirma({ ...firma, iban: e.currentTarget.value })} />
          </label>
          {feldFehler("iban") && <div role="alert">{feldFehler("iban")}</div>}
        </div>
        <div>
          <label>
            BIC
            <input value={firma.bic} onChange={(e) => setFirma({ ...firma, bic: e.currentTarget.value })} />
          </label>
          {feldFehler("bic") && <div role="alert">{feldFehler("bic")}</div>}
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={firma.kleinunternehmer}
              onChange={(e) => setFirma({ ...firma, kleinunternehmer: e.currentTarget.checked })}
            />
            Kleinunternehmer (§19 UStG)
          </label>
        </div>
        <button type="submit">Speichern</button>
      </form>
    </section>
  );
}

function EinheitenAbschnitt() {
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [name, setName] = useState("");
  const [kuerzel, setKuerzel] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);

  function laden() {
    api.einheiten
      .list()
      .then((liste) => {
        setEinheiten(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  async function speichern() {
    setFehler(null);
    try {
      if (bearbeiteId) {
        await api.einheiten.update({ id: bearbeiteId, name, kuerzel });
      } else {
        await api.einheiten.create(name, kuerzel);
      }
      setName("");
      setKuerzel("");
      setBearbeiteId(null);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.einheiten.delete(id);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function bearbeiten(e: Einheit) {
    setBearbeiteId(e.id);
    setName(e.name);
    setKuerzel(e.kuerzel);
  }

  return (
    <section>
      <h2>Einheiten</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Kürzel</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {einheiten.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>{e.kuerzel}</td>
              <td>
                <button type="button" onClick={() => bearbeiten(e)}>
                  Bearbeiten
                </button>
                <button type="button" onClick={() => loeschen(e.id)}>
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
          speichern();
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label>
          Kürzel
          <input value={kuerzel} onChange={(e) => setKuerzel(e.currentTarget.value)} />
        </label>
        <button type="submit">{bearbeiteId ? "Aktualisieren" : "Hinzufügen"}</button>
      </form>
    </section>
  );
}

const NUMMERNKREIS_LABEL: Record<string, string> = {
  rechnung: "Rechnung",
  angebot: "Angebot",
  gutschrift: "Gutschrift",
  mahnung: "Mahnung",
};

function NummernkreiseAbschnitt() {
  const [nummernkreise, setNummernkreise] = useState<Nummernkreis[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  function laden() {
    api.einstellungen
      .nummernkreise()
      .then((liste) => {
        setNummernkreise(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  async function speichern(nk: Nummernkreis) {
    setFehler(null);
    try {
      await api.einstellungen.nummernkreisUpdate(nk.art, nk.format, nk.jahres_reset);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function aendere(art: string, teil: Partial<Nummernkreis>) {
    setNummernkreise((liste) => liste.map((nk) => (nk.art === art ? { ...nk, ...teil } : nk)));
  }

  return (
    <section>
      <h2>Nummernkreise</h2>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {nummernkreise.map((nk) => (
        <form
          key={nk.art}
          onSubmit={(e) => {
            e.preventDefault();
            speichern(nk);
          }}
        >
          <label>
            {NUMMERNKREIS_LABEL[nk.art] ?? nk.art}
            <input value={nk.format} onChange={(e) => aendere(nk.art, { format: e.currentTarget.value })} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={nk.jahres_reset}
              onChange={(e) => aendere(nk.art, { jahres_reset: e.currentTarget.checked })}
            />
            Jährlicher Reset
          </label>
          <span>Aktueller Zähler: {nk.zaehler}</span>
          <button type="submit">Speichern</button>
        </form>
      ))}
    </section>
  );
}
