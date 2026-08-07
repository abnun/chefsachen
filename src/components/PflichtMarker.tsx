type PflichtArt = "pflicht" | "xrechnung";

const TITEL: Record<PflichtArt, string> = {
  pflicht: "Pflichtfeld",
  xrechnung: "Für den XRechnung-Export nötig",
};

const ZEICHEN: Record<PflichtArt, string> = {
  pflicht: "*",
  xrechnung: "†",
};

/**
 * Markiert ein Feld als Pflichtfeld oder als für den XRechnung-Export nötig.
 *
 * Kein natives `required`-Attribut allein: Die Browser-Blase sieht in jedem
 * System anders aus und verschwindet beim nächsten Klick. Dieses Zeichen
 * bleibt stehen; die eigentliche Prüfung passiert weiterhin im Rust-Teil.
 *
 * `aria-hidden`, damit ein Screenreader nicht "Name Stern" vorliest. Das ist
 * bewusst nur eine Markierung für sehende Nutzer — dieser Task ergänzt kein
 * `aria-required` an den Eingabefeldern selbst (das wäre eine eigene,
 * größere Änderung an jedem einzelnen Feld). Wer eine Hilfstechnologie
 * nutzt, erfährt die Pflicht wie bisher über die Fehlermeldung beim
 * Abschicken.
 */
export function PflichtMarker({ art }: { art: PflichtArt }) {
  return (
    <span aria-hidden="true" title={TITEL[art]} className="pflicht-marker">
      {" " + ZEICHEN[art]}
    </span>
  );
}

/** Legende am Ende eines Formulars mit mindestens einer Markierung. */
export function PflichtLegende({ zeigtXrechnung }: { zeigtXrechnung?: boolean }) {
  return (
    <p className="feld-hinweis pflicht-legende">
      * Pflichtfeld
      {zeigtXrechnung && " · † Für den XRechnung-Export nötig"}
    </p>
  );
}
