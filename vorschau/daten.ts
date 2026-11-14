/**
 * Beispieldaten für die Vorschau.
 *
 * Eine erfundene Grafikerin in Leipzig, Kleinunternehmerin, mit einem knappen
 * Jahr Geschäftspost. Die Summen der Belege ergeben sich aus den Positionen,
 * die Zahlungen aus dem Zustand, den jeder Beleg zeigen soll. So bleiben
 * Übersicht, Listen und Auswertung untereinander stimmig.
 *
 * Alle Formen sind gegen die Typen aus `src/api.ts` geprüft: Ändert sich dort
 * ein Feld, meldet `tsc` die Stelle hier.
 */

import type {
  Adresse,
  Ansprechpartner,
  Artikel,
  Beleg,
  Belegposition,
  Eingangsrechnung,
  EingangsrechnungAenderung,
  EingangsrechnungPosition,
  EingangsrechnungSteuerzeile,
  Einheit,
  Firma,
  Kunde,
  Kundenpreis,
  Nummernkreis,
  Sicherung,
  Zahlung,
} from "../src/api";

/** Stichtag der Beispieldaten. Fälligkeiten und Übersicht rechnen von hier. */
export const HEUTE = "2026-11-13";

/** Gespeicherte Form eines Belegs, ohne die nur in Listen abgeleiteten Felder. */
export type GespeicherterBeleg = Omit<Beleg, "bezahlt_cent" | "zahlungsstand" | "faellig_am">;

export interface Bestand {
  firma: Firma;
  einheiten: Einheit[];
  kunden: Kunde[];
  adressen: Adresse[];
  ansprechpartner: Ansprechpartner[];
  artikel: Artikel[];
  kundenpreise: Kundenpreis[];
  belege: GespeicherterBeleg[];
  positionen: Belegposition[];
  zahlungen: Zahlung[];
  eingangsrechnungen: Eingangsrechnung[];
  eingangsPositionen: Record<string, EingangsrechnungPosition[]>;
  eingangsSteuerzeilen: Record<string, EingangsrechnungSteuerzeile[]>;
  eingangsAenderungen: Record<string, EingangsrechnungAenderung[]>;
  einstellungen: Map<string, string>;
  nummernkreise: Nummernkreis[];
  sicherungen: Sicherung[];
}

const LEERE_FIRMA: Firma = {
  id: "firma",
  name: "",
  strasse: "",
  plz: "",
  ort: "",
  land: "DE",
  steuernummer: "",
  ust_idnr: "",
  iban: "",
  bic: "",
  email: "",
  telefon: "",
  fax: "",
  kontakt_name: "",
  gruendungsjahr: null,
  kleinunternehmer: true,
  eingerichtet: false,
};

const FIRMA: Firma = {
  ...LEERE_FIRMA,
  name: "Lena Hoffmann · Grafik & Illustration",
  strasse: "Karl-Heine-Straße 54",
  plz: "04229",
  ort: "Leipzig",
  steuernummer: "231/245/67890",
  iban: "DE39 8605 5592 1090 4471 23",
  bic: "WELADE8LXXX",
  email: "hallo@lenahoffmann.de",
  telefon: "0341 2479 3318",
  kontakt_name: "Lena Hoffmann",
  gruendungsjahr: 2023,
  kleinunternehmer: true,
  eingerichtet: true,
};

const EINHEITEN: Einheit[] = [
  { id: "e0000000-0000-0000-0000-000000000001", name: "Stunde", kuerzel: "Std." },
  { id: "e0000000-0000-0000-0000-000000000002", name: "Stück", kuerzel: "Stk." },
  { id: "e0000000-0000-0000-0000-000000000003", name: "Tag", kuerzel: "Tag" },
  { id: "e0000000-0000-0000-0000-000000000004", name: "Pauschale", kuerzel: "pausch." },
  { id: "e0000000-0000-0000-0000-000000000005", name: "Kilometer", kuerzel: "km" },
];
const STD = EINHEITEN[0];
const STK = EINHEITEN[1];
const TAG = EINHEITEN[2];
const PAUSCH = EINHEITEN[3];
const KM = EINHEITEN[4];

