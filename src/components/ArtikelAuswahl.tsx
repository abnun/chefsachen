import { useId, useMemo, useState } from "react";
import { type Artikel } from "../api";
import { formatCent } from "../geld";

/**
 * Artikelauswahl mit Tipphilfe.
 *
 * Vorher ein `<select>` mit allen Artikeln. Das trägt bei einer Handvoll
 * Einträgen; ab etwa fünfzig ist Scrollen durch eine alphabetische Liste
 * mühsamer als Tippen, und der Preis ist dabei nirgends zu sehen.
 *
 * Umgesetzt mit `<datalist>` statt einer selbstgebauten Vorschlagsliste: Die
 * Tastaturbedienung, das Blättern durch die Vorschläge und die Ankündigung
 * gegenüber Screenreadern bringt der Browser mit. Eine eigene Umsetzung müsste
 * das alles nachbauen — und tut es erfahrungsgemäß schlechter.
 */
interface ArtikelAuswahlProps {
  artikelListe: Artikel[];
  artikelId: string;
  onArtikelId: (id: string) => void;
}

export function ArtikelAuswahl({ artikelListe, artikelId, onArtikelId }: ArtikelAuswahlProps) {
  const listenId = useId();
  const [text, setText] = useState("");

  /**
   * Die Anzeige führt die Artikelnummer mit, weil Bezeichnungen sich
   * wiederholen dürfen — „Beratung" kann es mehrfach geben, die Nummer nicht.
   */
  const beschriftung = useMemo(() => {
    const zaehler = new Map<string, number>();
    for (const a of artikelListe) {
      zaehler.set(a.bezeichnung, (zaehler.get(a.bezeichnung) ?? 0) + 1);
    }
    return (a: Artikel) =>
      (zaehler.get(a.bezeichnung) ?? 0) > 1 ? `${a.bezeichnung} (${a.artikelnummer})` : a.bezeichnung;
  }, [artikelListe]);

  const gewaehlt = artikelListe.find((a) => a.id === artikelId);
  const anzeige = gewaehlt ? beschriftung(gewaehlt) : text;

  function uebernehmen(eingabe: string) {
    setText(eingabe);
    // Erst wenn die Eingabe genau einer Beschriftung entspricht, steht die
    // Wahl fest. Auf Teiltreffer zu raten hieße, dem Nutzer einen Artikel
    // unterzuschieben, den er nicht gemeint hat.
    const treffer = artikelListe.find((a) => beschriftung(a) === eingabe);
    onArtikelId(treffer?.id ?? "");
  }

  return (
    <>
      <label className="feld">
        Artikel
        <input
          list={listenId}
          value={anzeige}
          onChange={(e) => uebernehmen(e.currentTarget.value)}
          placeholder="tippen oder auswählen"
        />
      </label>
      <datalist id={listenId}>
        {artikelListe.map((a) => (
          <option key={a.id} value={beschriftung(a)}>
            {formatCent(a.standardpreis_cent)}
          </option>
        ))}
      </datalist>
    </>
  );
}
