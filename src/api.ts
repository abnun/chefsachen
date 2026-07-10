import { invoke } from "@tauri-apps/api/core";

export interface Einheit {
  id: string;
  name: string;
  kuerzel: string;
}
export interface Kunde {
  id: string;
  typ: "firma" | "privat";
  name: string;
  kundennummer: string;
  zahlungsziel_tage: number;
  notizen: string;
  ust_idnr: string;
  email: string;
  leitweg_id: string;
  kaeuferreferenz: string;
}
export type KundeNeu = Omit<Kunde, "id" | "kundennummer">;
export interface Adresse {
  id: string;
  kunde_id: string;
  typ: "rechnung" | "lieferung";
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  ist_standard: boolean;
}
export interface Ansprechpartner {
  id: string;
  kunde_id: string;
  name: string;
  rolle: string;
  email: string;
  telefon: string;
  ist_standard: boolean;
}
export interface KundeDetail {
  kunde: Kunde;
  adressen: Adresse[];
  ansprechpartner: Ansprechpartner[];
}
export interface Artikel {
  id: string;
  artikelnummer: string;
  bezeichnung: string;
  beschreibung: string;
  einheit_id: string;
  standardpreis_cent: number;
}
export interface Kundenpreis {
  id: string;
  artikel_id: string;
  kunde_id: string;
  preis_cent: number;
  gueltig_ab: string | null;
}
export interface Firma {
  id: string;
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  steuernummer: string;
  ust_idnr: string;
  iban: string;
  bic: string;
  kleinunternehmer: boolean;
  eingerichtet: boolean;
}
export interface Nummernkreis {
  art: string;
  format: string;
  zaehler: number;
  jahres_reset: boolean;
}
export type AppFehler =
  | { typ: "validation"; feld: string; meldung: string }
  | { typ: "nicht_gefunden"; meldung: string }
  | { typ: "technisch"; meldung: string };

export function istValidierungsfehler(e: unknown): e is Extract<AppFehler, { typ: "validation" }> {
  return typeof e === "object" && e !== null && (e as AppFehler).typ === "validation";
}

export const api = {
  einheiten: {
    list: () => invoke<Einheit[]>("einheit_list"),
    create: (name: string, kuerzel: string) => invoke<Einheit>("einheit_create", { name, kuerzel }),
    update: (e: Einheit) => invoke<Einheit>("einheit_update", { id: e.id, name: e.name, kuerzel: e.kuerzel }),
    delete: (id: string) => invoke<void>("einheit_delete", { id }),
  },
  kunden: {
    list: (suche?: string) => invoke<Kunde[]>("kunde_list", { suche: suche ?? null }),
    get: (id: string) => invoke<KundeDetail>("kunde_get", { id }),
    create: (daten: KundeNeu) => invoke<Kunde>("kunde_create", { daten }),
    update: (kunde: Kunde) => invoke<Kunde>("kunde_update", { kunde }),
    delete: (id: string) => invoke<void>("kunde_delete", { id }),
    adresseSave: (adresse: Adresse) => invoke<Adresse>("adresse_save", { adresse }),
    adresseDelete: (id: string) => invoke<void>("adresse_delete", { id }),
    ansprechpartnerSave: (ap: Ansprechpartner) => invoke<Ansprechpartner>("ansprechpartner_save", { ap }),
    ansprechpartnerDelete: (id: string) => invoke<void>("ansprechpartner_delete", { id }),
  },
  artikel: {
    list: (suche?: string) => invoke<Artikel[]>("artikel_list", { suche: suche ?? null }),
    create: (a: Omit<Artikel, "id" | "artikelnummer">) => invoke<Artikel>("artikel_create", { daten: a }),
    update: (a: Artikel) => invoke<Artikel>("artikel_update", { artikel: a }),
    delete: (id: string) => invoke<void>("artikel_delete", { id }),
    // Rust-Command `kundenpreis_list` erwartet den Parameter `artikel_id` (snake_case),
    // nicht `artikelId` wie im ursprünglichen Brief-Entwurf.
    kundenpreise: (artikelId: string) => invoke<Kundenpreis[]>("kundenpreis_list", { artikel_id: artikelId }),
    kundenpreisSave: (kp: Kundenpreis) => invoke<Kundenpreis>("kundenpreis_save", { kp }),
    kundenpreisDelete: (id: string) => invoke<void>("kundenpreis_delete", { id }),
    preisErmitteln: (artikelId: string, kundeId: string, belegdatum: string) =>
      invoke<number>("preis_ermitteln", { artikel_id: artikelId, kunde_id: kundeId, belegdatum }),
  },
  firma: {
    get: () => invoke<Firma>("firma_get"),
    save: (firma: Firma) => invoke<Firma>("firma_save", { firma }),
    logoSet: (bytes: number[]) => invoke<void>("firma_logo_set", { bytes }),
    logoGet: () => invoke<number[] | null>("firma_logo_get"),
  },
  einstellungen: {
    get: (key: string) => invoke<string | null>("einstellung_get", { key }),
    set: (key: string, value: string) => invoke<void>("einstellung_set", { key, value }),
    nummernkreise: () => invoke<Nummernkreis[]>("nummernkreis_list"),
    // Rust-Command `nummernkreis_update` erwartet den Parameter `jahres_reset` (snake_case),
    // nicht `jahresReset` wie im ursprünglichen Brief-Entwurf.
    nummernkreisUpdate: (art: string, format: string, jahresReset: boolean) =>
      invoke<void>("nummernkreis_update", { art, format, jahres_reset: jahresReset }),
  },
};