function standardEinstellungen(): Map<string, string> {
  return new Map<string, string>([
    ["text.kleinunternehmer", "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."],
    ["text.angebot.kopf", "vielen Dank für Ihre Anfrage. Gern unterbreite ich Ihnen folgendes Angebot:"],
    ["text.angebot.fuss", "Ich freue mich auf Ihre Rückmeldung. Dieses Angebot ist 30 Tage gültig."],
    ["text.rechnung.kopf", "vielen Dank für die gute Zusammenarbeit. Für meine Leistungen berechne ich:"],
    [
      "text.rechnung.fuss",
      "Bitte überweisen Sie den Betrag innerhalb der Zahlungsfrist auf das unten genannte Konto.",
    ],
    ["text.gutschrift.kopf", ""],
    [
      "text.gutschrift.fuss",
      "Der ausgewiesene Betrag wird Ihnen erstattet bzw. mit der nächsten Rechnung verrechnet.",
    ],
    [
      "text.zahlungserinnerung",
      "sicher ist Ihnen im Alltag entgangen, dass die folgende Rechnung noch offen ist. Bitte überweisen Sie den Betrag in den nächsten Tagen.",
    ],
    ["default.zahlungsziel_tage", "14"],
    ["vorlage.angebot_gueltigkeit_tage", "30"],
    ["vorlage.akzentfarbe", "#B4532A"],
    // Hinweise, die beim Start als Dialog aufgingen, sind für Screenshots
    // still gestellt: Version gilt als gesehen, die Spendenbitte liegt weit vorn.
    ["version.zuletzt_gesehen", "1.4.2"],
    ["spende.naechste_erinnerung", "2027-06-01T09:00:00.000Z"],
    ["aktualisierung.beim_start_suchen", "ja"],
    ["sicherung.zuletzt_exportiert", "2026-10-30T17:12:00.000Z"],
  ]);
}

function nummernkreise(z: { kunde: number; artikel: number; angebot: number; rechnung: number; gutschrift: number }): Nummernkreis[] {
  return [
    { art: "kunde", format: "KD-{lfd:4}", zaehler: z.kunde, jahres_reset: false },
    { art: "artikel", format: "ART-{lfd:4}", zaehler: z.artikel, jahres_reset: false },
    { art: "angebot", format: "AN-{JJJJ}-{lfd:4}", zaehler: z.angebot, jahres_reset: true },
    { art: "rechnung", format: "RE-{JJJJ}-{lfd:4}", zaehler: z.rechnung, jahres_reset: true },
    { art: "gutschrift", format: "GS-{JJJJ}-{lfd:4}", zaehler: z.gutschrift, jahres_reset: true },
  ];
}

/** Bestand für `?leer=1`: frische Installation, Einrichtungsassistent. */
export function leererBestand(): Bestand {
  return {
    firma: { ...LEERE_FIRMA },
    einheiten: EINHEITEN.map((e) => ({ ...e })),
    kunden: [],
    adressen: [],
    ansprechpartner: [],
    artikel: [],
    kundenpreise: [],
    belege: [],
    positionen: [],
    zahlungen: [],
    eingangsrechnungen: [],
    eingangsPositionen: {},
    eingangsSteuerzeilen: {},
    eingangsAenderungen: {},
    einstellungen: standardEinstellungen(),
    nummernkreise: nummernkreise({ kunde: 0, artikel: 0, angebot: 0, rechnung: 0, gutschrift: 0 }),
    sicherungen: [],
  };
}

// ---------------------------------------------------------------------------
// Kunden
// ---------------------------------------------------------------------------

interface KundeVorlage {
  id: string;
  typ: "firma" | "privat";
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  email: string;
  zahlungsziel_tage?: number;
  ust_idnr?: string;
  leitweg_id?: string;
  notizen?: string;
  ansprechpartner?: { name: string; rolle: string; email: string; telefon: string };
}

