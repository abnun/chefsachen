# IBAN → BIC und Vorbelegung des Ansprechpartners

Stand: 2026-11-14 · Branch `design-und-store` · baut auf
`2026-11-14-adressvorschlaege-design.md` auf (gleiche Formulare).

## IBAN → BIC, offline, immer aktiv

Entscheidung des Betreibers: ohne Schalter, weil nichts den Rechner verlässt.

- Datenquelle: Bankleitzahlendatei der Deutschen Bundesbank (BLZ → BIC).
  Nutzungsbedingungen prüfen und in der Lizenzübersicht neben der
  PLZ-Quelle vermerken. Erzeugungsskript `scripts/blz-daten.mjs` (lädt die
  aktuelle Datei, schreibt eine kompakte Zuordnung BLZ → BIC, nur
  Datensätze mit BIC, Duplikate je BLZ zusammengeführt); erzeugte Datei
  wird eingecheckt. Ablageort und Format wie bei den PLZ-Daten, Ziel unter
  150 KB. Kurzer Abschnitt im README unter „Neue Version veröffentlichen":
  Datei vierteljährlich auffrischen.
- Gemeinsames Bauteil `IbanFeld`:
  - gruppiert beim Tippen in Viererblöcke, Cursor bleibt an der richtigen
    Stelle (Vorlage: `../fairmietsachen/src/components/IbanInput.tsx`);
    Großbuchstaben, Leerzeichen tolerant;
  - prüft bei vollständiger Länge die Prüfziffer (ISO 13616, mod 97) und
    die Länge je Land (mindestens DE, AT, CH, NL, BE, FR, IT, ES, LU);
    falsche Prüfziffer = leiser Hinweis unter dem Feld, kein Blockieren;
  - bei gültiger deutscher IBAN und **leerem** BIC-Feld wird der BIC
    eingetragen; ein von Hand eingetragener BIC wird nie überschrieben.
    Unbekannte BLZ: kein Hinweis, BIC bleibt leer.
- Gespeichert wird wie bisher (prüfen, welche Form Backend, PDF und
  Girocode erwarten; Leerzeichen dürfen dort nicht stören, ggf. Tests im
  Rust-Teil ergänzen).
- Eingesetzt überall, wo eine IBAN eingegeben wird (Firmendaten in
  Einrichtung und Einstellungen; per `grep` weitere Stellen suchen,
  Eingangsrechnungen aus Import sind schreibgeschützt und bleiben unberührt).

## Ansprechpartner aus dem Firmennamen

- Einrichtung: Das Feld „Ansprechpartner" folgt dem Firmennamen, solange es
  nicht von Hand geändert wurde (Merker „selbst bearbeitet"; wird es von
  Hand geleert, folgt es nicht wieder automatisch).
- Einstellungen: Ist der gespeicherte Ansprechpartner leer, steht beim
  Öffnen der Firmenname im Feld (als echter Wert, nicht als Platzhalter);
  Speichern übernimmt ihn. Gleiches Folgeverhalten wie in der Einrichtung,
  solange das Feld nicht berührt wurde.
- Hinweistext „Ohne Angabe wird der Firmenname verwendet." anpassen, z. B.
  „Vorbelegt mit dem Firmennamen. Bei Einzelunternehmen meist der eigene
  Name."
- Rückwärtskompatibel: Backend-Verhalten bei leerem Ansprechpartner bleibt.
- `vorschau/backend.ts` falls nötig nachziehen.

## Gründungsjahr vorbelegt (Wunsch des Betreibers)

- Einrichtung: Das Feld „Gründungsjahr" ist mit dem aktuellen Jahr
  vorbelegt (Ortszeit, wie `heuteIso()`), frei überschreibbar und leerbar.
- Risiko: Das Gründungsjahr steuert die Umsatzgrenzen (im Gründungsjahr
  gilt eine andere Prüfung). Ein bestehendes Unternehmen, das die Vorbelegung
  übernimmt, bekäme falsche Grenzhinweise. Deshalb:
  - Hinweis unter dem Feld, sinngemäß: „Vorbelegt mit dem laufenden Jahr.
    Gibt es dein Unternehmen schon länger, trag das tatsächliche Jahr ein."
  - Keine Vorbelegung in den Einstellungen (dort steht der gespeicherte
    Wert; leer bleibt leer).
- Test: Vorbelegung vorhanden, überschreibbar, leerbar; gespeichert wird,
  was im Feld steht.

