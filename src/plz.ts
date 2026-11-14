/**
 * Postleitzahlen und Orte in Deutschland, für die Vorschläge in den
 * Adressfeldern. Läuft vollständig offline: Die Liste liegt dem Programm bei
 * (src/daten/plz-de.txt, erzeugt von scripts/plz-daten.mjs aus GeoNames,
 * CC BY 4.0).
 *
 * Nur für Deutschland. Für andere Länder gibt es keine Vorschläge, statt
 * falscher: Eine österreichische PLZ ist vierstellig, eine Schweizer auch,
 * und die deutsche Liste hätte zu beiden nichts Sinnvolles zu sagen.
 */

export interface PlzEintrag {
  plz: string;
  ort: string;
  /** Leer, wenn der Eintrag den Ort als Ganzes meint. */
  ortsteil: string;
}

export interface PlzVerzeichnis {
  /** Nach PLZ geordnet; eine Großkunden-PLZ steht mit leerem Ort darin. */
  nachPlz: Map<string, PlzEintrag[]>;
  eintraege: PlzEintrag[];
}

/**
 * Ein Vorschlag für das Ortsfeld. `plz` ist leer, wenn der Ort mehrere
 * Postleitzahlen hat: Dann ließe sich nur raten, welche gemeint ist.
 */
export interface OrtVorschlag {
  ort: string;
  ortsteil: string;
  plz: string;
}

/** Mehr passen nicht auf einen Blick, und wer mehr braucht, tippt weiter. */
const GRENZE = 8;

/**
 * Liest das kompakte Format von scripts/plz-daten.mjs: je Zeile der Abstand
 * zur vorigen PLZ in Basis 36, ein Tabulator und die Orte durch „|"
 * getrennt. „>Ortsteil" gehört zum vorigen Ort der Zeile, „Ort>Ortsteil"
 * nennt beide. Eine Zeile nur mit Abstand wiederholt die Orte der vorigen,
 * eine mit Tabulator und nichts danach ist eine PLZ ohne Ort.
 */
export function plzDatenLesen(text: string): PlzVerzeichnis {
  const nachPlz = new Map<string, PlzEintrag[]>();
  const eintraege: PlzEintrag[] = [];
  let plzZahl = 0;
  let vorige: { ort: string; ortsteil: string }[] = [];
  for (const zeile of text.split("\n")) {
    if (zeile === "" || zeile.startsWith("#")) continue;
    const tab = zeile.indexOf("\t");
    plzZahl += parseInt(tab < 0 ? zeile : zeile.slice(0, tab), 36);
    const plz = String(plzZahl).padStart(5, "0");
    if (tab >= 0) {
      const teile = zeile.slice(tab + 1);
      vorige = [];
      let letzterOrt = "";
      for (const teil of teile === "" ? [] : teile.split("|")) {
        const pfeil = teil.indexOf(">");
        const ort = pfeil < 0 ? teil : pfeil === 0 ? letzterOrt : teil.slice(0, pfeil);
        const ortsteil = pfeil < 0 ? "" : teil.slice(pfeil + 1);
        vorige.push({ ort, ortsteil });
        letzterOrt = ort;
      }
    }
    const liste = vorige.map((o) => ({ plz, ...o }));
    nachPlz.set(plz, liste);
    eintraege.push(...liste);
  }
  return { nachPlz, eintraege };
}

/** Die Orte zu einer PLZ, ohne Ortsteile und ohne Wiederholung. */
export function orteZurPlz(v: PlzVerzeichnis, plz: string): string[] {
  const orte = (v.nachPlz.get(plz) ?? []).map((e) => e.ort).filter((o) => o !== "");
  return [...new Set(orte)];
}

export function plzBekannt(v: PlzVerzeichnis, plz: string): boolean {
  return v.nachPlz.has(plz);
}

/**
 * Leere Angabe zählt als Deutschland: Die Firmendaten in der Einrichtung
 * zeigen kein Landfeld, und neue Adressen beginnen mit „DE".
 */
export function istDeutschland(land: string | undefined): boolean {
  const l = (land ?? "").trim().toLowerCase();
  return l === "" || l === "de" || l === "deu" || l === "deutschland";
}

/** Vergleichsform: klein, Umlaute umschrieben, damit „muen" München findet. */
function vergleichbar(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .trim();
}

/**
 * Wie gut ein Name zur Eingabe passt: 0 genau, 1 am Anfang, 2 am Anfang
 * eines späteren Worts („Main" in „Frankfurt am Main"), sonst gar nicht.
 */
