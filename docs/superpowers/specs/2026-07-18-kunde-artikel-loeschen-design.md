# Kunde/Artikel Lösch-UI (Teilprojekt 3 von 3: Lösch-UI für Kunde/Artikel)

## Kontext

Backend (`kunde_delete`/`artikel_delete`, Soft-Delete) und Frontend-API
(`api.kunden.delete`/`api.artikel.delete`) existieren bereits vollständig —
es fehlte bisher nur die UI. Teilprojekt 1 (Kunden-Snapshot-Anzeige) und
Teilprojekt 2 (Lösch-Bestätigungsdialog app-weit) sind Voraussetzungen und
bereits gemergt:

- Teilprojekt 1 sorgt dafür, dass bereits **gestellte** Angebote/Rechnungen
  den Kundennamen aus einem eingefrorenen Snapshot zeigen, nicht aus einer
  Live-Suche — ein gelöschter Kunde macht deren Anzeige also nicht kaputt.
  **Entwürfe** haben noch keinen Snapshot und hängen weiterhin von einer
  Live-Suche ab.
- Teilprojekt 2 stellt `useLoeschBestaetigung()` (Promise-basierter
  Bestätigungsdialog, `src/hooks/useLoeschBestaetigung.tsx`) bereit.

Zusätzlich bereits vorhanden: `Artikel.kundenpreise_anzahl` (Frontend-Feld,
aus einem früheren Plan) — die Anzahl zugehöriger Kundenpreise ist im
Frontend ohne weitere Backend-Abfrage bekannt.

## Ziel

Neue „Löschen"-Buttons für Kunde (Liste + Detailseite) und Artikel (Liste),
mit Regeln, die verhindern, dass noch benötigte Daten verschwinden:

- **Kunde**: Löschen blockiert, solange der Kunde noch mindestens einen
  **Entwurf** (Angebot oder Rechnung) referenziert — sowohl serverseitig
  (Validierungsfehler bei Verstoß) als auch clientseitig (Button von
  vornherein deaktiviert).
- **Artikel**: Löschen mit vorhandenen Kundenpreisen ist möglich, aber der
  Bestätigungsdialog weist auf die Anzahl hin und kündigt an, dass sie
  mitgelöscht werden. Nach expliziter Bestätigung werden Artikel und
  Kundenpreise gemeinsam (transaktional) soft-gelöscht.

## Design

### Backend — Kunde

**Neues Feld** `hat_offene_entwuerfe: bool` auf `Kunde`
(`src-tauri/src/commands/kunden.rs`), analog zum bestehenden `hat_adresse`:

```rust
EXISTS(SELECT 1 FROM beleg b WHERE b.kunde_id = k.id AND b.status = 'entwurf' AND b.deleted_at IS NULL) AS hat_offene_entwuerfe
```

Ergänzt in denselben Queries wie `hat_adresse` (`list` und `get` in
`kunden.rs`), auf dieselbe Weise abgeleitet.

**`delete()`** in `kunden.rs` prüft dieselbe Bedingung serverseitig (Defense
in Depth — das Frontend-Flag ist nur für die UI, kein Vertrauensanker) und
liefert bei Verstoß:

```rust
AppError::Validation {
    feld: "id".into(),
    meldung: "Kunde hat noch offene Entwürfe und kann nicht gelöscht werden".into(),
}
```

### Backend — Artikel

**`artikel_delete`** (Tauri-Command in `src-tauri/src/commands/artikel.rs`)
bekommt einen neuen Parameter `kundenpreise_mitloeschen: bool` (Default
`false` beim bestehenden Aufrufort, falls es einen gibt — aktuell keiner,
da diese Aktion neu in der UI ist).

- Artikel ohne Kundenpreise: `kundenpreise_mitloeschen` wird ignoriert,
  normales Soft-Delete des Artikels.
