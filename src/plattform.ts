/**
 * Auf welchem Betriebssystem die Oberfläche läuft.
 *
 * Gebraucht wird das an genau zwei Stellen: unter macOS liegen die
 * Ampelknöpfe über der Seitenleiste (Fensterstil „Overlay"), also braucht
 * deren Kopf Platz und die Leisten müssen das Fenster ziehen können; unter
 * Windows ist der Grundtext einen Pixel größer, weil Segoe bei gleicher
 * Größe kleiner zeichnet als die Systemschrift von macOS.
 *
 * Die Kennung des Browsers genügt dafür. Eine Abfrage beim Rust-Teil wäre
 * genauer, käme aber erst nach dem ersten Zeichnen an, und die Seitenleiste
 * spränge dann einmal sichtbar nach unten.
 */
export type Plattform = "mac" | "win" | "andere";

/** Leitet die Plattform aus Kennung und `navigator.platform` ab. */
export function plattformErkennen(kennung: string, platform = ""): Plattform {
  const text = `${platform} ${kennung}`;
  // iPhone und iPad melden sich ebenfalls mit „Mac OS X"; die App läuft dort
  // nicht, aber eine Vorschau im Simulator soll nicht als Mac gelten.
  if (/iPhone|iPad|iPod/.test(text)) return "andere";
  if (/Mac/.test(text)) return "mac";
  if (/Win/.test(text)) return "win";
  return "andere";
}

/**
 * Setzt `data-plattform` an `<html>`, einmal beim Start.
 *
 * Ein bereits gesetzter Wert bleibt stehen: Die Vorschau im Browser erzwingt
 * darüber die Mac- oder Windows-Ansicht, unabhängig vom Rechner, auf dem sie
 * gerade läuft.
 */
export function plattformSetzen(wurzel: HTMLElement = document.documentElement): Plattform {
  const vorhanden = wurzel.dataset.plattform;
  if (vorhanden === "mac" || vorhanden === "win" || vorhanden === "andere") return vorhanden;
  const erkannt = plattformErkennen(navigator.userAgent, navigator.platform);
  wurzel.dataset.plattform = erkannt;
  return erkannt;
}

/** Die beim Start gesetzte Plattform. */
export function aktuellePlattform(): Plattform {
  const wert = document.documentElement.dataset.plattform;
  return wert === "mac" || wert === "win" ? wert : "andere";
}
