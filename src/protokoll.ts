import { error } from "@tauri-apps/plugin-log";

/**
 * Leitet Fehler aus der Oberfläche in die Protokolldatei.
 *
 * Ein Fehler im Rust-Teil hinterlässt eine Spur, ein Fehler im Webview bisher
 * nicht: Er landete in einer Entwicklerkonsole, die im ausgelieferten Programm
 * niemand öffnet. Der Nutzer sah nur eine leere oder halb gefüllte Seite.
 *
 * Aufgezeichnet wird die technische Meldung samt Aufrufliste — keine
 * Formularinhalte, keine Kunden- oder Rechnungsdaten.
 */
export function fehlerAufzeichnungEinrichten() {
  window.addEventListener("error", (e) => {
    error(`Oberfläche: ${e.message} (${e.filename}:${e.lineno})`);
  });

  // Eine abgelehnte Promise ohne catch — etwa ein fehlgeschlagener Aufruf in
  // den Rust-Teil, den niemand behandelt hat. Ohne diesen Zweig verschwindet
  // sie spurlos.
  window.addEventListener("unhandledrejection", (e) => {
    error(`Oberfläche, unbehandelte Ablehnung: ${beschreibe(e.reason)}`);
  });
}

/**
 * Schreibt einen Fehler ins Protokoll, den die Oberfläche selbst abfängt,
 * weil sie ohne das Ergebnis weiterarbeiten kann. Abgefangen erreicht er die
 * Ereignisse oben nicht mehr.
 *
 * Scheitert das Schreiben selbst, bleibt es dabei: Ein Fehler beim
 * Protokollieren ist kein Grund für einen zweiten, unbehandelten.
 */
export function fehlerProtokollieren(anlass: string, grund: unknown) {
  Promise.resolve()
    .then(() => error(`Oberfläche: ${anlass}: ${beschreibe(grund)}`))
    .catch(() => {});
}

/** Fehlergründe sind nicht immer Error-Objekte; JSON ist der brauchbare Rest. */
function beschreibe(grund: unknown): string {
  if (grund instanceof Error) return `${grund.message}\n${grund.stack ?? ""}`;
  try {
    return JSON.stringify(grund);
  } catch {
    return String(grund);
  }
}
