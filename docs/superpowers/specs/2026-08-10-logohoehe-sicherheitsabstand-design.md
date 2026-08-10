# Logohöhe: automatische Obergrenze zum Anschriftfenster

## Kontext

Bei „Oben links" und „Oben rechts" (gestapelt) steht das Logo im Textfluss
direkt über der Firmenanschrift; das Anschriftfenster nach DIN 5008 Form A
ist dagegen absolut positioniert und beginnt unabhängig davon fest bei
45 mm von oben (`rechnung.typ:180-213`). Die Logo-Unterkante liegt bei
`rand_oben_mm + logo_hoehe_mm`. Mit den bisherigen Vorgaben (25 mm Rand,
20 mm Logo) ergibt das exakt 45 mm — 0 mm Puffer zum Fenster, sichtbar als
Logo, das auf der Absenderzeile „hängt" (Nutzer-Screenshot, 2026-08-10).

`logo_hoehe_mm` (5–50 mm) und `rand_oben_mm` (20–40 mm) werden bisher
unabhängig voneinander begrenzt (`vorlage.rs`, `aus_paaren`); es gibt keine
Prüfung ihrer Summe gegen die feste 45-mm-Marke.

Betroffen sind nur „Oben links" und „Oben rechts" (gestapelt) — bei „Oben
rechts, neben der Anschrift" sitzt das Logo horizontal außerhalb des 85 mm
breiten Fensters (x 20–105 mm) und kollidiert nicht.

**Vereinbart mit dem Nutzer:**
- Der Vorgabewert für `logo_hoehe_mm` sinkt von 20 auf 15 mm — das ist die
  einzige Möglichkeit, den Screenshot-Fall (Normalgröße) tatsächlich zu
  beheben, ohne den oberen Rand serienmäßig zu vergrößern. Ändert das
  Aussehen bei allen, die die Logohöhe nie angefasst haben — bewusst in
  Kauf genommen, analog zum bestehenden Vorgehen bei `rand_unten_mm`
  (Vorgabe von 15 auf 25 mm angehoben, weil sonst der Geschäftsfuß nicht
  passte).
- Die Obergrenze von `logo_hoehe_mm` wird dynamisch an `rand_oben_mm`
  gekoppelt, mit 5 mm Sicherheitspuffer. Bei den neuen Vorgabewerten
  (25 mm Rand, 15 mm Logo) ergibt das genau 5 mm Puffer — die Vorgabe
  liegt also exakt auf der neuen Obergrenze.

## Formel

```
logo_hoehe_max_mm(rand_oben_mm) = max(45.0 − rand_oben_mm − 5.0, 5.0)
```

- 45.0 mm: Beginn des Anschriftfensters nach DIN 5008 Form A (fixer Wert,
  identisch mit dem Literal in `rechnung.typ`).
- 5.0 mm (Minuend): Sicherheitspuffer zwischen Logo-Unterkante und Fenster.
- `.max(5.0)`: Bei sehr großem oberen Rand (nahe 40 mm) würde die Formel
  einen Wert unter der technischen Mindesthöhe (5 mm) liefern — ungültiger
  Bereich (`min > max`) für die bestehende Clamp-Funktion `mm()`. Der
  Boden verhindert das; in diesem Extremfall bleibt kein Puffer mehr, aber
  die App bleibt funktionsfähig statt abzustürzen.

Werte: `rand_oben_mm = 20` (Minimum) → 20 mm max. `rand_oben_mm = 25`
(Vorgabe) → 15 mm max. `rand_oben_mm = 40` (Maximum) → 5 mm max (Boden
greift, 0 mm Puffer).

## Backend-Änderungen (`src-tauri/src/dokument/vorlage.rs`)

1. Zwei Konstanten (Platzierung: oberhalb von `LogoPosition`, wie bei
   bestehenden modulweiten Werten):
   ```rust
   /// Wo laut DIN 5008 Form A das Anschriftfenster beginnt — muss mit dem
   /// Literal `45mm` in `templates/rechnung.typ` übereinstimmen.
   const ANSCHRIFTFENSTER_START_MM: f64 = 45.0;
   /// Mindestabstand zwischen Logo-Unterkante und Anschriftfenster.
   const LOGO_SICHERHEITSPUFFER_MM: f64 = 5.0;
   ```
2. Neue Funktion `logo_hoehe_max_mm(rand_oben_mm: f64) -> f64` (siehe
   Formel oben), mit Doc-Kommentar zur `.max(5.0)`-Begründung.
3. `Default for Vorlage`: `logo_hoehe_mm: 20.0` → `logo_hoehe_mm: 15.0`.
4. `aus_paaren`: `rand_oben_mm` muss vor `logo_hoehe_mm` berechnet werden
   (aktuell umgekehrte Reihenfolge im Struct-Literal). Umsetzung: lokale
   `let rand_oben_mm = mm(...)` vor dem `Self { ... }`-Literal, dann sowohl
   für das `rand_oben_mm`-Feld als auch für die Max-Grenze von
   `logo_hoehe_mm` verwenden:
   ```rust
   logo_hoehe_mm: mm(
       hole("vorlage.logo_hoehe_mm"),
       standard.logo_hoehe_mm,
       5.0,
       logo_hoehe_max_mm(rand_oben_mm),
   ),
   ```
   Das greift unabhängig davon, ob `logo_hoehe_mm` explizit gesetzt ist
   oder auf die Vorgabe zurückfällt — beides läuft durch dieselbe
   `mm()`-Clamp. Vorschau und echter Export nutzen denselben
   `aus_paaren`-Pfad, also gilt die Begrenzung für beide gleichermaßen.

