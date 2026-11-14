/**
 * Form und Prüfziffer einer IBAN, für den leisen Hinweis am Eingabefeld.
 *
 * Verbindlich prüft das Backend beim Speichern (src-tauri/src/domain/
 * bankverbindung.rs). Hier geht es nur darum, einen Tippfehler schon beim
 * Tippen zu zeigen, nicht erst nach „Weiter" oder „Speichern". Deshalb
 * blockiert nichts davon: Ein Befund ist ein Hinweis, kein Fehler.
 */

/**
 * Länge der IBAN je Land (ISO 13616, IBAN-Register von SWIFT). Mindestens
 * die Länder, aus denen Kunden kleiner deutscher Betriebe meist zahlen; ein
 * Land, das fehlt, bekommt nur keinen Hinweis zur Länge.
 */
export const IBAN_LAENGEN: Readonly<Record<string, number>> = {
  AT: 20,
  BE: 16,
  CH: 21,
  CZ: 24,
  DE: 22,
  DK: 18,
  ES: 24,
  FI: 18,
  FR: 27,
  GB: 22,
  IE: 22,
  IT: 27,
  LI: 21,
  LU: 20,
  NL: 18,
  NO: 15,
  PL: 28,
  PT: 25,
  SE: 24,
};

/**
 * Nur Buchstaben und Ziffern, groß. Leerzeichen sind erlaubt, und was sonst
 * beim Kopieren aus einem Brief oder einer Webseite mitkommt (Bindestriche,
 * Punkte, geschützte Leerzeichen), fällt ebenfalls weg.
 */
export function ibanKompakt(eingabe: string): string {
  return eingabe.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Viererblöcke, wie eine IBAN gedruckt wird: „DE02 1203 0000 …". */
export function ibanGruppieren(eingabe: string): string {
  return ibanKompakt(eingabe).replace(/(.{4})(?=.)/g, "$1 ");
}

/**
 * Modulo 97 nach ISO 7064: Die ersten vier Zeichen wandern ans Ende,
 * Buchstaben werden zu Zahlen (A = 10 … Z = 35), der Rest muss 1 sein.
 * Ziffernweise gerechnet, weil die Zahl für `number` viel zu groß wäre.
 */
export function ibanPruefsummeStimmt(eingabe: string): boolean {
  const iban = ibanKompakt(eingabe);
  if (iban.length < 5) return false;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const zeichen of umgestellt) {
    const wert = parseInt(zeichen, 36);
    rest = wert < 10 ? (rest * 10 + wert) % 97 : (rest * 100 + wert) % 97;
  }
  return rest === 1;
}

/**
 * - `leer`, `unvollstaendig`: kein Hinweis, es wird noch getippt;
 * - `gueltig`: Länge und Prüfziffer stimmen;
 * - `pruefziffer`: vollständig, aber die Prüfziffer passt nicht;
 * - `zu-lang`: länger als in diesem Land üblich.
 *
 * Bei einem Land ohne bekannte Länge bleibt es bei `unvollstaendig`: Ob
 * noch ein Zeichen kommt, lässt sich dann nicht sagen, und eine Prüfziffer,
 * die erst mit dem letzten Zeichen stimmt, wäre vorher ein falscher Alarm.
 */
export type IbanBefund = "leer" | "unvollstaendig" | "gueltig" | "pruefziffer" | "zu-lang";

export function ibanBefund(eingabe: string): IbanBefund {
  const iban = ibanKompakt(eingabe);
  if (iban === "") return "leer";
  const laenge = IBAN_LAENGEN[iban.slice(0, 2)];
  if (laenge === undefined || iban.length < laenge) return "unvollstaendig";
  if (iban.length > laenge) return "zu-lang";
  return ibanPruefsummeStimmt(iban) ? "gueltig" : "pruefziffer";
}
