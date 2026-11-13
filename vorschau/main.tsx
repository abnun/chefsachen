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

mockWindows("main");
mockIPC(backendErstellen(bestand), { shouldMockEvents: true });

void import("../src/main");
