import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api, istValidierungsfehler, type AppFehler, type Firma, type ZipImport } from "../api";
import { formularFehler } from "../formularFehler";
import { Fehler } from "../components/Fehler";
import { AdressFelder } from "../components/AdressFelder";
import { PflichtLegende, PflichtMarker } from "../components/PflichtMarker";
import { useXRechnungHilfe } from "../hooks/useXRechnungHilfe";
import { aktuellePlattform } from "../plattform";

/**
 * Unter macOS ist die Titelleiste ausgeblendet; ohne diesen Streifen ließe
 * sich das Fenster während der Einrichtung nirgends greifen, und die
 * Ampelknöpfe lägen über dem Titel.
 */
function Ziehbereich() {
  if (aktuellePlattform() !== "mac") return null;
  return <div className="einrichtung-ziehbereich" data-tauri-drag-region="" aria-hidden="true" />;
}

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
 *
 * Geprüft wird trotzdem schon nach Schritt 1: Wer sich in der IBAN vertippt,
 * erfuhr das früher erst nach fünf Schritten und wurde an den Anfang
 * zurückgeschickt. Die Prüfung läuft im Backend (`firma.pruefen`) — dieselbe
 * Funktion wie beim Speichern. Eine zweite Regelmenge hier liefe auseinander,
 * und die IBAN-Prüfsumme nachzubauen wäre ohnehin Unfug.
 */
