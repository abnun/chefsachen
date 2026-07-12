import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api, istValidierungsfehler, type AppFehler, type Firma } from "../api";
import { Fehler } from "../components/Fehler";

interface EinrichtungProps {
  onFertig: () => void;
}

type Schritt = 1 | 2 | 3 | 4;

/**
 * Vier-Schritte-Assistent für die Ersteinrichtung: Firmendaten, Logo
 * (optional), Kleinunternehmer-Bestätigung, Nummernkreise. Läuft komplett im
 * Speicher (kein Save pro Schritt) — erst der Abschluss in Schritt 4 ruft
 * `firma.save`, damit ein Abbruch mittendrin keine halb ausgefüllte Firma
 * mit `eingerichtet=false` hinterlässt.
 */
export function Einrichtung({ onFertig }: EinrichtungProps) {
  const [schritt, setSchritt] = useState<Schritt>(1);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [logoBytes, setLogoBytes] = useState<number[] | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    api.firma.get().then(setFirma).catch((e) => setFehler(e as AppFehler));
  }, []);

  if (!firma) {
    return (
      <main className="einrichtung-main">
        {fehler && <Fehler fehler={fehler} />}
      </main>
    );
  }

  const feldFehler = (feld: string) =>
    fehler && istValidierungsfehler(fehler) && fehler.feld === feld ? fehler.meldung : null;

  async function logoWaehlen() {
    const pfad = await open({
      multiple: false,
      filters: [{ name: "Bild", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (!pfad || typeof pfad !== "string") return;
    const bytes = await readFile(pfad);
    setLogoBytes(Array.from(bytes));
  }

  async function abschliessen() {
    if (!firma) return;
    setFehler(null);
    setSpeichert(true);
    try {
      await api.firma.save(firma);
      if (logoBytes) {
        await api.firma.logoSet(logoBytes);
      }
      onFertig();
    } catch (e) {
      setFehler(e as AppFehler);
      setSpeichert(false);
    }
  }

  return (
    <main className="einrichtung-main">
      <h1 className="seiten-kopf">Ersteinrichtung</h1>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}

      {schritt === 1 && (
        <section className="karte">
          <h2>Firmendaten</h2>
          <div className="feld">
            <label>
              Name
              <input value={firma.name} onChange={(e) => setFirma({ ...firma, name: e.currentTarget.value })} />
            </label>
            {feldFehler("name") && <div className="feld-fehler" role="alert">{feldFehler("name")}</div>}
          </div>
          <div className="feld">
            <label>
              Straße
              <input
                value={firma.strasse}
                onChange={(e) => setFirma({ ...firma, strasse: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              PLZ
              <input value={firma.plz} onChange={(e) => setFirma({ ...firma, plz: e.currentTarget.value })} />
            </label>
          </div>
          <div className="feld">
            <label>
              Ort
              <input value={firma.ort} onChange={(e) => setFirma({ ...firma, ort: e.currentTarget.value })} />
            </label>
          </div>
          <div className="feld">
            <label>
              Steuernummer
              <input
                value={firma.steuernummer}
                onChange={(e) => setFirma({ ...firma, steuernummer: e.currentTarget.value })}
              />
            </label>
            {feldFehler("steuernummer") && <div className="feld-fehler" role="alert">{feldFehler("steuernummer")}</div>}
          </div>
          <div className="feld">
            <label>
              USt-IdNr.
              <input
                value={firma.ust_idnr}
                onChange={(e) => setFirma({ ...firma, ust_idnr: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              IBAN
              <input value={firma.iban} onChange={(e) => setFirma({ ...firma, iban: e.currentTarget.value })} />
            </label>
          </div>
          <div className="feld">
            <label>
              BIC
              <input value={firma.bic} onChange={(e) => setFirma({ ...firma, bic: e.currentTarget.value })} />
            </label>
          </div>
          <button type="button" className="btn btn-primaer" onClick={() => setSchritt(2)}>
            Weiter
          </button>
        </section>
      )}

      {schritt === 2 && (
        <section className="karte">
          <h2>Logo</h2>
          <p>Optional — kann auch später in den Einstellungen hinzugefügt werden.</p>
          <button type="button" className="btn" onClick={logoWaehlen}>
            Datei wählen
          </button>
          {logoBytes && <p>Logo ausgewählt ({logoBytes.length} Bytes).</p>}
          <div className="werkzeugleiste">
            <button type="button" className="btn btn-leise" onClick={() => setSchritt(1)}>
              Zurück
            </button>
            <button type="button" className="btn btn-primaer" onClick={() => setSchritt(3)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {schritt === 3 && (
        <section className="karte">
          <h2>Kleinunternehmer-Bestätigung</h2>
          <p>
            Nach § 19 UStG müssen Kleinunternehmer keine Umsatzsteuer ausweisen, solange der
            Vorjahresumsatz 25.000 € und der voraussichtliche Umsatz des laufenden Jahres 100.000 € nicht
            übersteigt.
          </p>
          <label className="feld-checkbox">
            <input
              type="checkbox"
              checked={firma.kleinunternehmer}
              onChange={(e) => setFirma({ ...firma, kleinunternehmer: e.currentTarget.checked })}
            />
            Ich falle unter die Kleinunternehmerregelung
          </label>
          <div className="werkzeugleiste">
            <button type="button" className="btn btn-leise" onClick={() => setSchritt(2)}>
              Zurück
            </button>
            <button type="button" className="btn btn-primaer" onClick={() => setSchritt(4)}>
              Weiter
            </button>
          </div>
        </section>
      )}

      {schritt === 4 && (
        <section className="karte">
          <h2>Nummernkreise</h2>
          <p>Die vorbelegten Formate können später jederzeit in den Einstellungen angepasst werden.</p>
          <ul>
            <li>Kunden: KD-0001</li>
            <li>Artikel: ART-0001</li>
            <li>Angebote: AN-{new Date().getFullYear()}-0001</li>
            <li>Rechnungen: RE-{new Date().getFullYear()}-0001</li>
          </ul>
          <div className="werkzeugleiste">
            <button type="button" className="btn btn-leise" onClick={() => setSchritt(3)}>
              Zurück
            </button>
            <button type="button" className="btn btn-primaer" disabled={speichert} onClick={abschliessen}>
              Einrichtung abschließen
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
