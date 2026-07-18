# Kunden-Snapshot-Anzeige (Teilprojekt 1 von 3: Lösch-UI für Kunde/Artikel)

## Kontext

Beim Brainstorming der Lösch-UI für Kunde/Artikel kam die Frage auf, was mit
bestehenden Angeboten/Rechnungen passiert, wenn der referenzierte Kunde
gelöscht wird. Prüfung ergab:

- `beleg.kunde_snapshot` ist eine bereits bestehende, persistierte Spalte, die
  beim „Stellen" (Entwurf → versendet/gestellt) mit Name, Kundennummer,
  USt-IdNr., Adresse etc. befüllt wird (`kunde_snapshot_json` in
  `src-tauri/src/commands/belege.rs`).
- Sie wird aktuell **nur für den PDF-/XRechnung-/ZUGFeRD-Export** genutzt
  (`src-tauri/src/dokument/kontext.rs`), nicht für die Bildschirmanzeige.
- Liste (`Angebote.tsx`, `Rechnungen.tsx`) und `BelegEditor.tsx` lesen den
  Kundennamen weiterhin **live** über `kunden.find(k => k.id === kunde_id)`
  gegen `api.kunden.list()`. Ein soft-gelöschter Kunde fällt aus dieser Liste
  heraus, der Name würde dann nicht mehr angezeigt.
- Entwürfe haben noch **keinen** Snapshot (leerer String per Default), da
  dieser erst beim Stellen geschrieben wird.
- `kunde_id` eines Belegs kann nach dessen Erstellung nicht mehr geändert
  werden (kein UI dafür in `StammdatenAbschnitt`) — der Snapshot wird also nie
  durch eine spätere Kundenänderung veraltet.

## Ziel

Liste und `BelegEditor` zeigen den Kundennamen aus dem Snapshot, sobald einer
existiert (gestellte/versendete/bezahlte/stornierte Belege), statt sich auf
eine Live-Suche in der aktuellen Kundenliste zu verlassen. Für Entwürfe (ohne
Snapshot) bleibt die Live-Suche als Fallback bestehen.

Dies ist Voraussetzung für Teilprojekt 3 (Kunde/Artikel Lösch-UI): dort wird
die Regel gelten, dass ein Kunde nur dann nicht gelöscht werden darf, wenn er
noch mindestens einen **Entwurf** referenziert — für alle anderen Beleg-Status
ist die Anzeige durch den Snapshot bereits abgesichert.

## Umfang

### Backend

`Beleg` (Rust-Struct und das an Tauri-Commands zurückgegebene Objekt für
`beleg_list` und `beleg_get`) bekommt ein neues, abgeleitetes Feld:

```rust
pub kunde_snapshot_name: Option<String>,
```

Ableitung: `kunde_snapshot`-Spalte parsen (JSON, Struktur siehe
`kunde_snapshot_json` in `belege.rs`); ist die Spalte leer (Entwurf) oder das
JSON nicht parsbar, ist das Feld `None`. Sonst der Wert aus
`snapshot.kunde.name`.

Die Ableitung erfolgt als kleine private Hilfsfunktion (z. B.
`kunde_snapshot_name(roh: &str) -> Option<String>`), die von der
`list`/`get`-Query-Verarbeitung aufgerufen wird. Kein neues Schema, keine
Migration — reine Ableitung aus vorhandener Spalte.

### Frontend

- `src/api.ts`: `Beleg`-Interface bekommt `kunde_snapshot_name: string | null;`.
- `Angebote.tsx` (Zeile ~107) und `Rechnungen.tsx` (analoge Stelle): Anzeige
  wechselt von
  ```tsx
  kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id
  ```
  zu
  ```tsx
  a.kunde_snapshot_name ?? kunden.find((k) => k.id === a.kunde_id)?.name ?? a.kunde_id
  ```
- `BelegEditor.tsx`, `StammdatenAbschnitt` (Zeilen 313 und 324, beide
  identischen Vorkommen von `{kunde?.name ?? beleg.kunde_id}`): gleiche
  Fallback-Kette:
  ```tsx
  beleg.kunde_snapshot_name ?? kunde?.name ?? beleg.kunde_id
  ```

### Nicht im Umfang

- Keine Änderung an `stellen()` oder dem Zeitpunkt der Snapshot-Erstellung.
- Keine Blockier-Logik beim Kunde-Löschen (Teilprojekt 3).
- Keine Änderung an PDF-/XRechnung-/ZUGFeRD-Export (nutzt den Snapshot
  bereits korrekt).
- Kein Snapshot für Entwürfe — deren Kundenname bleibt live abhängig von
  `api.kunden.list()`.

## Tests

- Rust-Unit-Test für die Ableitungsfunktion: leerer String → `None`; valides
  Snapshot-JSON → korrekter Name extrahiert; kaputtes/nicht parsbares JSON →
  `None` (kein Panic).
- Rust-Test, dass `beleg_list`/`beleg_get` das Feld korrekt befüllen: ein
  Entwurf liefert `kunde_snapshot_name: None`, ein gestellter Beleg liefert
  den Namen.
- Frontend-Tests in `Angebote.test.tsx`/`Rechnungen.test.tsx`: Anzeige nutzt
  Snapshot-Namen, wenn vorhanden, sonst Live-Lookup.
- Frontend-Test in `BelegEditor.test.tsx`: Stammdaten-Anzeige (editierbar und
  nicht editierbar) nutzt denselben Fallback.