export function Einrichtung({ onFertig }: EinrichtungProps) {
  const { zeigen: zeigeXRechnungHilfe } = useXRechnungHilfe();
  const [schritt, setSchritt] = useState<Schritt>(1);
  const [firma, setFirma] = useState<Firma | null>(null);
  const [logoBytes, setLogoBytes] = useState<number[] | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [prueft, setPrueft] = useState(false);
  /** Ergebnis eines Umzugs aus einer Sicherung; danach fehlt nur der Neustart. */
  const [umzug, setUmzug] = useState<ZipImport | null>(null);
  const [spieltEin, setSpieltEin] = useState(false);

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

  const { feldFehler, bannerFehler } = formularFehler(fehler, [
    "name",
    "strasse",
    "plz",
    "ort",
    "steuernummer",
  ]);

  /**
   * Übernimmt eine Feldänderung und räumt eine stehengebliebene Meldung weg.
   *
   * Ohne das blieb „Die Prüfsumme der IBAN stimmt nicht" sichtbar, auch
   * nachdem der Nutzer sie längst korrigiert hatte — und ließ ihn im Zweifel,
   * ob seine Korrektur angekommen ist.
   */
  function feldAendern(aenderung: Partial<Firma>) {
    if (!firma) return;
    setFirma({ ...firma, ...aenderung });
    if (fehler) setFehler(null);
  }

  /** Prüft die Firmendaten und geht nur bei Erfolg weiter. */
  async function weiterVonSchritt1() {
    if (!firma) return;
    setPrueft(true);
    try {
      await api.firma.pruefen(firma);
      setFehler(null);
      setSchritt(2);
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setPrueft(false);
    }
  }

  async function logoWaehlen() {
    const pfad = await open({
      multiple: false,
      filters: [{ name: "Bild", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (!pfad || typeof pfad !== "string") return;
    const bytes = await readFile(pfad);
    setLogoBytes(Array.from(bytes));
  }

  /**
   * Übernimmt die Daten einer bestehenden Installation aus einer Sicherung.
   *
   * Der Weg für den Umzug in die Store-Fassung: Sie liegt in einem eigenen
   * Container und sieht die Daten der GitHub-Fassung nicht. Ohne diesen Knopf
   * müsste man erst eine Firma erfinden, um an die Einstellungen und damit an
   * „Aus Datei einspielen" zu kommen, und hätte danach eine Sicherung des
   * erfundenen Standes zwischen den echten.
   *
   * Ohne Rückfrage: Vor der Einrichtung gibt es nichts, was verloren ginge.
   * Wirksam wird die Datenbank wie in den Einstellungen erst beim Neustart,
   * weil sie im laufenden Betrieb geöffnet ist.
   */
  async function sicherungEinspielen() {
    setFehler(null);
    const pfad = await open({ filters: [{ name: "Zip", extensions: ["zip"] }], multiple: false });
    if (typeof pfad !== "string") return;
    setSpieltEin(true);
    try {
      setUmzug(await api.sicherungen.ausDateiEinspielen(pfad));
    } catch (e) {
      setFehler(e as AppFehler);
    } finally {
      setSpieltEin(false);
    }
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

  if (umzug) {
    return (
      <main className="einrichtung-main">
        <Ziehbereich />
        <h1>Ersteinrichtung</h1>
        <section role="status">
          <h2>Die Sicherung ist eingespielt</h2>
          <p>
            Beim Neustart übernimmt Chefsachen die Daten daraus. Danach geht es dort weiter, wo
            du in der bisherigen Fassung aufgehört hast.
          </p>
          {umzug.belege_neu > 0 && (
            <p className="feld-hinweis">{umzug.belege_neu} Belegdatei(en) übernommen.</p>
          )}
          <div className="aktionen aktionen-formular aktionen-rechts">
            <button type="button" className="btn btn-primaer" onClick={() => api.neuStarten()}>
              Jetzt neu starten
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="einrichtung-main">
      <Ziehbereich />
      <h1>Ersteinrichtung</h1>
      <Fehler fehler={bannerFehler} />

      {schritt === 1 && (
        <section>
          <p className="schritt-fortschritt">Schritt 1 von 5</p>
          <h2>Firmendaten</h2>
          <p className="einleitung">Diese Angaben erscheinen später auf deinen Angeboten und Rechnungen.</p>
          {/* Leise und vor dem Formular: Wer umzieht, soll es nicht erst
              ausfüllen, alle anderen stört ein Knopf in dieser Form nicht. */}
          <p className="feld-hinweis">
            <button
              type="button"
              className="btn btn-leise"
              disabled={spieltEin}
              onClick={sicherungEinspielen}
            >
              {spieltEin
                ? "Sicherung wird eingespielt …"
                : "Ich nutze Chefsachen schon: Sicherung einspielen …"}
            </button>
          </p>
          <div className="gruppe">
            <div className="feld">
              <label>
                <PflichtMarker art="pflicht">Firmenname</PflichtMarker>
                <input required value={firma.name} onChange={(e) => feldAendern({ name: e.currentTarget.value })} />
              </label>
              {feldFehler("name") && <div className="feld-fehler" role="alert">{feldFehler("name")}</div>}
            </div>
            <AdressFelder
              strasse={firma.strasse}
              plz={firma.plz}
              ort={firma.ort}
              land={firma.land}
              onAendern={feldAendern}
              feldFehler={feldFehler}
            />
          </div>
          <div className="gruppe">
            <div className="felder-reihe">
              <div className="feld">
                <label>
                  <PflichtMarker art="pflicht">Steuernummer</PflichtMarker>
                  <input
                    value={firma.steuernummer}
                    onChange={(e) => feldAendern({ steuernummer: e.currentTarget.value })}
                  />
                </label>
                {feldFehler("steuernummer") && <div className="feld-fehler" role="alert">{feldFehler("steuernummer")}</div>}
              </div>
              <div className="feld">
                <label>
                  USt-IdNr.
                  <input
                    value={firma.ust_idnr}
                    onChange={(e) => feldAendern({ ust_idnr: e.currentTarget.value })}
                  />
                </label>
                <p className="feld-hinweis">
                  Optional, wenn die Steuernummer angegeben ist. Vor allem für Geschäfte
                  innerhalb der EU nötig (z. B. innergemeinschaftliche Lieferungen).
                </p>
              </div>
            </div>
            <div className="felder-reihe felder-breit-schmal">
              <div className="feld">
                <label>
                  IBAN
                  <input value={firma.iban} onChange={(e) => feldAendern({ iban: e.currentTarget.value })} />
                </label>
              </div>
              <div className="feld">
                <label>
                  BIC
                  <input value={firma.bic} onChange={(e) => feldAendern({ bic: e.currentTarget.value })} />
                </label>
              </div>
            </div>
          </div>
          <div className="gruppe">
            {/* E-Mail, Telefon und Ansprechpartner sind für eine gültige XRechnung
                Pflicht (BT-34, BG-6). Fehlten sie hier, liefe der erste
                XRechnung-Export ins Leere, ohne dass etwas darauf hinweist. */}
            <div className="felder-reihe">
              <div className="feld">
                <label>
                  <PflichtMarker art="xrechnung">E-Mail</PflichtMarker>
                  <input
                    type="email"
                    value={firma.email}
                    onChange={(e) => feldAendern({ email: e.currentTarget.value })}
                  />
                </label>
                <p className="feld-hinweis">Wird für den XRechnung-Export benötigt.</p>
                {feldFehler("email") && <div className="feld-fehler" role="alert">{feldFehler("email")}</div>}
              </div>
              <div className="feld">
                <label>
                  <PflichtMarker art="xrechnung">Telefon</PflichtMarker>
                  <input
                    value={firma.telefon}
                    onChange={(e) => feldAendern({ telefon: e.currentTarget.value })}
                  />
                </label>
                <p className="feld-hinweis">Wird für den XRechnung-Export benötigt.</p>
                {feldFehler("telefon") && <div className="feld-fehler" role="alert">{feldFehler("telefon")}</div>}
              </div>
            </div>
            <div className="felder-reihe">
              <div className="feld">
                <label>
                  Fax
                  <input
                    value={firma.fax}
                    onChange={(e) => feldAendern({ fax: e.currentTarget.value })}
                  />
                </label>
                <p className="feld-hinweis">Optional — nicht vorgeschrieben, manche Kunden verlangen sie trotzdem.</p>
                {feldFehler("fax") && <div className="feld-fehler" role="alert">{feldFehler("fax")}</div>}
              </div>
              <div className="feld">
                <label>
                  Ansprechpartner
                  <input
                    value={firma.kontakt_name}
                    onChange={(e) => feldAendern({ kontakt_name: e.currentTarget.value })}
                  />
                </label>
                <p className="feld-hinweis">Ohne Angabe wird der Firmenname verwendet.</p>
              </div>
            </div>
            <div className="feld feld-schmal">
              <label>
                Gründungsjahr
                {/* Grenzen am Feld, damit das Zahlenrad gar nicht erst ins
                    Negative läuft. Die verbindliche Prüfung steht im Backend —
                    ein Attribut im Formular lässt sich umgehen. */}
                <input
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                  step={1}
                  value={firma.gruendungsjahr ?? ""}
                  onChange={(e) =>
                    feldAendern({
                      gruendungsjahr:
                        e.currentTarget.value === "" ? null : Number(e.currentTarget.value),
                    })
                  }
                />
              </label>
              <p className="feld-hinweis">
                Im Gründungsjahr gilt für die Kleinunternehmergrenze bereits das laufende Jahr.
              </p>
            </div>
          </div>
          <PflichtLegende zeigtXrechnung />
          <button type="button" className="feld-hinweis-link" onClick={zeigeXRechnungHilfe}>
            Was ist die XRechnung?
          </button>
          <div className="aktionen aktionen-formular aktionen-rechts">
            <button
              type="button"
              className="btn btn-primaer"
              disabled={prueft}
              onClick={weiterVonSchritt1}
            >
              Weiter
            </button>
          </div>
        </section>
      )}

      {schritt === 2 && (
        <section>
          <p className="schritt-fortschritt">Schritt 2 von 5</p>
          <h2>Logo</h2>
          <p className="einleitung">Optional — kann auch später in den Einstellungen hinzugefügt werden.</p>
          <div className="gruppe">
            <div className="aktionen">
              <button type="button" className="btn" onClick={logoWaehlen}>
                Datei wählen
              </button>
              {logoBytes && <span>Logo ausgewählt ({logoBytes.length} Bytes).</span>}
            </div>
          </div>
          <div className="aktionen aktionen-formular aktionen-rechts">
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
        <section>
          <p className="schritt-fortschritt">Schritt 3 von 5</p>
          <h2>Kleinunternehmer-Bestätigung</h2>
          <p className="einleitung">
            Nach § 19 UStG müssen Kleinunternehmer keine Umsatzsteuer ausweisen, solange der
            Vorjahresumsatz 25.000 € und der voraussichtliche Umsatz des laufenden Jahres 100.000 € nicht
            übersteigt.
          </p>
          <div className="gruppe">
            <label className="feld-checkbox">
              <input
                type="checkbox"
                checked={firma.kleinunternehmer}
                onChange={(e) => feldAendern({ kleinunternehmer: e.currentTarget.checked })}
              />
              Ich falle unter die Kleinunternehmerregelung
            </label>
            <p className="feld-hinweis">
              Ohne Häkchen gilt Regelbesteuerung: Belege weisen die enthaltene
              Umsatzsteuer aus, der Steuersatz wird je Artikel gewählt (19/7/0 %),
              die Preise bleiben Bruttopreise.
            </p>
          </div>
          <div className="aktionen aktionen-formular aktionen-rechts">
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
        <section>
          <p className="schritt-fortschritt">Schritt 4 von 5</p>
          <h2>Nummernkreise</h2>
          <p className="einleitung">Legt fest, wie deine Kunden-, Artikel-, Angebots- und Rechnungsnummern aufgebaut sind — änderbar in den Einstellungen.</p>
          <p>Die vorbelegten Formate können später jederzeit in den Einstellungen angepasst werden.</p>
          <dl className="angaben gruppe">
            <dt>Kunden</dt>
            <dd className="tabelle-num">KD-0001</dd>
            <dt>Artikel</dt>
            <dd className="tabelle-num">ART-0001</dd>
            <dt>Angebote</dt>
            <dd className="tabelle-num">AN-{new Date().getFullYear()}-0001</dd>
            <dt>Rechnungen</dt>
            <dd className="tabelle-num">RE-{new Date().getFullYear()}-0001</dd>
          </dl>
          <div className="aktionen aktionen-formular aktionen-rechts">
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
        <section>
          <h2>Fertig!</h2>
          <p className="einleitung">Womit möchtest du starten?</p>
          <div className="aktionen aktionen-formular aktionen-rechts">
            <button type="button" className="btn btn-primaer" onClick={() => onFertig("kunden")}>
              Ersten Kunden anlegen
            </button>
            <button type="button" className="btn btn-primaer" onClick={() => onFertig("artikel")}>
              Ersten Artikel anlegen
            </button>
          </div>
          <p className="feld-hinweis">Firmendaten und Nummernkreise kannst du jederzeit in den Einstellungen ändern.</p>
        </section>
      )}
    </main>
  );
}
