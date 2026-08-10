import { useEffect, useState } from "react";
import { api, type AppFehler } from "../api";
import { Fehler } from "./Fehler";
import { useSpeichern } from "../hooks/useSpeichern";

/**
 * Aussehen von Angebot und Rechnung einstellen, mit Vorschau daneben.
 *
 * Bewusst eine feste Menge von Stellschrauben statt einer frei bearbeitbaren
 * Vorlage. Die PDF ist hier kein reines Layout-Erzeugnis: Sie muss PDF/A-3b
 * sein und die ZUGFeRD-XML als Anhang tragen, das Anschriftfeld muss nach
 * DIN 5008 im Sichtfenster liegen, und die Pflichtangaben nach § 14 UStG
 * müssen darauf stehen. Eine freie Vorlage kann das alles verlieren, ohne dass
 * es auffällt — bis der Empfänger die Rechnung zurückweist.
 *
 * Die Vorschau zeigt einen erfundenen Beleg mit den echten Firmendaten und dem
 * echten Logo. Sie geht durch dieselbe Vorlage wie der spätere Export; eine
 * eigene Vorschau-Darstellung wäre der bequeme Weg und in diesem Projekt schon
 * dreimal schiefgegangen — die Kopien liefen auseinander.
 */

interface Schalter {
  schluessel: string;
  label: string;
  hinweis?: string;
  art: "auswahl" | "ja_nein" | "zahl" | "farbe";
  optionen?: [string, string][];
  einheit?: string;
  min?: number;
  max?: number;
  /**
   * Der Wert, den das Backend nimmt, wenn nichts gespeichert ist — muss mit
   * `Default for Vorlage` in `dokument/vorlage.rs` übereinstimmen. Ein leeres
   * Feld bedeutet hier nicht „nichts", sondern „Vorgabe"; ohne diese Angabe
   * sah man nirgends, was das konkret heißt.
   */
  standard?: string;
}

const SCHALTER: Schalter[] = [
  {
    schluessel: "vorlage.logo_position",
    label: "Logo",
    art: "auswahl",
    optionen: [
      ["links", "Oben links"],
      ["rechts", "Oben rechts"],
      ["keins", "Kein Logo"],
    ],
  },
  { schluessel: "vorlage.logo_hoehe_mm", label: "Logohöhe", art: "zahl", einheit: "mm", min: 5, max: 50, standard: "15" },
  {
    schluessel: "vorlage.absenderzeile",
    label: "Absenderzeile über der Anschrift",
    hinweis:
      "Kleingedruckt im Umschlagfenster, nach DIN 5008. Weist den Absender aus, wenn die Sendung nicht zustellbar ist.",
    art: "ja_nein",
  },
  { schluessel: "vorlage.akzentfarbe", label: "Akzentfarbe", art: "farbe", standard: "#1a1a1a" },
  {
    schluessel: "vorlage.akzent_verwendung",
    label: "Akzentfarbe verwenden für",
    hinweis:
      "Nur für Linien gefärbt, darf die Farbe beliebig hell sein. Färbt sie die Überschrift mit, " +
      "muss sie dunkel genug bleiben, um auf Papier lesbar zu sein.",
    art: "auswahl",
    optionen: [
      ["beides", "Linien und Überschrift"],
      ["linien", "Nur Linien"],
      ["ueberschrift", "Nur Überschrift"],
    ],
    standard: "beides",
  },
  { schluessel: "vorlage.spalte_nummer", label: "Spalte „Pos.“", art: "ja_nein" },
  {
    schluessel: "vorlage.einheit_eigene_spalte",
    label: "Einheit als eigene Spalte",
    hinweis: "Sonst steht sie hinter der Menge.",
    art: "ja_nein",
  },
  { schluessel: "vorlage.spalte_einzelpreis", label: "Spalte „Einzelpreis“", art: "ja_nein" },
  {
    schluessel: "vorlage.tabelle_gitterlinien",
    label: "Volle Gitterlinien um jede Zelle der Positionstabelle",
    hinweis:
      "Sonst nur eine schlanke Linie unter Kopf- und Positionszeilen. Bei vielen Positionen hilft das " +
      "volle Gitter dem Auge beim Zeilen-Halten.",
    art: "ja_nein",
  },
  {
    schluessel: "vorlage.zeigt_girocode",
    label: "Girocode (QR-Zahlungscode) auf Rechnungen anzeigen",
    hinweis:
      "Ermöglicht dem Empfänger, per Smartphone-Kamera zu bezahlen, ohne IBAN abzutippen. " +
      "Erscheint nur auf Rechnungen und Zahlungserinnerungen, sofern eine IBAN hinterlegt ist.",
    art: "ja_nein",
  },
  {
    schluessel: "vorlage.girocode_groesse_mm",
    label: "Girocode-Größe",
    hinweis: "Wer viel Fließtext vor dem Girocode hat, gewinnt mit einem kleineren Code etwas Platz.",
    art: "zahl",
    einheit: "mm",
    min: 20,
    max: 32,
    standard: "28",
  },
  { schluessel: "vorlage.rand_oben_mm", label: "Rand oben", art: "zahl", einheit: "mm", min: 20, max: 40, standard: "25" },
  { schluessel: "vorlage.rand_unten_mm", label: "Rand unten", art: "zahl", einheit: "mm", min: 25, max: 40, standard: "25" },
  { schluessel: "vorlage.rand_seitlich_mm", label: "Rand seitlich", art: "zahl", einheit: "mm", min: 15, max: 30, standard: "25" },
  {
    schluessel: "vorlage.falzmarken",
    label: "Falz- und Lochmarken",
    hinweis:
      "Kurze Markierungen am linken Rand für das Falten in einen Fensterumschlag " +
      "und das Lochen für den Ordner (DIN 5008). Erscheinen auf jeder Seite.",
    art: "ja_nein",
  },
];

