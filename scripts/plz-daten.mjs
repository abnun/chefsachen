#!/usr/bin/env node
// Erzeugt src/daten/plz-de.txt: alle deutschen Postleitzahlen mit Ortsnamen,
// für die PLZ- und Ortsvorschläge in den Adressfeldern.
//
// Quelle ist GeoNames (https://www.geonames.org), Datei DE.zip aus
// https://download.geonames.org/export/zip/, Lizenz Creative Commons
// Namensnennung 4.0 (CC BY 4.0, laut readme.txt der Quelle). Die Namensnennung
// steht in docs/DRITTANBIETER.md, in den Einstellungen unter
// „Programmversion" und im Kopf der erzeugten Datei.
//
// Das Skript darf ins Netz, das Programm nicht: Die erzeugte Datei wird
// eingecheckt, damit der Bau ohne Verbindung geht und die Liste nicht
// unbemerkt mit jedem Bau eine andere ist.
//
// Aufruf:
//   node scripts/plz-daten.mjs                      lädt, prüft, schreibt
//   node scripts/plz-daten.mjs --quelle DE.zip      nimmt eine lokale Datei
//   node scripts/plz-daten.mjs --neue-pruefsumme    nimmt einen neuen Stand an
//
// Die Prüfsumme gilt dem entpackten DE.txt, nicht dem Zip: GeoNames packt die
// Datei regelmäßig neu, ohne dass sich der Inhalt ändert. Weicht der Inhalt
// ab, bricht das Skript ab, bis jemand den neuen Stand mit --neue-pruefsumme
// bewusst annimmt und die Prüfsumme hier einträgt. Sonst käme eine geänderte
// (oder auf dem Weg verfälschte) Liste ohne Blick darauf ins Programm.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

export const QUELLE_URL = "https://download.geonames.org/export/zip/DE.zip";
export const ERWARTETE_PRUEFSUMME = "c5fa1e0905bedc2d67724cf142ac7ce8159b69658e419b912088068ff8128ea7";

/**
 * Bestandteile von Einrichtungsnamen. GeoNames führt neben den Orten auch die
 * Großkunden-Postleitzahlen (Banken, Ämter, Versicherungen) mit dem Namen des
 * Empfängers als „Ortsname". Für eine Anschrift sind sie unbrauchbar: Wer
 * 10877 eintippt, bekäme sonst „Commerzbank AG" als Ort eingetragen.
 *
 * Geprüft wird das Muster nur bei Einträgen ohne Genauigkeitsangabe; echte
 * Orte haben fast immer eine (Spalte 12: 1, 4 oder 6). Ein Rest an
 * Einrichtungen rutscht trotzdem durch. Das ist hinnehmbar, weil ein
 * Vorschlag nie einen von Hand eingetragenen Ort überschreibt.
 */
