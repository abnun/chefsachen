import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
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
import { AdressFelder } from "../components/AdressFelder";
import { IbanFeld } from "../components/IbanFeld";
import { OnlineVorschlaegeSchalter } from "../components/OnlineVorschlaegeSchalter";
import { PflichtLegende, PflichtMarker } from "../components/PflichtMarker";
import { useXRechnungHilfe } from "../hooks/useXRechnungHilfe";
// Beide nebeneinander mit Absicht: `useSpeichern` meldet neben dem Knopf und
// passt dort, wo ein Abschnitt eine klare Hauptaktion hat. Wo mehrere Knöpfe
// sich einen Abschnitt teilen (Sicherungen, Einheiten, Nummernkreise,
// Textbausteine), bleibt der Banner am Kopf richtig — er gehört dort zu
// keinem einzelnen Knopf.
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useSpeichern } from "../hooks/useSpeichern";
import { useBestaetigung } from "../hooks/useBestaetigung";
import { useUngespeichert } from "../hooks/useUngespeichert";
import { Aktualisierung } from "../components/Aktualisierung";
import { Belegvorlage } from "../components/Belegvorlage";
import { PAYPAL_LINK } from "../components/SpendenHinweis";
import { zeitpunktDeutsch } from "../datum";
import { type FuehrungsSchritt } from "../components/Fuehrung";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { storeName, useIstGithubFassung, useVertriebsweg } from "../hooks/useVertriebsweg";

/**
 * Statisch außerhalb der Komponente, wie auf der Übersicht: Ein je Rendern
 * neues Array ließe den Positionierungs-Effekt der Führung durchdrehen.
 */
const RUNDGANG_SCHRITTE: FuehrungsSchritt[] = [
  {
    ziel: "[data-tour='titel']",
    titel: "Einstellungen",
    text: "Alles Grundsätzliche an einem Ort: Firmendaten, Sicherungen, Nummernkreise, Textbausteine, das Aussehen der Belege und die Programmversion. Jeder Abschnitt speichert für sich.",
  },
  {
    ziel: "[data-tour='firmendaten']",
    titel: "Firmendaten",
    text: "Anschrift, Steuernummer, Bankverbindung, Kontaktdaten und Logo — sie erscheinen auf jedem Beleg. E-Mail und Telefon sind zugleich Pflichtangaben für den XRechnung-Export.",
  },
  {
    ziel: "[data-tour='sicherungen']",
    titel: "Sicherungen",
    text: "Bei jedem Start entsteht automatisch eine Kopie der Datenbank. Wichtig: Die liegt auf derselben Platte — erst Speichern unter bringt eine echte Sicherung woandershin, samt Belegarchiv als Zip, die sich hier auch wieder einspielen lässt.",
  },
  {
    ziel: "[data-tour='nummernkreise']",
    titel: "Nummernkreise",
    text: "Bestimmen, wie Angebots- und Rechnungsnummern aussehen. Vergeben wird lückenlos und nie doppelt — eine einmal verbrauchte Nummer kommt nicht wieder (GoBD).",
  },
  {
    ziel: "[data-tour='textbausteine']",
    titel: "Textbausteine",
    text: "Vorgaben für Kopf- und Fußtexte neuer Belege, den Kleinunternehmer-Hinweis und die Zahlungserinnerung. In jedem einzelnen Beleg lassen sich die Texte weiter anpassen.",
  },
  {
    ziel: "[data-tour='belegvorlage']",
    titel: "Belegvorlage",
    text: "Das Aussehen von Angebot und Rechnung: Logo-Position, Farben, Spalten, Ränder — mit Vorschau daneben, die sofort mitzeichnet. Pflichtangaben und das DIN-5008-Anschriftfeld sind bewusst nicht verstellbar.",
  },
  {
    ziel: "[data-tour='programmversion']",
    titel: "Programmversion",
    text: "Zeigt die installierte Version und sucht nach Aktualisierungen — beim Start automatisch, hier auch von Hand. Installiert wird nie ungefragt.",
  },
];

