# Falz- und Lochmarken

## Kontext

Beim Ausdruck fehlen bisher jegliche Hilfsmarken für das manuelle Falten
(Fensterumschlag DIN lang/C6/5) und Lochen (Zwei-Loch-Ordner). TODO-Punkt 2.

**Falsche Annahme korrigiert:** Das ursprünglich im TODO notierte Wertepaar
87 mm/192 mm gehört zu DIN 5008 **Form A** (27 mm Kopfzeile). Diese App
implementiert aber **Form B** (45 mm Kopfzeile, Anschriftfenster ab 45 mm) —
bestätigt durch zwei unabhängige Quellen und im selben Zug im gesamten
Bestandscode korrigiert (Commit `e58c2c9`, vorher fälschlich als „Form A"
beschriftet). Für Form B liegen die Falzmarken bei 105 mm und 210 mm.

Zusätzlich gibt es eine dritte, von der Form unabhängige Marke: die
**Lochmarke** bei fix 148,5 mm (Blattmitte, für die Zwei-Loch-Locherung),
die auf echtem Geschäftsbriefpapier meist zusammen mit den Falzmarken
steht.

## Entschiedene Design-Fragen

- **Drei Marken**, nicht nur eine: Falzmarke 1 (105 mm), Lochmarke
  (148,5 mm), Falzmarke 2 (210 mm) — alle von oben, am linken Blattrand.
- **Ein gemeinsamer Schalter**, keine Einzelsteuerung je Marke — passt zum
  bestehenden Prinzip „feste Menge von Stellschrauben" dieser App.
- **Vorgabe: an.** Bewusste Ausnahme vom sonstigen „neue Einstellung
  ändert nichts am bisherigen Aussehen"-Prinzip, wie bereits beim Girocode
  (`zeigt_girocode`) — ausdrücklicher Nutzerwunsch.
- **Auf jeder Seite**, nicht nur Seite 1: Anders als Logo/Anschrift (reine
  Inhalts-/Branding-Elemente, auf Folgeseiten redundant) sind Falz- und
  Lochmarken eine physische Handhabungshilfe für den ganzen gedruckten
  Stapel — die gefaltete/gelochte Handhabung betrifft alle Seiten
  gemeinsam, nicht nur die erste.
- **Gilt für alle Belegarten** (Angebot, Rechnung, Storno,
  Zahlungserinnerung) — reine Papier-Handhabung, unabhängig vom Inhalt.
- **Positionen sind fix**, nicht einstellbar — das sind Normwerte, kein
  Gestaltungsspielraum wie bei Farben oder Rändern.
- **Optik nicht normativ recherchierbar** (Strichlänge/-stärke stehen
  vermutlich nur im kostenpflichtigen Normtext, hier nicht verifizierbar).
  Gewählt: 4 mm langer, dünner Strich (0,3 pt) in demselben gedämpften
  Grau (`#999999`), das die Vorlage bereits für nicht-akzentuierte Linien
  verwendet (z. B. Girocode-Rahmen) — bewusst nicht in der einstellbaren
  Akzentfarbe, da es sich um eine funktionale Marke handelt, kein
  gestalterisches Element. Feinjustierbar über die ohnehin vorhandene
  Live-Vorschau, falls es beim ersten Blick nicht überzeugt.

## Technischer Ansatz (empirisch verifiziert)

Ein Spike-Test (temporär, nicht committet) hat geklärt, wie sich Typsts
`#set page(background: ...)` verhält: Anders als normaler Fließtext-Inhalt
(der relativ zur Randbox liegt und deshalb die `dx: 20mm - rand_seitlich`-
Korrektur beim Anschriftfeld braucht) positioniert `background` **absolut
vom wahren Blattursprung aus, unabhängig vom eingestellten Rand**. `place(dx:
0mm, dy: 105mm, ...)` landet exakt bei 105 mm vom echten Blattrand, ganz
ohne Korrekturterm. Das ist einfacher als beim Anschriftfeld, nicht
komplizierter.

`background` läuft wie `footer` pro Seite (bestätigt durch den bereits
bestehenden `footer: context { ... }`-Mechanismus) — damit erscheinen die
Marken automatisch auf jeder Seite, ohne eigene Seitenzähler-Logik.

