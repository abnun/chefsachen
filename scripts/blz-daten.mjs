#!/usr/bin/env node
// Erzeugt src/daten/blz-bic.txt: zu jeder deutschen Bankleitzahl den BIC,
// damit das IBAN-Feld den BIC offline eintragen kann.
//
// Quelle ist die Bankleitzahlendatei der Deutschen Bundesbank, unverbindliche
// Fassung von
// https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592
// Nutzung nach den Nutzungsbedingungen der Website, Abschnitt 4.1: Speichern,
// Weitergeben und Vervielfältigen für persönlichen oder geschäftlichen
// Gebrauch frei, Inhalt unverändert, mit der Angabe „Quelle: Deutsche
// Bundesbank". Deshalb übernimmt das Skript BLZ und BIC Zeichen für Zeichen
// und lässt nur weg, was das Programm nicht braucht (Namen, Orte, Filialen).
// Die Angabe steht in docs/DRITTANBIETER.md, in den Einstellungen unter
// „Programmversion" und im Kopf der erzeugten Datei.
//
// Die Bundesbank gibt die Datei vierteljährlich neu heraus, jeweils gültig ab
// Anfang März, Juni, September und Dezember. Wie man sie auffrischt, steht im
// README unter „Eine neue Version veröffentlichen".
//
// Das Skript darf ins Netz, das Programm nicht: Die erzeugte Datei wird
// eingecheckt, damit der Bau ohne Verbindung geht und die Zuordnung nicht
// unbemerkt mit jedem Bau eine andere ist.
//
// Aufruf:
//   node scripts/blz-daten.mjs                      lädt, prüft, schreibt
//   node scripts/blz-daten.mjs --quelle blz.txt     nimmt eine lokale Datei
//   node scripts/blz-daten.mjs --neue-pruefsumme    nimmt einen neuen Stand an
//
// Wie bei den Postleitzahlen bricht das Skript ab, wenn die geladene Datei
// nicht die hier eingetragene Prüfsumme hat. Ein neuer Stand wird bewusst
// angenommen, nicht nebenbei: Sonst käme eine geänderte (oder auf dem Weg
// verfälschte) Zuordnung ohne Blick darauf ins Programm.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SEITE_URL =
  "https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen/download-bankleitzahlen-602592";
/** Stand gültig vom 07.09.2026 bis 06.12.2026. */
export const ERWARTETE_PRUEFSUMME = "5872bf19298f55cc0594d22656b72e0f8ff277faedbf5b18f9b7f3bcae4c606b";

/**
 * Sucht auf der Downloadseite die Adresse der aktuell gültigen Datei im
 * TXT-Format. Sie enthält Kennungen, die mit jedem Stand wechseln; fest im
 * Skript eingetragen, zeigte sie nach einem Quartal auf eine alte Datei.
 */
export function downloadAdresse(html) {
  const treffer = html.match(/href="([^"]*\/blz-aktuell-txt-data\.txt)"/);
  if (!treffer) throw new Error("Link auf blz-aktuell-txt-data.txt nicht gefunden");
  return new URL(treffer[1], "https://www.bundesbank.de").href;
}

/**
 * Liest die Bankleitzahlendatei (feste Spaltenbreiten, je Datensatz 168
 * Zeichen) und liefert je BLZ einen BIC als { blz, bic }, nach BLZ sortiert.
 *
 * Unter einer BLZ stehen die Hauptstelle (Merkmal 1) und ihre Filialen
 * (Merkmal 2), bei großen Banken mit jeweils eigenem BIC. Eine IBAN nennt nur
 * die BLZ, also gilt der BIC der Hauptstelle. Fehlt er dort, nimmt das Skript
 * den ersten einer Filiale; hat keiner einen, entfällt die BLZ, und das
 * Programm lässt den BIC dann leer.
 */
