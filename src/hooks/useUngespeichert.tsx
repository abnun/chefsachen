import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";

/**
 * Warnung vor dem Verwerfen ungespeicherter Eingaben.
 *
 * Die Anwendung wechselt Seiten durch Umschalten des Zustands, nicht über
 * Adressen — es gibt also keinen Browser, der von sich aus nachfragte. Wer
 * mitten im Ausfüllen eines Formulars auf „Kunden" klickt, verlor bisher alles
 * Eingetippte, ohne Rückfrage und ohne Weg zurück.
 *
 * Formulare melden über [`useUngespeichert`] an, dass sie ungesicherte
 * Eingaben halten. Die Navigation fragt über [`useVerlassenPruefen`] nach,
 * bevor sie wechselt.
 *
 * Dasselbe gilt für das Schließen des Fensters. Das läuft nicht über die
 * Webview, sondern über das Betriebssystem — ohne `onCloseRequested` wäre alles
 * Eingetippte beim Klick auf das Schließkreuz weg.
 */
interface UngespeichertWert {
  anmelden: (schluessel: symbol) => void;
  abmelden: (schluessel: symbol) => void;
  pruefen: () => Promise<boolean>;
}

const Kontext = createContext<UngespeichertWert | null>(null);

export function UngespeichertProvider({ children }: { children: ReactNode }) {
  // Ein Set statt eines Zählers: Meldet sich ein Formular doppelt an — etwa
  // weil ein Effekt zweimal läuft —, bleibt der Stand richtig.
  const offen = useRef(new Set<symbol>());
  const [frage, setFrage] = useState<((antwort: boolean) => void) | null>(null);

  const anmelden = useCallback((schluessel: symbol) => {
    offen.current.add(schluessel);
  }, []);

  const abmelden = useCallback((schluessel: symbol) => {
    offen.current.delete(schluessel);
  }, []);

  const pruefen = useCallback(() => {
    if (offen.current.size === 0) return Promise.resolve(true);
    return new Promise<boolean>((antworten) => setFrage(() => antworten));
  }, []);

  function beantworten(antwort: boolean) {
    frage?.(antwort);
    setFrage(null);
  }

  useEffect(() => {
    // In einer Testumgebung ohne Tauri wirft `getCurrentWindow()` sofort —
    // nicht als abgelehnte Promise, sondern beim Aufruf. Ein `.catch()` allein
    // fängt das nicht. Dort bleibt es beim reinen Navigationsschutz.
    let abmelden: (() => void) | undefined;
    try {
      getCurrentWindow()
        .onCloseRequested(async (ereignis) => {
          if (!(await pruefen())) {
            ereignis.preventDefault();
          }
        })
        .then((f) => {
          abmelden = f;
        })
        .catch(() => {});
    } catch {
      // Kein Fenster vorhanden.
    }
    return () => abmelden?.();
  }, [pruefen]);

  return (
    <Kontext.Provider value={{ anmelden, abmelden, pruefen }}>
      {children}
      {frage && (
        <Bestaetigungsdialog
          text="Es gibt ungespeicherte Änderungen. Sollen sie verworfen werden?"
          bestaetigenLabel="Verwerfen"
          onAbbrechen={() => beantworten(false)}
          onBestaetigen={() => beantworten(true)}
        />
      )}
    </Kontext.Provider>
  );
}

/**
 * Meldet ungespeicherte Eingaben an, solange `hatAenderungen` gilt.
 *
 * Die Abmeldung beim Abbau ist wesentlich: Ein Formular, das mit gesetztem
 * Kennzeichen verschwindet, blockierte sonst jede weitere Navigation — und der
 * Nutzer fände nie heraus, warum.
 */
export function useUngespeichert(hatAenderungen: boolean) {
  const kontext = useContext(Kontext);
  const schluessel = useRef(Symbol("formular"));

  useEffect(() => {
    if (!kontext) return;
    const eigen = schluessel.current;
    if (hatAenderungen) {
      kontext.anmelden(eigen);
    } else {
      kontext.abmelden(eigen);
    }
    return () => kontext.abmelden(eigen);
  }, [kontext, hatAenderungen]);
}

/**
 * Liefert eine Prüfung, die vor dem Verlassen nachfragt.
 *
 * Ergebnis `true` heißt: weitermachen. Ohne umgebenden Provider — etwa in einem
 * Test, der nur eine Seite rendert — ist die Antwort immer `true`, damit die
 * Navigation nicht stillsteht.
 */
export function useVerlassenPruefen(): () => Promise<boolean> {
  const kontext = useContext(Kontext);
  return useCallback(() => kontext?.pruefen() ?? Promise.resolve(true), [kontext]);
}
