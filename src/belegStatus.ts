/**
 * Belegstatus: Beschriftung und Einfärbung, an einer Stelle.
 *
 * Diese Zuordnung stand vorher dreimal im Code — in `Angebote.tsx`,
 * `Rechnungen.tsx` und `BelegEditor.tsx` — und die Kopien liefen auseinander.
 * Der Editor zeigte am Ende den rohen Schlüssel („abgelehnt") statt einer
 * Beschriftung, weil dort nur die Farbtabelle mitgepflegt worden war.
 *
 * Angebote und Rechnungen haben getrennte Statuswerte; die Tabellen hier
 * enthalten beide, damit jede Ansicht dieselbe Quelle benutzen kann.
 */

/** Statuswerte, die ein Angebot annehmen kann — in der Reihenfolge des Ablaufs. */
export const ANGEBOT_STATUS = ["entwurf", "festgeschrieben", "angenommen", "abgelehnt", "abgelaufen"] as const;

/** Statuswerte, die eine Rechnung annehmen kann. */
export const RECHNUNG_STATUS = ["entwurf", "gestellt", "storniert"] as const;

const LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  // Nicht „Versendet": Die Anwendung verschickt nichts. Sie vergibt eine Nummer
  // und macht den Beleg unveränderbar — genau das sagt auch die Rückfrage davor,
  // und ein Status „Versendet" widersprach ihr.
  festgeschrieben: "Festgeschrieben",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  abgelaufen: "Abgelaufen",
  gestellt: "Gestellt",
  storniert: "Storniert",
};

const KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  // Ein abgelaufenes Angebot ist so wenig verbindlich wie ein Entwurf.
  abgelaufen: "status-entwurf",
  festgeschrieben: "status-gestellt",
  gestellt: "status-gestellt",
  angenommen: "status-bezahlt",
  abgelehnt: "status-storniert",
  storniert: "status-storniert",
};

/**
 * Beschriftung eines Status. Unbekannte Werte kommen unverändert zurück —
 * besser der rohe Schlüssel als eine leere Zelle, falls das Backend einmal
 * einen Status ergänzt, den die Oberfläche noch nicht kennt.
 */
export function statusLabel(status: string): string {
  return LABEL[status] ?? status;
}

/** CSS-Klasse für die Statusmarke. */
export function statusKlasse(status: string): string {
  return KLASSE[status] ?? "status-entwurf";
}

/** Beschriftungen für ein Auswahlfeld, als Paare aus Wert und Text. */
export function statusAuswahl(werte: readonly string[]): [string, string][] {
  return werte.map((w) => [w, statusLabel(w)]);
}
