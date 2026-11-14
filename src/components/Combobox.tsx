import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

export interface ComboboxOption {
  /** Eindeutig innerhalb der Liste; dient React als Schlüssel. */
  schluessel: string;
  text: string;
  /** Leiser Zusatz hinter dem Text, etwa die PLZ. */
  zusatz?: string;
}

interface ComboboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onSelect" | "role"> {
  value: string;
  /** Nur für Eingaben des Nutzers, nicht für eine Übernahme aus der Liste. */
  onWertAendern: (wert: string) => void;
  optionen: ComboboxOption[];
  offen: boolean;
  /** Pfeil nach unten bei geschlossener Liste: bitte öffnen. */
  onOeffnen?: () => void;
  onSchliessen: () => void;
  onAuswahl: (index: number) => void;
  /** Name der Liste für Bildschirmleser, z. B. „Vorschläge für den Ort". */
  listenBeschriftung: string;
}

/**
 * Eingabefeld mit Vorschlagsliste nach dem ARIA-1.2-Muster „Combobox mit
 * Listbox": Der Fokus bleibt im Feld, die aktive Option meldet
 * `aria-activedescendant`. So bleibt das Feld ein gewöhnliches Textfeld, in
 * dem man frei weiterschreiben kann; die Liste ist nur ein Angebot.
 *
 * Ob die Liste offen ist, entscheidet der Aufrufer: Die Adressfelder öffnen
 * die Ortsliste auch dann, wenn gerade die PLZ getippt wurde und das Ortsfeld
 * noch gar keinen Fokus hat.
 *
 * Tastatur: Pfeile wandern (und laufen am Ende herum), Enter übernimmt die
 * aktive Option, Escape schließt, Tab verlässt das Feld ohne Übernahme. Ohne
 * aktive Option bleibt Enter, was es im Formular immer ist: Abschicken.
 */
export function Combobox({
  value,
  onWertAendern,
  optionen,
  offen,
  onOeffnen,
  onSchliessen,
  onAuswahl,
  listenBeschriftung,
  id,
  className,
  onKeyDown,
  onBlur,
  ...rest
}: ComboboxProps) {
  const eigeneId = useId();
  const feldId = id ?? `${eigeneId}-feld`;
  const listenId = `${feldId}-liste`;
  const [aktiv, setAktiv] = useState(-1);
  const huelle = useRef<HTMLDivElement>(null);
  const sichtbar = offen && optionen.length > 0;

  // Neue Vorschläge, neue Wahl: Eine stehengebliebene Markierung zeigte
  // sonst auf einen Eintrag, den es nicht mehr gibt.
  useEffect(() => {
    setAktiv(-1);
  }, [optionen, offen]);

  // Ein Klick neben Feld und Liste schließt. Nötig, weil die Liste auch ohne
  // Fokus im Feld offen sein kann; dann gibt es kein Blur, das sie schlösse.
  useEffect(() => {
    if (!sichtbar) return;
    function daneben(e: MouseEvent) {
      if (huelle.current && !huelle.current.contains(e.target as Node)) onSchliessen();
    }
    document.addEventListener("mousedown", daneben);
    return () => document.removeEventListener("mousedown", daneben);
  }, [sichtbar, onSchliessen]);

  function tasten(e: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!sichtbar) {
        if (optionen.length > 0 && onOeffnen) {
          e.preventDefault();
          onOeffnen();
        }
        return;
      }
      e.preventDefault();
      const n = optionen.length;
      setAktiv((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter" && sichtbar && aktiv >= 0) {
      e.preventDefault();
      onAuswahl(aktiv);
    } else if (e.key === "Escape" && sichtbar) {
      // Nur verbrauchen, wenn es etwas zu schließen gab. Sonst gehört Escape
      // dem Dialog oder Blatt drumherum.
      e.preventDefault();
      e.stopPropagation();
      onSchliessen();
    }
  }

  const optionId = (i: number) => `${listenId}-${i}`;

  return (
    <div className="combobox" ref={huelle}>
      <input
        {...rest}
        id={feldId}
        className={className}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={sichtbar}
        aria-controls={sichtbar ? listenId : undefined}
        aria-activedescendant={sichtbar && aktiv >= 0 ? optionId(aktiv) : undefined}
        // Die Vorschläge des Browsers lägen über unseren und kennten weder
        // PLZ noch Ort; im Programmfenster sind sie ohnehin fehl am Platz.
        autoComplete="off"
        value={value}
        onChange={(e) => onWertAendern(e.currentTarget.value)}
        onKeyDown={tasten}
        onBlur={(e) => {
          onBlur?.(e);
          if (sichtbar) onSchliessen();
        }}
      />
      {sichtbar && (
        <ul className="combobox-liste" id={listenId} role="listbox" aria-label={listenBeschriftung}>
          {optionen.map((o, i) => (
            <li
              key={o.schluessel}
              id={optionId(i)}
              role="option"
              aria-selected={i === aktiv}
              className="combobox-option"
              // Ohne das nähme der Mausdruck dem Feld den Fokus, das Blur
              // schlösse die Liste, und der Klick ginge ins Leere.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAktiv(i)}
              onClick={() => onAuswahl(i)}
            >
              <span>{o.text}</span>
              {o.zusatz && (
                <>
                  {" "}
                  <span className="combobox-zusatz">{o.zusatz}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