const SCHLUESSEL = SCHALTER.map((s) => s.schluessel);

/**
 * Vorschläge für die Akzentfarbe. Alle liegen auf weißem Papier über 8:1 und
 * bleiben damit auch als Überschrift lesbar; ausgesucht sind sie als
 * Geschäftspost-Töne, nicht als Bildschirmfarben.
 */
const FARB_VORSCHLAEGE: [string, string][] = [
  ["#1a1a1a", "Anthrazit"],
  ["#1f4e79", "Tiefblau"],
  ["#1e5b3a", "Tannengrün"],
  ["#7a2530", "Bordeaux"],
  ["#5c4327", "Sepia"],
  ["#41485a", "Schiefer"],
];

/** Relative Helligkeit nach WCAG 2.1. */
function helligkeit(hex: string): number {
  const h = hex.replace("#", "");
  const kanal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
}

/**
 * Kontrast der Farbe gegen weißes Papier. Weiß hat die Helligkeit 1, daher
 * verkürzt sich die WCAG-Formel zu 1,05 geteilt durch den Rest.
 */
export function kontrastAufWeiss(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 21;
  return 1.05 / (helligkeit(hex) + 0.05);
}

/**
 * Farbvorschläge, Vorgabe-Angabe und eine Warnung bei zu heller Wahl.
 *
 * Die Akzentfarbe färbt nicht nur die Linien der Positionstabelle, sondern
 * auch die Überschrift des Belegs (`#show heading` in `rechnung.typ`). Ein
 * helles Türkis kommt dort auf 1,6:1 und ist gedruckt kaum zu entziffern —
 * am Bildschirm sieht man das der Vorschau nur an, wenn man weiß, worauf man
 * achten muss. Der freie Farbwähler bleibt; er sagt jetzt nur dazu, wann die
 * Wahl auf Papier nicht mehr trägt.
 */
function FarbHilfe({
  wert,
  standard,
  faerbtText,
  onWaehlen,
}: {
  wert: string;
  standard: string;
  /** Ob die Farbe gerade Text färbt — nur dann zählt der Kontrast. */
  faerbtText: boolean;
  onWaehlen: (farbe: string) => void;
}) {
  const kontrast = kontrastAufWeiss(wert);
  return (
    <>
      <div className="farb-vorschlaege">
        {FARB_VORSCHLAEGE.map(([farbe, name]) => {
          const gewaehlt = farbe.toLowerCase() === wert.toLowerCase();
          return (
            <button
              key={farbe}
              type="button"
              className={gewaehlt ? "farb-tupfer gewaehlt" : "farb-tupfer"}
              style={{ backgroundColor: farbe }}
              aria-label={`Akzentfarbe ${name}`}
              aria-pressed={gewaehlt}
              onClick={() => onWaehlen(farbe)}
            />
          );
        })}
      </div>
      <p className="feld-hinweis">Vorgabe {standard} (Anthrazit).</p>
      {/* Der Kontrast zählt nur, solange die Farbe Text färbt. Als reine
          Linienfarbe darf sie beliebig hell sein — eine Warnung wäre dort
          falsch und würde nach kurzer Zeit ohnehin überlesen. */}
      {faerbtText && kontrast < 4.5 && (
        <p className="feld-warnung" role="status">
          Auf weißem Papier schwer zu lesen: Kontrast {kontrast.toFixed(1)}:1, empfohlen ab 4,5:1.
          Die Überschrift des Belegs wird damit blass. Entweder eine dunklere Farbe wählen oder
          unten „Nur Linien“ einstellen.
        </p>
      )}
    </>
  );
}