const KUNDEN_VORLAGEN: KundeVorlage[] = [
  {
    id: "k-bohnenwerk",
    typ: "firma",
    name: "Kaffeerösterei Bohnenwerk GmbH",
    strasse: "Zschochersche Straße 23",
    plz: "04229",
    ort: "Leipzig",
    email: "buchhaltung@bohnenwerk-leipzig.de",
    ust_idnr: "DE318442761",
    notizen: "Verpackungslinie „Hausröstung“, saisonale Editionen jeweils im Frühjahr und Herbst.",
    ansprechpartner: { name: "Paul Wenzel", rolle: "Marketing", email: "p.wenzel@bohnenwerk-leipzig.de", telefon: "0341 4926 110" },
  },
  {
    id: "k-ostwind",
    typ: "firma",
    name: "Verlag Ostwind & Söhne KG",
    strasse: "Königsbrücker Straße 61",
    plz: "01099",
    ort: "Dresden",
    email: "rechnungen@ostwind-verlag.de",
    zahlungsziel_tage: 30,
    ust_idnr: "DE274190553",
    ansprechpartner: { name: "Sabine Kröger", rolle: "Programmleitung Kinderbuch", email: "s.kroeger@ostwind-verlag.de", telefon: "0351 8820 417" },
  },
  {
    id: "k-kulturamt",
    typ: "firma",
    name: "Stadt Leipzig, Kulturamt",
    strasse: "Martin-Luther-Ring 4–6",
    plz: "04109",
    ort: "Leipzig",
    email: "kulturamt@leipzig.de",
    zahlungsziel_tage: 30,
    leitweg_id: "14713000-KA01-37",
    notizen: "Rechnungen ausschließlich als XRechnung über die Leitweg-ID.",
    ansprechpartner: { name: "Dr. Henrike Saalfeld", rolle: "Kulturelle Bildung", email: "h.saalfeld@leipzig.de", telefon: "0341 123 4271" },
  },
  {
    id: "k-brauhaus",
    typ: "firma",
    name: "Brauhaus Connewitz GmbH",
    strasse: "Bornaische Straße 18",
    plz: "04277",
    ort: "Leipzig",
    email: "info@brauhaus-connewitz.de",
    ust_idnr: "DE301877245",
    ansprechpartner: { name: "Tobias Reuter", rolle: "Geschäftsführung", email: "t.reuter@brauhaus-connewitz.de", telefon: "0341 3065 980" },
  },
  {
    id: "k-plagwitz",
    typ: "firma",
    name: "Stadtteilverein Plagwitz e. V.",
    strasse: "Weißenfelser Straße 65",
    plz: "04229",
    ort: "Leipzig",
    email: "vorstand@plagwitz-ev.de",
    zahlungsziel_tage: 14,
  },
  {
    id: "k-albrecht",
    typ: "privat",
    name: "Jonas Albrecht",
    strasse: "Holbeinstraße 12",
    plz: "04229",
    ort: "Leipzig",
    email: "jonas.albrecht@posteo.de",
    zahlungsziel_tage: 10,
  },
  {
    id: "k-kessler",
    typ: "privat",
    name: "Dr. Miriam Kessler",
    strasse: "Gohliser Straße 9",
    plz: "04155",
    ort: "Leipzig",
    email: "m.kessler@web.de",
    zahlungsziel_tage: 10,
  },
  {
    id: "k-feldmann",
    typ: "firma",
    name: "Atelier Feldmann Innenarchitektur",
    strasse: "Spinnereistraße 7",
    plz: "04179",
    ort: "Leipzig",
    email: "studio@atelier-feldmann.de",
    notizen: "Erstkontakt über die Spinnerei-Rundgänge. Interesse an Wandillustrationen.",
  },
];

// ---------------------------------------------------------------------------
// Artikel
// ---------------------------------------------------------------------------

interface ArtikelVorlage {
  id: string;
  bezeichnung: string;
  beschreibung: string;
  einheit: Einheit;
  preis: number;
}

const ARTIKEL_VORLAGEN: ArtikelVorlage[] = [
  { id: "a-logo", bezeichnung: "Logoentwicklung", beschreibung: "Recherche, drei Entwürfe, zwei Korrekturschleifen, Reinzeichnung in allen gängigen Formaten", einheit: PAUSCH, preis: 1450_00 },
  { id: "a-gestaltung", bezeichnung: "Gestaltung", beschreibung: "Konzeption und Layout nach Aufwand", einheit: STD, preis: 75_00 },
  { id: "a-illu-gross", bezeichnung: "Illustration ganzseitig", beschreibung: "Farbige Illustration, digital, inkl. einer Korrektur", einheit: STK, preis: 380_00 },
  { id: "a-illu-spot", bezeichnung: "Spot-Illustration", beschreibung: "Kleine Vignette oder Freisteller", einheit: STK, preis: 120_00 },
  { id: "a-workshop", bezeichnung: "Workshop Visual Storytelling", beschreibung: "Ganztägiger Workshop für bis zu 14 Teilnehmende, inkl. Material", einheit: TAG, preis: 680_00 },
  { id: "a-reinzeichnung", bezeichnung: "Reinzeichnung & Druckdaten", beschreibung: "Druckfertige Daten nach Vorgaben der Druckerei", einheit: STD, preis: 65_00 },
  { id: "a-nutzung", bezeichnung: "Erweiterte Nutzungsrechte", beschreibung: "Zeitlich unbegrenzt, Print und Web, Deutschland", einheit: PAUSCH, preis: 450_00 },
  { id: "a-fahrt", bezeichnung: "Fahrtkosten", beschreibung: "Je gefahrenem Kilometer", einheit: KM, preis: 30 },
];

