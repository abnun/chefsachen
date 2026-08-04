import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler } from "./api";

/**
 * Die vier Export-Wege eines Belegs: PDF, XRechnung, ZUGFeRD und
 * Zahlungserinnerung. Jeder ruft den passenden Befehl, lässt den Nutzer den
 * Speicherort wählen und schreibt die Datei — dieselbe Abfolge viermal, nur
 * mit anderem Endpunkt und Dateinamen.
 *
 * Kein Hook trotz des naheliegenden Namens: Es steckt kein React-Zustand
 * darin, nur Closures über `beleg`. Ein `use...`-Name hätte die
 * Hooks-Regeln der Aufrufreihenfolge ausgelöst, sobald der Aufruf hinter
 * einem frühen `return` steht — wie im Editor, der vor dem Laden abbricht.
 */
export function belegExportFunktionen(
  beleg: { id: string; nummer: string | null },
  onFehler: (e: AppFehler | null) => void,
  zeigen: (text: string) => void,
) {
  async function pdfExportieren() {
    onFehler(null);
    try {
      const bytes = await api.belege.pdfExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
        zeigen("PDF exportiert");
      }
    } catch (e) {
      onFehler(e as AppFehler);
    }
  }

  async function xrechnungExportieren() {
    onFehler(null);
    try {
      const bytes = await api.belege.xrechnungExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}.xml`, filters: [{ name: "XML", extensions: ["xml"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
        zeigen("XRechnung exportiert");
      }
    } catch (e) {
      onFehler(e as AppFehler);
    }
  }

  async function zugferdExportieren() {
    onFehler(null);
    try {
      const bytes = await api.belege.zugferdExportieren(beleg.id);
      const ziel = await save({ defaultPath: `${beleg.nummer ?? beleg.id}-zugferd.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
        zeigen("ZUGFeRD-Rechnung exportiert");
      }
    } catch (e) {
      onFehler(e as AppFehler);
    }
  }

  /**
   * Zahlungserinnerung als PDF — kein mehrstufiges Mahnverfahren, nur ein
   * höflicher Hinweis mit Fälligkeit, offenem Betrag und Bankverbindung.
   *
   * Wird anders als PDF/XRechnung/ZUGFeRD nicht im Belegarchiv abgelegt: Sie
   * ändert sich täglich ("3 Tage überfällig") und ist damit kein einmal
   * eingefrorenes Dokument.
   */
  async function zahlungserinnerungExportieren() {
    onFehler(null);
    try {
      const bytes = await api.belege.zahlungserinnerungExportieren(beleg.id);
      const ziel = await save({
        defaultPath: `${beleg.nummer ?? beleg.id}-zahlungserinnerung.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (ziel) {
        await writeFile(ziel, new Uint8Array(bytes));
        zeigen("Zahlungserinnerung exportiert");
      }
    } catch (e) {
      onFehler(e as AppFehler);
    }
  }

  return { pdfExportieren, xrechnungExportieren, zugferdExportieren, zahlungserinnerungExportieren };
}
