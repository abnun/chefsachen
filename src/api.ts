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
  hat_offene_entwuerfe?: boolean;
  kundenpreise_anzahl: number;
}
export type KundeNeu = Omit<Kunde, "id" | "kundennummer" | "hat_adresse" | "hat_offene_entwuerfe" | "kundenpreise_anzahl">;
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
/** Sonderpreis samt Artikeldaten — für die Sicht vom Kunden aus. */
export interface KundenpreisMitArtikel {
  id: string;
  artikel_id: string;
  kunde_id: string;
  preis_cent: number;
  gueltig_ab: string | null;
  artikelnummer: string;
  bezeichnung: string;
  /** Zum Vergleich: Was der Artikel ohne Sonderpreis kosten würde. */
  standardpreis_cent: number;
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
  /** Elektronische Adresse des Rechnungsstellers (BT-34) — für eine gültige XRechnung Pflicht. */
  email: string;
  /** Telefon des Ansprechpartners (BT-42) — Teil der Pflichtgruppe SELLER CONTACT. */
  telefon: string;
  /** Name des Ansprechpartners (BT-41). Leer bedeutet: Firmenname wird verwendet. */
  kontakt_name: string;
  /**
   * Gründungsjahr, sofern bekannt. Entscheidet über die im laufenden Jahr
   * maßgebliche Umsatzgrenze: Im Gründungsjahr gibt es kein Vorjahr, an dem die
   * 25.000-€-Grenze ansetzen könnte — sie gilt dann sofort.
   */
  gruendungsjahr: number | null;
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
  /** Leistungsdatum, bei einem Zeitraum dessen Beginn. */
  leistungsdatum: string;
  /**
   * Ende eines Leistungszeitraums; null bedeutet Einzeldatum. § 14 Abs. 4 Nr. 6
   * UStG lässt Zeitpunkt „oder Zeitraum" zu — bei Dauerleistungen wäre ein
   * Einzeldatum sachlich falsch.
   */
  leistungsdatum_bis?: string | null;
  zahlungsziel_tage: number;
  kopftext: string;
  fusstext: string;
  summe_cent: number;
  ursprungsangebot_id: string | null;
  storno_von_id: string | null;
  kunde_snapshot_name?: string | null;
  /** Summe der erfassten Zahlungen; nur in Listen befüllt. */
  bezahlt_cent?: number;
  /**
   * Aus Summe und Zahlungen abgeleitet — nicht gespeichert, damit Status und
   * Zahlungen nicht auseinanderlaufen können. Null bei Angeboten und Entwürfen.
   */
  zahlungsstand?: Zahlungsstand | null;
  /** Belegdatum plus Zahlungsziel. Null bei Angeboten und Entwürfen. */
  faellig_am?: string | null;
}

export type Zahlungsstand = "offen" | "teilbezahlt" | "bezahlt" | "ueberzahlt";
export type BelegNeu = Pick<
  Beleg,
  "typ" | "kunde_id" | "datum" | "leistungsdatum" | "zahlungsziel_tage" | "kopftext" | "fusstext"