const KUNDENPREISE: Kundenpreis[] = [
  { id: "kp-1", artikel_id: "a-gestaltung", kunde_id: "k-bohnenwerk", preis_cent: 70_00, gueltig_ab: "2026-01-01" },
  { id: "kp-2", artikel_id: "a-illu-gross", kunde_id: "k-ostwind", preis_cent: 350_00, gueltig_ab: null },
  { id: "kp-3", artikel_id: "a-workshop", kunde_id: "k-plagwitz", preis_cent: 540_00, gueltig_ab: null },
];

// ---------------------------------------------------------------------------
// Belege
// ---------------------------------------------------------------------------

/** Eine Position als [Artikel-ID, Menge, Preis in Cent oder null für den gültigen Preis]. */
type PosVorlage = [artikelId: string, menge: number, preis?: number];

interface BelegVorlage {
  id: string;
  typ: Beleg["typ"];
  nummer: string | null;
  status: string;
  kunde: string;
  datum: string;
  leistungsdatum?: string;
  leistungsdatum_bis?: string;
  gueltig_bis?: string;
  ziel?: number;
  kopf?: string;
  pos: PosVorlage[];
  /** Zahlungen als [Datum, Betrag in Cent oder "voll"]. */
  zahlungen?: [string, number | "voll"][];
  ursprungsangebot_id?: string;
  storno_von_id?: string;
  gutschrift_zu_id?: string;
}

