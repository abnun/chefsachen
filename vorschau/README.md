# Vorschau

Die echte Oberfläche aus `src/` im normalen Browser, ohne Tauri und ohne Rust. Gedacht für Design-Arbeit, Playwright-Screenshots (hell und dunkel) und App-Store-Bilder.

## Start

```sh
npm run vorschau
```

Danach unter <http://localhost:1430/> öffnen.

| Adresse | Inhalt |
| --- | --- |
| `/` | Beispielfirma „Lena Hoffmann · Grafik & Illustration“, Leipzig, mit Kunden, Artikeln und Belegen |
| `/?leer=1` | Frische Installation, zeigt den Einrichtungsassistenten |
| `/?plattform=mac` | Erzwingt die Mac-Ansicht (Platz für die Ampelknöpfe), ebenso `win` und `andere` |
| `/?vertriebsweg=mac_app_store` | Oberfläche der Store-Fassung (ohne Aktualisierung und Spendenhinweis), ebenso `microsoft_store` |

## Store-Screenshots

```sh
node vorschau/screenshots.mjs
```

Fotografiert Übersicht, Rechnungen, eine gestellte Rechnung, eine Eingangsrechnung und die Einstellungen, je hell und dunkel: für den Mac App Store in 2880 × 1800 (1440 × 900 bei doppelter Dichte), für den Microsoft Store in 1920 × 1080. Die Bilder landen in `docs/store/screenshots/<mac|win>/` und sind nicht eingecheckt.

Läuft auf Port 1430 schon eine Vorschau, wird sie benutzt, sonst startet und beendet das Skript sie selbst. Playwright ist keine Abhängigkeit des Projekts; fehlt es, holt das Skript `playwright@1.65.0` über `npx`. Es nimmt das installierte Google Chrome; ohne Chrome einmalig `npx playwright@1.65.0 install chromium` ausführen.

## Aufbau

- `main.tsx` ersetzt zuerst die Tauri-Brücke (`mockIPC`, `mockWindows`) und lädt erst dann `src/main.tsx`. Die Anwendung selbst bleibt unverändert.
- `backend.ts` beantwortet alle Befehle aus `src/api.ts` sowie die Plugin-Aufrufe (Updater, Log, Dialog, Opener, Prozess, Fenster). Unbekannte Befehle erscheinen als Warnung in der Konsole und liefern `null`.
- `daten.ts` enthält die Beispieldaten. Sie sind gegen die Typen aus `src/api.ts` geprüft, weil `vorschau/` in der `tsconfig.json` mit eingeschlossen ist.
- `vorlageSvg.ts` zeichnet eine einfache Belegvorschau für die Einstellungsseite.

Der Bestand liegt nur im Arbeitsspeicher. Anlegen, Ändern, Festschreiben und Zahlungen wirken in der laufenden Sitzung; Neuladen stellt die Beispieldaten wieder her.

Stichtag der Daten ist der 13.11.2026. Die Übersicht rechnet Fälligkeiten und Umsatzgrenzen von diesem Tag aus, unabhängig vom Systemdatum.

## Grenzen

Steuerberechnung, PDF, XRechnung, ZUGFeRD und Sicherungen sind nur angedeutet: Exporte liefern Platzhalterbytes, Dateidialoge kehren ohne Auswahl zurück. Einzige Ausnahme ist der Import einer Eingangsrechnung, der eine erfundene Datei bekommt, damit sich die Importvorschau ansehen lässt. Für Screenshots spielt das keine Rolle, für fachliche Tests ist die Vorschau nicht gedacht.