function passung(name: string, eingabe: string): number | null {
  const n = vergleichbar(name);
  if (n === eingabe) return 0;
  if (n.startsWith(eingabe)) return 1;
  if (n.split(/[\s\-/(]+/).some((wort) => wort.startsWith(eingabe))) return 2;
  return null;
}

/**
 * Vorschläge für das Ortsfeld.
 *
 * Ab zwei Zeichen, damit nicht jeder einzelne Buchstabe hunderte Treffer
 * bringt. Ohne Eingabe gibt es nur dann etwas, wenn die PLZ schon dasteht:
 * Dann sind das die Orte dieser PLZ, aus denen man wählt.
 *
 * Eine schon eingetragene PLZ (oder ihr Anfang) grenzt die Suche ein. Passt
 * darin nichts, wird ohne Grenze gesucht. Vermutlich ist dann die PLZ falsch,
 * und ein Vorschlag hilft mehr als eine leere Liste.
 */
export function ortVorschlaege(v: PlzVerzeichnis, eingabe: string, plz = ""): OrtVorschlag[] {
  const suche = vergleichbar(eingabe);
  const plzAnfang = /^\d{1,5}$/.test(plz.trim()) ? plz.trim() : "";
  if (suche.length < 2 && !(suche === "" && plzAnfang.length === 5)) return [];

  const kandidaten = plzAnfang ? v.eintraege.filter((e) => e.plz.startsWith(plzAnfang)) : v.eintraege;
  const treffer = vorschlaegeAus(kandidaten, suche);
  if (treffer.length > 0 || !plzAnfang || suche === "") return treffer;
  return vorschlaegeAus(v.eintraege, suche);
}

function vorschlaegeAus(eintraege: PlzEintrag[], suche: string): OrtVorschlag[] {
  // Je Ort (und je Ortsteil) ein Vorschlag mit allen seinen PLZ. Sonst
  // stünde Hamburg hundertmal da, und Hameln käme gar nicht mehr vor.
  const gruppen = new Map<string, { ort: string; ortsteil: string; plz: Set<string>; rang: number }>();
  for (const e of eintraege) {
    if (e.ort === "") continue;
    let rang: number | null;
    let ortsteil = "";
    if (suche === "") {
      rang = 0;
    } else {
      rang = passung(e.ort, suche);
      // Ortsteile nur, wenn die Eingabe zum Ortsteil passt, nicht zum Ort:
      // Wer „Dres" tippt, will Dresden, nicht jeden Stadtteil einzeln.
      if (rang === null && e.ortsteil) {
        const r = passung(e.ortsteil, suche);
        if (r !== null) {
          rang = r + 3;
          ortsteil = e.ortsteil;
        }
      }
    }
    if (rang === null) continue;
    const schluessel = `${e.ort}\u0000${ortsteil}`;
    const gruppe = gruppen.get(schluessel);
    if (gruppe) gruppe.plz.add(e.plz);
    else gruppen.set(schluessel, { ort: e.ort, ortsteil, plz: new Set([e.plz]), rang });
  }
  return [...gruppen.values()]
    // Bei gleicher Passung zuerst die Orte mit mehr Postleitzahlen, also die
    // größeren: Wer „Heil" tippt, meint eher Heilbronn als Heilbach.
    .sort(
      (a, b) =>
        a.rang - b.rang ||
        b.plz.size - a.plz.size ||
        a.ort.localeCompare(b.ort, "de") ||
        a.ortsteil.localeCompare(b.ortsteil, "de"),
    )
    .slice(0, GRENZE)
    .map((g) => ({ ort: g.ort, ortsteil: g.ortsteil, plz: g.plz.size === 1 ? [...g.plz][0] : "" }));
}

/** „Ort (PLZ)", „Ort, Ortsteil (PLZ)" oder „Ort (mehrere PLZ)". */
export function vorschlagText(v: OrtVorschlag): string {
  const name = v.ortsteil ? `${v.ort}, ${v.ortsteil}` : v.ort;
  return `${name} (${v.plz || "mehrere PLZ"})`;
}

let geladen: Promise<PlzVerzeichnis> | null = null;

/**
 * Lädt die Liste beim ersten Bedarf. Als eigener Teil des Bündels, damit sie
 * den Programmstart nicht verlängert: Gebraucht wird sie erst, wenn ein
 * Adressformular offen ist.
 */
export function plzVerzeichnisLaden(): Promise<PlzVerzeichnis> {
  geladen ??= import("./daten/plz-de.txt?raw").then((m) => plzDatenLesen(m.default));
  return geladen;
}