/**
 * Der Rundgang der Store-Fassungen. Dort sucht das Programm nicht selbst,
 * der letzte Schritt versprach sonst etwas, das es nicht gibt. Je Store ein
 * fester Satz, damit das Array wie oben stabil bleibt.
 */
function rundgangFuerStore(store: string): FuehrungsSchritt[] {
  return [
    ...RUNDGANG_SCHRITTE.slice(0, -1),
    {
      ziel: "[data-tour='programmversion']",
      titel: "Programmversion",
      text: `Zeigt die installierte Version und den Ort des Protokolls. Aktualisierungen kommen über ${store}.`,
    },
  ];
}
const RUNDGANG_APP_STORE = rundgangFuerStore(storeName("mac_app_store"));
const RUNDGANG_MICROSOFT_STORE = rundgangFuerStore(storeName("microsoft_store"));

/**
 * Einstellungsseite mit unabhängigen Abschnitten: Firmendaten, Sicherungen,
 * Einheiten-Verwaltung, Nummernkreise, Textbausteine und Programmversion. Jeder Abschnitt lädt
 * und speichert unabhängig von den anderen — ein Fehler in einem Abschnitt
 * blockiert die anderen nicht.
 */
export function Einstellungen() {
  const weg = useVertriebsweg();
  const schritte =
    weg === "mac_app_store"
      ? RUNDGANG_APP_STORE
      : weg === "microsoft_store"
        ? RUNDGANG_MICROSOFT_STORE
        : RUNDGANG_SCHRITTE;
  return (
    <div>
      <Werkzeugleiste titel="Einstellungen" rundgang={schritte} />
      <FirmendatenAbschnitt />
      <AdressvorschlaegeAbschnitt />
      <SicherungenAbschnitt />
      <EinheitenAbschnitt />
      <NummernkreiseAbschnitt />
      <TextbausteineAbschnitt />
      <AngeboteAbschnitt />
      {/* Nach den Textbausteinen: Die Vorschau zeigt sie mit, und wer beides
          einstellt, arbeitet von innen nach außen — erst der Inhalt, dann das
          Aussehen. */}
      <Belegvorlage />
      <Aktualisierung />
      <SpendenAbschnitt />
    </div>
  );
}

/**
 * Die einzige Funktion, für die Chefsachen ins Internet geht, und deshalb
 * ausdrücklich zum Einschalten. Die Beschreibung sagt vorher, was dabei wohin
 * geht: Wer Kundenadressen erfasst, gibt sonst ohne es zu wissen Daten Dritter
 * weiter.
 *
 * Gespeichert wird sofort beim Umschalten, wie bei der Aktualisierungssuche:
 * Ein eigener Speichern-Knopf für ein einziges Häkchen wäre ein Schritt, den
 * man vergisst.
 */
function AdressvorschlaegeAbschnitt() {
  return (
    <section className="abschnitt inhalt-schmal">
      <h2>Adressvorschläge</h2>
      <p>
        Zur Postleitzahl schlägt Chefsachen den Ort vor und umgekehrt, aus einer mitgelieferten
        Liste. Dafür verlässt nichts den Rechner.
      </p>
      <OnlineVorschlaegeSchalter beschriftung="Adressvorschläge aus dem Internet" />
    </section>
  );
}

/**
 * Nur in der GitHub-Fassung: Spendenaufrufe außerhalb des In-App-Kaufs sind
 * in den Stores für Einzelentwickler unzulässig.
 */
function SpendenAbschnitt() {
  if (!useIstGithubFassung()) return null;
  return (
    <section className="abschnitt spenden">
      <div className="gruppe inhalt-schmal">
        <p>Gefällt dir Chefsachen? Über eine kleine Unterstützung würde ich mich freuen — muss aber nicht.</p>
        <p className="feld-hinweis">
          Eine freiwillige Zuwendung ohne Gegenleistung — keine Spende im steuerlichen Sinn, nicht
          absetzbar, und ohne Einfluss auf den Funktionsumfang.
        </p>
        <a href={PAYPAL_LINK} target="_blank" rel="noopener noreferrer" className="btn">
          Über PayPal unterstützen
        </a>
      </div>
    </section>
  );
}

