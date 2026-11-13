/**
 * Einstieg der Vorschau: echte Oberfläche, nachgebildetes Backend.
 *
 * Erst die Tauri-Brücke ersetzen, dann die Anwendung laden. Der Import von
 * `src/main.tsx` ist absichtlich dynamisch: Statische Importe würden vor dem
 * Einrichten der Nachbildung ausgewertet.
 */

import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { backendErstellen } from "./backend";
import { beispielBestand, leererBestand } from "./daten";

const parameter = new URLSearchParams(window.location.search);
const bestand = parameter.get("leer") === "1" ? leererBestand() : beispielBestand();

// `?plattform=mac` bzw. `win` erzwingt die jeweilige Ansicht, etwa für
// Screenshots mit dem Platz für die Ampelknöpfe auf einem anderen Rechner.
// `plattformSetzen()` lässt einen vorab gesetzten Wert stehen.
const plattform = parameter.get("plattform");
if (plattform === "mac" || plattform === "win" || plattform === "andere") {
  document.documentElement.dataset.plattform = plattform;
}

mockWindows("main");
mockIPC(backendErstellen(bestand), { shouldMockEvents: true });

void import("../src/main");
