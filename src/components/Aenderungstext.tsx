import { Fragment, type ReactNode } from "react";

/**
 * Stellt den Änderungstext einer Veröffentlichung dar.
 *
 * Der Text stammt aus `docs/CHANGELOG.md` und wird beim Bauen in die
 * `latest.json` gelegt. Er ist Markdown — bisher stand er wörtlich im Dialog,
 * mit sichtbaren Sternchen und Bindestrichen, und die Zeilenumbrüche der
 * Quelldatei mitten im Satz.
 *
 * Absichtlich keine Markdown-Bibliothek: Wir erzeugen diesen Text selbst und
 * benutzen genau drei Dinge — fette Zwischenüberschriften, Aufzählungen und
 * Absätze. Ein vollständiger Darsteller brächte eine Abhängigkeit mit, die
 * beliebiges HTML erzeugen kann; das müsste dann über
 * `dangerouslySetInnerHTML` in die Seite, samt der Pflicht, es zu säubern.
 * Hier entstehen nur React-Knoten, und HTML im Text bleibt Text.
 *
 * Was nicht erkannt wird — Überschriften mit `#`, Verweise, Code —, erscheint
 * unverändert als Absatz. Lieber ein Sternchen zu viel als ein verschluckter
 * Satz.
 */
export function Aenderungstext({ text }: { text: string }) {
  return <div className="aenderungstext">{bloecke(text).map(darstellen)}</div>;
}

type Block =
  | { art: "ueberschrift"; text: string }
  | { art: "absatz"; text: string }
  | { art: "liste"; punkte: string[] };

/**
 * Zerlegt den Text in Blöcke.
 *
 * Der Zeilenumbruch der Quelldatei ist keine Absicht des Autors, sondern die
 * Zeilenbreite der Datei: Ein Aufzählungspunkt läuft dort über mehrere Zeilen,
 * eingerückt fortgesetzt. Solche Fortsetzungen gehören an den vorigen Punkt,
 * sonst zerfällt ein Satz in drei Zeilen.
 */
function bloecke(text: string): Block[] {
  const ergebnis: Block[] = [];
  let absatz: string[] = [];

  function absatzAbschliessen() {
    if (absatz.length > 0) {
      ergebnis.push({ art: "absatz", text: absatz.join(" ") });
      absatz = [];
    }
  }

  for (const zeile of text.split("\n")) {
    const inhalt = zeile.trim();
    const letzter = ergebnis[ergebnis.length - 1];
    const inListe = letzter?.art === "liste" && absatz.length === 0;

    if (inhalt === "") {
      absatzAbschliessen();
      // Eine Leerzeile beendet auch die Aufzählung: Was danach kommt, ist ein
      // neuer Block, selbst wenn es wieder eine Aufzählung ist.
      if (letzter?.art === "liste") ergebnis.push({ art: "absatz", text: "" });
      continue;
    }

    if (inhalt.startsWith("- ")) {
      absatzAbschliessen();
      const punkt = inhalt.slice(2);
      if (inListe) letzter.punkte.push(punkt);
      else ergebnis.push({ art: "liste", punkte: [punkt] });
      continue;
    }

    // Eingerückte Fortsetzung eines Aufzählungspunkts.
    if (inListe && zeile.startsWith("  ")) {
      letzter.punkte[letzter.punkte.length - 1] += ` ${inhalt}`;
      continue;
    }

    if (inhalt.startsWith("**") && inhalt.endsWith("**") && inhalt.length > 4) {
      absatzAbschliessen();
      ergebnis.push({ art: "ueberschrift", text: inhalt.slice(2, -2) });
      continue;
    }

    absatz.push(inhalt);
  }

  absatzAbschliessen();
  // Die Trenner von oben sind nur Hilfsmittel gewesen.
  return ergebnis.filter((b) => b.art !== "absatz" || b.text !== "");
}

function darstellen(block: Block, i: number): ReactNode {
  switch (block.art) {
    case "ueberschrift":
      return <h3 key={i}>{block.text}</h3>;
    case "liste":
      return (
        <ul key={i}>
          {block.punkte.map((p, j) => (
            <li key={j}>{fett(p)}</li>
          ))}
        </ul>
      );
    case "absatz":
      return <p key={i}>{fett(block.text)}</p>;
  }
}

/**
 * Hebt `**so ausgezeichnete**` Stellen hervor.
 *
 * Die Teile mit ungerader Nummer liegen zwischen zwei Sternchenpaaren. Bleibt
 * ein Paar unvollständig, ist die Anzahl gerade und der Rest bleibt Text —
 * besser als ein Satz, der ab der Hälfte fett weiterläuft.
 */
function fett(text: string): ReactNode {
  const teile = text.split("**");
  if (teile.length % 2 === 0) return text;
  return teile.map((teil, i) => (
    <Fragment key={i}>{i % 2 === 1 ? <strong>{teil}</strong> : teil}</Fragment>
  ));
}
