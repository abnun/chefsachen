# Vierte Logo-Position „Oben rechts"

## Kontext

TODO-Punkt 1 (`docs/TODO.md`): Heute gibt es drei Logo-Optionen — „Oben
links", „Oben rechts, neben der Anschrift" und „Kein Logo". Gewünscht ist
eine vierte, die das Logo an der rechten Blattkante zeigt, mit der eigenen
Firmenanschrift (Name/Straße/Ort) darunter — also spiegelbildlich zu „Oben
links", nicht nebeneinander wie die bestehende „rechts"-Option.

`firma_block` (Name, Straße, PLZ/Ort) ist im Template bereits unbedingt
rechtsbündig (`align(right)`, seit Commit `c54a1da`). Der bestehende
„links"-Zweig rendert schon `#logo` gefolgt von `#firma_block` — die neue
Option muss davon nur die Logo-Ausrichtung auf rechts drehen, sonst nichts.

Nebenbei entdeckt: Bei „Oben rechts, neben der Anschrift" stoßen Anschrift
und Logo ohne Abstand aneinander (`grid` ohne `column-gutter`). Wird mit
erledigt.

Separat, nicht Teil dieser Spec: Ein Bug, bei dem „Logo entfernen" ein
leeres statt ein `NULL`-Blob speichert und dadurch jeden Beleg-Export zum
Absturz bringt, wurde bereits während dieser Session behoben
(`src-tauri/src/commands/firma.rs`, `logo_get` filtert jetzt leere Blobs).

## Änderungen

### `src-tauri/src/dokument/vorlage.rs`

Neue Variante `LogoPosition::RechtsOben`, Wert `"rechts_oben"`:

```rust
pub enum LogoPosition {
    Links,
    Rechts,
    RechtsOben,
    Keins,
}
```

`aus()` und `als_str()` entsprechend erweitert. Vorgabe bleibt `Links`
(unverändert) — an laufender Geschäftspost ändert sich nichts.

### `src-tauri/templates/rechnung.typ`

Neuer Zweig zwischen dem bestehenden `"rechts"`-Zweig und dem `else`
(„links"):

```typst
] else if sys.inputs.v_logo_position == "rechts_oben" [
  #align(right)[#logo]
  #firma_block
] else [
```

Zusätzlich: `column-gutter: 12pt` im bestehenden `grid(...)` der
„rechts"-Option (Zeile 169), analog zum dreispaltigen Fuß-Grid weiter oben
in derselben Datei — behebt den fehlenden Abstand zwischen Anschrift und
Logo.

### `src/components/Belegvorlage.tsx`

Neuer Eintrag im `optionen`-Array von `vorlage.logo_position`, zwischen
„rechts" und „keins":

```ts
["rechts_oben", "Oben rechts"],
```

## Tests

- `vorlage.rs`: `aus_paaren`-Test für `"rechts_oben"` ergänzen, analog zum
  bestehenden Test für `"rechts"`.
- `pdf.rs`: Rendert ohne Fehler mit `LogoPosition::RechtsOben` und echtem
  Logo (Testfixture `logo_1x1.png`); Regressionstest im bisherigen Stil
  (Text-Positionsprüfung), ohne Anspruch, die Logo-Position selbst zu
  verifizieren — dafür existiert im Testbestand kein Werkzeug (Bilder lassen
  sich aus dem PDF-Text nicht auslesen), das gilt auch für die bestehende
  „rechts"-Option.
- Bestehender Test `firma_anschrift_steht_bei_logo_rechts_daneben_nicht_am_
  linken_rand` bleibt unverändert gültig (testet weiterhin nur die
  „rechts"-Option).

## Release

Nach Umsetzung und grünen Tests: Version in `Cargo.toml`, `package.json`,
`tauri.conf.json` von `1.3.0` auf `1.3.1`; `CHANGELOG.md`-Eintrag; TODO-Punkt
1 aus „Offen" ins Archiv verschoben (inkl. Erwähnung des
Abstands-Nebenfunds). Kein Datenbank-Migrationsbedarf.
