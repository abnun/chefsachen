export const translations: Record<string, string> = {
  "nav.kunden": "Kunden",
  "nav.artikel": "Artikel & Leistungen",
  "nav.einstellungen": "Einstellungen",
};

/**
 * Übersetzt den gegebenen Schlüssel. Fällt bewusst auf den Schlüssel selbst
 * zurück, wenn keine Übersetzung existiert — so wird ein Tippfehler im
 * Aufrufer sichtbar (z. B. "nav.kundne" auf der Oberfläche) statt leer/blank
 * zu bleiben.
 */
export function t(key: string): string {
  return translations[key] ?? key;
}
