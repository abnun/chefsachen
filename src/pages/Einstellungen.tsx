import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  api,
  type AppFehler,
  type Einheit,
  type Firma,
  type Nummernkreis,
  type Sicherung,
} from "../api";
import { formularFehler } from "../formularFehler";
import { Fehler } from "../components/Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useBestaetigung } from "../hooks/useBestaetigung";

/**
 * Einstellungsseite mit vier unabhängigen Abschnitten: Firmendaten,
 * Einheiten-Verwaltung, Nummernkreise und Textbausteine. Jeder Abschnitt lädt
 * und speichert unabhängig von den anderen — ein Fehler in einem Abschnitt
 * blockiert die anderen nicht.
 */
export function Einstellungen() {
  return (
    <div>
      <h1 className="seiten-kopf">Einstellungen</h1>
      <FirmendatenAbschnitt />
      <SicherungenAbschnitt />
      <EinheitenAbschnitt />
      <NummernkreiseAbschnitt />
      <TextbausteineAbschnitt />
    </div>
  );
}

function FirmendatenAbschnitt() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [logoGroesse, setLogoGroesse] = useState<number | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  useEffect(() => {
    api.firma.get().then(setFirma).catch((e) => setFehler(e as AppFehler));
    api.firma.logoGet().then((b) => setLogoGroesse(b ? b.length : null)).catch(() => {});
  }, []);

  /**
   * Der Einrichtungsassistent sagt zu, das Logo lasse sich später hier ändern —
   * bislang gab es dafür keine Möglichkeit.
   */
  async function logoWaehlen() {
    setFehler(null);
    try {
      const pfad = await open({
        multiple: false,
        filters: [{ name: "Bild", extensions: ["png", "jpg", "jpeg"] }],
      });
      if (!pfad || typeof pfad !== "string") return;
      const bytes = Array.from(await readFile(pfad));
      await api.firma.logoSet(bytes);
      setLogoGroesse(bytes.length);
      zeigen("Logo gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function logoEntfernen() {
    setFehler(null);
    try {
      // Ein leeres Feld entfernt das Logo — das Backend kennt keinen eigenen Befehl dafür.
      await api.firma.logoSet([]);
      setLogoGroesse(null);
      zeigen("Logo entfernt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function speichern() {
    if (!firma) return;
    setFehler(null);
    try {
      const gespeicherteFirma = await api.firma.save(firma);
      setFirma(gespeicherteFirma);
      zeigen("Firmendaten gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  const { feldFehler, bannerFehler } = formularFehler(fehler, [
    "name",
    "strasse",
    "plz",
    "ort",
    "land",
    "steuernummer",
    "ust_idnr",
    "iban",
    "bic",
    "email",
    "telefon",
    "kontakt_name",
    "gruendungsjahr",
  ]);

  if (!firma) {
    return (
      <section>
        <h2>Firmendaten</h2>
        <Fehler fehler={bannerFehler} />
      </section>
    );
  }

  return (
    <section>
      <h2>Firmendaten</h2>
      <Fehler fehler={bannerFehler} />
      {hinweis}
      <form
        className="karte"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="feld">
          <label>
            Name
            <input value={firma.name} onChange={(e) => setFirma({ ...firma, name: e.currentTarget.value })} />
          </label>
          {feldFehler("name") && <div role="alert" className="feld-fehler">{feldFehler("name")}</div>}
        </div>
        <div className="feld">
          <label>
            Straße
            <input
              value={firma.strasse}
              onChange={(e) => setFirma({ ...firma, strasse: e.currentTarget.value })}
            />
          </label>
          {feldFehler("strasse") && <div role="alert" className="feld-fehler">{feldFehler("strasse")}</div>}
        </div>
        <div className="feld">
          <label>
            PLZ
            <input value={firma.plz} onChange={(e) => setFirma({ ...firma, plz: e.currentTarget.value })} />
          </label>
          {feldFehler("plz") && <div role="alert" className="feld-fehler">{feldFehler("plz")}</div>}
        </div>
        <div className="feld">
          <label>
            Ort
            <input value={firma.ort} onChange={(e) => setFirma({ ...firma, ort: e.currentTarget.value })} />
          </label>
          {feldFehler("ort") && <div role="alert" className="feld-fehler">{feldFehler("ort")}</div>}
        </div>
        <div className="feld">
          <label>
            Land
            <input value={firma.land} onChange={(e) => setFirma({ ...firma, land: e.currentTarget.value })} />
          </label>
          {feldFehler("land") && <div role="alert" className="feld-fehler">{feldFehler("land")}</div>}
        </div>
        <div className="feld">
          <label>
            Steuernummer
            <input
              value={firma.steuernummer}
              onChange={(e) => setFirma({ ...firma, steuernummer: e.currentTarget.value })}
            />
          </label>
          {feldFehler("steuernummer") && <div role="alert" className="feld-fehler">{feldFehler("steuernummer")}</div>}
        </div>
        <div className="feld">
          <label>
            USt-IdNr.
            <input
              value={firma.ust_idnr}
              onChange={(e) => setFirma({ ...firma, ust_idnr: e.currentTarget.value })}
            />
          </label>
          {feldFehler("ust_idnr") && <div role="alert" className="feld-fehler">{feldFehler("ust_idnr")}</div>}
        </div>
        <div className="feld">
          <label>
            IBAN
            <input value={firma.iban} onChange={(e) => setFirma({ ...firma, iban: e.currentTarget.value })} />
          </label>
          {feldFehler("iban") && <div role="alert" className="feld-fehler">{feldFehler("iban")}</div>}
        </div>
        <div className="feld">
          <label>
            BIC
            <input value={firma.bic} onChange={(e) => setFirma({ ...firma, bic: e.currentTarget.value })} />
          </label>
          {feldFehler("bic") && <div role="alert" className="feld-fehler">{feldFehler("bic")}</div>}
        </div>
        <div className="feld">
          <label>
            E-Mail
            <input
              type="email"
              value={firma.email}
              onChange={(e) => setFirma({ ...firma, email: e.currentTarget.value })}
            />
          </label>
          <p className="feld-hinweis">Pflichtangabe für den XRechnung-Export.</p>
          {feldFehler("email") && <div role="alert" className="feld-fehler">{feldFehler("email")}</div>}
        </div>
        <div className="feld">
          <label>
            Telefon
            <input
              value={firma.telefon}
              onChange={(e) => setFirma({ ...firma, telefon: e.currentTarget.value })}
            />
          </label>
          <p className="feld-hinweis">Pflichtangabe für den XRechnung-Export.</p>
          {feldFehler("telefon") && <div role="alert" className="feld-fehler">{feldFehler("telefon")}</div>}
        </div>
        <div className="feld">
          <label>
            Gründungsjahr
            <input
              type="number"
              value={firma.gruendungsjahr ?? ""}
              onChange={(e) =>
                setFirma({
                  ...firma,
                  gruendungsjahr: e.currentTarget.value === "" ? null : Number(e.currentTarget.value),
                })
              }
            />
          </label>
          <p className="feld-hinweis">
            Im Gründungsjahr gibt es kein Vorjahr — dann gilt die 25.000-€-Grenze bereits
            für das laufende Jahr. Ohne Angabe wird vom Regelfall ausgegangen.
          </p>
          {feldFehler("gruendungsjahr") && (
            <div role="alert" className="feld-fehler">{feldFehler("gruendungsjahr")}</div>
          )}
        </div>
        <div className="feld">
          <label>
            Ansprechpartner
            <input
              value={firma.kontakt_name}
              onChange={(e) => setFirma({ ...firma, kontakt_name: e.currentTarget.value })}
            />
          </label>
          <p className="feld-hinweis">Ohne Angabe wird der Firmenname verwendet.</p>
          {feldFehler("kontakt_name") && <div role="alert" className="feld-fehler">{feldFehler("kontakt_name")}</div>}
        </div>
        <div className="feld">
          <span className="feld-beschriftung">Logo</span>
          <p className="feld-hinweis">
            {logoGroesse === null
              ? "Kein Logo hinterlegt — die Rechnungen erscheinen ohne."
              : `Logo hinterlegt (${Math.round(logoGroesse / 1024)} KB).`}
          </p>
          <div className="werkzeugleiste">
            <button type="button" className="btn" onClick={logoWaehlen}>
              {logoGroesse === null ? "Logo wählen" : "Logo ersetzen"}
            </button>
            {logoGroesse !== null && (
              <button type="button" className="btn btn-gefahr" onClick={logoEntfernen}>
                Logo entfernen
              </button>
            )}
          </div>
        </div>
        <label className="feld-checkbox">
          <input
            type="checkbox"
            checked={firma.kleinunternehmer}
            onChange={(e) => setFirma({ ...firma, kleinunternehmer: e.currentTarget.checked })}
          />
          Kleinunternehmer (§19 UStG)
        </label>
        <button type="submit" className="btn btn-primaer">Speichern</button>
      </form>
    </section>
  );
}

/**
 * Zeigt die automatischen Sicherungen und erlaubt eine sofortige.
 *
 * Ohne diesen Abschnitt bliebe die Sicherung unsichtbar: Sie liefe zwar bei
 * jedem Start, aber im Ernstfall wüsste niemand, dass es sie gibt oder wo sie
 * liegt.
 */
function SicherungenAbschnitt() {
  const [sicherungen, setSicherungen] = useState<Sicherung[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const { zeigen, hinweis } = useErfolgsHinweis();

  function laden() {
    api.sicherungen.liste().then(setSicherungen).catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, []);

  async function jetztSichern() {
    if (laeuft) return;
    setFehler(null);
    setLaeuft(true);
    try {
      await api.sicherungen.jetzt();
      laden();
      zeigen("Sicherung angelegt");
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setLaeuft(false);
    }
  }

  /** "2026-08-03_10-15-00" → "03.08.2026, 10:15 Uhr" */
  function zeitpunkt(zeitstempel: string): string {
    const [datum, uhrzeit] = zeitstempel.split("_");
    const d = datum?.split("-");
    const u = uhrzeit?.split("-");
    if (d?.length !== 3 || u?.length !== 3) return zeitstempel;
    return `${d[2]}.${d[1]}.${d[0]}, ${u[0]}:${u[1]} Uhr`;
  }

  return (
    <section className="karte">
      <h2>Sicherungen</h2>
      <Fehler fehler={fehler} />
      {hinweis}
      <p className="feld-hinweis">
        Bei jedem Programmstart wird die Datenbank kopiert, bevor Änderungen an ihrer
        Struktur vorgenommen werden. Die zehn jüngsten Kopien bleiben erhalten. Zum
        Wiederherstellen ersetzen Sie die Datei <code>daten.db</code> durch eine Sicherung —
        bei geschlossenem Programm.
      </p>
      <button type="button" className="btn" disabled={laeuft} onClick={jetztSichern}>
        Jetzt sichern
      </button>
      {sicherungen.length === 0 ? (
        <p>Noch keine Sicherungen vorhanden.</p>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Größe</th>
              <th>Ablage</th>
            </tr>
          </thead>
          <tbody>
            {sicherungen.map((s) => (
              <tr key={s.zeitstempel}>
                <td>{zeitpunkt(s.zeitstempel)}</td>
                <td>{Math.max(1, Math.round(s.groesse_bytes / 1024))} KB</td>
                <td className="tabelle-num">{s.pfad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EinheitenAbschnitt() {
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [name, setName] = useState("");
  const [kuerzel, setKuerzel] = useState("");
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

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
    const warNeu = !bearbeiteId;
    const gespeicherterName = name;
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
      zeigen(
        warNeu ? `Einheit „${gespeicherterName}" angelegt` : `Einheit „${gespeicherterName}" gespeichert`,
      );
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string, name: string) {
    if (!(await bestaetigen(`Einheit „${name}" löschen?`))) return;
    setFehler(null);
    try {
      await api.einheiten.delete(id);
      laden();
      zeigen("Einheit gelöscht");
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
    <section className="karte">
      <h2>Einheiten</h2>
      <Fehler fehler={fehler} />
      {hinweis}
      {dialog}
      <table className="tabelle">
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
                <button type="button" className="btn" onClick={() => bearbeiten(e)}>
                  Bearbeiten
                </button>
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(e.id, e.name)}>
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
        <label className="feld">
          Name
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Kürzel
          <input value={kuerzel} onChange={(e) => setKuerzel(e.currentTarget.value)} />
        </label>
        <button type="submit" className="btn btn-primaer">{bearbeiteId ? "Aktualisieren" : "Hinzufügen"}</button>
      </form>
    </section>
  );
}

const NUMMERNKREIS_LABEL: Record<string, string> = {
  kunde: "Kunde",
  artikel: "Artikel",
  rechnung: "Rechnung",
  angebot: "Angebot",
  gutschrift: "Gutschrift",
  mahnung: "Mahnung",
};

function NummernkreiseAbschnitt() {
  const [nummernkreise, setNummernkreise] = useState<Nummernkreis[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

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
      zeigen("Nummernkreis gespeichert");
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
      <Fehler fehler={fehler} />
      {hinweis}
      {nummernkreise.map((nk) => (
        <form
          key={nk.art}
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern(nk);
          }}
        >
          <label className="feld">
            {NUMMERNKREIS_LABEL[nk.art] ?? nk.art}
            <input value={nk.format} onChange={(e) => aendere(nk.art, { format: e.currentTarget.value })} />
          </label>
          <label className="feld-checkbox">
            <input
              type="checkbox"
              checked={nk.jahres_reset}
              onChange={(e) => aendere(nk.art, { jahres_reset: e.currentTarget.checked })}
            />
            Jährlicher Reset
          </label>
          <p>Aktueller Zähler: {nk.zaehler}</p>
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      ))}
    </section>
  );
}

const TEXTBAUSTEIN_LABEL: Record<string, string> = {
  "text.kleinunternehmer": "Kleinunternehmer-Hinweis",
  "text.rechnung.fuss": "Rechnungs-Fußtext",
  "text.angebot.fuss": "Angebots-Fußtext",
};

const TEXTBAUSTEIN_KEYS = Object.keys(TEXTBAUSTEIN_LABEL);

function TextbausteineAbschnitt() {
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  useEffect(() => {
    Promise.all(TEXTBAUSTEIN_KEYS.map((key) => api.einstellungen.get(key)))
      .then((liste) => {
        const neueWerte: Record<string, string> = {};
        TEXTBAUSTEIN_KEYS.forEach((key, i) => {
          neueWerte[key] = liste[i] ?? "";
        });
        setWerte(neueWerte);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }, []);

  function aendere(key: string, wert: string) {
    setWerte((bisherige) => ({ ...bisherige, [key]: wert }));
  }

  async function speichern(key: string) {
    setFehler(null);
    try {
      await api.einstellungen.set(key, werte[key] ?? "");
      zeigen(`${TEXTBAUSTEIN_LABEL[key]} gespeichert`);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section>
      <h2>Textbausteine</h2>
      <Fehler fehler={fehler} />
      {hinweis}
      {TEXTBAUSTEIN_KEYS.map((key) => (
        <form
          key={key}
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern(key);
          }}
        >
          <label className="feld">
            {TEXTBAUSTEIN_LABEL[key]}
            <textarea value={werte[key] ?? ""} onChange={(e) => aendere(key, e.currentTarget.value)} />
          </label>
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      ))}
    </section>
  );
}
