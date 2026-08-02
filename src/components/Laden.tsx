import { useEffect, useState } from "react";

/**
 * Hinweis, dass gerade Daten abgerufen werden.
 *
 * Bisher gab es dafür nichts: Seiten gaben während des Abrufs `null` zurück
 * oder zeigten ihre leere Liste. Ein weißer Bereich ist für den Nutzer aber
 * nicht von einem kaputten Programm zu unterscheiden, und „Noch keine
 * Rechnungen" ist schlicht falsch, solange die Antwort noch aussteht.
 *
 * Der Hinweis erscheint bewusst verzögert. Die Datenbank liegt auf derselben
 * Festplatte, die allermeisten Abrufe sind in wenigen Millisekunden zurück —
 * ein sofort eingeblendeter Hinweis würde nur aufblitzen. Unruhe ist schlimmer
 * als eine kurze Leere.
 */
interface LadenProps {
  /** Was geladen wird, im Plural: „Rechnungen", „Kunden". */
  was?: string;
  /** Wartezeit in Millisekunden, bevor der Hinweis erscheint. */
  verzoegerungMs?: number;
}

export function Laden({ was, verzoegerungMs = 150 }: LadenProps) {
  const [sichtbar, setSichtbar] = useState(false);

  useEffect(() => {
    const zeitgeber = setTimeout(() => setSichtbar(true), verzoegerungMs);
    return () => clearTimeout(zeitgeber);
  }, [verzoegerungMs]);

  if (!sichtbar) return null;

  return (
    <p className="laden" role="status">
      {was ? `${was} werden geladen …` : "Wird geladen …"}
    </p>
  );
}