const BELEG_VORLAGEN: BelegVorlage[] = [
  // Vorjahr: Grundlage für die 25.000-€-Prüfung.
  { id: "r-2025-18", typ: "rechnung", nummer: "RE-2025-0018", status: "gestellt", kunde: "k-bohnenwerk", datum: "2025-09-15", pos: [["a-illu-gross", 6], ["a-gestaltung", 18, 70_00], ["a-nutzung", 1]], zahlungen: [["2025-09-26", "voll"]] },
  { id: "r-2025-19", typ: "rechnung", nummer: "RE-2025-0019", status: "gestellt", kunde: "k-ostwind", datum: "2025-10-08", ziel: 30, pos: [["a-illu-gross", 14, 350_00], ["a-illu-spot", 10], ["a-reinzeichnung", 12]], zahlungen: [["2025-11-04", "voll"]] },
  { id: "r-2025-20", typ: "rechnung", nummer: "RE-2025-0020", status: "gestellt", kunde: "k-kulturamt", datum: "2025-11-03", ziel: 30, pos: [["a-workshop", 4], ["a-gestaltung", 20]], zahlungen: [["2025-11-28", "voll"]] },
  { id: "r-2025-21", typ: "rechnung", nummer: "RE-2025-0021", status: "gestellt", kunde: "k-brauhaus", datum: "2025-12-01", pos: [["a-gestaltung", 26], ["a-reinzeichnung", 10], ["a-illu-gross", 2]], zahlungen: [["2025-12-12", "voll"]] },

  // Laufendes Jahr.
  { id: "r-01", typ: "rechnung", nummer: "RE-2026-0001", status: "gestellt", kunde: "k-bohnenwerk", datum: "2026-01-20", leistungsdatum: "2026-01-12", pos: [["a-illu-gross", 6], ["a-nutzung", 1]], zahlungen: [["2026-02-02", "voll"]] },
  { id: "r-02", typ: "rechnung", nummer: "RE-2026-0002", status: "gestellt", kunde: "k-ostwind", datum: "2026-02-16", ziel: 30, pos: [["a-illu-gross", 3, 350_00], ["a-illu-spot", 8], ["a-reinzeichnung", 6]], zahlungen: [["2026-03-11", "voll"]] },
  { id: "r-03", typ: "rechnung", nummer: "RE-2026-0003", status: "gestellt", kunde: "k-kulturamt", datum: "2026-03-10", leistungsdatum: "2026-02-23", leistungsdatum_bis: "2026-02-25", ziel: 30, pos: [["a-workshop", 3], ["a-gestaltung", 12]], zahlungen: [["2026-04-08", "voll"]] },
  { id: "r-04", typ: "rechnung", nummer: "RE-2026-0004", status: "gestellt", kunde: "k-albrecht", datum: "2026-04-02", ziel: 10, pos: [["a-illu-gross", 1], ["a-gestaltung", 4]], zahlungen: [["2026-04-10", "voll"]] },
  { id: "r-05", typ: "rechnung", nummer: "RE-2026-0005", status: "gestellt", kunde: "k-brauhaus", datum: "2026-05-05", pos: [["a-logo", 1], ["a-gestaltung", 14], ["a-nutzung", 1]], zahlungen: [["2026-05-20", "voll"]] },
  { id: "r-06", typ: "rechnung", nummer: "RE-2026-0006", status: "storniert", kunde: "k-plagwitz", datum: "2026-06-12", pos: [["a-gestaltung", 10]] },
  { id: "r-07", typ: "rechnung", nummer: "RE-2026-0007", status: "gestellt", kunde: "k-plagwitz", datum: "2026-06-15", storno_von_id: "r-06", kopf: "Stornorechnung zu RE-2026-0006 vom 12.06.2026.", pos: [["a-gestaltung", 10, -75_00]] },
  { id: "r-08", typ: "rechnung", nummer: "RE-2026-0008", status: "gestellt", kunde: "k-ostwind", datum: "2026-06-30", ziel: 30, ursprungsangebot_id: "an-01", leistungsdatum: "2026-06-01", leistungsdatum_bis: "2026-06-26", pos: [["a-illu-gross", 12, 350_00], ["a-reinzeichnung", 10]], zahlungen: [["2026-07-28", "voll"]] },
  { id: "r-09", typ: "rechnung", nummer: "RE-2026-0009", status: "gestellt", kunde: "k-bohnenwerk", datum: "2026-08-18", pos: [["a-illu-gross", 4], ["a-gestaltung", 8, 70_00]], zahlungen: [["2026-09-01", "voll"]] },
  { id: "r-10", typ: "rechnung", nummer: "RE-2026-0010", status: "gestellt", kunde: "k-kessler", datum: "2026-09-22", ziel: 10, pos: [["a-illu-gross", 1], ["a-illu-spot", 2]], zahlungen: [["2026-10-01", "voll"]] },
  { id: "r-12", typ: "rechnung", nummer: "RE-2026-0011", status: "gestellt", kunde: "k-brauhaus", datum: "2026-09-28", pos: [["a-gestaltung", 9], ["a-reinzeichnung", 3]] },
  { id: "r-11", typ: "rechnung", nummer: "RE-2026-0012", status: "gestellt", kunde: "k-kulturamt", datum: "2026-10-20", ziel: 30, leistungsdatum: "2026-09-01", leistungsdatum_bis: "2026-10-16", pos: [["a-gestaltung", 30], ["a-workshop", 1], ["a-fahrt", 46]], zahlungen: [["2026-11-06", 1500_00]] },
  { id: "r-13", typ: "rechnung", nummer: "RE-2026-0013", status: "gestellt", kunde: "k-plagwitz", datum: "2026-11-02", pos: [["a-gestaltung", 10], ["a-reinzeichnung", 2]] },
  { id: "r-14", typ: "rechnung", nummer: null, status: "entwurf", kunde: "k-bohnenwerk", datum: "2026-11-12", leistungsdatum: "2026-11-10", pos: [["a-illu-gross", 3], ["a-illu-spot", 4], ["a-gestaltung", 6, 70_00], ["a-nutzung", 1]] },

  // Angebote.
  { id: "an-01", typ: "angebot", nummer: "AN-2026-0001", status: "angenommen", kunde: "k-ostwind", datum: "2026-05-28", gueltig_bis: "2026-06-27", pos: [["a-illu-gross", 12, 350_00], ["a-reinzeichnung", 10]] },
  { id: "an-02", typ: "angebot", nummer: "AN-2026-0002", status: "abgelehnt", kunde: "k-plagwitz", datum: "2026-09-10", gueltig_bis: "2026-10-10", pos: [["a-gestaltung", 24], ["a-illu-spot", 6]] },
  { id: "an-03", typ: "angebot", nummer: "AN-2026-0003", status: "festgeschrieben", kunde: "k-brauhaus", datum: "2026-10-28", gueltig_bis: "2026-11-27", pos: [["a-illu-gross", 4], ["a-nutzung", 1], ["a-reinzeichnung", 4]] },
  { id: "an-04", typ: "angebot", nummer: null, status: "entwurf", kunde: "k-kulturamt", datum: "2026-11-11", gueltig_bis: "2026-12-11", pos: [["a-workshop", 4], ["a-gestaltung", 8], ["a-fahrt", 120]] },

  // Gutschrift zur Porträtillustration: eine Vignette entfiel.
  { id: "gs-01", typ: "gutschrift", nummer: "GS-2026-0001", status: "festgeschrieben", kunde: "k-kessler", datum: "2026-10-05", ziel: 0, gutschrift_zu_id: "r-10", pos: [["a-illu-spot", 1, -120_00]], zahlungen: [["2026-10-07", "voll"]] },
];

