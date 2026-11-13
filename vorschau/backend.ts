/**
 * Nachgebildetes Tauri-Backend für die Vorschau.
 *
 * Beantwortet jeden Befehl, den `src/api.ts` und die Tauri-Plugins aufrufen,
 * aus einem Bestand im Arbeitsspeicher. Anlegen und Ändern wirken für die
 * laufende Sitzung; ein Neuladen der Seite stellt die Beispieldaten wieder her.
 *
 * Die Logik bildet das Rust-Backend nur so weit nach, wie die Oberfläche es
 * zum Darstellen braucht. Steuerrecht, Archiv und Dateiausgabe fehlen bewusst.
 */

import type {
  Adresse,
  Ansprechpartner,
  AppFehler,
  Artikel,
  Beleg,
  BelegDetail,
  BelegNeu,
  BelegpositionNeu,
  BelegUpdate,
  DashboardDaten,
  Eingangsrechnung,
  EingangsrechnungFelderNeu,
  EingangsrechnungUpdate,
  EingangsrechnungVorschau,
  Firma,
  Grenze,
  Hinweis,
  Jahresauswertung,
  Kunde,
  KundeNeu,
  Kundenpreis,
  KundenpreisMitArtikel,
  OffenerPosten,
  Umsatzgrenzen,
  Warnstufe,
  Zahlung,
  ZahlungNeu,
  Zahlungsstand,
} from "../src/api";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { HEUTE, plusTage, positionssumme, type Bestand, type GespeicherterBeleg } from "./daten";
import { vorlageSvg } from "./vorlageSvg";

type Argumente = InvokeArgs | undefined;

let zaehler = 0;
function neueId(praefix: string): string {
  zaehler += 1;
  return `${praefix}-neu-${zaehler}`;
}

function nichtGefunden(): AppFehler {
  return { typ: "nicht_gefunden", meldung: "Datensatz nicht gefunden" };
}

function validierung(feld: string, meldung: string): AppFehler {
  return { typ: "validation", feld, meldung };
}

function finde<T extends { id: string }>(liste: T[], id: unknown): T {
  const treffer = liste.find((x) => x.id === id);
  if (!treffer) throw nichtGefunden();
  return treffer;
}

function enthaelt(text: string, suche: unknown): boolean {
  if (typeof suche !== "string" || suche.trim() === "") return true;
  return text.toLowerCase().includes(suche.trim().toLowerCase());
}

