import { fehlerProtokollieren } from "./protokoll";

/**
 * Lädt etwas beim ersten Bedarf und merkt sich das Ergebnis, etwa die
 * mitgelieferten PLZ- und BLZ-Listen.
 *
 * Gemerkt wird nur ein Erfolg. Schlägt das Laden fehl, versucht es der
 * nächste Aufruf erneut; sonst galte ein einmaliger Fehler, etwa ein
 * abgebrochenes Nachladen des Bündelteils, bis zum Neustart, und kein
 * Formular bekäme je wieder Vorschläge. Der Fehler landet im Protokoll: Die
 * Formulare fangen ihn ab, weil sie auch ohne Liste bedienbar bleiben, und
 * ohne Protokolleintrag bliebe er unsichtbar.
 */
export function einmalLaden<T>(name: string, laden: () => Promise<T>): () => Promise<T> {
  let geladen: Promise<T> | null = null;
  return () => {
    geladen ??= laden().catch((grund: unknown) => {
      geladen = null;
      fehlerProtokollieren(`${name} ließ sich nicht laden`, grund);
      throw grund;
    });
    return geladen;
  };
}