export function Belegvorlage() {
  const [werte, setWerte] = useState<Record<string, string>>({});

  // Größte Logohöhe, die beim aktuellen oberen Rand noch Sicherheitsabstand
  // zum DIN-5008-Anschriftfenster lässt (das bei „Oben links"/„Oben rechts"
  // im Textfluss direkt über der Firmenanschrift steht) — muss mit
  // logo_hoehe_max_mm in dokument/vorlage.rs übereinstimmen. Rein
  // clientseitiges Feedback; die Begrenzung selbst erzwingt das Backend.
  const randObenMm = Number(werte["vorlage.rand_oben_mm"] ?? "25") || 25;
  const logoHoeheMaxMm = Math.max(45 - randObenMm - 5, 5);
  const logoHoeheStandardMm = Math.min(15, logoHoeheMaxMm);
  const [geladen, setGeladen] = useState(false);
  const [svgs, setSvgs] = useState<string[] | null>(null);
  const [seite, setSeite] = useState(0);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { laeuft, rueckmeldung, ausfuehren } = useSpeichern();

  useEffect(() => {
    api.einstellungen
      .list()
      .then((liste) => {
        const gefunden: Record<string, string> = {};
        for (const [k, v] of liste) {
          if (SCHLUESSEL.includes(k)) gefunden[k] = v;
        }
        setWerte(gefunden);
      })
      .catch((e) => setFehler(e as AppFehler))
      .finally(() => setGeladen(true));
  }, []);

  // Die Vorschau folgt den Werten im Formular, nicht dem Gespeicherten.
  useEffect(() => {
    if (!geladen) return;
    let abgebaut = false;
    api.vorlage
      .vorschau(Object.entries(werte))
      .then((s) => {
        if (abgebaut) return;
        setSvgs(s);
        // Eine geänderte Einstellung kann die Seitenzahl verkleinern — ohne
        // diese Zeile zeigte ein Blättern-Index, der die neue Vorschau gar
        // nicht mehr hat, eine leere Seite.
        setSeite((bisher) => Math.min(bisher, s.length - 1));
      })
      .catch((e) => {
        if (!abgebaut) setFehler(e as AppFehler);
      });
    return () => {
      abgebaut = true;
    };
  }, [werte, geladen]);

  function aendere(schluessel: string, wert: string) {
    setWerte((bisher) => ({ ...bisher, [schluessel]: wert }));
  }

  async function speichern() {
    setFehler(null);
    try {
      await ausfuehren(
        () => Promise.all(SCHLUESSEL.map((k) => api.einstellungen.set(k, werte[k] ?? ""))),
        "Belegvorlage gespeichert",
      );
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  /** Schalter, deren Vorgabe „nein" ist — alle anderen starten bei „ja". */
  const VORGABE_NEIN = ["vorlage.einheit_eigene_spalte", "vorlage.tabelle_gitterlinien"];

  /** Vorgabe, solange nichts gespeichert ist — wie im Rust-Teil (`Vorlage::default()`). */
  function istJa(schluessel: string): boolean {
    const wert = werte[schluessel];
    if (wert === "ja") return true;
    if (wert === "nein") return false;
    return !VORGABE_NEIN.includes(schluessel);
  }

  return (
    <section className="karte" data-tour="belegvorlage">
      <h2>Belegvorlage</h2>
      <Fehler fehler={fehler} />
      <p className="feld-hinweis hinweis-absatz">
        Gilt für Angebote und Rechnungen. Nicht einstellbar sind die Lage des Anschriftfelds
        (DIN 5008 — sonst liegt die Anschrift nicht im Umschlagfenster) sowie die Spalten
        „Bezeichnung“ und „Menge“: Beide sind Pflichtangaben nach § 14 Abs. 4 Nr. 5 UStG.
      </p>

      <div className="vorlage-layout">
        <form
          className="vorlage-schalter"
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          {SCHALTER.map((s) => {
            const istLogoHoehe = s.schluessel === "vorlage.logo_hoehe_mm";
            const effektiverMax = istLogoHoehe ? logoHoeheMaxMm : s.max;
            const effektiverStandard = istLogoHoehe ? String(logoHoeheStandardMm) : s.standard;

            return s.art === "ja_nein" ? (
              <div key={s.schluessel}>
                <label className="feld-checkbox">
                  <input
                    type="checkbox"
                    checked={istJa(s.schluessel)}
                    onChange={(e) => aendere(s.schluessel, e.currentTarget.checked ? "ja" : "nein")}
                  />
                  {s.label}
                </label>
                {s.hinweis && <p className="feld-hinweis">{s.hinweis}</p>}
              </div>
            ) : (
              <div key={s.schluessel}>
                <label className="feld">
                  {s.label}
                  {s.art === "auswahl" && (
                    <select
                      value={werte[s.schluessel] ?? s.optionen![0][0]}
                      onChange={(e) => aendere(s.schluessel, e.currentTarget.value)}
                    >
                      {s.optionen!.map(([wert, text]) => (
                        <option key={wert} value={wert}>
                          {text}
                        </option>
                      ))}
                    </select>
                  )}
                  {s.art === "zahl" && (
                    /* Der Platzhalter zeigt die Vorgabe, nicht den erlaubten
                       Bereich: Ein leeres Feld heißt „Vorgabe", und genau die
                       stand vorher nirgends. Der Bereich steht im Hinweis. */
                    <input
                      type="number"
                      min={s.min}
                      max={effektiverMax}
                      value={werte[s.schluessel] ?? ""}
                      placeholder={effektiverStandard}
                      onChange={(e) => aendere(s.schluessel, e.currentTarget.value)}
                    />
                  )}
                  {s.art === "farbe" && (
                    <input
                      type="color"
                      value={werte[s.schluessel] || s.standard}
                      onChange={(e) => aendere(s.schluessel, e.currentTarget.value)}
                    />
                  )}
                </label>
                {s.art === "farbe" && (
                  <FarbHilfe
                    wert={werte[s.schluessel] || s.standard!}
                    standard={s.standard!}
                    faerbtText={
                      (werte["vorlage.akzent_verwendung"] ?? "beides") !== "linien"
                    }
                    onWaehlen={(farbe) => aendere(s.schluessel, farbe)}
                  />
                )}
                {s.art === "zahl" && (
                  <p className="feld-hinweis">
                    Vorgabe {effektiverStandard} {s.einheit}, möglich {s.min}–{effektiverMax} {s.einheit}.
                    {s.hinweis ? ` ${s.hinweis}` : ""}
                  </p>
                )}
                {s.hinweis && s.art !== "zahl" && <p className="feld-hinweis">{s.hinweis}</p>}
              </div>
            );
          })}

          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer" disabled={laeuft}>
              {laeuft ? "Speichert …" : "Speichern"}
            </button>
            {rueckmeldung}
          </div>
        </form>

        <div className="vorlage-vorschau">
          <p className="feld-hinweis">Vorschau mit erfundenen Beleg­daten:</p>
          {svgs === null ? (
            <p className="feld-hinweis">Wird erstellt …</p>
          ) : (
            <>
              <img
                /* Als Bild und nicht als eingebettetes Dokument: Die
                   Inhaltsrichtlinie verbietet `object`/`embed` und fremde
                   Rahmenquellen, erlaubt aber `data:`-Bilder. Skripte in einem
                   SVG laufen in einem <img> ohnehin nicht. */
                src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgs[seite])))}`}
                alt={`Vorschau der Belegvorlage, Seite ${seite + 1} von ${svgs.length}`}
              />
              {svgs.length > 1 && (
                <div className="vorlage-vorschau-blaettern">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSeite((s) => s - 1)}
                    disabled={seite === 0}
                  >
                    ← Zurück
                  </button>
                  <span>
                    Seite {seite + 1} von {svgs.length}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSeite((s) => s + 1)}
                    disabled={seite === svgs.length - 1}
                  >
                    Vor →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
