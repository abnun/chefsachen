import { useEffect, useState } from "react";
import { api, type AppFehler } from "../api";
import { Fehler } from "./Fehler";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";

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
}

const SCHALTER: Schalter[] = [
  {
    schluessel: "vorlage.logo_position",
    label: "Logo",
    art: "auswahl",
    optionen: [
      ["links", "Oben links"],
      ["rechts", "Oben rechts, neben der Anschrift"],
      ["keins", "Kein Logo"],
    ],
  },
  { schluessel: "vorlage.logo_hoehe_mm", label: "Logohöhe", art: "zahl", einheit: "mm", min: 5, max: 50 },
  {
    schluessel: "vorlage.absenderzeile",
    label: "Absenderzeile über der Anschrift",
    hinweis:
      "Kleingedruckt im Umschlagfenster, nach DIN 5008. Weist den Absender aus, wenn die Sendung nicht zustellbar ist.",
    art: "ja_nein",
  },
  { schluessel: "vorlage.akzentfarbe", label: "Akzentfarbe", art: "farbe" },
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
  },
  { schluessel: "vorlage.rand_oben_mm", label: "Rand oben", art: "zahl", einheit: "mm", min: 20, max: 40 },
  { schluessel: "vorlage.rand_unten_mm", label: "Rand unten", art: "zahl", einheit: "mm", min: 25, max: 40 },
  { schluessel: "vorlage.rand_seitlich_mm", label: "Rand seitlich", art: "zahl", einheit: "mm", min: 15, max: 30 },
];

const SCHLUESSEL = SCHALTER.map((s) => s.schluessel);

export function Belegvorlage() {
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [geladen, setGeladen] = useState(false);
  const [svgs, setSvgs] = useState<string[] | null>(null);
  const [seite, setSeite] = useState(0);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

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
      await Promise.all(
        SCHLUESSEL.map((k) => api.einstellungen.set(k, werte[k] ?? "")),
      );
      zeigen("Belegvorlage gespeichert");
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
      {hinweis}
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
          {SCHALTER.map((s) =>
            s.art === "ja_nein" ? (
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
                    <input
                      type="number"
                      min={s.min}
                      max={s.max}
                      value={werte[s.schluessel] ?? ""}
                      placeholder={`${s.min}–${s.max} ${s.einheit}`}
                      onChange={(e) => aendere(s.schluessel, e.currentTarget.value)}
                    />
                  )}
                  {s.art === "farbe" && (
                    <input
                      type="color"
                      value={werte[s.schluessel] || "#1a1a1a"}
                      onChange={(e) => aendere(s.schluessel, e.currentTarget.value)}
                    />
                  )}
                </label>
                {s.hinweis && <p className="feld-hinweis">{s.hinweis}</p>}
              </div>
            ),
          )}

          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">
              Speichern
            </button>
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
