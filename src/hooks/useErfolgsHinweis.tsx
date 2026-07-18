import { useRef, useState } from "react";
import { Hinweis } from "../components/Hinweis";

/**
 * Kapselt Banner-State + Auto-Dismiss für konsistentes Erfolgs-Feedback nach
 * Speichern-/Anlegen-/Löschen-Aktionen. Jede Komponente, die eine solche
 * Aktion ausführt, ruft diesen Hook eigenständig auf (kein globaler State).
 *
 * `zeigen(text)` zeigt den Banner mit dem übergebenen Text an; ruft man es
 * erneut auf, während der vorherige Banner noch sichtbar ist, wird der
 * Auto-Dismiss-Timer neu gestartet (garantiert durch `banner.id` aus einem
 * `useRef`-Zähler statt `Date.now()`, siehe React-key auf `Hinweis`).
 */
export function useErfolgsHinweis() {
  const zaehler = useRef(0);
  const [banner, setBanner] = useState<{ text: string; id: number } | null>(null);

  function zeigen(text: string) {
    zaehler.current += 1;
    setBanner({ text, id: zaehler.current });
  }

  const hinweis = banner && (
    <Hinweis key={banner.id} autoDismissMs={4000} onSchliessen={() => setBanner(null)}>
      {banner.text}
    </Hinweis>
  );

  return { zeigen, hinweis };
}
