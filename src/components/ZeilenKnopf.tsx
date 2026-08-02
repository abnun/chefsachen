import { type ReactNode } from "react";

/**
 * Öffnet den Datensatz einer Tabellenzeile — als richtiger Knopf.
 *
 * Die Listen waren nur mit der Maus zu bedienen: Der Klick hing am `<tr>`, und
 * eine Tabellenzeile ist kein bedienbares Element (WCAG 2.1.1). Wer nicht
 * zeigen kann, kam an keinen Beleg heran.
 *
 * Der naheliegende Ausweg wäre `tabIndex` und `role="button"` an der Zeile.
 * Damit hört sie aber auf, für Screenreader eine Zeile zu sein — die Zuordnung
 * von Spaltenkopf zu Zelle geht verloren. Deshalb steht der Knopf in der ersten
 * Zelle und trägt deren Inhalt, meist die Nummer. Die Zeile bleibt für
 * Mausnutzer zusätzlich klickbar.
 */
export function ZeilenKnopf({ onOeffnen, children }: { onOeffnen: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="zeilen-knopf"
      onClick={(e) => {
        // Ohne das liefe der Klick zusätzlich über die Zeile darüber.
        e.stopPropagation();
        onOeffnen();
      }}
    >
      {children}
    </button>
  );
}
