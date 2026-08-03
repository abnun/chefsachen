import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * WebdriverIO gegen die gebaute Anwendung.
 *
 * `tauri-driver` startet das Programm und übersetzt zwischen WebDriver und der
 * Webview des Betriebssystems. Unter Linux ist das WebKitWebDriver — dieselbe
 * Webview, die auch der ausgelieferte Linux-Bau benutzt. Für WKWebView auf
 * macOS gibt es kein Gegenstück, deshalb läuft dieser Test dort nicht.
 */
const ANWENDUNG = process.env.KUV_BINARY ?? "../src-tauri/target/debug/kleinunternehmer-verwaltung";
const PORT = 4444;

let treiber;
let bildschirm;

/** Wartet, bis auf dem Port jemand horcht. */
async function warteAufPort(port, sekunden) {
  for (let i = 0; i < sekunden * 10; i++) {
    const offen = await new Promise((fertig) => {
      const verbindung = createConnection({ port, host: "127.0.0.1" })
        .on("connect", () => {
          verbindung.end();
          fertig(true);
        })
        .on("error", () => fertig(false));
    });
    if (offen) return;
    await new Promise((w) => setTimeout(w, 100));
  }
  throw new Error(`tauri-driver horcht nach ${sekunden}s nicht auf Port ${port}`);
}

/**
 * Startet einen Hintergrundprozess, ohne auf ihn zu warten.
 *
 * `stdio: "ignore"` ist hier wesentlich: Erbt der Prozess Pipes, hält er sie
 * offen, solange er läuft — und ein wartender Elternprozess kommt nie zurück.
 * Genau daran hing der erste Anlauf dieses Tests fest, ohne jede Ausgabe.
 */
function starteImHintergrund(befehl, argumente) {
  return spawn(befehl, argumente, { stdio: "ignore", detached: false });
}

export const config = {
  runner: "local",
  specs: ["./specs/**/*.js"],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": { application: ANWENDUNG },
    },
  ],
  hostname: "127.0.0.1",
  port: PORT,
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 60000 },
  logLevel: "warn",

  onPrepare: async () => {
    // Ohne Bildschirmfläche startet keine Fensteranwendung, auch wenn niemand
    // hinsieht.
    if (!process.env.DISPLAY) {
      bildschirm = starteImHintergrund("Xvfb", [":99", "-screen", "0", "1280x1024x24"]);
      process.env.DISPLAY = ":99";
      await new Promise((w) => setTimeout(w, 1000));
    }

    // Eigener Datenordner je Lauf. Er muss *vor* tauri-driver gesetzt werden:
    // Der Treiber erbt HOME beim Start und gibt es an die Anwendung weiter —
    // was eine Spec später setzt, erreicht sie nicht mehr.
    process.env.HOME = mkdtempSync(join(tmpdir(), "kuv-e2e-"));

    treiber = starteImHintergrund("tauri-driver", []);
    await warteAufPort(PORT, 20);
  },

  onComplete: () => {
    treiber?.kill();
    bildschirm?.kill();
  },
};
