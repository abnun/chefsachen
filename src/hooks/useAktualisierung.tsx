import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { info, warn } from "@tauri-apps/plugin-log";
import { api } from "../api";
import { SCHLUESSEL_NOTIZEN } from "../components/VersionsHinweis";

/**
 * Stand der Aktualisierungssuche.
 *
 * Als Kontext statt als lokaler Zustand der Einstellungen-Seite: Vorher saß
 * die gesamte Logik — auch die Suche „beim Programmstart" — in der
 * Aktualisierung-Komponente, die nur innerhalb von Einstellungen gemountet
 * wird. Wer nicht von sich aus in die Einstellungen ging, bekam von einer
 * verfügbaren Aktualisierung schlicht nichts mit, obwohl die Beschriftung
 * „beim Programmstart" etwas anderes versprach. Der Anbieter sitzt jetzt in
 * App.tsx und läuft damit beim tatsächlichen Start, unabhängig von der
 * gerade angezeigten Seite.
 */
export type AktualisierungStand =
  | { art: "unbekannt" }
  | { art: "sucht" }
  | { art: "aktuell" }
  | { art: "verfuegbar"; update: Update }
  | { art: "laedt"; anteil: number | null }
  | { art: "bereit" }
  | { art: "fehler"; meldung: string };

interface AktualisierungApi {
  version: string;
  /** Ob beim Start von selbst gesucht wird. `null`, solange unbekannt. */
  autoSuche: boolean | null;
  stand: AktualisierungStand;
  suchen: (manuell: boolean) => Promise<void>;
  installieren: (update: Update) => Promise<void>;
  autoSucheUmschalten: (an: boolean) => Promise<void>;
}

const Kontext = createContext<AktualisierungApi | null>(null);

/** Einstellungsschlüssel für die Suche beim Start. */
const SCHLUESSEL_AUTOSUCHE = "aktualisierung.beim_start_suchen";

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function AktualisierungProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState("");
  const [autoSuche, setAutoSuche] = useState<boolean | null>(null);
  const [stand, setStand] = useState<AktualisierungStand>({ art: "unbekannt" });
  /**
   * Ob die Suche beim Start schon erledigt ist.
   *
   * Sie hängt an der gespeicherten Einstellung und läuft daher erst los,
   * nachdem diese geladen ist. Klickt der Nutzer in der Zwischenzeit selbst auf
   * „Suchen", überschrieb die nachlaufende automatische Suche dessen Ergebnis —
   * eine Fehlermeldung verschwand wieder, ohne dass etwas passiert wäre.
   */
  const startsucheErledigt = useRef(false);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
    // Voreinstellung ist „an": Wer nichts einstellt, soll von Fehlerbehebungen
    // erfahren. Nur ein ausdrückliches „nein" schaltet ab.
    api.einstellungen
      .get(SCHLUESSEL_AUTOSUCHE)
      .then((wert) => setAutoSuche(wert !== "nein"))
      .catch(() => setAutoSuche(true));
  }, []);

  const suchen = useCallback(async (manuell: boolean) => {
    startsucheErledigt.current = true;
    setStand({ art: "sucht" });
    try {
      const update = await check();
      /*
       * Das Ergebnis gehört ins Protokoll.
       *
       * „Auf dem neuesten Stand" ist die einzige Meldung der Anwendung, die
       * richtig aussieht und trotzdem falsch sein kann — etwa weil die
       * Veröffentlichung auf der Gegenseite noch nicht umgeschaltet war. Ohne
       * diese Zeile ließ sich hinterher nicht unterscheiden, ob wirklich
       * nichts da war oder ob die Abfrage etwas anderes zu sehen bekam.
       */
      info(
        update
          ? `Aktualisierungssuche: Version ${update.version} gefunden`
          : "Aktualisierungssuche: nichts Neueres gefunden",
      ).catch(() => {});
      setStand(update ? { art: "verfuegbar", update } : { art: "aktuell" });
    } catch (e) {
      warn(`Aktualisierungssuche fehlgeschlagen: ${fehlertext(e)}`).catch(() => {});
      // Ohne Netz schlägt die Suche fehl. Beim Programmstart ist das kein
      // Ereignis, über das der Nutzer etwas erfahren müsste.
      setStand(manuell ? { art: "fehler", meldung: fehlertext(e) } : { art: "unbekannt" });
    }
  }, []);

  useEffect(() => {
    // Erst suchen, wenn feststeht, ob überhaupt gesucht werden soll — sonst
    // liefe beim ersten Rendern eine Abfrage los, die der Nutzer abbestellt hat.
    // Und nur, solange nicht schon gesucht wurde: Ein Klick des Nutzers geht vor.
    if (autoSuche && !startsucheErledigt.current) suchen(false);
  }, [autoSuche, suchen]);

  async function autoSucheUmschalten(an: boolean) {
    setAutoSuche(an);
    try {
      await api.einstellungen.set(SCHLUESSEL_AUTOSUCHE, an ? "ja" : "nein");
    } catch (e) {
      // Die Einstellung ließ sich nicht merken — das gehört gesagt, sonst
      // steht sie beim nächsten Start wieder anders da.
      setStand({ art: "fehler", meldung: fehlertext(e) });
    }
  }

  async function installieren(update: Update) {
    setStand({ art: "laedt", anteil: null });
    try {
      let gesamt = 0;
      let geladen = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") {
          gesamt = e.data.contentLength ?? 0;
        } else if (e.event === "Progress") {
          geladen += e.data.chunkLength;
          // Ohne Content-Length lässt sich kein Anteil bilden — dann bleibt es
          // bei „wird geladen" statt einer erfundenen Prozentzahl.
          setStand({ art: "laedt", anteil: gesamt > 0 ? Math.round((geladen / gesamt) * 100) : null });
        }
      });
      // Den Änderungstext vor dem Neustart festhalten: Danach ist das Update-
      // Objekt fort, und der Hinweis nach dem Start hätte nichts zu zeigen.
      await api.einstellungen.set(SCHLUESSEL_NOTIZEN, update.body ?? "").catch(() => {});
      setStand({ art: "bereit" });
    } catch (e) {
      setStand({ art: "fehler", meldung: fehlertext(e) });
    }
  }

  return (
    <Kontext.Provider value={{ version, autoSuche, stand, suchen, installieren, autoSucheUmschalten }}>
      {children}
    </Kontext.Provider>
  );
}

/** Zugriff auf die Aktualisierungssuche — erfordert `AktualisierungProvider` als Vorfahren. */
export function useAktualisierung(): AktualisierungApi {
  const ctx = useContext(Kontext);
  if (!ctx) {
    throw new Error("useAktualisierung() braucht einen umgebenden AktualisierungProvider");
  }
  return ctx;
}