export function zuordnungAusBundesbank(text) {
  const haupt = new Map();
  const filiale = new Map();
  for (const roh of text.split("\n")) {
    const zeile = roh.replace(/\r$/, "");
    if (zeile.length < 150) continue;
    const blz = zeile.slice(0, 8);
    const merkmal = zeile[8];
    const bic = zeile.slice(139, 150).trim();
    if (!/^\d{8}$/.test(blz) || !bic) continue;
    if (merkmal === "1") haupt.set(blz, bic);
    else if (!filiale.has(blz)) filiale.set(blz, bic);
  }
  const alle = new Set([...haupt.keys(), ...filiale.keys()]);
  return [...alle].sort().map((blz) => ({ blz, bic: haupt.get(blz) ?? filiale.get(blz) }));
}

/**
 * Schreibt die Zuordnung im kompakten Format, das src/blz.ts liest: je Zeile
 * der Abstand zur vorigen BLZ in Basis 36, ein Tabulator und der BIC. Steht
 * derselbe BIC wie in der Zeile davor, bleibt nur der Abstand (Sparkassen und
 * Commerzbank führen viele Bankleitzahlen unter einem BIC).
 *
 * Warum nicht JSON: Achtstellige Bankleitzahlen, Anführungszeichen und
 * Schlüssel machten die Datei mehr als doppelt so groß, und das Lesen ginge
 * nicht schneller.
 */
export function kompaktSchreiben(eintraege, kopf = []) {
  const zeilen = kopf.map((k) => `# ${k}`);
  let vorige = 0;
  let vorigerBic = null;
  for (const { blz, bic } of eintraege) {
    const abstand = (Number(blz) - vorige).toString(36);
    vorige = Number(blz);
    zeilen.push(bic === vorigerBic ? abstand : `${abstand}\t${bic}`);
    vorigerBic = bic;
  }
  return zeilen.join("\n") + "\n";
}

async function main() {
  const args = process.argv.slice(2);
  const quelleIndex = args.indexOf("--quelle");
  const neuePruefsumme = args.includes("--neue-pruefsumme");

  let daten;
  if (quelleIndex >= 0) {
    daten = readFileSync(args[quelleIndex + 1]);
  } else {
    const seite = await (await fetch(SEITE_URL)).text();
    daten = Buffer.from(await (await fetch(downloadAdresse(seite))).arrayBuffer());
  }
  const pruefsumme = createHash("sha256").update(daten).digest("hex");
  if (pruefsumme !== ERWARTETE_PRUEFSUMME) {
    if (!neuePruefsumme) {
      console.error(
        `Die Bankleitzahlendatei hat sich geändert (SHA-256 ${pruefsumme}).\n` +
          "Inhalt prüfen und mit --neue-pruefsumme annehmen, dann die Prüfsumme im Skript eintragen.",
      );
      process.exit(1);
    }
    console.warn(`Neuer Stand angenommen. Im Skript eintragen: ${pruefsumme}`);
  }

  // Die Datei ist ISO 8859-1. BLZ und BIC bestehen nur aus ASCII, aber die
  // Spaltenpositionen stimmen nur, wenn jedes Byte ein Zeichen ist.
  const eintraege = zuordnungAusBundesbank(daten.toString("latin1"));
  const ausgabe = kompaktSchreiben(eintraege, [
    "Bankleitzahl und BIC. Erzeugt von scripts/blz-daten.mjs, nicht von Hand ändern.",
    "Quelle: Deutsche Bundesbank, Bankleitzahlendatei (https://www.bundesbank.de).",
    "Auszug: je Bankleitzahl der BIC der Hauptstelle, Werte unverändert.",
    `Stand: SHA-256 der Bankleitzahlendatei ${pruefsumme}`,
  ]);
  const ziel = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "daten", "blz-bic.txt");
  writeFileSync(ziel, ausgabe);
  console.log(`${eintraege.length} Bankleitzahlen, ${Buffer.byteLength(ausgabe)} Bytes nach ${ziel}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