const EINGANG: Eingangsrechnung[] = [
  {
    id: "er-papier",
    dateiname: "Rechnung_PW-48213.pdf",
    format: "zugferd",
    rechnungssteller_name: "Papierwerk Leipzig GmbH",
    rechnungsnummer: "PW-48213",
    rechnungsdatum: "2026-03-04",
    betrag_cent: 186_40,
    waehrung: "EUR",
    manuell_erfasst: false,
    importiert_am: "2026-03-05T08:41:12Z",
    kaeufer_name: "Lena Hoffmann",
    kaeufer_strasse: "Karl-Heine-Straße 54",
    kaeufer_plz: "04229",
    kaeufer_ort: "Leipzig",
    kaeufer_land: "DE",
    verkaeufer_strasse: "Brandenburger Straße 2",
    verkaeufer_plz: "04103",
    verkaeufer_ort: "Leipzig",
    verkaeufer_land: "DE",
    verkaeufer_steuernummer: "DE264118930",
    verkaeufer_email: "service@papierwerk-leipzig.de",
    zahlungsbedingungen: "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
    faelligkeitsdatum: "2026-03-18",
    iban: "DE44 8605 0000 1100 2233 44",
    bic: "SOLADES1LPZ",
    bankname: "Sparkasse Leipzig",
    bestellnummer: "",
    leitweg_id: "",
    lieferantennummer: "",
    leistungsdatum: "2026-03-03",
  },
  {
    id: "er-druck",
    dateiname: "xrechnung_2026-1187.xml",
    format: "xrechnung",
    rechnungssteller_name: "Druckerei Grafisches Viertel OHG",
    rechnungsnummer: "2026-1187",
    rechnungsdatum: "2026-08-21",
    betrag_cent: 642_60,
    waehrung: "EUR",
    manuell_erfasst: false,
    importiert_am: "2026-08-22T10:03:47Z",
    kaeufer_name: "Lena Hoffmann · Grafik & Illustration",
    kaeufer_strasse: "Karl-Heine-Straße 54",
    kaeufer_plz: "04229",
    kaeufer_ort: "Leipzig",
    kaeufer_land: "DE",
    verkaeufer_strasse: "Gerichtsweg 28",
    verkaeufer_plz: "04103",
    verkaeufer_ort: "Leipzig",
    verkaeufer_land: "DE",
    verkaeufer_steuernummer: "DE811450327",
    verkaeufer_email: "auftrag@grafisches-viertel.de",
    zahlungsbedingungen: "Zahlbar bis 04.09.2026. 2 % Skonto bei Zahlung bis 28.08.2026.",
    faelligkeitsdatum: "2026-09-04",
    iban: "DE89 8604 0000 0123 4567 89",
    bic: "COBADEFFXXX",
    bankname: "Commerzbank Leipzig",
    bestellnummer: "LH-2026-031",
    leitweg_id: "",
    lieferantennummer: "K-20417",
    leistungsdatum: "2026-08-19",
  },
  {
    id: "er-kreativ",
    dateiname: "KV-2026-30912.pdf",
    format: "zugferd",
    rechnungssteller_name: "Kreativmarkt Versand GmbH",
    rechnungsnummer: "KV-2026-30912",
    rechnungsdatum: "2026-10-30",
    betrag_cent: 89_90,
    waehrung: "EUR",
    manuell_erfasst: true,
    importiert_am: "2026-11-02T16:25:09Z",
    kaeufer_name: "Lena Hoffmann",
    kaeufer_strasse: "Karl-Heine-Straße 54",
    kaeufer_plz: "04229",
    kaeufer_ort: "Leipzig",
    kaeufer_land: "DE",
    verkaeufer_strasse: "Industriestraße 112",
    verkaeufer_plz: "90765",
    verkaeufer_ort: "Fürth",
    verkaeufer_land: "DE",
    verkaeufer_steuernummer: "DE299031775",
    verkaeufer_email: "rechnung@kreativmarkt-versand.de",
    zahlungsbedingungen: "Bereits per PayPal bezahlt.",
    faelligkeitsdatum: "2026-10-30",
    iban: "",
    bic: "",
    bankname: "",
    bestellnummer: "3091255",
    leitweg_id: "",
    lieferantennummer: "",
    leistungsdatum: "2026-10-30",
  },
];

/** Rechnet einen Bruttobetrag mit 19 % in eine Steuerzeile um. */
function steuerzeile19(brutto: number): EingangsrechnungSteuerzeile {
  const netto = Math.round(brutto / 1.19);
  return { nettobetrag_cent: netto, steuersatz_promille: 190, steuerbetrag_cent: brutto - netto };
}

