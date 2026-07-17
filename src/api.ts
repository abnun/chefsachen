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
  hat_adresse: boolean;
}
export type KundeNeu = Omit<Kunde, "id" | "kundennummer" | "hat_adresse">;
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
  kundenpreise_anzahl: number;
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
export interface Beleg {
  id: string;
  typ: "angebot" | "rechnung";
  nummer: string | null;
  status: string;
  kunde_id: string;
  datum: string;
  leistungsdatum: string;
  zahlungsziel_tage: number;
  kopftext: string;
  fusstext: string;
  summe_cent: number;
  ursprungsangebot_id: string | null;
  storno_von_id: string | null;
}
export type BelegNeu = Pick<
  Beleg,
  "typ" | "kunde_id" | "datum" | "leistungsdatum" | "zahlungsziel_tage" | "kopftext" | "fusstext"
>;
export interface BelegUpdate {
  id: string;
  kunde_id: string;
  datum: string;
  leistungsdatum: string;
  zahlungsziel_tage: number;
  kopftext: string;
  fusstext: string;
}
export interface Belegposition {
  id: string;
  beleg_id: string;
  artikel_id: string | null;
  bezeichnung: string;
  einheit_kuerzel: string;
  einzelpreis_cent: number;
  menge: number;
  positionssumme_cent: number;
  reihenfolge: number;
}
export interface BelegpositionNeu {
  id: string;
  beleg_id: string;
  artikel_id: string | null;
  bezeichnung: string;
  einheit_kuerzel: string;
  einzelpreis_cent: number | null;
  menge: number;
}
export interface Zahlung {
  id: string;
  rechnung_id: string;
  datum: string;
  betrag_cent: number;
  notiz: string;
}
export type ZahlungNeu = Omit<Zahlung, "id">;
export interface BelegDetail {
  beleg: Beleg;
  positionen: Belegposition[];
  zahlungen: Zahlung[];
  bezahlt_cent: number;
  offener_betrag_cent: number;
}
export interface OffenerPosten {
  beleg: Beleg;
  offener_betrag_cent: number;
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
    create: (a: Omit<Artikel, "id" | "artikelnummer" | "kundenpreise_anzahl">) => invoke<Artikel>("artikel_create", { daten: a }),
    update: (a: Artikel) => invoke<Artikel>("artikel_update", { artikel: a }),
    delete: (id: string) => invoke<void>("artikel_delete", { id }),
    kundenpreise: (artikelId: string) => invoke<Kundenpreis[]>("kundenpreis_list", { artikelId }),
    kundenpreisSave: (kp: Kundenpreis) => invoke<Kundenpreis>("kundenpreis_save", { kp }),
    kundenpreisDelete: (id: string) => invoke<void>("kundenpreis_delete", { id }),
    preisErmitteln: (artikelId: string, kundeId: string, belegdatum: string) =>
      invoke<number>("preis_ermitteln", { artikelId, kundeId, belegdatum }),
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
    nummernkreisUpdate: (art: string, format: string, jahresReset: boolean) =>
      invoke<void>("nummernkreis_update", { art, format, jahresReset }),
  },
  belege: {
    list: (typ?: "angebot" | "rechnung", status?: string) =>
      invoke<Beleg[]>("beleg_list", { typ: typ ?? null, status: status ?? null }),
    get: (id: string) => invoke<BelegDetail>("beleg_get", { id }),
    create: (daten: BelegNeu) => invoke<Beleg>("beleg_create", { daten }),
    update: (daten: BelegUpdate) => invoke<Beleg>("beleg_update", { daten }),
    delete: (id: string) => invoke<void>("beleg_delete", { id }),
    positionSave: (position: BelegpositionNeu) => invoke<Belegposition>("belegposition_save", { position }),
    positionDelete: (id: string) => invoke<void>("belegposition_delete", { id }),
    stellen: (id: string) => invoke<Beleg>("beleg_stellen", { id }),
    angebotStatusSetzen: (id: string, status: string) => invoke<Beleg>("angebot_status_setzen", { id, status }),
    angebotInRechnungUeberfuehren: (angebotId: string) =>
      invoke<Beleg>("angebot_in_rechnung_ueberfuehren", { angebotId }),
    rechnungStornieren: (id: string) => invoke<Beleg>("rechnung_stornieren", { id }),
    zahlungErfassen: (daten: ZahlungNeu) => invoke<Zahlung>("zahlung_erfassen", { daten }),
    zahlungDelete: (id: string) => invoke<void>("zahlung_delete", { id }),
    offenePosten: () => invoke<OffenerPosten[]>("offene_posten_list"),
    pdfExportieren: (id: string) => invoke<number[]>("beleg_pdf_exportieren", { id }),
    xrechnungExportieren: (id: string) => invoke<number[]>("rechnung_xrechnung_exportieren", { id }),
    zugferdExportieren: (id: string) => invoke<number[]>("rechnung_zugferd_exportieren", { id }),
  },
};