### `src-tauri/templates/rechnung.typ`

Neue Funktion `falzmarke(y_mm)`, definiert vor dem `#set page(...)`-Aufruf
(lexikalische Bindung, wie bei `bankverbindung`/`kontaktzeilen`), plus ein
neuer `background:`-Parameter im bestehenden `#set page(...)`:

```typst
// Falz- und Lochmarken nach DIN 5008 Form B: kurze Striche am linken
// Blattrand für das manuelle Falten (Fensterumschlag) und Lochen
// (Zwei-Loch-Ordner). Über `background` statt im Textfluss — anders als
// das Anschriftfeld unten braucht das keine Rand-Korrektur, background
// sitzt schon absolut am Blattursprung. Läuft wie `footer` auf jeder
// Seite, nicht nur der ersten: Anders als Logo/Anschrift ist das keine
// Inhaltsangabe, sondern eine Handhabungshilfe für den ganzen Stapel.
#let falzmarke(y_mm) = place(
  top + left,
  dx: 0mm,
  dy: y_mm * 1mm,
  line(length: 4mm, stroke: 0.3pt + rgb("#999999")),
)
```

Im bestehenden `#set page(...)` (Zeile ~121) ergänzt um:

```typst
  background: if ja(sys.inputs.v_falzmarken) [
    #falzmarke(105.0)
    #falzmarke(148.5)
    #falzmarke(210.0)
  ],
```

### `src-tauri/src/dokument/vorlage.rs`

Neues Feld `falzmarken: bool` auf `Vorlage`, exakt nach dem Muster von
`zeigt_girocode`:
- `Default for Vorlage`: `falzmarken: true`.
- `aus_paaren`: `falzmarken: ja(hole("vorlage.falzmarken"), standard.falzmarken)`.
- `als_eingaben`: `("v_falzmarken", ja_nein(self.falzmarken))`.

### `src/components/Belegvorlage.tsx`

Neuer Eintrag im `SCHALTER`-Array, Typ `ja_nein`, direkt nach dem
`zeigt_girocode`-Eintrag:

```ts
{
  schluessel: "vorlage.falzmarken",
  label: "Falz- und Lochmarken",
  hinweis:
    "Kurze Markierungen am linken Rand für das Falten in einen Fensterumschlag " +
    "und das Lochen für den Ordner (DIN 5008). Erscheinen auf jeder Seite.",
  art: "ja_nein",
},
```

## Tests

- `vorlage.rs`: Unit-Test analog `ohne_einstellung_ist_der_girocode_aktiv`
  (Vorgabe an) plus ein Test, der `vorlage.falzmarken` auf „nein" setzt und
  `v.falzmarken == false` prüft.
- `pdf.rs`: neuer PDF-Geometrie-Test-Helfer `linienpositionen`, analog zu
  `textpositionen`/`bildpositionen`, aber für `m`/`l`-Pfadoperatoren (Typst
  kompiliert `line()` zu PDF-„moveto"/„lineto"). Liefert
  `Vec<((f32,f32),(f32,f32))>` (Start- und Endpunkt je Linie), transformiert
  durch die zum Zeitpunkt von `m`/`l` aktuelle Matrix — dafür ein neuer
  Hilfspunkt-Transform (Matrix auf einen Punkt statt zwei Matrizen
  verketten, siehe `mal`).
  - Test „bei aktivierten Falzmarken stehen drei Striche an den richtigen
    Höhen (105/148,5/210 mm), unabhängig vom eingestellten Rand" — rendert
    einmal mit Vorgabe-Rändern und einmal mit stark abweichenden Rändern,
    beide Male müssen die Marken an denselben absoluten Positionen liegen
    (beweist die rand-unabhängige `background`-Platzierung, nicht nur die
    Zahl selbst).
  - Test „bei deaktivierten Falzmarken erscheint keine Linie" —
    `linienpositionen` liefert eine leere Liste.

## Kein Migrationsbedarf

Reine Einstellung, keine Datenbankstruktur betroffen.