- Artikel mit Kundenpreisen, `kundenpreise_mitloeschen = false`: Ablehnung
  mit `AppError::Validation`, Meldung enthält die Anzahl (z. B. „Artikel hat
  3 Kundenpreise — zum Löschen bestätigen, dass sie mitgelöscht werden
  sollen").
- Artikel mit Kundenpreisen, `kundenpreise_mitloeschen = true`: Artikel UND
  alle zugehörigen `kundenpreis`-Zeilen werden in einer Transaktion
  soft-gelöscht (`deleted_at` gesetzt).

### Frontend — API

`src/api.ts`:

```ts
kunden: {
  // ... bestehende Felder
  delete: (id: string) => invoke<void>("kunde_delete", { id }),  // bereits vorhanden, unverändert
},
```

`Kunde`-Interface bekommt `hat_offene_entwuerfe: boolean;` (analog
`hat_adresse`).

```ts
artikel: {
  delete: (id: string, kundenpreiseMitloeschen: boolean) =>
    invoke<void>("artikel_delete", { id, kundenpreiseMitloeschen }),
},
```

### Frontend — Kunden.tsx (Liste)

Neuer „Löschen"-Button (`btn btn-gefahr`) pro Zeile, neben „Bearbeiten"/dem
bestehenden Zeilen-Klick-Verhalten. `disabled={k.hat_offene_entwuerfe}`.
Klick → `bestaetigen(\`Kunde „${k.name}" löschen?\`)` → bei Bestätigung
`api.kunden.delete(k.id)`, danach `laden()` (Liste neu laden) und
`zeigen(\`Kunde „${k.name}" gelöscht\`)`.

### Frontend — KundeDetail.tsx (Stammdaten-Bereich)

Gleicher Button in `StammdatenReiter`, `disabled={kunde.hat_offene_entwuerfe}`.
Nach erfolgreichem Löschen: neuer Callback-Prop `onGeloescht: () => void` auf
`KundeDetail` (und intern an `StammdatenReiter` durchgereicht), den
`App.tsx` mit `() => setAusgewaehlterKunde(null)` befüllt — das schaltet die
Seite zurück auf die Kundenliste (`App.tsx`s bestehendes
`ausgewaehlterKunde`-State-Umschalten zwischen `Kunden`- und
`KundeDetail`-Ansicht, kein Router in dieser App).

### Frontend — Artikel.tsx (Liste)

Neuer „Löschen"-Button (`btn btn-gefahr`) pro Zeile. Dialogtext hängt von
`a.kundenpreise_anzahl` ab:

- `0`: `Artikel „${a.bezeichnung}" löschen?`
- `> 0`: `Artikel „${a.bezeichnung}" hat ${a.kundenpreise_anzahl} Kundenpreis(e). Diese werden beim Löschen ebenfalls entfernt. Trotzdem löschen?`

Bei Bestätigung: `api.artikel.delete(a.id, a.kundenpreise_anzahl > 0)`,
danach `ladeArtikel()` und `zeigen(\`Artikel „${a.bezeichnung}" gelöscht\`)`.

Kein Detailseiten-Pendant nötig — Artikel hat keine eigene Detailseite in
dieser App.

## Nicht im Umfang

- Kundenpreis-/Zahlung-Löschen-UI (existiert nicht, nicht Teil dieses Plans).
- Kaskadierendes Löschen von Adresse/Ansprechpartner beim Kunde-Löschen —
  bleiben wie bisher als (harmlose) verwaiste Zeilen in der Datenbank
  bestehen, konsistent mit dem bestehenden Verhalten der App (keine
  Kaskadierung bei Eltern-Löschung, außer der hier neu eingeführten
  Ausnahme für Artikel→Kundenpreis).
- Undo/Wiederherstellen gelöschter Kunden/Artikel (Soft-Delete ist bereits
  vorhanden, aber keine UI, um gelöschte Einträge einzusehen oder
  zurückzuholen).
- Fokus-Trap oder andere Verbesserungen am `Bestaetigungsdialog` selbst —
  der Hook/die Komponente aus Teilprojekt 2 wird unverändert wiederverwendet.

## Tests

- Rust: `hat_offene_entwuerfe`-Ableitung in `kunde_list`/`kunde_get` (Kunde
  mit Entwurf → `true`; Kunde ohne Belege oder nur mit gestellten Belegen →
  `false`).
- Rust: `kunde_delete` lehnt ab, wenn Entwurf existiert (Validierungsfehler);
  erlaubt, wenn keine Belege oder nur gestellte/stornierte Belege existieren.
- Rust: `artikel_delete` — löscht normal ohne Kundenpreise; lehnt ab mit
  Kundenpreisen und `kundenpreise_mitloeschen=false`; löscht Artikel und
  Kundenpreise gemeinsam mit `kundenpreise_mitloeschen=true` (Test prüft,
  dass die Kundenpreis-Zeilen danach `deleted_at` gesetzt haben).
- Frontend: `Kunden.tsx` — Löschen-Button ist deaktiviert bei
  `hat_offene_entwuerfe`; Bestätigen löscht und zeigt Banner; Abbrechen tut
  nichts (analog Teilprojekt 2).
- Frontend: `KundeDetail.tsx` — Löschen-Button deaktiviert bei
  `hat_offene_entwuerfe`; nach Bestätigen wird `onGeloescht` aufgerufen.
- Frontend: `Artikel.tsx` — Dialogtext ohne Kundenpreise vs. mit
  Kundenpreisen (Anzahl im Text); Bestätigen ruft `api.artikel.delete` mit
  korrektem zweiten Parameter auf.
- Frontend: `App.tsx` — `onGeloescht` von `KundeDetail` schaltet zurück zur
  Kundenliste (`ausgewaehlterKunde` wird `null`).
