# Adressvorschläge

Stand: 2026-11-14 · Branch `design-und-store`

Wunsch des Betreibers: Adresseingaben mit Vorschlägen, wie in Fairmietsachen
(`../fairmietsachen`, `src/components/AddressAutocomplete.tsx`,
`src-tauri/src/commands/geocoding.rs`, dort über Photon/komoot). Entscheidung:
**offline PLZ ↔ Ort immer, Straßenvorschläge online nur nach Einschalten.**
Chefsachen verspricht „nichts verlässt den Rechner"; das bleibt im
Auslieferungszustand wahr.

## Stufe 1: PLZ ↔ Ort, offline, immer aktiv

- Mitgelieferte Liste aller deutschen Postleitzahlen mit Ortsnamen.
  Quelle mit klarer, kompatibler Lizenz (Kandidat: GeoNames Postal Codes DE,
  CC BY 4.0; Alternative prüfen). Namensnennung in `docs/DRITTANBIETER.md`
  bzw. vorhandener Lizenzübersicht und in den Einstellungen unter
  „Programmversion".
- Erzeugt durch ein Skript `scripts/plz-daten.mjs` (lädt die Quelle, prüft
  eine Prüfsumme, schreibt eine kompakte Datei); die erzeugte Datei wird
  eingecheckt, damit der Bau ohne Netz geht. Zielgröße: unter 300 KB
  unkomprimiert im Bündel oder als Rust-Ressource, je nachdem was schlanker
  ist. Nur Deutschland; bei Land ≠ DE keine Vorschläge.
- Verhalten:
  - PLZ-Feld: Sobald fünf Ziffern stehen und der Ort leer ist, wird bei genau
    einem Ort dieser eingetragen; bei mehreren erscheint eine Vorschlagsliste
    am Ortsfeld. Ein von Hand eingetragener Ort wird nie überschrieben.
  - Ort-Feld: ab zwei Zeichen Vorschläge „Ort (PLZ)" bzw. „Ort, Ortsteil
    (PLZ)"; Auswahl füllt Ort und, wenn leer, PLZ.
  - Unbekannte PLZ: leiser Hinweis unter dem Feld („Diese PLZ ist nicht
    bekannt"), kein Fehler, kein Blockieren.
- Eingesetzt in: Firmendaten (Einrichtung, Einstellungen), Kundenadressen
  (Rechnungs- und Lieferadresse). Nicht bei importierten Eingangsrechnungen.

## Stufe 2: Straßenvorschläge über Photon, nur auf Wunsch

- Neue Einstellung „Adressvorschläge aus dem Internet" (Schlüssel z. B.
  `adressen.online_vorschlaege`), Standard **aus**. Beschreibung nennt
  ausdrücklich: Dienst Photon von komoot, was übertragen wird (der getippte
  Text, bei Bedarf PLZ/Ort, die IP-Adresse), dass Kundenadressen dabei an
  komoot gehen, Link zur Datenschutzerklärung von komoot.
- Rust-Befehl `adresse_vorschlagen(text, plz?, ort?)`: prüft die Einstellung
  selbst (Abwehr in der Tiefe: ohne Einwilligung keine Anfrage, auch wenn
  die Oberfläche fragt), HTTPS-Anfrage an `photon.komoot.io` mit
  `lang=de`, `limit=5`, Begrenzung auf Deutschland, Zeitlimit 5 s, eigener
  User-Agent ohne persönliche Daten. Fehler und Zeitüberschreitung ergeben
  eine leere Liste, nie eine Fehlermeldung. `reqwest` mit `rustls`, ohne
  Standard-Features. Antwort-Parser wie in Fairmietsachen mit Tests.
- Oberfläche: Straßenfeld als Combobox, ab drei Zeichen, 300 ms entprellt,
  nur wenn eingeschaltet. Auswahl füllt Straße + Hausnummer, PLZ, Ort.
- Inhaltsrichtlinie der Webview bleibt unverändert (Anfrage läuft in Rust).

## Bedienung und Barrierefreiheit

- Ein gemeinsames Combobox-Bauteil nach dem ARIA-1.2-Muster (`role="combobox"`,
  `aria-expanded`, `aria-controls`, `aria-activedescendant`, Liste mit
  `role="listbox"`/`option`), Pfeiltasten, Enter übernimmt, Escape schließt,
  Tab verlässt ohne Übernahme. Stil passend zum neuen Erscheinungsbild
  (Menü wie unter macOS: Radius 8, Schatten, Hervorhebung in Akzent).
- Browser-Autovervollständigung an diesen Feldern aus (`autoComplete="off"`).

## Store und Datenschutz

- Mac App Store: `com.apple.security.network.client` in
  `Entitlements.appstore.plist`, mit Kommentar warum. Microsoft Store:
  `internetClient`-Capability im Manifest.
- `website/datenschutz.html`: App-Abschnitt um die optionale Funktion
  ergänzen (aus nach Installation; wenn eingeschaltet, was an komoot geht).
  Die Sätze „baut keinerlei Netzwerkverbindung auf" anpassen.
- `docs/store/texte.md`, README: „braucht keine Internetverbindung" bleibt
  wahr; optionale Online-Vorschläge erwähnen.
- `docs/store/checkliste.md`: Hinweis zur App-Datenschutzangabe (Daten gehen
  nur auf ausdrücklichen Wunsch in Echtzeit an einen Dritten; Betreiber
  entscheidet, ob „Keine Daten erfasst" noch passt).
- `vorschau/backend.ts`: `adresse_vorschlagen` mit Beispieldaten.

## Nicht im Umfang

- Adressprüfung/Validierung, andere Länder, Hausnummernlisten offline.
