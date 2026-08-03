import { useEffect, useState } from "react";
import { api } from "../api";

/** Wohin die Kachel schicken kann. */
export type Schritt = "kunde" | "artikel" | "beleg";

interface ErsteSchritteProps {
  /** Ob schon ein Angebot oder eine Rechnung angelegt wurde. */
  hatBelege: boolean;
  onStarten: (schritt: Schritt) => void;
}

interface Stand {
  kunden: boolean;
  artikel: boolean;
}

/**
 * „Erste Schritte" auf der Übersicht: was schon steht und was als Nächstes dran ist.
 *
 * Der Einrichtungsassistent endet nach den Firmendaten und lässt einen dann
 * allein — wer sich dort für „erst einen Kunden anlegen" entscheidet, steht
 * danach ohne weiteren Hinweis in der Anwendung. Bis zur ersten Rechnung fehlen
 * aber noch zwei Schritte, und in welcher Reihenfolge sie nötig sind, sieht man
 * der Oberfläche nicht an.
 *
 * Bewusst eine Kachel auf der Übersicht und keine Verlängerung des Assistenten:
 * Der Assistent zwingt in eine Reihenfolge und lässt sich nicht verlassen. Diese
 * Kachel wartet, sie wird nicht ungeduldig, und wer ohne sie zurechtkommt,
 * scrollt daran vorbei. Sobald alle drei Schritte stehen, verschwindet sie von
 * selbst und kommt nicht wieder.
 */
export function ErsteSchritte({ hatBelege, onStarten }: ErsteSchritteProps) {
  const [stand, setStand] = useState<Stand | null>(null);

  useEffect(() => {
    Promise.all([api.kunden.list(), api.artikel.list()])
      .then(([kunden, artikel]) =>
        setStand({ kunden: kunden.length > 0, artikel: artikel.length > 0 }),
      )
      // Schlägt das fehl, ist die Kachel das kleinste Problem — die Übersicht
      // meldet denselben Fehler bereits an prominenterer Stelle.
      .catch(() => setStand(null));
  }, []);

  if (!stand) return null;
  if (stand.kunden && stand.artikel && hatBelege) return null;

  const schritte = [
    {
      schluessel: "firma" as const,
      titel: "Firmendaten hinterlegt",
      text: "Steht — Anschrift, Steuernummer und Bankverbindung erscheinen auf jeder Rechnung.",
      erledigt: true,
      knopf: null,
    },
    {
      schluessel: "kunde" as const,
      titel: "Ersten Kunden anlegen",
      text: "Ohne Kunden lässt sich kein Angebot und keine Rechnung schreiben.",
      erledigt: stand.kunden,
      knopf: "Kunden anlegen",
    },
    {
      schluessel: "artikel" as const,
      titel: "Ersten Artikel anlegen",
      text: "Leistungen und Waren, die auf einen Beleg kommen — mit Preis und Einheit.",
      erledigt: stand.artikel,
      knopf: "Artikel anlegen",
    },
    {
      schluessel: "beleg" as const,
      titel: "Erstes Angebot oder erste Rechnung",
      text: "Jetzt kann es losgehen. Ein Angebot lässt sich später in eine Rechnung überführen.",
      erledigt: hatBelege,
      knopf: "Angebot schreiben",
    },
  ];

  // Nur der erste offene Schritt bekommt einen Knopf. Vier Knöpfe nebeneinander
  // wären wieder eine Auswahl statt eines Weges — und zwei davon führten ins
  // Leere, weil ein Beleg ohne Kunde und Artikel gar nicht geht.
  const naechster = schritte.find((s) => !s.erledigt);
  const offen = schritte.filter((s) => !s.erledigt).length;

  return (
    <section className="karte erste-schritte" aria-labelledby="erste-schritte">
      <h2 id="erste-schritte">Erste Schritte</h2>
      <p className="feld-hinweis">
        Noch {offen} {offen === 1 ? "Schritt" : "Schritte"} bis zur ersten Rechnung. Danach
        verschwindet diese Kachel.
      </p>

      <ol className="schritt-liste">
        {schritte.map((s) => (
          <li key={s.schluessel} className={s.erledigt ? "schritt erledigt" : "schritt"}>
            <span className="schritt-marke" aria-hidden="true">
              {s.erledigt ? "✓" : "○"}
            </span>
            <div className="schritt-text">
              <strong>
                {s.titel}
                {/* Für Screenreader, denen das Häkchen nichts sagt. */}
                <span className="nur-vorlesen">{s.erledigt ? " — erledigt" : " — offen"}</span>
              </strong>
              <span className="feld-hinweis">{s.text}</span>
            </div>
            {s === naechster && s.knopf && (
              <button
                type="button"
                className="btn btn-primaer"
                onClick={() => onStarten(s.schluessel as Schritt)}
              >
                {s.knopf}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
