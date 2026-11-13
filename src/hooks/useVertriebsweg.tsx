import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Vertriebsweg } from "../api";

/**
 * Vertriebsweg der laufenden Fassung, einmal beim Start geladen.
 *
 * `null`, solange die Antwort aussteht. Wer danach etwas ein- oder ausblendet,
 * zeigt in dieser Zeit lieber nichts: Ein Spendenaufruf oder eine
 * Aktualisierungssuche, die in der Store-Fassung kurz aufblitzt, wäre genau
 * das, was Apple bei der Prüfung beanstandet.
 *
 * Ohne Anbieter (Komponententests ohne main.tsx) gilt "github", also das
 * bisherige Verhalten. Sonst müsste jeder Test, der eine betroffene
 * Komponente rendert, einen Anbieter um sie legen, obwohl er mit dem
 * Vertriebsweg nichts zu tun hat.
 */
const Kontext = createContext<Vertriebsweg | null>("github");

const BEKANNT: Vertriebsweg[] = ["github", "mac_app_store", "microsoft_store"];

export function VertriebswegProvider({ children }: { children: ReactNode }) {
  const [weg, setWeg] = useState<Vertriebsweg | null>(null);

  useEffect(() => {
    api
      .vertriebsweg()
      // Unbekanntes (etwa `undefined` aus einer nachgebildeten Brücke) gilt
      // wie ein Fehlschlag, statt als Store-Fassung durchzugehen.
      .then((w) => setWeg(BEKANNT.includes(w) ? w : "github"))
      // Scheitert die Abfrage, läuft die Oberfläche ohne Rust-Teil, etwa in
      // der Vorschau im Browser. Dann gilt das bisherige Verhalten.
      .catch(() => setWeg("github"));
  }, []);

  return <Kontext.Provider value={weg}>{children}</Kontext.Provider>;
}

/** Der Vertriebsweg, oder `null`, solange er noch nicht feststeht. */
export function useVertriebsweg(): Vertriebsweg | null {
  return useContext(Kontext);
}

/**
 * Ob diese Fassung sich selbst aktualisiert und um Spenden bitten darf. Nur
 * die GitHub-Fassung: In den Stores aktualisiert allein der Store, und
 * Spendenaufrufe außerhalb des In-App-Kaufs sind dort unzulässig.
 */
export function useIstGithubFassung(): boolean {
  return useVertriebsweg() === "github";
}

/** Name des Stores für Hinweise wie „Aktualisierungen kommen über …". */
export function storeName(weg: Vertriebsweg | null): string {
  return weg === "microsoft_store" ? "den Microsoft Store" : "den App Store";
}