function euro(cent: number): string {
  return (
    (cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €"
  );
}

// ---------------------------------------------------------------------------
// Ableitungen wie im Rust-Teil
// ---------------------------------------------------------------------------

function zahlungsstand(summe: number, bezahlt: number): Zahlungsstand {
  if (summe === 0) return bezahlt === 0 ? "bezahlt" : "ueberzahlt";
  const offen = summe - bezahlt;
  if (offen === 0) return "bezahlt";
  if (offen > 0 !== summe > 0) return "ueberzahlt";
  return bezahlt === 0 ? "offen" : "teilbezahlt";
}

const ANNAEHERUNG = 80;
const KRITISCH = 95;
const GRENZE_VORJAHR = 25_000_00;
const GRENZE_JAHR = 100_000_00;

function anteil(umsatz: number, grenze: number): number {
  if (grenze <= 0 || umsatz <= 0) return 0;
  return Math.floor((umsatz * 100) / grenze);
}

function warnstufe(umsatz: number, grenze: number): Warnstufe {
  if (umsatz > grenze) return "ueberschritten";
  const p = anteil(umsatz, grenze);
  if (p >= KRITISCH) return "kritisch";
  if (p >= ANNAEHERUNG) return "annaeherung";
  return "keine";
}

function grenze(umsatz: number, grenzeCent: number): Grenze {
  return { umsatz_cent: umsatz, grenze_cent: grenzeCent, anteil_prozent: anteil(umsatz, grenzeCent), warnstufe: warnstufe(umsatz, grenzeCent) };
}

/**
 * Hinweise zur Umsatzlage. Nachgebildet ist nur der Fall „Regelung gegeben"
 * (Annäherung an eine der beiden Grenzen); die Fälle mit bereits entfallener
 * Regelung braucht die Vorschau nicht.
 */
function hinweise(laufend: number, grenzeLaufend: number, gruendungsjahr: boolean): Hinweis[] {
  const liste: Hinweis[] = [];
  const stufeLaufend = warnstufe(laufend, grenzeLaufend);
  if (stufeLaufend !== "keine") {
    liste.push({
      stufe: stufeLaufend,
      titel: `Nur noch ${euro(Math.max(grenzeLaufend - laufend, 0))} bis zur Grenze dieses Jahres`,
      bedeutung: `Der Umsatz liegt bei ${euro(laufend)} von ${euro(grenzeLaufend)}. Wird die Grenze überschritten, endet die Kleinunternehmerregelung sofort.`,
      finanzielle_folge: null,
      handlung: [
        "Rechnen Sie durch, ob geplante Aufträge dieses Jahr noch unter der Grenze bleiben oder ob die Umstellung ansteht.",
        "Bereiten Sie die Umstellung vor: Preise kalkulieren, Rechnungsvorlagen anpassen, Voranmeldung anmelden.",
      ],
    });
  }
  if (!gruendungsjahr) {
    const stufe = warnstufe(laufend, GRENZE_VORJAHR);
    if (stufe !== "keine" && laufend <= GRENZE_VORJAHR) {
      const rest = Math.max(GRENZE_VORJAHR - laufend, 0);
      liste.push({
        stufe,
        titel: "Der Status im nächsten Jahr steht auf der Kippe",
        bedeutung: `Der Umsatz dieses Jahres liegt bei ${euro(laufend)}, noch ${euro(rest)} bis zu den ${euro(GRENZE_VORJAHR)}, an denen sich entscheidet, ob die Kleinunternehmerregelung im nächsten Jahr noch gilt. Überschreiten Sie sie, entfällt die Regelung für das gesamte Folgejahr, und zwar ab dem 1. Januar.`,
        finanzielle_folge: null,
        handlung: [
          "Entscheiden Sie bewusst: Aufträge ins nächste Jahr schieben und unter der Grenze bleiben, oder die Umstellung planen.",
          "Bei Umstellung: Ihre Preise steigen für Privatkunden um 19 %, sofern Sie die Steuer aufschlagen. Für Geschäftskunden ändert sich nichts, sie ziehen die Vorsteuer ab.",
          "Denken Sie an den Vorteil der Umstellung: Ab dann können Sie die Vorsteuer aus Anschaffungen geltend machen.",
          "Achtung bei einem freiwilligen Verzicht auf die Regelung: Er bindet Sie für fünf Kalenderjahre (§ 19 Abs. 3 UStG).",
        ],
      });
    }
  }
  return liste;
}

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function backendErstellen(b: Bestand) {
  function kundenName(id: string): string {
    return b.kunden.find((k) => k.id === id)?.name ?? "";
  }

  function bezahlt(belegId: string): number {
    return b.zahlungen.filter((z) => z.rechnung_id === belegId).reduce((s, z) => s + z.betrag_cent, 0);
  }

  function summeNeuBerechnen(belegId: string) {
    const beleg = finde(b.belege, belegId);
    beleg.summe_cent = b.positionen.filter((p) => p.beleg_id === belegId).reduce((s, p) => s + p.positionssumme_cent, 0);
  }

  function ausgeben(g: GespeicherterBeleg): Beleg {
    const bez = bezahlt(g.id);
    const mitLage = (g.typ === "rechnung" || g.typ === "gutschrift") && g.status !== "entwurf";
    return {
      ...g,
      kunde_snapshot_name: g.kunde_snapshot_name ?? kundenName(g.kunde_id),
      bezahlt_cent: bez,
      zahlungsstand: mitLage ? zahlungsstand(g.summe_cent, bez) : null,
      faellig_am: mitLage && !g.storno_von_id && g.typ !== "gutschrift" ? plusTage(g.datum, g.zahlungsziel_tage) : null,
    };
  }

  function sortiert(liste: GespeicherterBeleg[]): GespeicherterBeleg[] {
    return [...liste].sort((x, y) => y.datum.localeCompare(x.datum));
  }

  function kundeAusgeben(k: Kunde): Kunde {
    return {
      ...k,
      hat_adresse: b.adressen.some((a) => a.kunde_id === k.id),
      hat_offene_entwuerfe: b.belege.some((x) => x.kunde_id === k.id && x.status === "entwurf"),
      kundenpreise_anzahl: b.kundenpreise.filter((p) => p.kunde_id === k.id).length,
    };
  }

  function artikelAusgeben(a: Artikel): Artikel {
    return { ...a, kundenpreise_anzahl: b.kundenpreise.filter((p) => p.artikel_id === a.id).length };
  }

  function naechsteNummer(art: string, datum: string): string {
    const nk = b.nummernkreise.find((n) => n.art === art);
    if (!nk) return `${art.toUpperCase()}-${Date.now()}`;
    nk.zaehler += 1;
    return nk.format
      .replace("{JJJJ}", datum.slice(0, 4))
      .replace(/\{lfd:(\d+)\}/, (_, stellen: string) => String(nk.zaehler).padStart(Number(stellen), "0"));
  }

  function belegDetail(id: unknown): BelegDetail {
    const g = finde(b.belege, id);
    const zahlungen = b.zahlungen.filter((z) => z.rechnung_id === g.id).sort((x, y) => x.datum.localeCompare(y.datum));
    const bez = zahlungen.reduce((s, z) => s + z.betrag_cent, 0);
    return {
      beleg: ausgeben(g),
      positionen: b.positionen.filter((p) => p.beleg_id === g.id).sort((x, y) => x.reihenfolge - y.reihenfolge),
      zahlungen,
      bezahlt_cent: bez,
      offener_betrag_cent: g.summe_cent - bez,
      steuerzeilen: [],
      gutschrift_zu_nummer: g.gutschrift_zu_id ? (b.belege.find((x) => x.id === g.gutschrift_zu_id)?.nummer ?? null) : null,
    };
  }

  function belegAnlegen(d: BelegNeu & { gueltig_bis?: string | null; ursprungsangebot_id?: string | null }): GespeicherterBeleg {
    if (!b.kunden.some((k) => k.id === d.kunde_id)) throw validierung("kunde_id", "Bitte einen Kunden wählen");
    const tage = Number(b.einstellungen.get("vorlage.angebot_gueltigkeit_tage") ?? "30");
    const neu: GespeicherterBeleg = {
      id: neueId("beleg"),
      typ: d.typ,
      nummer: null,
      status: "entwurf",
      kunde_id: d.kunde_id,
      datum: d.datum,
      leistungsdatum: d.leistungsdatum,
      leistungsdatum_bis: null,
      gueltig_bis: d.typ === "angebot" ? (d.gueltig_bis ?? plusTage(d.datum, tage)) : null,
      zahlungsziel_tage: d.zahlungsziel_tage,
      kopftext: d.kopftext,
      fusstext: d.fusstext,
      summe_cent: 0,
      ursprungsangebot_id: d.ursprungsangebot_id ?? null,
      storno_von_id: null,
      adresse_id: null,
      ansprechpartner_id: null,
      gesamtauftragswert_cent: null,
      kunde_snapshot_name: null,
      gutschrift_zu_id: d.gutschrift_zu_id ?? null,
    };
    b.belege.push(neu);
    return neu;
  }

  function positionenKopieren(vonId: string, nachId: string, negieren = false) {
    for (const p of b.positionen.filter((x) => x.beleg_id === vonId)) {
      b.positionen.push({
        ...p,
        id: neueId("pos"),
        beleg_id: nachId,
        einzelpreis_cent: negieren ? -Math.abs(p.einzelpreis_cent) : p.einzelpreis_cent,
        positionssumme_cent: negieren ? -Math.abs(p.positionssumme_cent) : p.positionssumme_cent,
      });
    }
    summeNeuBerechnen(nachId);
  }

  function vereinnahmtImJahr(jahr: number): number {
    return b.zahlungen
      .filter((z) => z.datum.startsWith(`${jahr}-`) && b.belege.some((x) => x.id === z.rechnung_id))
      .reduce((s, z) => s + z.betrag_cent, 0);
  }

  function offenePosten(): OffenerPosten[] {
    return b.belege
      .filter((x) => x.typ === "rechnung" && x.status === "gestellt")
      .sort((x, y) => x.datum.localeCompare(y.datum))
      .map((x) => ({ beleg: ausgeben(x), offener_betrag_cent: x.summe_cent - bezahlt(x.id) }))
      .filter((p) => p.offener_betrag_cent !== 0);
  }

  function dashboard(): DashboardDaten {
    const jahr = Number(HEUTE.slice(0, 4));
    const laufend = vereinnahmtImJahr(jahr);
    const vorjahr = vereinnahmtImJahr(jahr - 1);
    const gruendungsjahr = b.firma.gruendungsjahr === jahr;
    const grenzeLaufend = gruendungsjahr ? GRENZE_VORJAHR : GRENZE_JAHR;
    const umsatzgrenzen: Umsatzgrenzen | null = b.firma.kleinunternehmer
      ? {
          laufendes_jahr_gegen_vorjahresgrenze: grenze(laufend, GRENZE_VORJAHR),
          laufendes_jahr_gegen_jahresgrenze: grenze(laufend, grenzeLaufend),
          vorjahr_gegen_vorjahresgrenze: grenze(vorjahr, GRENZE_VORJAHR),
          befund: !gruendungsjahr && vorjahr > GRENZE_VORJAHR ? "entfallen_wegen_vorjahr" : laufend > grenzeLaufend ? "entfallen_wegen_laufendem_jahr" : "gegeben",
          ist_gruendungsjahr: gruendungsjahr,
          hinweise: hinweise(laufend, grenzeLaufend, gruendungsjahr),
        }
      : null;

    const offene_rechnungen = offenePosten()
      .filter((p) => !p.beleg.storno_von_id && p.offener_betrag_cent > 0)
      .map((p) => {
        const faellig = plusTage(p.beleg.datum, p.beleg.zahlungsziel_tage);
        return {
          id: p.beleg.id,
          nummer: p.beleg.nummer ?? "",
          kunde_name: kundenName(p.beleg.kunde_id),
          datum: p.beleg.datum,
          faellig_am: faellig,
          tage_bis_faellig: tageZwischen(HEUTE, faellig),
          offener_betrag_cent: p.offener_betrag_cent,
        };
      })
      .sort((x, y) => x.tage_bis_faellig - y.tage_bis_faellig);

    const offene_angebote = sortiert(b.belege.filter((x) => x.typ === "angebot"))
      .filter((x) => ["festgeschrieben", "angenommen"].includes(x.status))
      .filter((x) => !x.gueltig_bis || x.gueltig_bis >= HEUTE)
      .map((x) => ({
        id: x.id,
        nummer: x.nummer ?? "",
        kunde_name: kundenName(x.kunde_id),
        datum: x.datum,
        summe_cent: x.summe_cent,
        gueltig_bis: x.gueltig_bis ?? null,
      }));

    // Zuletzt bearbeitet: Ohne Änderungszeit nehmen wir neu Angelegtes zuerst,
    // danach das jüngste Belegdatum.
    const neu = b.belege.filter((x) => x.id.includes("-neu-")).reverse();
    const alt = sortiert(b.belege.filter((x) => !x.id.includes("-neu-")));
    const letzte_belege = [...neu, ...alt].slice(0, 5).map((x) => ({
      id: x.id,
      typ: x.typ,
      nummer: x.nummer ?? "",
      kunde_name: kundenName(x.kunde_id),
      status: x.status,
      summe_cent: x.summe_cent,
    }));

    return {
      jahr,
      umsatz_laufendes_jahr_cent: laufend,
      umsatz_vorjahr_cent: vorjahr,
      umsatzgrenzen,
      offene_rechnungen,
      offene_angebote,
      letzte_belege,
    };
  }

  function jahresauswertung(jahr: number): Jahresauswertung {
    const vereinnahmungen = b.zahlungen
      .filter((z) => z.datum.startsWith(`${jahr}-`))
      .map((z) => {
        const beleg = b.belege.find((x) => x.id === z.rechnung_id);
        return {
          datum: z.datum,
          rechnung_nummer: beleg?.nummer ?? "",
          kunde_name: beleg ? kundenName(beleg.kunde_id) : "",
          betrag_cent: z.betrag_cent,
        };
      })
      .sort((x, y) => x.datum.localeCompare(y.datum));
    return { jahr, summe_cent: vereinnahmungen.reduce((s, v) => s + v.betrag_cent, 0), vereinnahmungen };
  }

  function preisErmitteln(artikelId: unknown, kundeId: unknown, belegdatum: unknown): number {
    const a = finde(b.artikel, artikelId);
    const sonder = b.kundenpreise
      .filter((p) => p.artikel_id === artikelId && p.kunde_id === kundeId)
      .filter((p) => !p.gueltig_ab || typeof belegdatum !== "string" || p.gueltig_ab <= belegdatum)
      .sort((x, y) => (y.gueltig_ab ?? "").localeCompare(x.gueltig_ab ?? ""))[0];
    return sonder ? sonder.preis_cent : a.standardpreis_cent;
  }

  const LEERE_EINGANGSFELDER: EingangsrechnungFelderNeu = {
    rechnungssteller_name: "Papierwerk Leipzig GmbH",
    rechnungsnummer: "PW-49870",
    rechnungsdatum: HEUTE,
    betrag_cent: 112_30,
    waehrung: "EUR",
    positionen: [{ bezeichnung: "Skizzenbücher A4, 3 Stück", menge: 3, einzelpreis_cent: 37_43, positionssumme_cent: 112_29 }],
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
    faelligkeitsdatum: plusTage(HEUTE, 14),
    iban: "DE44 8605 0000 1100 2233 44",
    bic: "SOLADES1LPZ",
    bankname: "Sparkasse Leipzig",
    bestellnummer: "",
    leitweg_id: "",
    lieferantennummer: "",
    leistungsdatum: HEUTE,
    steuerzeilen: [{ nettobetrag_cent: 94_37, steuersatz_promille: 190, steuerbetrag_cent: 17_93 }],
  };

  /** Ein paar Bytes, damit Exporte etwas zum Speichern haben. */
  function platzhalterBytes(text: string): number[] {
    return Array.from(new TextEncoder().encode(text));
  }

  const befehle: Record<string, (a: Record<string, unknown>) => unknown> = {
    // Übersicht und Auswertung
    dashboard_laden: () => dashboard(),
    auswertung_jahresauswertung: (a) => jahresauswertung(Number(a.jahr)),
    auswertung_verfuegbare_jahre: () =>
      [...new Set(b.zahlungen.map((z) => Number(z.datum.slice(0, 4))))].sort((x, y) => y - x),

    // Sicherungen
    sicherungen_liste: () => b.sicherungen,
    sicherung_jetzt: () => {
      const s = { zeitstempel: `${HEUTE}_${new Date().toTimeString().slice(0, 8).replace(/:/g, "-")}`, groesse_bytes: 1_490_944, pfad: "~/Library/Application Support/de.chefsachen.app/sicherungen/neu.db" };
      b.sicherungen.unshift(s);
      return s;
    },
    sicherung_wiederherstellen: () => false,
    sicherung_exportieren: () => platzhalterBytes("PK"),
    sicherung_aus_datei_einspielen: () => ({ belege_neu: 0, belege_vorhanden: 0, vormerkung_ersetzt: false }),

    // Einheiten
    einheit_list: () => b.einheiten,
    einheit_create: (a) => {
      const e = { id: neueId("einheit"), name: String(a.name), kuerzel: String(a.kuerzel) };
      b.einheiten.push(e);
      return e;
    },
    einheit_update: (a) => {
      const e = finde(b.einheiten, a.id);
      e.name = String(a.name);
      e.kuerzel = String(a.kuerzel);
      return e;
    },
    einheit_delete: (a) => {
      b.einheiten = b.einheiten.filter((e) => e.id !== a.id);
      return null;
    },

    vorlage_vorschau: (a) => [vorlageSvg(b.firma, new Map(a.einstellungen as [string, string][]))],

    // Kunden
    kunde_list: (a) =>
      b.kunden
        .filter((k) => enthaelt(`${k.name} ${k.kundennummer} ${k.email}`, a.suche))
        .sort((x, y) => x.name.localeCompare(y.name, "de"))
        .map(kundeAusgeben),
    kunde_get: (a) => {
      const k = finde(b.kunden, a.id);
      return {
        kunde: kundeAusgeben(k),
        adressen: b.adressen.filter((x) => x.kunde_id === k.id),
        ansprechpartner: b.ansprechpartner.filter((x) => x.kunde_id === k.id),
      };
    },
    kunde_create: (a) => {
      const d = a.daten as KundeNeu;
      if (!d.name?.trim()) throw validierung("name", "Name darf nicht leer sein");
      const k: Kunde = { ...d, id: neueId("kunde"), kundennummer: naechsteNummer("kunde", HEUTE), hat_adresse: false, kundenpreise_anzahl: 0 };
      b.kunden.push(k);
      return kundeAusgeben(k);
    },
    kunde_update: (a) => {
      const d = a.kunde as Kunde;
      const k = finde(b.kunden, d.id);
      Object.assign(k, d);
      return kundeAusgeben(k);
    },
    kunde_delete: (a) => {
      b.kunden = b.kunden.filter((k) => k.id !== a.id);
      b.kundenpreise = b.kundenpreise.filter((p) => p.kunde_id !== a.id);
      return null;
    },
    adresse_save: (a) => {
      const d = a.adresse as Adresse;
      if (d.ist_standard) b.adressen.filter((x) => x.kunde_id === d.kunde_id && x.typ === d.typ).forEach((x) => (x.ist_standard = false));
      const vorhanden = b.adressen.find((x) => x.id === d.id);
      if (vorhanden) return Object.assign(vorhanden, d);
      const neu = { ...d, id: neueId("adresse") };
      b.adressen.push(neu);
      return neu;
    },
    adresse_delete: (a) => {
      b.adressen = b.adressen.filter((x) => x.id !== a.id);
      return null;
    },
    ansprechpartner_save: (a) => {
      const d = a.ap as Ansprechpartner;
      if (d.ist_standard) b.ansprechpartner.filter((x) => x.kunde_id === d.kunde_id).forEach((x) => (x.ist_standard = false));
      const vorhanden = b.ansprechpartner.find((x) => x.id === d.id);
      if (vorhanden) return Object.assign(vorhanden, d);
      const neu = { ...d, id: neueId("ap") };
      b.ansprechpartner.push(neu);
      return neu;
    },
    ansprechpartner_delete: (a) => {
      b.ansprechpartner = b.ansprechpartner.filter((x) => x.id !== a.id);
      return null;
    },

    // Artikel und Kundenpreise
    artikel_list: (a) =>
      b.artikel.filter((x) => enthaelt(`${x.bezeichnung} ${x.artikelnummer} ${x.beschreibung}`, a.suche)).map(artikelAusgeben),
    artikel_create: (a) => {
      const d = a.daten as Omit<Artikel, "id" | "artikelnummer" | "kundenpreise_anzahl">;
      if (!d.bezeichnung?.trim()) throw validierung("bezeichnung", "Bezeichnung darf nicht leer sein");
      const neu: Artikel = { ...d, id: neueId("artikel"), artikelnummer: naechsteNummer("artikel", HEUTE), kundenpreise_anzahl: 0 };
      b.artikel.push(neu);
      return neu;
    },
    artikel_update: (a) => {
      const d = a.artikel as Artikel;
      return artikelAusgeben(Object.assign(finde(b.artikel, d.id), d));
    },
    artikel_delete: (a) => {
      b.artikel = b.artikel.filter((x) => x.id !== a.id);
      b.kundenpreise = b.kundenpreise.filter((p) => p.artikel_id !== a.id);
      return null;
    },
    kundenpreis_list: (a) => b.kundenpreise.filter((p) => p.artikel_id === a.artikelId),
    kundenpreis_list_fuer_kunde: (a): KundenpreisMitArtikel[] =>
      b.kundenpreise
        .filter((p) => p.kunde_id === a.kundeId)
        .map((p) => {
          const art = b.artikel.find((x) => x.id === p.artikel_id);
          return { ...p, artikelnummer: art?.artikelnummer ?? "", bezeichnung: art?.bezeichnung ?? "", standardpreis_cent: art?.standardpreis_cent ?? 0 };
        }),
    kundenpreis_save: (a) => {
      const d = a.kp as Kundenpreis;
      const vorhanden = b.kundenpreise.find((x) => x.id === d.id);
      if (vorhanden) return Object.assign(vorhanden, d);
      const neu = { ...d, id: neueId("kp") };
      b.kundenpreise.push(neu);
      return neu;
    },
    kundenpreis_delete: (a) => {
      b.kundenpreise = b.kundenpreise.filter((x) => x.id !== a.id);
      return null;
    },
    preis_ermitteln: (a) => preisErmitteln(a.artikelId, a.kundeId, a.belegdatum),

    // Firma
    firma_get: () => b.firma,
    firma_save: (a) => {
      b.firma = { ...(a.firma as Firma), eingerichtet: true };
      return b.firma;
    },
    firma_pruefen: (a) => {
      const f = a.firma as Firma;
      if (!f.name?.trim()) throw validierung("name", "Name darf nicht leer sein");
      return null;
    },
    firma_logo_set: () => null,
    firma_logo_get: () => null,

    // Einstellungen
    einstellung_get: (a) => b.einstellungen.get(String(a.key)) ?? null,
    einstellung_list: () => [...b.einstellungen.entries()],
    einstellung_set: (a) => {
      b.einstellungen.set(String(a.key), String(a.value));
      return null;
    },
    nummernkreis_list: () => b.nummernkreise,
    nummernkreis_update: (a) => {
      const nk = b.nummernkreise.find((n) => n.art === a.art);
      if (nk) {
        nk.format = String(a.format);
        nk.jahres_reset = Boolean(a.jahresReset);
      }
      return null;
    },

    // Belege
    beleg_list: (a) =>
      sortiert(
        b.belege
          .filter((x) => !a.typ || x.typ === a.typ)
          .filter((x) => !a.status || x.status === a.status)
          .filter((x) => enthaelt(`${x.nummer ?? ""} ${kundenName(x.kunde_id)}`, a.suche)),
      ).map(ausgeben),
    beleg_get: (a) => belegDetail(a.id),
    beleg_create: (a) => ausgeben(belegAnlegen(a.daten as BelegNeu)),
    beleg_update: (a) => {
      const d = a.daten as BelegUpdate;
      const g = finde(b.belege, d.id);
      if (g.status !== "entwurf") throw validierung("status", "Nur Entwurfsbelege können bearbeitet werden");
      Object.assign(g, {
        kunde_id: d.kunde_id,
        datum: d.datum,
        leistungsdatum: d.leistungsdatum,
        leistungsdatum_bis: d.leistungsdatum_bis ?? null,
        gueltig_bis: g.typ === "angebot" ? (d.gueltig_bis ?? null) : null,
        zahlungsziel_tage: d.zahlungsziel_tage,
        kopftext: d.kopftext,
        fusstext: d.fusstext,
        adresse_id: d.adresse_id ?? null,
        ansprechpartner_id: d.ansprechpartner_id ?? null,
        gesamtauftragswert_cent: d.gesamtauftragswert_cent,
      });
      return ausgeben(g);
    },
    beleg_delete: (a) => {
      b.belege = b.belege.filter((x) => x.id !== a.id);
      b.positionen = b.positionen.filter((p) => p.beleg_id !== a.id);
      return null;
    },
    beleg_duplizieren: (a) => {
      const g = finde(b.belege, a.id);
      const neu = belegAnlegen({ ...g, datum: HEUTE, leistungsdatum: HEUTE, gutschrift_zu_id: null, gueltig_bis: null });
      positionenKopieren(g.id, neu.id);
      return ausgeben(neu);
    },
    belegposition_save: (a) => {
      const d = a.position as BelegpositionNeu;
      const beleg = finde(b.belege, d.beleg_id);
      if (d.menge <= 0) throw validierung("menge", "Menge muss größer als 0 sein");
      const art = d.artikel_id ? b.artikel.find((x) => x.id === d.artikel_id) : undefined;
      const preis = d.einzelpreis_cent ?? (art ? preisErmitteln(art.id, beleg.kunde_id, beleg.datum) : 0);
      const werte = {
        beleg_id: d.beleg_id,
        artikel_id: d.artikel_id,
        bezeichnung: d.bezeichnung,
        einheit_kuerzel: d.einheit_kuerzel,
        einzelpreis_cent: preis,
        menge: d.menge,
        positionssumme_cent: positionssumme(d.menge, preis),
        ust_satz_prozent: art?.ust_satz_prozent ?? d.ust_satz_prozent ?? 19,
      };
      const vorhanden = b.positionen.find((p) => p.id === d.id);
      let ergebnis;
      if (vorhanden) {
        ergebnis = Object.assign(vorhanden, werte);
      } else {
        const reihenfolge = Math.max(0, ...b.positionen.filter((p) => p.beleg_id === d.beleg_id).map((p) => p.reihenfolge)) + 1;
        ergebnis = { ...werte, id: d.id || neueId("pos"), reihenfolge };
        b.positionen.push(ergebnis);
      }
      summeNeuBerechnen(d.beleg_id);
      return ergebnis;
    },
    belegposition_delete: (a) => {
      const p = finde(b.positionen, a.id);
      b.positionen = b.positionen.filter((x) => x.id !== a.id);
      summeNeuBerechnen(p.beleg_id);
      return null;
    },
    belegposition_verschieben: (a) => {
      const p = finde(b.positionen, a.id);
      const liste = b.positionen.filter((x) => x.beleg_id === p.beleg_id).sort((x, y) => x.reihenfolge - y.reihenfolge);
      const i = liste.indexOf(p);
      const j = a.richtung === "hoch" ? i - 1 : i + 1;
      if (j >= 0 && j < liste.length) {
        const r = liste[j].reihenfolge;
        liste[j].reihenfolge = p.reihenfolge;
        p.reihenfolge = r;
      }
      return null;
    },
    beleg_stellen: (a) => {
      const g = finde(b.belege, a.id);
      if (g.status !== "entwurf") throw validierung("status", "Nur Entwurfsbelege können festgeschrieben werden");
      if (!b.positionen.some((p) => p.beleg_id === g.id)) throw validierung("positionen", "Beleg benötigt mindestens eine Position");
      g.nummer = naechsteNummer(g.typ, g.datum);
      g.status = g.typ === "rechnung" ? "gestellt" : "festgeschrieben";
      g.kunde_snapshot_name = kundenName(g.kunde_id);
      return ausgeben(g);
    },
    angebot_status_setzen: (a) => {
      const g = finde(b.belege, a.id);
      g.status = String(a.status);
      return ausgeben(g);
    },
    angebot_in_rechnung_ueberfuehren: (a) => {
      const an = finde(b.belege, a.angebotId);
      const neu = belegAnlegen({
        typ: "rechnung",
        kunde_id: an.kunde_id,
        datum: HEUTE,
        leistungsdatum: HEUTE,
        zahlungsziel_tage: b.kunden.find((k) => k.id === an.kunde_id)?.zahlungsziel_tage ?? 14,
        kopftext: b.einstellungen.get("text.rechnung.kopf") ?? "",
        fusstext: b.einstellungen.get("text.rechnung.fuss") ?? "",
        ursprungsangebot_id: an.id,
      });
      positionenKopieren(an.id, neu.id);
      return ausgeben(neu);
    },
    rechnung_stornieren: (a) => {
      const r = finde(b.belege, a.id);
      if (r.status !== "gestellt") throw validierung("status", "Nur gestellte Rechnungen können storniert werden");
      const storno = belegAnlegen({ ...r, datum: HEUTE, kopftext: `Stornorechnung zu ${r.nummer ?? ""}.`, gutschrift_zu_id: null });
      positionenKopieren(r.id, storno.id, true);
      storno.storno_von_id = r.id;
      storno.status = "gestellt";
      storno.nummer = naechsteNummer("rechnung", HEUTE);
      storno.kunde_snapshot_name = kundenName(r.kunde_id);
      r.status = "storniert";
      return ausgeben(storno);
    },
    gutschrift_aus_rechnung_anlegen: (a) => {
      const r = finde(b.belege, a.rechnungId);
      const gs = belegAnlegen({
        typ: "gutschrift",
        kunde_id: r.kunde_id,
        datum: HEUTE,
        leistungsdatum: HEUTE,
        zahlungsziel_tage: 0,
        kopftext: b.einstellungen.get("text.gutschrift.kopf") ?? "",
        fusstext: b.einstellungen.get("text.gutschrift.fuss") ?? "",
        gutschrift_zu_id: r.id,
      });
      positionenKopieren(r.id, gs.id, true);
      return ausgeben(gs);
    },
    zahlung_erfassen: (a) => {
      const d = a.daten as ZahlungNeu;
      if (!d.betrag_cent) throw validierung("betrag_cent", "Betrag darf nicht 0 sein");
      const z: Zahlung = { ...d, id: neueId("zahlung") };
      b.zahlungen.push(z);
      return z;
    },
    zahlung_delete: (a) => {
      b.zahlungen = b.zahlungen.filter((z) => z.id !== a.id);
      return null;
    },
    offene_posten_list: () => offenePosten(),
    beleg_pdf_exportieren: () => platzhalterBytes("%PDF-1.7\n% Vorschau\n"),
    rechnung_xrechnung_exportieren: () => platzhalterBytes("<?xml version=\"1.0\"?><Invoice/>"),
    rechnung_zugferd_exportieren: () => platzhalterBytes("%PDF-1.7\n% Vorschau\n"),
    rechnung_zahlungserinnerung_exportieren: () => platzhalterBytes("%PDF-1.7\n% Vorschau\n"),

    // Eingangsrechnungen
    eingangsrechnung_import_vorschau: (): EingangsrechnungVorschau => ({
      format: "zugferd",
      geparst: true,
      felder: LEERE_EINGANGSFELDER,
      ist_duplikat: false,
    }),
    eingangsrechnung_speichern: (a) => {
      const f = a.felder as EingangsrechnungFelderNeu;
      const { positionen, steuerzeilen, ...rest } = f;
      const neu: Eingangsrechnung = {
        ...rest,
        id: neueId("eingang"),
        dateiname: String(a.dateiname),
        format: "zugferd",
        manuell_erfasst: false,
        importiert_am: new Date().toISOString(),
      };
      b.eingangsrechnungen.push(neu);
      b.eingangsPositionen[neu.id] = positionen;
      b.eingangsSteuerzeilen[neu.id] = steuerzeilen;
      return neu;
    },
    eingangsrechnung_list: (a) =>
      b.eingangsrechnungen
        .filter((e) => enthaelt(`${e.rechnungssteller_name} ${e.rechnungsnummer}`, a.suche))
        .sort((x, y) => y.rechnungsdatum.localeCompare(x.rechnungsdatum)),
    eingangsrechnung_get: (a) => {
      const e = finde(b.eingangsrechnungen, a.id);
      return { eingangsrechnung: e, positionen: b.eingangsPositionen[e.id] ?? [], steuerzeilen: b.eingangsSteuerzeilen[e.id] ?? [] };
    },
    eingangsrechnung_update: (a) => {
      const d = a.daten as EingangsrechnungUpdate;
      const e = finde(b.eingangsrechnungen, d.id);
      Object.assign(e, d, { manuell_erfasst: true });
      return e;
    },
    eingangsrechnung_original_exportieren: (a) => {
      const e = finde(b.eingangsrechnungen, a.id);
      return { dateiname: e.dateiname, bytes: platzhalterBytes("Vorschau") };
    },
    eingangsrechnung_aenderungen: (a) => b.eingangsAenderungen[String(a.id)] ?? [],

    // Sonstiges
    menue_einstellungen_freigeben: () => null,
    protokoll_pfad: () => "~/Library/Logs/de.chefsachen.app/chefsachen.log",
    // `?vertriebsweg=mac_app_store` zeigt die Oberfläche der Store-Fassung,
    // etwa für die Screenshots des Store-Eintrags.
    vertriebsweg: () => new URLSearchParams(location.search).get("vertriebsweg") ?? "github",
    programm_neu_starten: () => {
      location.reload();
      return null;
    },

    // Plugins
    "plugin:app|version": () => "1.4.2",
    "plugin:app|name": () => "Chefsachen",
    "plugin:app|tauri_version": () => "2.11.1",
    "plugin:updater|check": () => null,
    "plugin:log|log": () => null,
    "plugin:dialog|open": () => null,
    "plugin:dialog|save": () => null,
    "plugin:dialog|message": () => null,
    "plugin:dialog|ask": () => false,
    "plugin:dialog|confirm": () => false,
    "plugin:fs|write_file": () => null,
    "plugin:fs|read_file": () => [],
    "plugin:opener|open_url": () => null,
    "plugin:opener|reveal_item_in_dir": () => null,
    "plugin:process|restart": () => null,
    "plugin:process|exit": () => null,
    "plugin:window-state|save_window_state": () => null,
    "plugin:window-state|restore_state": () => null,
  };

  return function verarbeiten(cmd: string, args: Argumente): unknown {
    const befehl = befehle[cmd];
    if (befehl) {
      // Wie über die echte Brücke: Das Ergebnis kommt als Kopie an. Sonst
      // änderte die Oberfläche den Bestand an der Logik vorbei.
      const ergebnis = befehl((args ?? {}) as Record<string, unknown>);
      return ergebnis === undefined ? null : structuredClone(ergebnis);
    }
    if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) {
      // Fensteraufrufe wie onCloseRequested, setTitle oder Größenabfragen.
      return null;
    }
    console.warn(`[Vorschau] Unbekannter Befehl: ${cmd}`, args);
    return null;
  };
}
