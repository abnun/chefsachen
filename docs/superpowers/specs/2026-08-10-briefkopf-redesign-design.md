# Briefkopf-Redesign: Anschrift auf Fensterhöhe, schlankerer Fuß

## Kontext

Angeregt durch einen Vergleich mit einer Lexware-Musterrechnung
(TODO-Punkt 3, 2026-08-10). Drei zusammenhängende Änderungen:

1. Die eigene Anschrift steht bisher im Textfluss direkt unter dem Logo,
   nicht auf Höhe der Empfängeranschrift (45 mm, DIN 5008 Form B).
2. Telefon/Fax/E-Mail stehen nur im Fuß, nicht bei der eigenen Anschrift
   oben.
3. Der Fuß zeigt dadurch dieselbe Anschrift+Kontakt-Information doppelt
   (oben und unten).

## Entschiedene Design-Fragen

- **Eigene Anschrift + Kontakt wird ein einziger, vom Logo entkoppelter
  Block**, rechtsbündig fest bei 45 mm (Höhe der Empfängeranschrift) —
  unabhängig davon, welche Logo-Position gewählt ist. Enthält Name,
  Straße, PLZ/Ort, Telefon, Fax, E-Mail (wie bisher: nur was gepflegt
  ist, erscheint).
- **Fuß wird schlanker**: Nur noch Steuerangaben + Bankverbindung (2 statt
  3 Spalten). Die Anschrift/Kontakt-Spalte entfällt, weil sie jetzt oben
  steht — keine Dopplung mehr.
- **Steuernummer + USt-IdNr. bleiben unverändert**: Beide werden gezeigt,
  wenn beide hinterlegt sind (mit Zeilenumbruch dazwischen); ist nur eine
  gesetzt, erscheint nur die eine; ist keine gesetzt, erscheint keine
  Zeile. § 14 UStG verlangt nur eine von beiden, ein früheres Review hatte
  aber Gründe, beide zu zeigen (u. a. KoSIT-Prüfregel bei der XRechnung,
  betrifft aber primär die XML, nicht zwingend den PDF-Fuß) — unverändert
  gelassen, kein Grund für eine Verhaltensänderung hier.
- **Absenderzeile im Anschriftfenster bleibt unverändert.** Sie erfüllt
  einen anderen Zweck (DIN-5008-Pflicht fürs Umschlagfenster, falls die
  Sendung nicht zustellbar ist) und ist keine Dopplung zur neuen Anschrift
  oben, auch wenn beide ähnliche Angaben zeigen.

### Logo-Positionen vereinfacht