const EINRICHTUNG =
  /\b(e\.\s?G\.|e\.\s?V\.|S\.A\.|RAe\.)|\b(AG|GmbH|gGmbH|mbH|KG|KGaA|SE|eG|IG|Partner|Regierung|Bezirk|Express|Wirtschaft|Haus der|AOK|BKK|DAK|DRK|IKK|HUK|BARMER|Bank|Sparkasse|Post|Telekom|Rundfunk|Radio|Deutschlandfunk|Deutschlandradio|Universität|Hochschule|Schule|Institut|Stiftung|Verein|Verband|Kammer|Senat|Landtag|Bundestag|Polizei\w*|Stadt|Landeshauptstadt|Kreis|Landkreis|Regierungspräsidium|Gemeinnützige|Anstalt|Gruppe|Group|Holding|Konzern|International|Niederlassung|Zentrale|Service|Redaktion|Werke|Stadtwerke|Kaserne|Krankenhaus|Hospital|Ministerpräsident\w*|Bundes\w*|Landes\w*|Staats\w*|Deutsche[rs]?|Agentur|Aktiengesellschaft|Jobcenter|Bevollmächtigte\w*|Förder\w*|GbR|Ltd|Restaurant|Lotterie\w*|FH|Center|Landrat|Medizinische\w*|Städtische\w*|ARGE)\b|\w*(amt|ämter|gericht|kasse|klinik|klinikum|verwaltung|kammer|bank|anstalt|behörde|direktion|präsidium|zentrum|vertretung|versicherung\w*|verein|krankenhaus|feuerwehr|stiftung|bücherei|zeitung|stelle|gemeinschaft|kreis|genossenschaft|vereinigung|gesellschaft|buchhandlung|logistik\w*|ministerium|bibliothek|kanzlei|vikariat|verlag\w*)\b|[&+@0-9']|\s-|\.de\b/iu;

/**
 * Abkürzungen und Firmennamen in Versalien („SIGNAL IDUNA", „(AUB)"). Eigener
 * Ausdruck, weil er Groß- und Kleinschreibung unterscheiden muss; im obigen
 * träfe er mit dem Schalter i jedes Wort.
 */
const VERSALIEN = /(^|[\s(])[A-ZÄÖÜ]{3,}([\s)]|$)/u;

/** Echte Orte tragen in GeoNames meist eine Genauigkeit; Großkunden nie. */
function hatGenauigkeit(genauigkeit) {
  return genauigkeit === "1" || genauigkeit === "4" || genauigkeit === "6";
}

/**
 * Liest die Zeilen von DE.txt (Tabulator-getrennt, UTF-8) und liefert die
 * Einträge als { plz, ort, ortsteil }, nach PLZ sortiert und ohne Dubletten.
 *
 * GeoNames schreibt Ortsteile in den Namen: „Dresden Innere Altstadt",
 * „Schipkau Hörlitz". Getrennt wird am längsten Wortanfang, der selbst ein
 * Ort ist, aber nur, wenn der Rest mit einem Großbuchstaben beginnt. Sonst
 * fiele „Steinbach am Glan" in „Steinbach" und „am Glan" auseinander und
 * „Frankfurt (Oder)" in „Frankfurt" und „(Oder)".
 */
export function eintraegeAusGeonames(text) {
  const zeilen = text
    .split("\n")
    .map((z) => z.replace(/\r$/, ""))
    .filter((z) => z.length > 0)
    .map((z) => z.split("\t"));

  const gueltig = zeilen.filter(([land, plz, name]) => land === "DE" && /^\d{5}$/.test(plz) && name);
  const behalten = gueltig.filter((spalten) => {
    const [, , name, , , , , , , , , genauigkeit = ""] = spalten;
    return hatGenauigkeit(genauigkeit) || !(EINRICHTUNG.test(name) || VERSALIEN.test(name));
  });

  const bekannteOrte = new Set(behalten.map((s) => s[2]));

  const gesehen = new Set();
  const eintraege = [];
  for (const spalten of behalten) {
    const plz = spalten[1];
    const { ort, ortsteil } = zerlegen(spalten[2], bekannteOrte);
    const schluessel = `${plz}\t${ort}\t${ortsteil}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    eintraege.push({ plz, ort, ortsteil });
  }
  // Eine Großkunden-PLZ gibt es trotzdem. Sie bleibt ohne Ort in der Liste,
  // damit die Oberfläche sie nicht als unbekannt meldet: Viele
  // Geschäftskunden haben genau so eine als Anschrift.
  const mitOrt = new Set(eintraege.map((e) => e.plz));
  for (const [, plz] of gueltig) {
    if (mitOrt.has(plz)) continue;
    mitOrt.add(plz);
    eintraege.push({ plz, ort: "", ortsteil: "" });
  }
  eintraege.sort(
    (a, b) =>
      a.plz.localeCompare(b.plz) ||
      // Der Ort ohne Ortsteil zuerst, damit „>Ortsteil" in der Datei auf ihn
      // zurückgreifen kann.
      a.ort.localeCompare(b.ort, "de") ||
      a.ortsteil.localeCompare(b.ortsteil, "de"),
  );
  return eintraege;
}

function zerlegen(name, bekannteOrte) {
  const woerter = name.split(" ");
  for (let i = woerter.length - 1; i >= 1; i--) {
    const ort = woerter.slice(0, i).join(" ");
    const rest = woerter.slice(i).join(" ");
    if (!bekannteOrte.has(ort)) continue;
    if (!/^\p{Lu}/u.test(rest)) continue;
    // „Briesen (Mark) Briesen (Mark)": Der Ortsteil wiederholt nur den Ort.
    return { ort, ortsteil: rest === ort ? "" : rest };
  }
  return { ort: name, ortsteil: "" };
}

/**
 * Schreibt die Einträge im kompakten Format, das src/plz.ts liest.
 *
 * Eine Zeile je PLZ: Abstand zur vorigen PLZ in Basis 36, Tabulator, die Orte
 * durch „|" getrennt. Ein Eintrag ist „Ort", „Ort>Ortsteil" oder
 * „>Ortsteil" (Ortsteil des vorigen Orts dieser Zeile). Hat eine PLZ genau
 * dieselben Orte wie die vorige, steht nur der Abstand da.
 *
 * Warum nicht JSON: Die Ortsnamen wiederholen sich stark (Berlin hat rund
 * 190 Postleitzahlen, Hamburg 100), und Anführungszeichen, Schlüssel und
 * fünfstellige PLZ machten die Datei fast doppelt so groß. So bleibt sie
 * unter 300 KB und lässt sich in einem Durchgang ohne Bibliothek lesen.
 */
export function kompaktSchreiben(eintraege, kopf = []) {
  const nachPlz = new Map();
  for (const e of eintraege) {
    if (!nachPlz.has(e.plz)) nachPlz.set(e.plz, []);
    nachPlz.get(e.plz).push(e);
  }
  const zeilen = kopf.map((k) => `# ${k}`);
  let vorigePlz = 0;
  let vorigeOrte = null;
  for (const [plz, liste] of nachPlz) {
    const abstand = (Number(plz) - vorigePlz).toString(36);
    vorigePlz = Number(plz);
    const teile = [];
    let letzterOrt = null;
    for (const { ort, ortsteil } of liste) {
      if (!ortsteil) teile.push(ort);
      else if (ort === letzterOrt) teile.push(`>${ortsteil}`);
      else teile.push(`${ort}>${ortsteil}`);
      letzterOrt = ort;
    }
    const orte = teile.join("|");
    zeilen.push(orte === vorigeOrte ? abstand : `${abstand}\t${orte}`);
    vorigeOrte = orte;
  }
  return zeilen.join("\n") + "\n";
}

/**
 * Holt eine Datei aus einem Zip-Archiv. Eigene Minimalfassung, damit das
 * Skript ohne zusätzliche Abhängigkeit läuft: Es genügt, das zentrale
 * Verzeichnis zu lesen und den Eintrag zu entpacken (Methode 0 oder 8).
 */
export function ausZip(zip, dateiname) {
  let ende = zip.length - 22;
  while (ende >= 0 && zip.readUInt32LE(ende) !== 0x06054b50) ende--;
  if (ende < 0) throw new Error("Kein Zip-Archiv");
  const anzahl = zip.readUInt16LE(ende + 10);
  let pos = zip.readUInt32LE(ende + 16);
  for (let i = 0; i < anzahl; i++) {
    const methode = zip.readUInt16LE(pos + 10);
    const groesse = zip.readUInt32LE(pos + 20);
    const nameLaenge = zip.readUInt16LE(pos + 28);
    const extraLaenge = zip.readUInt16LE(pos + 30);
    const kommentarLaenge = zip.readUInt16LE(pos + 32);
    const kopfPos = zip.readUInt32LE(pos + 42);
    const name = zip.toString("utf8", pos + 46, pos + 46 + nameLaenge);
    if (name === dateiname) {
      const start = kopfPos + 30 + zip.readUInt16LE(kopfPos + 26) + zip.readUInt16LE(kopfPos + 28);
      const daten = zip.subarray(start, start + groesse);
      if (methode === 0) return Buffer.from(daten);
      if (methode === 8) return inflateRawSync(daten);
      throw new Error(`Unbekannte Packmethode ${methode}`);
    }
    pos += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }
  throw new Error(`${dateiname} fehlt im Archiv`);
}

async function main() {
  const args = process.argv.slice(2);
  const quelleIndex = args.indexOf("--quelle");
  const neuePruefsumme = args.includes("--neue-pruefsumme");

  const zip =
    quelleIndex >= 0
      ? readFileSync(args[quelleIndex + 1])
      : Buffer.from(await (await fetch(QUELLE_URL)).arrayBuffer());
  const text = ausZip(zip, "DE.txt");
  const pruefsumme = createHash("sha256").update(text).digest("hex");
  if (pruefsumme !== ERWARTETE_PRUEFSUMME) {
    if (!neuePruefsumme) {
      console.error(
        `DE.txt hat sich geändert (SHA-256 ${pruefsumme}).\n` +
          "Inhalt prüfen und mit --neue-pruefsumme annehmen, dann die Prüfsumme im Skript eintragen.",
      );
      process.exit(1);
    }
    console.warn(`Neuer Stand angenommen. Im Skript eintragen: ${pruefsumme}`);
  }

  const eintraege = eintraegeAusGeonames(text.toString("utf8"));
  const ausgabe = kompaktSchreiben(eintraege, [
    "Postleitzahlen und Orte in Deutschland. Erzeugt von scripts/plz-daten.mjs, nicht von Hand ändern.",
    "Quelle: GeoNames (https://www.geonames.org), DE.zip, Lizenz CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).",
    "Bearbeitet: Großkunden-Postleitzahlen entfernt, Ortsteile vom Ort getrennt.",
    `Stand: SHA-256 von DE.txt ${pruefsumme}`,
  ]);
  const ziel = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "daten", "plz-de.txt");
  writeFileSync(ziel, ausgabe);
  console.log(`${eintraege.length} Einträge, ${Buffer.byteLength(ausgabe)} Bytes nach ${ziel}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
