import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api, istValidierungsfehler, type AppFehler, type Firma } from "../api";
import { formularFehler } from "../formularFehler";
import { Fehler } from "../components/Fehler";

interface EinrichtungProps {
  onFertig: (zielSeite?: "kunden" | "artikel") => void;
}

type Schritt = 1 | 2 | 3 | 4 | 5;

/**
 * Fünf-Schritte-Assistent für die Ersteinrichtung: Firmendaten, Logo
 * (optional), Kleinunternehmer-Bestätigung, Nummernkreise, Abschluss. Läuft
 * komplett im Speicher (kein Save pro Schritt) — erst der Abschluss in
 * Schritt 4 ruft `firma.save`, damit ein Abbruch mittendrin keine halb
 * ausgefüllte Firma mit `eingerichtet=false` hinterlässt.
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

  const { feldFehler, bannerFehler } = formularFehler(fehler, ["name", "steuernummer"]);

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
      setSchritt(5);
      setSpeichert(false);
    } catch (e) {
      const appFehler = e as AppFehler;
      setFehler(appFehler);
      setSpeichert(false);
      if (istValidierungsfehler(appFehler)) {
        setSchritt(1);
      }
    }
  }

  return (
    <main className="einrichtung-main">
      <h1 className="seiten-kopf">Ersteinrichtung</h1>
      <Fehler fehler={bannerFehler} />

      {schritt === 1 && (
        <section className="karte">
          <p className="schritt-fortschritt">Schritt 1 von 5</p>
          <h2>Firmendaten</h2>
          <p>Diese Angaben erscheinen später auf deinen Angeboten und Rechnungen.</p>
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
          {/* E-Mail, Telefon und Ansprechpartner sind für eine gültige XRechnung
              Pflicht (BT-34, BG-6). Fehlten sie hier, liefe der erste
              XRechnung-Export ins Leere, ohne dass etwas darauf hinweist. */}
          <div className="feld">
            <label>
              E-Mail
              <input
                type="email"
                value={firma.email}
                onChange={(e) => setFirma({ ...firma, email: e.currentTarget.value })}
              />
            </label>
            <p className="feld-hinweis">Wird für den XRechnung-Export benötigt.</p>
            {feldFehler("email") && <div className="feld-fehler" role="alert">{feldFehler("email")}</div>}
          </div>
          <div className="feld">
            <label>
              Telefon
              <input
                value={firma.telefon}
                onChange={(e) => setFirma({ ...firma, telefon: e.currentTarget.value })}
              />
            </label>
            <p className="feld-hinweis">Wird für den XRechnung-Export benötigt.</p>
            {feldFehler("telefon") && <div className="feld-fehler" role="alert">{feldFehler("telefon")}</div>}
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
              Im Gründungsjahr gilt für die Kleinunternehmergrenze bereits das laufende Jahr.
            </p>
          </div>
          <button type="button" className="btn btn-primaer" onClick={() => setSchritt(2)}>
            Weiter
          </button>
        </section>
      )}

      {schritt === 2 && (
        <section className="karte">
          <p className="schritt-fortschritt">Schritt 2 von 5</p>
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
          <p className="schritt-fortschritt">Schritt 3 von 5</p>
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
          <p className="schritt-fortschritt">Schritt 4 von 5</p>
          <h2>Nummernkreise</h2>
          <p>Legt fest, wie deine Kunden-, Artikel-, Angebots- und Rechnungsnummern aufgebaut sind — änderbar in den Einstellungen.</p>
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

      {schritt === 5 && (
        <section className="karte">
          <h2>Fertig!</h2>
          <p>Womit möchtest du starten?</p>
          <div className="werkzeugleiste">
            <button type="button" className="btn btn-primaer" onClick={() => onFertig("kunden")}>
              Ersten Kunden anlegen
            </button>
            <button type="button" className="btn btn-primaer" onClick={() => onFertig("artikel")}>
              Ersten Artikel anlegen
            </button>
          </div>
          <p>Firmendaten und Nummernkreise kannst du jederzeit in den Einstellungen ändern.</p>
        </section>
      )}
    </main>
  );
}