>;
export interface BelegUpdate {
  id: string;
  kunde_id: string;
  datum: string;
  /** Leistungsdatum, bei einem Zeitraum dessen Beginn. */
  leistungsdatum: string;
  /**
   * Ende eines Leistungszeitraums; null bedeutet Einzeldatum. § 14 Abs. 4 Nr. 6
   * UStG lässt Zeitpunkt „oder Zeitraum" zu — bei Dauerleistungen wäre ein
   * Einzeldatum sachlich falsch.
   */
  leistungsdatum_bis?: string | null;
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
export interface EingangsrechnungPosition {
  bezeichnung: string;
  menge: number;
  einzelpreis_cent: number;
  positionssumme_cent: number;
}
export interface EingangsrechnungSteuerzeile {
  nettobetrag_cent: number;
  steuersatz_promille: number;
  steuerbetrag_cent: number;
}
export interface EingangsrechnungFelderNeu {
  rechnungssteller_name: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  betrag_cent: number;
  waehrung: string;
  positionen: EingangsrechnungPosition[];
  kaeufer_name: string;
  kaeufer_strasse: string;
  kaeufer_plz: string;
  kaeufer_ort: string;
  kaeufer_land: string;
  verkaeufer_strasse: string;
  verkaeufer_plz: string;
  verkaeufer_ort: string;
  verkaeufer_land: string;
  verkaeufer_steuernummer: string;
  verkaeufer_email: string;
  zahlungsbedingungen: string;
  faelligkeitsdatum: string;
  iban: string;
  bic: string;
  bankname: string;
  bestellnummer: string;
  leitweg_id: string;
  lieferantennummer: string;
  leistungsdatum: string;
  steuerzeilen: EingangsrechnungSteuerzeile[];
}
export interface EingangsrechnungVorschau {
  /** Erkanntes Format: "xrechnung", "zugferd" oder "pdf". */
  format: string;
  geparst: boolean;
  felder: EingangsrechnungFelderNeu;
  ist_duplikat: boolean;
}
export interface Eingangsrechnung {
  id: string;
  dateiname: string;
  format: "xrechnung" | "zugferd";
  rechnungssteller_name: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  betrag_cent: number;
  waehrung: string;
  manuell_erfasst: boolean;
  importiert_am: string;
  kaeufer_name: string;
  kaeufer_strasse: string;
  kaeufer_plz: string;
  kaeufer_ort: string;
  kaeufer_land: string;
  verkaeufer_strasse: string;
  verkaeufer_plz: string;
  verkaeufer_ort: string;
  verkaeufer_land: string;
  verkaeufer_steuernummer: string;
  verkaeufer_email: string;
  zahlungsbedingungen: string;
  faelligkeitsdatum: string;
  iban: string;
  bic: string;
  bankname: string;
  bestellnummer: string;
  leitweg_id: string;
  lieferantennummer: string;
  leistungsdatum: string;
}
export interface EingangsrechnungUpdate {
  id: string;
  rechnungssteller_name: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  betrag_cent: number;
  waehrung: string;
}
/** Ein protokollierter Feldwechsel an einer Eingangsrechnung. */
export interface EingangsrechnungAenderung {
  feld: string;
  alt: string;
  neu: string;
  geaendert_am: string;
}
export interface EingangsrechnungDetail {
  eingangsrechnung: Eingangsrechnung;
  positionen: EingangsrechnungPosition[];
  steuerzeilen: EingangsrechnungSteuerzeile[];
}
export interface EingangsrechnungOriginal {
  dateiname: string;
  bytes: number[];
}
export type Warnstufe = "keine" | "annaeherung" | "kritisch" | "ueberschritten";
export type Statusbefund = "gegeben" | "entfallen_wegen_vorjahr" | "entfallen_wegen_laufendem_jahr";

export interface Grenze {
  umsatz_cent: number;
  grenze_cent: number;
  anteil_prozent: number;
  warnstufe: Warnstufe;
}

export interface Finanzfolge {
  grundlage_cent: number;
  betrag_cent: number;
  erlaeuterung: string;
}

export interface Hinweis {
  stufe: Warnstufe;
  titel: string;
  bedeutung: string;
  finanzielle_folge: Finanzfolge | null;
  handlung: string[];
}

export interface Umsatzgrenzen {
  laufendes_jahr_gegen_vorjahresgrenze: Grenze;
  laufendes_jahr_gegen_jahresgrenze: Grenze;
  vorjahr_gegen_vorjahresgrenze: Grenze;
  befund: Statusbefund;
  ist_gruendungsjahr: boolean;
  hinweise: Hinweis[];
}

export interface OffeneRechnung {
  id: string;
  nummer: string;
  kunde_name: string;
  datum: string;
  faellig_am: string;
  /** Negativ bedeutet überfällig. */
  tage_bis_faellig: number;
  offener_betrag_cent: number;
}

export interface OffenesAngebot {
  id: string;
  nummer: string;
  kunde_name: string;
  datum: string;
  summe_cent: number;
}

export interface LetzterBeleg {
  id: string;
  typ: string;
  nummer: string;
  kunde_name: string;
  status: string;
  summe_cent: number;
}

export interface DashboardDaten {
  jahr: number;
  umsatz_laufendes_jahr_cent: number;
  umsatz_vorjahr_cent: number;
  /** Null, wenn die Firma nicht als Kleinunternehmer geführt wird. */
  umsatzgrenzen: Umsatzgrenzen | null;
  offene_rechnungen: OffeneRechnung[];
  offene_angebote: OffenesAngebot[];
  letzte_belege: LetzterBeleg[];
}

export interface Sicherung {
  /** Zeitpunkt der Sicherung im Format JJJJ-MM-TT_hh-mm-ss. */
  zeitstempel: string;
  groesse_bytes: number;
  pfad: string;
}

export type AppFehler =
  | { typ: "validation"; feld: string; meldung: string }
  | { typ: "nicht_gefunden"; meldung: string }
  | { typ: "technisch"; meldung: string };

export function istValidierungsfehler(e: unknown): e is Extract<AppFehler, { typ: "validation" }> {
  return typeof e === "object" && e !== null && (e as AppFehler).typ === "validation";
}

export const api = {
  dashboard: {
    laden: () => invoke<DashboardDaten>("dashboard_laden"),
  },
  sicherungen: {
    liste: () => invoke<Sicherung[]>("sicherungen_liste"),
    jetzt: () => invoke<Sicherung>("sicherung_jetzt"),
  },
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
    delete: (id: string, kundenpreiseMitloeschen: boolean) =>
      invoke<void>("kunde_delete", { id, kundenpreiseMitloeschen }),
    adresseSave: (adresse: Adresse) => invoke<Adresse>("adresse_save", { adresse }),
    adresseDelete: (id: string) => invoke<void>("adresse_delete", { id }),
    ansprechpartnerSave: (ap: Ansprechpartner) => invoke<Ansprechpartner>("ansprechpartner_save", { ap }),
    ansprechpartnerDelete: (id: string) => invoke<void>("ansprechpartner_delete", { id }),
  },
  artikel: {
    list: (suche?: string) => invoke<Artikel[]>("artikel_list", { suche: suche ?? null }),
    create: (a: Omit<Artikel, "id" | "artikelnummer" | "kundenpreise_anzahl">) => invoke<Artikel>("artikel_create", { daten: a }),
    update: (a: Artikel) => invoke<Artikel>("artikel_update", { artikel: a }),
    delete: (id: string, kundenpreiseMitloeschen: boolean) =>
      invoke<void>("artikel_delete", { id, kundenpreiseMitloeschen }),
    kundenpreise: (artikelId: string) => invoke<Kundenpreis[]>("kundenpreis_list", { artikelId }),
    kundenpreiseFuerKunde: (kundeId: string) =>
      invoke<KundenpreisMitArtikel[]>("kundenpreis_list_fuer_kunde", { kundeId }),
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
    list: (typ?: "angebot" | "rechnung", status?: string, suche?: string) =>
      invoke<Beleg[]>("beleg_list", { typ: typ ?? null, status: status ?? null, suche: suche ?? null }),
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
  eingangsrechnungen: {
    importVorschau: (dateiBytes: number[]) =>
      invoke<EingangsrechnungVorschau>("eingangsrechnung_import_vorschau", { dateiBytes }),
    speichern: (dateiBytes: number[], dateiname: string, felder: EingangsrechnungFelderNeu) =>
      invoke<Eingangsrechnung>("eingangsrechnung_speichern", { dateiBytes, dateiname, felder }),
    list: () => invoke<Eingangsrechnung[]>("eingangsrechnung_list"),
    get: (id: string) => invoke<EingangsrechnungDetail>("eingangsrechnung_get", { id }),
    update: (daten: EingangsrechnungUpdate) => invoke<Eingangsrechnung>("eingangsrechnung_update", { daten }),
    originalExportieren: (id: string) => invoke<EingangsrechnungOriginal>("eingangsrechnung_original_exportieren", { id }),
    aenderungen: (id: string) => invoke<EingangsrechnungAenderung[]>("eingangsrechnung_aenderungen", { id }),
  },
  protokoll: {
    pfad: () => invoke<string>("protokoll_pfad"),
  },
};
