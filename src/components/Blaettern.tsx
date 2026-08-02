/**
 * Seitenweises Blättern durch eine lange Liste.
 *
 * Zeigt sich nur, wenn es mehr als eine Seite gibt — bei den zwölf Rechnungen
 * eines typischen Jahres wäre eine Blätterleiste unter jeder Tabelle nur
 * Beiwerk.
 */
interface BlaetternProps {
  seite: number;
  seitenAnzahl: number;
  gesamt: number;
  onSeite: (seite: number) => void;
}

export function Blaettern({ seite, seitenAnzahl, gesamt, onSeite }: BlaetternProps) {
  if (seitenAnzahl <= 1) return null;

  return (
    <nav className="blaettern" aria-label="Seiten">
      <button type="button" className="btn" disabled={seite === 1} onClick={() => onSeite(seite - 1)}>
        ← Zurück
      </button>
      <span aria-live="polite">
        Seite {seite} von {seitenAnzahl} ({gesamt} Einträge)
      </span>
      <button
        type="button"
        className="btn"
        disabled={seite === seitenAnzahl}
        onClick={() => onSeite(seite + 1)}
      >
        Weiter →
      </button>
    </nav>
  );
}
