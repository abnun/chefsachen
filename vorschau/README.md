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

## Aufbau

- `main.tsx` ersetzt zuerst die Tauri-Brücke (`mockIPC`, `mockWindows`) und lädt erst dann `src/main.tsx`. Die Anwendung selbst bleibt unverändert.
- `backend.ts` beantwortet alle Befehle aus `src/api.ts` sowie die Plugin-Aufrufe (Updater, Log, Dialog, Opener, Prozess, Fenster). Unbekannte Befehle erscheinen als Warnung in der Konsole und liefern `null`.
- `daten.ts` enthält die Beispieldaten. Sie sind gegen die Typen aus `src/api.ts` geprüft, weil `vorschau/` in der `tsconfig.json` mit eingeschlossen ist.
- `vorlageSvg.ts` zeichnet eine einfache Belegvorschau für die Einstellungsseite.

Der Bestand liegt nur im Arbeitsspeicher. Anlegen, Ändern, Festschreiben und Zahlungen wirken in der laufenden Sitzung; Neuladen stellt die Beispieldaten wieder her.

Stichtag der Daten ist der 13.11.2026. Die Übersicht rechnet Fälligkeiten und Umsatzgrenzen von diesem Tag aus, unabhängig vom Systemdatum.

## Grenzen

Steuerberechnung, PDF, XRechnung, ZUGFeRD und Sicherungen sind nur angedeutet: Exporte liefern Platzhalterbytes, Dateidialoge kehren ohne Auswahl zurück. Für Screenshots spielt das keine Rolle, für fachliche Tests ist die Vorschau nicht gedacht.
