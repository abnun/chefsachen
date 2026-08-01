import { istValidierungsfehler, type AppFehler } from "./api";

/**
 * Verteilt einen Backend-Fehler auf die beiden Anzeigeorte eines Formulars.
 *
 * Der Aufrufer gibt an, für welche Felder er selbst eine Meldung direkt am
 * Eingabefeld rendert. Alles andere — technische Fehler, „nicht gefunden" und
 * vor allem Validierungsfehler zu Feldern, die das Formular nicht kennt —
 * landet im Banner.
 *
 * Der Vorgabewert ist damit „sichtbar": Ergänzt das Backend eine neue
 * Feldprüfung, erscheint sie automatisch im Banner, statt stumm verschluckt zu
 * werden. Vorher endete ein Artikel ohne Einheit darin, dass der
 * Speichern-Knopf sichtbar nichts tat.
 */
export function formularFehler(fehler: AppFehler | null, inlineFelder: readonly string[]) {
  const feldFehler = (feld: string) =>
    fehler && istValidierungsfehler(fehler) && fehler.feld === feld ? fehler.meldung : null;

  const bannerFehler =
    fehler && istValidierungsfehler(fehler) && inlineFelder.includes(fehler.feld) ? null : fehler;

  return { feldFehler, bannerFehler };
}