/**
 * PNG erkennt man an der Signatur `\x89PNG`; alles andere, was diese Anwendung
 * entgegennimmt, ist JPEG (siehe `logo_dateiname` im Rust-Teil — dieselbe
 * Unterscheidung, hier nur fürs Anzeigen statt fürs Ablegen im Archiv).
 */
function logoMimetyp(bytes: number[]): string {
  const istPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return istPng ? "image/png" : "image/jpeg";
}

/**
 * Bytes als Base64 — in Stücken, damit ein großes Logo nicht am Aufruflimit
 * von `String.fromCharCode(...bytes)` scheitert (Firefox/Safari brechen bei
 * einigen Zehntausend Argumenten ab).
 */
function bytesZuBase64(bytes: number[]): string {
  const GROESSE = 0x8000;
  let binaer = "";
  for (let i = 0; i < bytes.length; i += GROESSE) {
    binaer += String.fromCharCode(...bytes.slice(i, i + GROESSE));
  }
  return btoa(binaer);
}

function FirmendatenAbschnitt() {
  const { zeigen: zeigeXRechnungHilfe } = useXRechnungHilfe();
  const [firma, setFirma] = useState<Firma | null>(null);
  /** Der zuletzt gespeicherte Stand, um Änderungen zu erkennen. */
  const [gespeichert, setGespeichert] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  /**
   * Die Logo-Bytes selbst, nicht nur ihre Länge — für die Vorschau. Vorher
   * stand hier nur „Logo hinterlegt (2160 KB)": ob das die richtige Datei ist
   * (oder ein falscher Screenshot), ließ sich erst auf dem fertigen Beleg sehen.
   */
  const [logoBytes, setLogoBytes] = useState<number[] | null>(null);
  // Zwei getrennte Stände, weil dieser Abschnitt Aktionen an zwei Stellen hat:
  // die Logo-Knöpfe mitten im Formular und den Speichern-Knopf am Fuß. Jede
  // Aktion meldet an ihrem eigenen Knopf — eine Meldung am Kopf des
  // Abschnitts wäre bei diesem langen Formular außerhalb des Bildes.
  const logo = useSpeichern();
  const { laeuft, rueckmeldung, ausfuehren } = useSpeichern();
  /**
   * Ob der Ansprechpartner dem Firmennamen folgt. Ja, solange er leer
   * gespeichert war oder dem Namen gleicht und niemand ihn angefasst hat;
   * sonst stünde nach einer Umfirmierung der alte Name als Ansprechpartner da.
   */
  const [kontaktFolgt, setKontaktFolgt] = useState(false);

  useUngespeichert(
    firma !== null && gespeichert !== null && JSON.stringify(firma) !== JSON.stringify(gespeichert),
  );

  useEffect(() => {
    api.firma
      .get()
      .then((f) => {
        // Ein leerer Ansprechpartner wird als echter Wert vorbelegt, nicht
        // als Platzhalter: Was im Feld steht, soll auch gespeichert werden.
        // Als „gespeichert" gilt der vorbelegte Stand, damit das bloße Öffnen
        // nicht als ungespeicherte Änderung zählt.
        const folgt = f.kontakt_name.trim() === "" || f.kontakt_name === f.name;
        const vorbelegt = f.kontakt_name.trim() === "" ? { ...f, kontakt_name: f.name } : f;
        setKontaktFolgt(folgt);
        setFirma(vorbelegt);
        setGespeichert(vorbelegt);
      })
      .catch((e) => setFehler(e as AppFehler));
    api.firma.logoGet().then((b) => setLogoBytes(b && b.length > 0 ? b : null)).catch(() => {});
  }, []);

  const logoGroesse = logoBytes?.length ?? null;
  const logoDataUrl =
    logoBytes && logoBytes.length > 0 ? `data:${logoMimetyp(logoBytes)};base64,${bytesZuBase64(logoBytes)}` : null;

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
      await logo.ausfuehren(async () => {
        await api.firma.logoSet(bytes);
        setLogoBytes(bytes);
      }, "Logo gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function logoEntfernen() {
    setFehler(null);
    try {
      // Ein leeres Feld entfernt das Logo — das Backend kennt keinen eigenen Befehl dafür.
      await logo.ausfuehren(async () => {
        await api.firma.logoSet([]);
        setLogoBytes(null);
      }, "Logo entfernt");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function speichern() {
    if (!firma) return;
    setFehler(null);
    try {
      await ausfuehren(async () => {
        const gespeicherteFirma = await api.firma.save(firma);
        setFirma(gespeicherteFirma);
        setGespeichert(gespeicherteFirma);
      }, "Firmendaten gespeichert");
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
    "fax",
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
    <section className="abschnitt" data-tour="firmendaten">
      <h2>Firmendaten</h2>
      <Fehler fehler={bannerFehler} />
      <form
        className="inhalt-schmal"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="gruppe">
          <div className="feld">
            <label>
              <PflichtMarker art="pflicht">Firmenname</PflichtMarker>
              <input
                required
                value={firma.name}
                onChange={(e) => {
                  const name = e.currentTarget.value;
                  setFirma({ ...firma, name, ...(kontaktFolgt ? { kontakt_name: name } : {}) });
                }}
              />
            </label>
            {feldFehler("name") && <div role="alert" className="feld-fehler">{feldFehler("name")}</div>}
          </div>
          <AdressFelder
            strasse={firma.strasse}
            plz={firma.plz}
            ort={firma.ort}
            land={firma.land}
            onAendern={(aenderung) => setFirma({ ...firma, ...aenderung })}
            feldFehler={feldFehler}
          />
          <div className="feld feld-schmal">
            <label>
              <PflichtMarker art="pflicht">Land</PflichtMarker>
              <input value={firma.land} onChange={(e) => setFirma({ ...firma, land: e.currentTarget.value })} />
            </label>
            {feldFehler("land") && <div role="alert" className="feld-fehler">{feldFehler("land")}</div>}
          </div>
        </div>
        <div className="gruppe">
          <div className="felder-reihe">
            <div className="feld">
              <label>
                <PflichtMarker art="pflicht">Steuernummer</PflichtMarker>
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
              <p className="feld-hinweis">
                Optional, wenn die Steuernummer angegeben ist. Vor allem für Geschäfte
                innerhalb der EU nötig (z. B. innergemeinschaftliche Lieferungen).
              </p>
              {feldFehler("ust_idnr") && <div role="alert" className="feld-fehler">{feldFehler("ust_idnr")}</div>}
            </div>
          </div>
          <IbanFeld
            iban={firma.iban}
            bic={firma.bic}
            onAendern={(aenderung) => setFirma({ ...firma, ...aenderung })}
            feldFehler={feldFehler}
          />
        </div>
        <div className="gruppe">
          <div className="felder-reihe">
            <div className="feld">
              <label>
                <PflichtMarker art="xrechnung">E-Mail</PflichtMarker>
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
                <PflichtMarker art="xrechnung">Telefon</PflichtMarker>
                <input
                  value={firma.telefon}
                  onChange={(e) => setFirma({ ...firma, telefon: e.currentTarget.value })}
                />
              </label>
              <p className="feld-hinweis">Pflichtangabe für den XRechnung-Export.</p>
              {feldFehler("telefon") && <div role="alert" className="feld-fehler">{feldFehler("telefon")}</div>}
            </div>
          </div>
          <div className="felder-reihe">
            <div className="feld">
              <label>
                Fax
                <input
                  value={firma.fax}
                  onChange={(e) => setFirma({ ...firma, fax: e.currentTarget.value })}
                />
              </label>
              <p className="feld-hinweis">Optional — nicht vorgeschrieben, manche Kunden verlangen sie trotzdem.</p>
              {feldFehler("fax") && <div role="alert" className="feld-fehler">{feldFehler("fax")}</div>}
            </div>
            <div className="feld">
              <label>
                Ansprechpartner
                <input
                  value={firma.kontakt_name}
                  onChange={(e) => {
                    // Auch Leeren zählt als eigene Entscheidung: Danach folgt
                    // das Feld dem Namen nicht wieder von selbst.
                    setKontaktFolgt(false);
                    setFirma({ ...firma, kontakt_name: e.currentTarget.value });
                  }}
                />
              </label>
              <p className="feld-hinweis">
                Vorbelegt mit dem Firmennamen. Bei Einzelunternehmen meist der eigene Name.
              </p>
              {feldFehler("kontakt_name") && <div role="alert" className="feld-fehler">{feldFehler("kontakt_name")}</div>}
            </div>
          </div>
        </div>
        <div className="gruppe">
          <div className="feld">
            <span className="feld-beschriftung">Logo</span>
            <p className="feld-hinweis">
              {logoGroesse === null
                ? "Kein Logo hinterlegt — die Rechnungen erscheinen ohne."
                : `Logo hinterlegt (${logoGroesse < 1024 ? `${logoGroesse} Bytes` : `${Math.round(logoGroesse / 1024)} KB`}).`}
            </p>
            {logoDataUrl && (
              // Ohne diese Vorschau ließ sich nur an der Dateigröße erahnen, ob
              // das gewählte Bild auch wirklich das gewünschte Logo ist — sicher
              // wusste man es erst auf dem fertigen Beleg.
              <img src={logoDataUrl} alt="Hinterlegtes Logo" className="logo-vorschau" />
            )}
            <div className="aktionen">
              <button type="button" className="btn" onClick={logoWaehlen}>
                {logoGroesse === null ? "Logo wählen" : "Logo ersetzen"}
              </button>
              {logoGroesse !== null && (
                <button type="button" className="btn btn-gefahr" onClick={logoEntfernen}>
                  Logo entfernen
                </button>
              )}
              {logo.rueckmeldung}
            </div>
          </div>
        </div>
        <div className="gruppe">
          <div className="feld feld-schmal">
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
          <label className="feld-checkbox">
            <input
              type="checkbox"
              checked={firma.kleinunternehmer}
              onChange={(e) => setFirma({ ...firma, kleinunternehmer: e.currentTarget.checked })}
            />
            Kleinunternehmer (§19 UStG)
          </label>
          <p className="feld-hinweis">
            Abgewählt gilt Regelbesteuerung: Neue Belege weisen die Umsatzsteuer aus
            (Satz je Artikel, Preise bleiben brutto). Bereits festgeschriebene Belege
            behalten ihren damaligen Steuermodus.
          </p>
        </div>
        <PflichtLegende zeigtXrechnung />
        <button type="button" className="feld-hinweis-link" onClick={zeigeXRechnungHilfe}>
          Was ist die XRechnung?
        </button>
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer" disabled={laeuft}>
            {laeuft ? "Speichert …" : "Speichern"}
          </button>
          {rueckmeldung}
        </div>
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
/** Schlüssel, unter dem der Zeitpunkt der letzten externen Sicherung steht. */
const SCHLUESSEL_ZULETZT_EXPORTIERT = "sicherung.zuletzt_exportiert";

function SicherungenAbschnitt() {
  const [sicherungen, setSicherungen] = useState<Sicherung[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  /** Gesetzt, sobald eine Wiederherstellung vorgemerkt ist. */
  const [neustartNoetig, setNeustartNoetig] = useState(false);
  /**
   * Zeitpunkt der letzten Sicherung "Speichern unter …", `null` wenn noch nie.
   *
   * Die automatischen Kopien liegen auf derselben Platte wie die Datenbank —
   * bei einem Plattendefekt sind sie mit weg. Ohne diesen Hinweis gerät leicht
   * in Vergessenheit, dass „automatisch gesichert" nicht „sicher gesichert"
   * heißt, und die letzte externe Kopie liegt unbemerkt Monate zurück.
   */
  const [zuletztExportiert, setZuletztExportiert] = useState<string | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  function laden() {
    api.sicherungen.liste().then(setSicherungen).catch((e) => setFehler(e as AppFehler));
    api.einstellungen.get(SCHLUESSEL_ZULETZT_EXPORTIERT).then(setZuletztExportiert).catch(() => {});
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

  /**
   * Spielt eine Sicherung zurück.
   *
   * Wirksam wird das erst beim nächsten Start: Die Datenbank ist im laufenden
   * Betrieb geöffnet, und sie unter der offenen Verbindung auszutauschen führt
   * zu einer beschädigten Datei.
   */
  async function wiederherstellen(s: Sicherung) {
    const text =
      `Den Stand von ${zeitpunkt(s.zeitstempel)} zurückspielen? ` +
      "Alles, was seitdem eingegeben wurde, verschwindet aus der Anwendung. " +
      "Der jetzige Stand wird vorher automatisch gesichert.";
    if (!(await bestaetigen(text, "Zurückspielen"))) return;
    setFehler(null);
    try {
      const ersetzt = await api.sicherungen.wiederherstellen(s.zeitstempel);
      setNeustartNoetig(true);
      // Es gibt nur eine Vormerkung — die letzte Entscheidung gewinnt. Ohne
      // diesen Hinweis geschähe das Ersetzen unsichtbar.
      if (ersetzt) zeigen("Ersetzt die zuvor vorgemerkte Wiederherstellung");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  /**
   * Legt eine Sicherung an einem selbst gewählten Ort ab — gebündelt mit dem
   * Belegarchiv (erzeugte PDFs, XRechnungen, ZUGFeRD-Dateien) in einer Zip.
   *
   * Die automatischen Kopien liegen neben der Datenbank, auf derselben Platte.
   * Bei einem Defekt sind sie mit weg — erst eine Kopie woandershin ist eine
   * Sicherung im eigentlichen Sinn. Und die Datenbank allein reicht dafür
   * nicht: Das Belegarchiv liegt als eigene Dateien daneben.
   */
  async function exportieren(s: Sicherung) {
    setFehler(null);
    try {
      const bytes = await api.sicherungen.exportieren(s.zeitstempel);
      const ziel = await save({
        defaultPath: `kleinunternehmer-${s.zeitstempel}.zip`,
        filters: [{ name: "Zip", extensions: ["zip"] }],
      });
      if (!ziel) return;
      await writeFile(ziel, new Uint8Array(bytes));
      // Merken, wann zuletzt exportiert wurde — nicht wo: Der Speicherort ist
      // frei gewählt und liegt oft außerhalb des Programmordners.
      const jetzt = new Date().toISOString();
      api.einstellungen.set(SCHLUESSEL_ZULETZT_EXPORTIERT, jetzt).catch(() => {});
      setZuletztExportiert(jetzt);
      zeigen("Sicherung gespeichert");
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  /**
   * Spielt eine exportierte Zip wieder ein — der Rückweg zu „Speichern unter".
   *
   * Genau im beworbenen Ernstfall (Platte defekt, neuer Rechner) musste man
   * die Zip bisher von Hand entpacken und die Dateien an die richtigen Pfade
   * legen, was nirgends erklärt war. Das Belegarchiv wird sofort übernommen
   * (Vorhandenes bleibt unangetastet), die Datenbank beim nächsten Start —
   * wie beim Zurückspielen einer internen Sicherung.
   */
  async function ausDateiEinspielen() {
    setFehler(null);
    const pfad = await open({ filters: [{ name: "Zip", extensions: ["zip"] }], multiple: false });
    if (typeof pfad !== "string") return;
    const text =
      "Die Sicherung aus dieser Datei einspielen? Die Datenbank daraus ersetzt beim " +
      "nächsten Start den jetzigen Stand; alles, was seitdem eingegeben wurde, " +
      "verschwindet aus der Anwendung. Der jetzige Stand wird vorher automatisch " +
      "gesichert. Belegdateien aus der Sicherung werden sofort übernommen, ohne " +
      "vorhandene zu überschreiben.";
    if (!(await bestaetigen(text, "Einspielen"))) return;
    try {
      const ergebnis = await api.sicherungen.ausDateiEinspielen(pfad);
      setNeustartNoetig(true);
      const teile = ["Sicherung eingespielt"];
      if (ergebnis.belege_neu > 0) teile.push(`${ergebnis.belege_neu} Belegdatei(en) übernommen`);
      // Es gibt nur eine Vormerkung — die letzte Entscheidung gewinnt. Ohne
      // diesen Hinweis geschähe das Ersetzen unsichtbar.
      if (ergebnis.vormerkung_ersetzt) teile.push("ersetzt die zuvor vorgemerkte Wiederherstellung");
      zeigen(teile.join(", "));
    } catch (e) {
      setFehler(e as AppFehler);
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
    <section className="abschnitt" data-tour="sicherungen">
      <h2>Sicherungen</h2>
      <Fehler fehler={fehler} />
      {hinweis}
      {dialog}
      <div className="inhalt-schmal">
        <p className="feld-hinweis">
          Bei jedem Programmstart wird die Datenbank kopiert, bevor Änderungen an ihrer
          Struktur vorgenommen werden. Die zehn jüngsten Kopien bleiben erhalten.
        </p>
        <p className="feld-hinweis">
          Diese Kopien liegen neben der Datenbank, also auf derselben Festplatte. Bei einem
          Defekt sind sie mit weg — sichere zusätzlich woandershin, etwa mit „Speichern
          unter". Die dabei entstehende Datei enthält auch das Belegarchiv (erzeugte PDFs,
          XRechnungen, ZUGFeRD-Dateien), nicht nur die Datenbank.
        </p>
        <p className="feld-hinweis">
          {zuletztExportiert
            ? `Zuletzt extern gesichert: ${zeitpunktDeutsch(zuletztExportiert)}.`
            : "Noch nie extern gesichert."}
        </p>
      </div>

      {neustartNoetig && (
        <div className="hinweis-karte" role="status">
          <h3>Die Wiederherstellung ist vorgemerkt</h3>
          <p>
            Sie wird beim nächsten Start eingespielt — die Datenbank ist gerade geöffnet und
            lässt sich im laufenden Betrieb nicht austauschen. Der jetzige Stand wird dabei
            zuerst gesichert.
          </p>
          <button type="button" className="btn btn-primaer" onClick={() => api.neuStarten()}>
            Jetzt neu starten
          </button>
        </div>
      )}
      <div className="aktionen aktionen-ueber-tabelle">
        <button type="button" className="btn" disabled={laeuft} onClick={jetztSichern}>
          Jetzt sichern
        </button>
        <button type="button" className="btn" disabled={laeuft} onClick={ausDateiEinspielen}>
          Aus Datei einspielen …
        </button>
      </div>
      {sicherungen.length === 0 ? (
        <p>Noch keine Sicherungen vorhanden.</p>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Größe</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sicherungen.map((s) => (
              <tr key={s.zeitstempel}>
                <td>{zeitpunkt(s.zeitstempel)}</td>
                <td>{Math.max(1, Math.round(s.groesse_bytes / 1024))} KB</td>
                <td className="aktionen">
                  <button type="button" className="btn" onClick={() => exportieren(s)}>
                    Speichern unter …
                  </button>
                  <button type="button" className="btn" onClick={() => wiederherstellen(s)}>
                    Zurückspielen
                  </button>
                </td>
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
    <section className="abschnitt">
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
              <td className="aktionen">
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
        className="inhalt-schmal"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="gruppe">
          <div className="felder-reihe felder-breit-schmal">
            <label className="feld">
              <PflichtMarker art="pflicht">Name</PflichtMarker>
              <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
            </label>
            <label className="feld">
              Kürzel
              <input value={kuerzel} onChange={(e) => setKuerzel(e.currentTarget.value)} />
            </label>
          </div>
        </div>
        <PflichtLegende />
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">
            {bearbeiteId ? "Aktualisieren" : "Hinzufügen"}
          </button>
        </div>
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
    <section className="abschnitt" data-tour="nummernkreise">
      <h2>Nummernkreise</h2>
      <Fehler fehler={fehler} />
      {hinweis}
      {nummernkreise.map((nk) => (
        /* Eine Zeile je Nummernkreis: Format, Rücksetzen, Zähler und
           Speichern nebeneinander. Vorher stand jeder Kreis in einer eigenen
           Karte mit vier Zeilen übereinander. */
        <form
          key={nk.art}
          className="gruppe inhalt-schmal nummernkreis"
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
          <p className="nummernkreis-zaehler">Aktueller Zähler: {nk.zaehler}</p>
          <button type="submit" className="btn">Speichern</button>
        </form>
      ))}
    </section>
  );
}

const TEXTBAUSTEIN_LABEL: Record<string, string> = {
  "text.kleinunternehmer": "Kleinunternehmer-Hinweis",
  // Je Belegart ein eigenes Paar. Ohne das landete beim Überführen eines
  // Angebots dessen Wortlaut in der Rechnung — samt „anbei erhalten Sie das
  // gewünschte Angebot".
  "text.angebot.kopf": "Angebots-Kopftext",
  "text.angebot.fuss": "Angebots-Fußtext",
  "text.rechnung.kopf": "Rechnungs-Kopftext",
  "text.rechnung.fuss": "Rechnungs-Fußtext",
  "text.gutschrift.kopf": "Gutschrift-Kopftext",
  "text.gutschrift.fuss": "Gutschrift-Fußtext",
  "text.zahlungserinnerung": "Zahlungserinnerungs-Text",
};

const TEXTBAUSTEIN_KEYS = Object.keys(TEXTBAUSTEIN_LABEL);

/** Schlüssel der Einstellung, mit der Vorgabe aus der Migration als Rückfall. */
const SCHLUESSEL_ANGEBOT_GUELTIGKEIT = "vorlage.angebot_gueltigkeit_tage";

/**
 * Wie viele Tage ein neu angelegtes Angebot gültig ist.
 *
 * Der Fußtext versprach bisher eine Frist ("Dieses Angebot ist 30 Tage
 * gültig"), ohne dass ein Datum dazu existierte. Dieser Wert ist die Vorgabe
 * dafür — änderbar hier, überschreibbar am einzelnen Angebot in dessen
 * Stammdaten.
 */
function AngeboteAbschnitt() {
  const [tage, setTage] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { laeuft, rueckmeldung, ausfuehren } = useSpeichern();

  useEffect(() => {
    api.einstellungen
      .get(SCHLUESSEL_ANGEBOT_GUELTIGKEIT)
      .then((wert) => setTage(wert ?? "30"))
      .catch((e) => setFehler(e as AppFehler));
  }, []);

  async function speichern() {
    setFehler(null);
    try {
      await ausfuehren(
        () => api.einstellungen.set(SCHLUESSEL_ANGEBOT_GUELTIGKEIT, tage),
        "Angebotsgültigkeit gespeichert",
      );
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section className="abschnitt">
      <h2>Angebote</h2>
      <Fehler fehler={fehler} />
      <form
        className="inhalt-schmal"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="gruppe">
          <label className="feld feld-schmal">
            Angebotsgültigkeit (Tage)
            <input
              type="number"
              min={0}
              value={tage}
              onChange={(e) => setTage(e.currentTarget.value)}
            />
          </label>
          <p className="feld-hinweis">
            Neu angelegte Angebote bekommen dieses Gültigkeitsdatum vorgeschlagen — am
            einzelnen Angebot lässt es sich jederzeit ändern.
          </p>
        </div>
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer" disabled={laeuft}>
            {laeuft ? "Speichert …" : "Speichern"}
          </button>
          {rueckmeldung}
        </div>
      </form>
    </section>
  );
}

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
    <section className="abschnitt" data-tour="textbausteine">
      <h2>Textbausteine</h2>
      <Fehler fehler={fehler} />
      {hinweis}
      {TEXTBAUSTEIN_KEYS.map((key) => (
        <form
          key={key}
          className="gruppe inhalt-schmal textbaustein"
          onSubmit={(e) => {
            e.preventDefault();
            speichern(key);
          }}
        >
          <label className="feld">
            {TEXTBAUSTEIN_LABEL[key]}
            <textarea value={werte[key] ?? ""} onChange={(e) => aendere(key, e.currentTarget.value)} />
          </label>
          <div className="aktionen aktionen-rechts">
            <button type="submit" className="btn">Speichern</button>
          </div>
        </form>
      ))}
    </section>
  );
}