Der neue Anschrift-Block ist vom Logo entkoppelt — das bricht die
bestehende Option **„Oben rechts, neben der Anschrift"**
(`LogoPosition::Rechts`), deren ganzer Zweck war, Logo und Anschrift im
selben Grid nebeneinander zu halten. Entscheidung: **Diese Option wird
komplett entfernt**, nicht nur ausgeblendet — es gibt nur einen Nutzer
dieser App, ein Kompatibilitätspfad für eine nicht mehr wählbare Option
lohnt sich nicht (siehe „Avoid backwards-compatibility hacks"-Prinzip).

Da damit die bisherige Unterscheidung zwischen `Rechts` (nebeneinander)
und `RechtsOben` (gestapelt) wegfällt — „Oben rechts" bedeutet jetzt nur
noch „Logo steht rechts", ohne Bezug zur Anschrift —, wird `RechtsOben`
zu **`Rechts`** umbenannt (einfacherer Name für ein jetzt einfacheres
Konzept). Verbleibende Logo-Optionen: **Oben links, Oben rechts, Kein
Logo** (drei statt vier).

**Wichtig — bereits bestehender Sicherheitsabstand bleibt gültig:** Die
heute früher in dieser Session gebaute `logo_hoehe_max_mm`-Begrenzung
(Logo darf nicht ins Anschriftfenster hineinragen) bezieht sich auf das
Logo selbst, nicht auf `firma_block` — sie bleibt nach diesem Umbau
unverändert korrekt und nötig (das Logo allein, ohne Anschrift darunter,
kann bei „Oben links" immer noch ins Fenster hineinragen). Nur der
Kommentar dazu in `vorlage.rs` muss angepasst werden — er behauptet
aktuell fälschlich, das Logo stehe „direkt über der Firmenanschrift",
was nach diesem Umbau nicht mehr stimmt.

## Technischer Ansatz

### `src-tauri/templates/rechnung.typ`

**Entfernen:**
- Den gesamten `firma_block`-Mechanismus und die Fallunterscheidung
  `#if logo == none [...] else if v_logo_position == "rechts" [grid mit
  column-gutter] else if "rechts_oben" [...] else [...]` (Zeilen 174-202
  im aktuellen Stand).
- Die `anschrift_und_kontakt`-Spalte aus dem Fuß-Grid (aus 3 Spalten
  werden 2: `steuerangaben, bankverbindung`).

**Ändern:**
- Logo-Rendering vereinfacht sich auf zwei Fälle:
  ```typst
  #if logo != none [
    #if sys.inputs.v_logo_position == "rechts" [
      #align(right)[#logo]
    ] else [
      #logo
    ]
  ]
  ```
- `kontaktzeilen`-Kommentar korrigieren (aktuell: „Absichtlich nicht im
  Kopf neben Logo und Anschrift" — das Gegenteil ist jetzt der Fall).

**Neu:**
- `anschrift_und_kontakt` (bereits als Inhalt vorhanden, bisher nur im
  Fuß verwendet) wird zusätzlich oben platziert, rechtsbündig, fest bei
  45 mm — als eigenständiges `#place`, analog zum bestehenden
  Anschriftfeld-`#place` weiter unten, aber mit `top + right` statt
  `top + left` (kein `dx` nötig — die Rechtsbündigkeit übernimmt die
  Alignment-Angabe selbst, keine Rand-Korrektur wie bei `dx` nötig):
  ```typst
  // Eigene Anschrift + Kontakt rechtsbündig auf Höhe der
  // Empfängeranschrift (45 mm) — entkoppelt vom Logo, das oben allein
  // steht. Reine Flusspositionierung (kein `background`): Anders als die
  // Falzmarken ist das eine Inhaltsangabe, die nur auf Seite 1 gehört
  // (dort beginnt auch das Anschriftfeld der Empfängerin).
  #place(
    top + right,
    dy: 45mm - rand_oben,
    anschrift_und_kontakt,
  )
  ```

### `src-tauri/src/dokument/vorlage.rs`

- `LogoPosition`: `Rechts`-Variante (alt) entfernen, `RechtsOben` zu
  `Rechts` umbenannt. `aus()`/`als_str()` entsprechend.
- Neuer Doc-Kommentar auf `Rechts` (ersetzt den alten, der auf die jetzt
  entfernte Variante verweist): einfach „Logo steht rechts" ohne
  Vergleich zu einer anderen Variante.
- `LOGO_SICHERHEITSPUFFER_MM`-Kommentar korrigieren: nicht mehr „dort
  steht das Logo im Textfluss direkt über der Firmenanschrift", sondern
  sinngemäß „das Logo steht dort allein im Textfluss, seine Unterkante
  kann ins Anschriftfenster hineinragen".

### `src/components/Belegvorlage.tsx`

`optionen` auf drei Einträge reduziert, `hinweis` entfällt (keine
Mehrdeutigkeit mehr zu erklären zwischen zwei einfachen Positionen):

```ts
{
  schluessel: "vorlage.logo_position",
  label: "Logo",
  art: "auswahl",
  optionen: [
    ["links", "Oben links"],
    ["rechts", "Oben rechts"],
    ["keins", "Kein Logo"],
  ],
},
```

## Betroffene Bestandstests

### Entfallen (testen entfernte Funktionalität)

- `abstand_zwischen_anschrift_und_logo_bei_rechts_neben_der_anschrift`
  (`pdf.rs`) — testet den jetzt entfernten `column-gutter`-Grid der alten
  „Rechts, neben der Anschrift"-Option.
- `firma_anschrift_steht_bei_logo_rechts_daneben_nicht_am_linken_rand`
  (`pdf.rs`) — testet, dass `firma_block` neben dem Logo im rechten
  Seitenbereich steht; `firma_block` in dieser Form gibt es nicht mehr.
- `bietet die vierte Logo-Option „Oben rechts" an`
  (`Belegvorlage.test.tsx`) — die Prämisse „vierte Option, unterscheidbar
  von einer dritten" entfällt, da nur noch drei Optionen existieren; die
  verbleibende Funktionalität (Auswahl ändert `logo_position`) ist bereits
  durch den Nachbartest `zeichnet die Vorschau mit den Werten aus dem
  Formular neu` abgedeckt.

### Umzubenennen / anzupassen (Bezug auf `RechtsOben`/`rechts_oben`)

- `logo_position_rechts_oben_wird_gelesen` (`vorlage.rs`) → neuer Name
  ohne „oben" (z. B. `logo_position_rechts_wird_gelesen`), Wert
  `"rechts_oben"` → `"rechts"`, erwarteter Enum-Wert `LogoPosition::RechtsOben`
  → `LogoPosition::Rechts`.
- `logo_steht_rechts_bei_rechts_oben_und_links_bei_links` (`pdf.rs`) →
  neuer Name (z. B. `logo_steht_rechts_bei_rechts_und_links_bei_links`),
  `LogoPosition::RechtsOben` → `LogoPosition::Rechts`.

### Kommentare korrigieren (Test bleibt inhaltlich unverändert gültig)

Diese Tests prüfen nur Textpräsenz irgendwo auf der Seite, nicht die
Position — sie bleiben nach dem Umbau unverändert grün, weil Telefon/
Fax/E-Mail weiterhin irgendwo erscheinen (jetzt oben statt im Fuß). Nur
ihre Kommentare, die „Fuß" nennen, sind nach dem Umbau ungenau:

- `rechnung_enthaelt_telefon_fax_und_email` (`pdf.rs`)
- `zahlungserinnerung_enthaelt_telefon_fax_und_email` (`pdf.rs`)
- `rechnung_zeigt_keine_leeren_kontaktangaben` (`pdf.rs`)

### Neu

- Ein geometrischer Test, der beweist, dass die eigene Anschrift jetzt
  bei 45 mm steht, **unabhängig von der gewählten Logo-Position** (Links,
  Rechts, Keins) — das ist die zentrale neue Eigenschaft dieses Umbaus,
  bisher durch keinen Test abgesichert. Nutzt `textpositionen` (bereits
  vorhanden), filtert auf einen eindeutigen Bestandteil des Anschrift-
  Blocks (z. B. die E-Mail-Adresse aus `test_kontext()`) und prüft dessen
  y-Position gegen 45 mm.
- Ein Test, der beweist, dass der Fuß jetzt nur noch zwei Spalten hat
  bzw. dass die Anschrift/Kontakt-Information dort **nicht mehr** in
  Fuß-typischer Position (unterhalb des Hauptinhalts, `y`-Bereich des
  Footers) auftaucht — zur Absicherung, dass die Information wirklich
  verschoben und nicht einfach verdoppelt wurde.

## Kein Migrationsbedarf

Reine Vorlagen-/Einstellungsänderung. Wer aktuell `vorlage.logo_position
= "rechts"` (alt, nebeneinander) gespeichert hat, bekommt beim nächsten
Laden `LogoPosition::Rechts` (neu, Logo rechts allein) — eine
Verhaltensänderung ohne Fehler oder Datenverlust, aber ohne Rückfrage.
Da diese App nur vom Betreiber selbst genutzt wird, ist das akzeptabel;
bei mehreren Nutzern wäre das genauer zu bedenken.
