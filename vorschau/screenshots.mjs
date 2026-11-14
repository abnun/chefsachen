/* global fetch, process, setTimeout, console */

/**
 * Store-Screenshots aus der Vorschau.
 *
 * Fotografiert fünf Seiten (Übersicht, Rechnungen, eine gestellte Rechnung,
 * eine Eingangsrechnung, Einstellungen) je hell und dunkel:
 *
 * - Mac App Store: 1440 × 900 bei doppelter Pixeldichte, also 2880 × 1800,
 *   mit `?plattform=mac&vertriebsweg=mac_app_store`.
 * - Microsoft Store: 1920 × 1080 bei einfacher Dichte, mit
 *   `?plattform=win&vertriebsweg=microsoft_store`.
 *
 * Ausgabe nach `docs/store/screenshots/<mac|win>/<nr>-<name>-<hell|dunkel>.png`
 * (nicht eingecheckt, siehe .gitignore).
 *
 * Läuft auf Port 1430 schon eine Vorschau, wird sie benutzt; sonst startet
 * das Skript `npm run vorschau` selbst und beendet sie am Ende wieder.
 *
 * Playwright ist bewusst keine Abhängigkeit des Projekts: Fehlt es in
 * node_modules, holt das Skript eine feste Fassung über npx. Start:
 *
 *     node vorschau/screenshots.mjs
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLAYWRIGHT_FASSUNG = "1.65.0";
const ADRESSE = "http://localhost:1430/";
const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUSGABE = join(WURZEL, "docs", "store", "screenshots");

const ZIELE = [
  {
    ordner: "mac",
    abfrage: "?plattform=mac&vertriebsweg=mac_app_store",
    fenster: { width: 1440, height: 900 },
    dichte: 2,
  },
  {
    ordner: "win",
    abfrage: "?plattform=win&vertriebsweg=microsoft_store",
    fenster: { width: 1920, height: 1080 },
    dichte: 1,
  },
];

/**
 * Die Seiten in Store-Reihenfolge. Jede Funktion bekommt eine frisch
 * geladene Übersicht und navigiert von dort aus, so wie ein Nutzer.
 */
const SEITEN = [
  { name: "uebersicht", oeffnen: async () => {} },
  { name: "rechnungen", oeffnen: async (page) => navigiere(page, "Rechnungen") },
  {
    name: "rechnung",
    oeffnen: async (page) => {
      await navigiere(page, "Rechnungen");
      await page.getByRole("button", { name: "RE-2026-0012", exact: true }).click();
    },
  },
  {
    name: "eingangsrechnung",
    oeffnen: async (page) => {
      await navigiere(page, "Eingangsrechnungen");
      await page.locator("tbody .zeilen-knopf").first().click();
    },
  },
  { name: "einstellungen", oeffnen: async (page) => navigiere(page, "Einstellungen") },
];

async function navigiere(page, bereich) {
  await page.locator(".app-nav").getByRole("button", { name: bereich, exact: true }).click();
}

/** Playwright aus node_modules oder, falls nicht vorhanden, über npx. */
async function playwrightLaden() {
  try {
    return await import("playwright");
  } catch {
    // npx legt das Paket in einen eigenen Zwischenspeicher und setzt nur
    // PATH; daraus lässt sich das node_modules-Verzeichnis ablesen.
    const pfad = execFileSync(
      "npx",
      ["--yes", "-p", `playwright@${PLAYWRIGHT_FASSUNG}`, "node", "-e", "console.log(process.env.PATH)"],
      { encoding: "utf8" },
    );
    const bin = pfad
      .trim()
      .split(":")
      .find((p) => p.includes("_npx") && p.endsWith(join("node_modules", ".bin")));
    if (!bin) throw new Error("Playwright ließ sich über npx nicht finden.");
    return import(pathToFileURL(join(bin, "..", "playwright", "index.mjs")).href);
  }
}

/**
 * Bevorzugt das installierte Google Chrome: Dann muss Playwright keinen
 * eigenen Browser herunterladen. Fehlt Chrome, bleibt Playwrights Chromium
 * (einmalig `npx playwright@<Fassung> install chromium`).
 */
async function browserStarten(chromium) {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return chromium.launch();
  }
}

async function erreichbar() {
  try {
    return (await fetch(ADRESSE)).ok;
  } catch {
    return false;
  }
}

/** Startet die Vorschau, falls nötig; liefert eine Funktion zum Beenden. */
async function vorschauSicherstellen() {
  if (await erreichbar()) return () => {};
  const prozess = spawn("npm", ["run", "vorschau", "--", "--strictPort"], {
    cwd: WURZEL,
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    if (await erreichbar()) return () => process.kill(-prozess.pid, "SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  }
  process.kill(-prozess.pid, "SIGTERM");
  throw new Error("Die Vorschau ist auf Port 1430 nicht erreichbar.");
}

async function main() {
  const { chromium } = await playwrightLaden();
  const vorschauBeenden = await vorschauSicherstellen();
  const browser = await browserStarten(chromium);
  try {
    for (const ziel of ZIELE) {
      mkdirSync(join(AUSGABE, ziel.ordner), { recursive: true });
      for (const modus of ["hell", "dunkel"]) {
        const kontext = await browser.newContext({
          viewport: ziel.fenster,
          deviceScaleFactor: ziel.dichte,
          colorScheme: modus === "hell" ? "light" : "dark",
          // Ohne Bewegung: Ein Bild mitten in einer Einblendung wäre unscharf.
          reducedMotion: "reduce",
        });
        const page = await kontext.newPage();
        for (const [i, seite] of SEITEN.entries()) {
          await page.goto(ADRESSE + ziel.abfrage);
          await page.locator(".werkzeugleiste").first().waitFor();
          await seite.oeffnen(page);
          await page.waitForTimeout(400);
          const datei = join(AUSGABE, ziel.ordner, `${i + 1}-${seite.name}-${modus}.png`);
          await page.screenshot({ path: datei });
          console.log(datei);
        }
        await kontext.close();
      }
    }
  } finally {
    await browser.close();
    vorschauBeenden();
  }
}

main().catch((fehler) => {
  console.error(fehler);
  process.exit(1);
});