function eingangsPos(bezeichnung: string, menge: number, einzelpreis: number): EingangsrechnungPosition {
  return { bezeichnung, menge, einzelpreis_cent: einzelpreis, positionssumme_cent: menge * einzelpreis };
}

/** Kaufmännisch gerundete Positionssumme wie im Backend (Menge in Tausendsteln). */
export function positionssumme(mengeX1000: number, einzelpreisCent: number): number {
  const roh = mengeX1000 * einzelpreisCent;
  return Math.sign(roh) * Math.round(Math.abs(roh) / 1000);
}

/** Datum plus Tage im ISO-Format. */
export function plusTage(iso: string, tage: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Der vollständige Beispielbestand. */
export function beispielBestand(): Bestand {
  const kunden: Kunde[] = [];
  const adressen: Adresse[] = [];
  const ansprechpartner: Ansprechpartner[] = [];

  KUNDEN_VORLAGEN.forEach((v, i) => {
    kunden.push({
      id: v.id,
      typ: v.typ,
      name: v.name,
      kundennummer: `KD-${String(i + 1).padStart(4, "0")}`,
      zahlungsziel_tage: v.zahlungsziel_tage ?? 14,
      notizen: v.notizen ?? "",
      ust_idnr: v.ust_idnr ?? "",
      email: v.email,
      leitweg_id: v.leitweg_id ?? "",
      kaeuferreferenz: "",
      hat_adresse: true,
      kundenpreise_anzahl: 0,
    });
    adressen.push({
      id: `adr-${v.id}`,
      kunde_id: v.id,
      typ: "rechnung",
      strasse: v.strasse,
      plz: v.plz,
      ort: v.ort,
      land: "DE",
      ist_standard: true,
    });
    if (v.ansprechpartner) {
      ansprechpartner.push({ id: `ap-${v.id}`, kunde_id: v.id, ist_standard: true, ...v.ansprechpartner });
    }
  });
  // Eine abweichende Lieferanschrift, damit der Reiter nicht nur eine Zeile zeigt.
  adressen.push({
    id: "adr-bohnenwerk-lager",
    kunde_id: "k-bohnenwerk",
    typ: "lieferung",
    strasse: "Saalfelder Straße 8a",
    plz: "04179",
    ort: "Leipzig",
    land: "DE",
    ist_standard: false,
  });
  ansprechpartner.push({
    id: "ap-bohnenwerk-2",
    kunde_id: "k-bohnenwerk",
    name: "Annett Lorenz",
    rolle: "Buchhaltung",
    email: "a.lorenz@bohnenwerk-leipzig.de",
    telefon: "0341 4926 140",
    ist_standard: false,
  });

  const artikel: Artikel[] = ARTIKEL_VORLAGEN.map((v, i) => ({
    id: v.id,
    artikelnummer: `ART-${String(i + 1).padStart(4, "0")}`,
    bezeichnung: v.bezeichnung,
    beschreibung: v.beschreibung,
    einheit_id: v.einheit.id,
    standardpreis_cent: v.preis,
    ust_satz_prozent: 19,
    kundenpreise_anzahl: 0,
  }));

  const belege: GespeicherterBeleg[] = [];
  const positionen: Belegposition[] = [];
  const zahlungen: Zahlung[] = [];

  for (const v of BELEG_VORLAGEN) {
    const kunde = kunden.find((k) => k.id === v.kunde);
    let summe = 0;
    v.pos.forEach(([artikelId, menge, preis], i) => {
      const a = ARTIKEL_VORLAGEN.find((x) => x.id === artikelId);
      if (!a) throw new Error(`Unbekannter Artikel ${artikelId}`);
      const einzelpreis = preis ?? a.preis;
      const mengeX1000 = menge * 1000;
      const ps = positionssumme(mengeX1000, einzelpreis);
      summe += ps;
      positionen.push({
        id: `${v.id}-p${i + 1}`,
        beleg_id: v.id,
        artikel_id: artikelId,
        bezeichnung: a.bezeichnung,
        einheit_kuerzel: a.einheit.kuerzel,
        einzelpreis_cent: einzelpreis,
        menge: mengeX1000,
        positionssumme_cent: ps,
        ust_satz_prozent: 19,
        reihenfolge: i + 1,
      });
    });
    const typText = v.typ === "angebot" ? "angebot" : v.typ === "rechnung" ? "rechnung" : "gutschrift";
    const einst = standardEinstellungen();
    belege.push({
      id: v.id,
      typ: v.typ,
      nummer: v.nummer,
      status: v.status,
      kunde_id: v.kunde,
      datum: v.datum,
      leistungsdatum: v.leistungsdatum ?? v.datum,
      leistungsdatum_bis: v.leistungsdatum_bis ?? null,
      gueltig_bis: v.gueltig_bis ?? null,
      zahlungsziel_tage: v.ziel ?? kunde?.zahlungsziel_tage ?? 14,
      kopftext: v.kopf ?? einst.get(`text.${typText}.kopf`) ?? "",
      fusstext: einst.get(`text.${typText}.fuss`) ?? "",
      summe_cent: summe,
      ursprungsangebot_id: v.ursprungsangebot_id ?? null,
      storno_von_id: v.storno_von_id ?? null,
      adresse_id: null,
      ansprechpartner_id: v.typ === "angebot" || v.typ === "rechnung" ? (ansprechpartner.find((a) => a.kunde_id === v.kunde && a.ist_standard)?.id ?? null) : null,
      gesamtauftragswert_cent: null,
      kunde_snapshot_name: kunde?.name ?? null,
      gutschrift_zu_id: v.gutschrift_zu_id ?? null,
    });
    (v.zahlungen ?? []).forEach(([datum, betrag], i) => {
      zahlungen.push({
        id: `${v.id}-z${i + 1}`,
        rechnung_id: v.id,
        datum,
        betrag_cent: betrag === "voll" ? summe : betrag,
        notiz: betrag === "voll" ? (summe < 0 ? "Erstattung per Überweisung" : "Überweisung") : "Abschlag laut Vereinbarung",
      });
    });
  }

  for (const kp of KUNDENPREISE) {
    const a = artikel.find((x) => x.id === kp.artikel_id);
    const k = kunden.find((x) => x.id === kp.kunde_id);
    if (a) a.kundenpreise_anzahl += 1;
    if (k) k.kundenpreise_anzahl += 1;
  }

  return {
    firma: { ...FIRMA },
    einheiten: EINHEITEN.map((e) => ({ ...e })),
    kunden,
    adressen,
    ansprechpartner,
    artikel,
    kundenpreise: KUNDENPREISE.map((k) => ({ ...k })),
    belege,
    positionen,
    zahlungen,
    eingangsrechnungen: EINGANG.map((e) => ({ ...e })),
    eingangsPositionen: {
      "er-papier": [eingangsPos("Aquarellpapier Hahnemühle A3, 25 Blatt", 2, 48_90), eingangsPos("Musterbogen Naturpapiere", 1, 22_60), eingangsPos("Versand", 1, 66_00)],
      "er-druck": [eingangsPos("Probedruck Verpackung, 4/0-farbig", 6, 54_50), eingangsPos("Proof nach ISO 12647-7", 3, 105_20)],
      "er-kreativ": [eingangsPos("Copic Marker Set 12 Farben", 1, 84_95), eingangsPos("Versandkosten", 1, 4_95)],
    },
    eingangsSteuerzeilen: {
      "er-papier": [steuerzeile19(186_40)],
      "er-druck": [steuerzeile19(642_60)],
      "er-kreativ": [steuerzeile19(89_90)],
    },
    eingangsAenderungen: {
      "er-kreativ": [
        { feld: "betrag_cent", alt: "84,95", neu: "89,90", geaendert_am: "2026-11-02T16:26:40Z" },
        { feld: "rechnungssteller_name", alt: "Kreativmarkt Versand", neu: "Kreativmarkt Versand GmbH", geaendert_am: "2026-11-02T16:27:02Z" },
      ],
    },
    einstellungen: standardEinstellungen(),
    nummernkreise: nummernkreise({ kunde: kunden.length, artikel: artikel.length, angebot: 3, rechnung: 13, gutschrift: 1 }),
    sicherungen: [
      { zeitstempel: "2026-11-13_08-02-11", groesse_bytes: 1_482_752, pfad: "~/Library/Application Support/de.chefsachen.app/sicherungen/chefsachen_2026-11-13_08-02-11.db" },
      { zeitstempel: "2026-11-12_08-01-54", groesse_bytes: 1_478_656, pfad: "~/Library/Application Support/de.chefsachen.app/sicherungen/chefsachen_2026-11-12_08-01-54.db" },
      { zeitstempel: "2026-11-10_09-15-37", groesse_bytes: 1_470_464, pfad: "~/Library/Application Support/de.chefsachen.app/sicherungen/chefsachen_2026-11-10_09-15-37.db" },
      { zeitstempel: "2026-11-06_18-44-02", groesse_bytes: 1_462_272, pfad: "~/Library/Application Support/de.chefsachen.app/sicherungen/chefsachen_2026-11-06_18-44-02.db" },
    ],
  };
}
