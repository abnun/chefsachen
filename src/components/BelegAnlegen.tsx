import { type AppFehler, type Kunde } from "../api";
import { Fehler } from "./Fehler";
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";

/**
 * Formular zum Anlegen eines Belegs: Kunde und Datum, sonst nichts.
 *
 * Stand wortgleich in `Angebote.tsx` und `Rechnungen.tsx`. Alles Weitere
 * — Positionen, Texte, Zahlungsziel — trägt der Belegeditor nach; hier geht
 * es nur darum, überhaupt einen Beleg zu bekommen, den man öffnen kann.
 */
interface BelegAnlegenProps {
  kunden: Kunde[];
  kundeId: string;
  onKundeId: (id: string) => void;
  datum: string;
  onDatum: (datum: string) => void;
  fehler: AppFehler | null;
  onAnlegen: () => void;
}

export function BelegAnlegen({
  kunden,
  kundeId,
  onKundeId,
  datum,
  onDatum,
  fehler,
  onAnlegen,
}: BelegAnlegenProps) {
  return (
    <form
      className="karte"
      onSubmit={(e) => {
        e.preventDefault();
        onAnlegen();
      }}
    >
      {fehler && <Fehler fehler={fehler} />}
      <label className="feld">
        Kunde
        <PflichtMarker art="pflicht" />
        <select value={kundeId} onChange={(e) => onKundeId(e.currentTarget.value)}>
          <option value="">– wählen –</option>
          {kunden.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      <label className="feld">
        Datum
        <input type="date" value={datum} onChange={(e) => onDatum(e.currentTarget.value)} />
      </label>
      <PflichtLegende />
      <button type="submit" className="btn btn-primaer">
        Anlegen
      </button>
    </form>
  );
}