## Frontend-Änderungen (`src/components/Belegvorlage.tsx`)

Keine Änderung an der generischen `SCHALTER`-Architektur nötig — nur das
Feld `vorlage.logo_hoehe_mm` bekommt beim Rendern eine dynamische
Obergrenze statt der statischen `max`/`standard`-Werte aus dem Array.

1. Im Komponentenkörper (Zugriff auf `werte` nötig), dieselbe Formel wie
   im Backend:
   ```tsx
   // Größte Logohöhe, die beim aktuellen oberen Rand noch Sicherheitsabstand
   // zum Anschriftfenster lässt — muss mit logo_hoehe_max_mm in
   // dokument/vorlage.rs übereinstimmen.
   const randObenMm = Number(werte["vorlage.rand_oben_mm"] ?? "25") || 25;
   const logoHoeheMaxMm = Math.max(45 - randObenMm - 5, 5);
   const logoHoeheStandardMm = Math.min(15, logoHoeheMaxMm);
   ```
2. Im `SCHALTER.map(...)`-Rendering: pro Durchlauf ermitteln, ob es sich
   um `vorlage.logo_hoehe_mm` handelt, und dafür `effektiverMax`/
   `effektiverStandard` statt `s.max`/`s.standard` verwenden — sowohl am
   `<input type="number">` (`max`, `placeholder`) als auch im Hinweistext
   (`Vorgabe {…} mm, möglich 5–{…} mm.`). Alle anderen Felder bleiben
   unverändert.
3. Rein clientseitiges Feedback (native `max`-Validierung, aktualisierter
   Hinweistext) — keine harte Durchsetzung. Wie überall in dieser App
   bleibt die Backend-Prüfung maßgeblich (P4.10-Prinzip).

## Nebenbefund: bestehender Geometrie-Test verliert Trennschärfe

`abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift`
(`pdf.rs`, aus der vorigen Session) nutzt `Vorlage { logo_position: Rechts,
..Default::default() }` — das quadratische Test-Logo (`logo_1x1.png`,
Seitenverhältnis 1:1) übernimmt die Höhe *und* Breite von
`logo_hoehe_mm`. Sinkt die Vorgabe von 20 auf 15 mm, wird das Logo im Test
5 mm schmäler, rutscht dadurch 5 mm weiter nach rechts, und der gemessene
Abstand wächst um denselben Betrag — der bestehende Schwellenwert
(12.0 mm) unterscheidet dann nicht mehr zuverlässig zwischen „mit" und
„ohne" Gutter (beide Fälle blieben klar darüber). Kein Fehlschlag, aber
ein stiller Verlust an Testqualität.

**Fix:** Sowohl dieser Test als auch der benachbarte
`logo_steht_rechts_bei_rechts_oben_und_links_bei_links` (Task 3 der
vorigen Session) setzen `logo_hoehe_mm` künftig explizit
(z. B. `logo_hoehe_mm: 20.0` unverändert wie bisher tatsächlich gerendert)
statt sich über `..Default::default()` implizit auf den App-Vorgabewert zu
verlassen. Entkoppelt beide Tests von künftigen Änderungen an
`Vorlage::default()` — sauberer unabhängig vom aktuellen Anlass. Für den
Abstand-Test muss der Schwellenwert (12.0 mm) nicht neu hergeleitet werden,
weil die feste Logohöhe von 20 mm exakt der bisher schon gemessenen und
verifizierten Situation entspricht.

## Tests

- `vorlage.rs`, neuer Unit-Test für `logo_hoehe_max_mm`: Randwerte prüfen
  (20 mm Rand → 20 mm max; 25 mm Rand → 15 mm max; 40 mm Rand → 5 mm max,
  Boden greift).
- `vorlage.rs`, `aus_paaren`-Test: ein zu groß eingestellter
  `logo_hoehe_mm`-Wert bei zugleich großem `rand_oben_mm` wird auf die
  dynamische Grenze statt auf die feste 50 mm geklemmt.
- `pdf.rs`: die beiden bestehenden Tests aus dem Nebenbefund bekommen ihre
  Logohöhe explizit gesetzt (siehe oben) — reiner Härtungs-Fix, keine neue
  Assertion nötig, da beide bereits vor der Änderung grün liefen und danach
  weiterhin dasselbe messen.
- `Belegvorlage.test.tsx`: ein Test, der `vorlage.rand_oben_mm` auf einen
  großen Wert setzt (z. B. „35") und prüft, dass das Logohöhe-Feld daraufhin
  ein kleineres `max` (5 mm) sowie den passenden Hinweistext zeigt.
- Bestehender Test `ohne_gespeicherte_einstellungen_gilt_das_bisherige_
  aussehen` (vergleicht `Vorlage::laden` gegen `Vorlage::default()`) bleibt
  ohne Änderung gültig, da beide Seiten symmetrisch denselben neuen
  Vorgabewert verwenden.

## Kein Migrationsbedarf

Reine Vorgabewert- und Validierungsänderung, keine Datenbankstruktur
betroffen. Wer bereits einen expliziten `logo_hoehe_mm`-Wert gespeichert
hat, behält ihn — außer er überschreitet die neue dynamische Obergrenze
bei seinem aktuellen `rand_oben_mm`, dann wird er ab dem nächsten Laden
automatisch auf die Obergrenze geklemmt (das ist der gewünschte
„automatisch skaliert"-Effekt aus der ursprünglichen Anfrage).
