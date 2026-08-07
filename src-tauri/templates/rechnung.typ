#set text(font: "Inter", size: 10pt)

#let ist_gesetzt(wert) = wert != none and wert != ""
#let ja(wert) = wert == "ja"

// Vorgezogen, damit die Girocode-Größe direkt darunter darauf zugreifen
// kann — Typst bindet Variablen lexikalisch an ihrer Quelltextstelle, ein
// erst weiter unten stehendes `#let mass` wäre hier noch nicht bekannt.
#let mass(name) = float(name) * 1mm

// Girocode (SEPA-QR-Zahlungscode, EPC069-12): Der Empfänger zahlt per
// Smartphone-Kamera, ohne IBAN abzutippen. Rust liefert nur die
// Hell/Dunkel-Matrix (wie die Positionstabelle nur Zahlen liefert) — hier
// entstehen daraus Vektor-Rechtecke, kein Bild.
#let girocode_groesse = mass(sys.inputs.v_girocode_groesse_mm)
#let girocode_block(matrix_json) = {
  let reihen = json(bytes(matrix_json))
  if reihen.len() > 0 {
    v(0.3cm)
    let n = reihen.len()
    box(stroke: 0.5pt + rgb("#999999"), inset: 8pt)[
      #grid(
        columns: (auto, 1fr),
        column-gutter: 10pt,
        align: horizon,
        block(width: girocode_groesse, height: girocode_groesse)[
          #grid(
            columns: (1fr,) * n,
            rows: (1fr,) * n,
            ..reihen.map(reihe => reihe.map(dunkel => box(
              width: 100%, height: 100%,
              fill: if dunkel { black } else { white },
            ))).flatten()
          )
        ],
        [
          *Bezahlen Sie jetzt mit GiroCode* \
          #text(size: 8pt)[Einfach GiroCode auf dem Smartphone scannen und lästiges Abtippen ersparen.]
        ],
      )
    ]
  }
}

// Einstellbares aus `dokument::vorlage`. Die Vorgaben dort bilden das
// ursprüngliche Aussehen ab; hier steht nur, wie die Werte wirken.
#let mass(name) = float(name) * 1mm
#let rand_oben = mass(sys.inputs.v_rand_oben_mm)
#let rand_unten = mass(sys.inputs.v_rand_unten_mm)
#let rand_seitlich = mass(sys.inputs.v_rand_seitlich_mm)
#let akzent = rgb(sys.inputs.v_akzentfarbe)

// Geschäftsangaben für den Fuß jeder Seite — als `#let` hier oben, nicht
// erst weiter unten im Fließtext, wo sie inhaltlich hingehören würden: Der
// `footer`-Funktionswert von `#set page` unten bindet Variablen lexikalisch
// an ihrer Quelltextstelle. Was erst später mit `#let` definiert würde,
// sähe der Fuß nicht.
//
// Bankverbindung: gesetzlich nicht vorgeschrieben, aber ohne sie kann der
// Empfänger nicht zahlen — bei einer Erinnerung erst recht wichtig.
#let bankverbindung = if ist_gesetzt(sys.inputs.firma_iban) [
  *Bankverbindung* \
  IBAN: #sys.inputs.firma_iban
  #if ist_gesetzt(sys.inputs.firma_bic) [
    \ BIC: #sys.inputs.firma_bic
  ]
] else { [] }
// Leeres Content-Element statt `none`: Die drei Spalten unten übergeben
// `bankverbindung` direkt als Grid-Zelle, die dafür `content` erwartet.

// Kontaktangaben: gesetzlich nicht vorgeschrieben — nur was gepflegt ist,
// erscheint auch. Absichtlich nicht im Kopf neben Logo und Anschrift: Der
// bleibt bewusst knapp, wie ein DIN-5008-Briefkopf es vorsieht.
#let kontaktzeilen = (
  if ist_gesetzt(sys.inputs.firma_telefon) { "Telefon: " + sys.inputs.firma_telefon },
  if ist_gesetzt(sys.inputs.firma_fax) { "Fax: " + sys.inputs.firma_fax },
  if ist_gesetzt(sys.inputs.firma_email) { "E-Mail: " + sys.inputs.firma_email },
).filter(z => z != none)

#let anschrift_und_kontakt = [
  #sys.inputs.firma_name \
  #sys.inputs.firma_strasse \
  #sys.inputs.firma_plz #sys.inputs.firma_ort
  // Eine eigene Zeile je Kontaktangabe statt mit " · " zu einem Fließtext
  // verbunden: Bei allen drei Angaben (Telefon, Fax, E-Mail) brach die
  // verbundene Zeile in der schmalen Fuß-Spalte um, mit einem verwaisten
  // "·" vor der letzten Angabe.
  #for zeile in kontaktzeilen [
    \ #zeile
  ]
]

// Pflichtangabe nach § 14 Abs. 4 Nr. 2 UStG: Steuernummer oder USt-IdNr. des
// Ausstellers. Ohne sie ist die Rechnung formell fehlerhaft und der
// Empfänger kann sie zurückweisen.
#let steuerangaben = [
  #if ist_gesetzt(sys.inputs.firma_steuernummer) [
    Steuernummer: #sys.inputs.firma_steuernummer
  ]
  #if ist_gesetzt(sys.inputs.firma_steuernummer) and ist_gesetzt(sys.inputs.firma_ust_idnr) [
    #linebreak()
  ]
  #if ist_gesetzt(sys.inputs.firma_ust_idnr) [
    USt-IdNr.: #sys.inputs.firma_ust_idnr
  ]
]

// Fester Geschäfts-Fuß auf jeder Seite: Anschrift/Kontakt, Steuerangaben und
// Bankverbindung nebeneinander — statt bisher als loser Fließtext nach der
// Positionstabelle, an unterschiedlichen, einstellbaren Stellen. Die
// Seitenzahl ("Seite X von Y") bleibt zusätzlich, nur bei mehr als einer
// Seite — auf einer einseitigen Rechnung wäre sie nur Ballast.
#set page(
  margin: (top: rand_oben, bottom: rand_unten, x: rand_seitlich),
  // Ohne diese Angabe senkt Typst den Footer standardmäßig um 30 % des
  // unteren Randes in die Marge ab (`footer-descent`) — bei drei
  // Adresszeilen plus einer umgebrochenen Kontaktzeile reichte der
  // verbleibende Platz nicht mehr aus, der Footer klebte am Papierrand.
  // 10 % lassen bei 25 mm Rand noch 22,5 mm Platz statt 17,5 mm.
  footer-descent: 10%,
  footer: context {
    let seiten = counter(page).final().first()
    text(size: 8pt)[
      #grid(
        columns: (1fr, 1fr, 1fr),
        column-gutter: 12pt,
        anschrift_und_kontakt, steuerangaben, bankverbindung,
      )
      #if seiten > 1 [
        #v(0.15cm)
        #align(center, text(fill: rgb("#666666"))[
          #sys.inputs.titel #sys.inputs.nummer — Seite #counter(page).display() von #seiten
        ])
      ]
    ]
  },
)

#set heading(numbering: none)
#show heading: it => text(fill: akzent, it)

// Logo und Absenderanschrift teilen sich die Kopfzeile. Steht das Logo rechts,
// rückt die Anschrift nach links — sonst überlagerten sie einander.
#let logo = if ist_gesetzt(sys.inputs.hat_logo) {
  image(sys.inputs.hat_logo, height: mass(sys.inputs.v_logo_hoehe_mm))
} else { none }

#let firma_block = align(right)[
  #sys.inputs.firma_name \
  #sys.inputs.firma_strasse \
  #sys.inputs.firma_plz #sys.inputs.firma_ort
]

#if logo == none [
  #firma_block
] else if sys.inputs.v_logo_position == "rechts" [
  // "Neben der Anschrift": Beides gehört auf dieselbe Seite der Kopfzeile,
  // nicht auf entgegengesetzte Ecken. Die erste Spalte bleibt 1fr breit (sie
  // schluckt den Freiraum), aber ihr Inhalt wird an ihren rechten Rand
  // gerückt — direkt neben die Logo-Spalte, statt an den linken Seitenrand.
  #grid(columns: (1fr, auto), align: (right + horizon, right + horizon), firma_block, logo)
] else [
  #logo
  #firma_block
]

// Anschriftfeld nach DIN 5008 Form A: 20 mm von links, 45 mm von oben,
// 85 mm breit. Nur an dieser Stelle steht die Anschrift im Sichtfenster eines
// gewöhnlichen Umschlags (DIN lang, C6/5). Lag sie im Fluss des Dokuments,
// verschob sie ein Logo oder eine längere Firmenanschrift so weit, dass die
// Rechnung von Hand kuvertiert werden musste.
//
// `place` nimmt die Angaben relativ zum Seitenrand, deshalb die Differenz zu
// den Maßen der Norm. Beide Ränder kommen aus derselben Größe wie oben — wären
// es zwei, verschöbe eine Randänderung das Feld aus dem Fenster.
#place(
  top + left,
  dx: 20mm - rand_seitlich,
  dy: 45mm - rand_oben,
  block(width: 85mm)[
    // Rücksendeangabe: kleingedruckt über der Anschrift, wie in der Norm
    // vorgesehen. Sie steht ebenfalls im Fenster und weist den Absender aus,
    // falls die Sendung nicht zustellbar ist.
    #if ja(sys.inputs.v_absenderzeile) [
      #text(size: 7pt)[
        #sys.inputs.firma_name · #sys.inputs.firma_strasse · #sys.inputs.firma_plz #sys.inputs.firma_ort
      ]
      #v(0.4cm)
    ]
    #if ist_gesetzt(sys.inputs.kunde_ansprechpartner) [
      #sys.inputs.kunde_ansprechpartner \
    ]
    #sys.inputs.kunde_name \
    #sys.inputs.kunde_strasse \
    #sys.inputs.kunde_plz #sys.inputs.kunde_ort
    #if ist_gesetzt(sys.inputs.kunde_land) [
      \ #sys.inputs.kunde_land
    ]
  ],
)

// Abstand bis unter das Anschriftfeld (45 mm + 40 mm nach Norm).
#v(85mm - rand_oben)

= #sys.inputs.titel

// Eine Zahlungserinnerung teilt Briefkopf, Anschriftfeld und Bankverbindung
// mit der Rechnung, aber nicht die Positionstabelle und die rechtlichen
// Pflichtangaben — sie ist selbst kein Beleg nach § 14 UStG, nur ein
// höflicher Hinweis. `.at(default:)`, weil die Rechnung diese Felder gar
// nicht mitgibt: Ein fehlender Schlüssel bräche sonst deren Erzeugung.
#let ist_erinnerung = sys.inputs.at("ist_erinnerung", default: "nein") == "ja"

#if ist_erinnerung [
  #v(0.3cm)
  #sys.inputs.at("erinnerungstext", default: "")

  #v(0.4cm)
  #table(
    columns: (auto, 1fr),
    align: (left, right),
    stroke: none,
    inset: (y: 3pt),
    [Rechnung], [#sys.inputs.at("erinnerung_rechnung_nummer", default: "") vom #sys.inputs.at("erinnerung_rechnung_datum", default: "")],
    [Fällig seit], [#sys.inputs.at("erinnerung_faellig_am", default: "") (#sys.inputs.at("erinnerung_tage_ueberfaellig", default: "0") Tage)],
    [*Offener Betrag*], [*#sys.inputs.at("erinnerung_offener_betrag", default: "")*],
  )
  #girocode_block(sys.inputs.girocode_matrix_json)
] else [
  #let nummer_label = if sys.inputs.titel == "Angebot" { "Angebotsnummer:" } else { "Rechnungsnummer:" }
  #let leistung_label = sys.inputs.leistung_beschriftung + ":"
  #table(
    columns: (auto, 1fr),
    align: (left, right),
    stroke: none,
    inset: (y: 2pt),
    [#nummer_label], [#sys.inputs.nummer],
    [Kundennummer:], [#sys.inputs.kunde_kundennummer],
    [Datum:], [#sys.inputs.datum],
    [#leistung_label], [#sys.inputs.leistungsdatum],
  )

  #if ist_gesetzt(sys.inputs.zahlungsbedingung) [
    #sys.inputs.zahlungsbedingung
  ]
  // Umgekehrt: eine Gültigkeit ist eine Angebotssache. Der Fußtext versprach
  // bisher eine Frist, ohne dass ein Datum dazu auf dem Beleg stand.
  #if ist_gesetzt(sys.inputs.angebot_gueltig_bis) [
    Gültig bis: #sys.inputs.angebot_gueltig_bis
  ]

  // Eine Rechnungskorrektur ohne Bezug zur ursprünglichen Rechnung ist für die
  // Buchhaltung des Empfängers nicht zuzuordnen.
  #if ist_gesetzt(sys.inputs.storno_von_nummer) [
    #v(0.3cm)
    Storno zu Rechnung #sys.inputs.storno_von_nummer
  ]

  #if ist_gesetzt(sys.inputs.kopftext) [
    #v(0.5cm)
    #sys.inputs.kopftext
  ]

  #v(0.5cm)

  #let positionen = json(bytes(sys.inputs.positionen_json))

  // Spalten je nach Einstellung. Bezeichnung, Menge und Summe stehen immer:
  // Menge und Bezeichnung sind Pflichtangaben nach § 14 Abs. 4 Nr. 5 UStG, und
  // ohne die Summe je Position ergibt die Gesamtsumme keinen nachvollziehbaren
  // Zusammenhang.
  #let mit_nummer = ja(sys.inputs.v_spalte_nummer)
  #let mit_gitterlinien = ja(sys.inputs.v_tabelle_gitterlinien)
  #let mit_einheit = ja(sys.inputs.v_einheit_eigene_spalte)
  #let mit_einzelpreis = ja(sys.inputs.v_spalte_einzelpreis)

  #let spalten = (
    ..if mit_nummer { (auto,) } else { () },
    1fr,
    auto,
    ..if mit_einheit { (auto,) } else { () },
    ..if mit_einzelpreis { (auto,) } else { () },
    auto,
  )

  #let ausrichtung = (
    ..if mit_nummer { (right,) } else { () },
    left,
    right,
    ..if mit_einheit { (left,) } else { () },
    ..if mit_einzelpreis { (right,) } else { () },
    right,
  )

  #let kopfzeile = (
    ..if mit_nummer { ([*Pos.*],) } else { () },
    [*Bezeichnung*],
    [*Menge*],
    ..if mit_einheit { ([*Einheit*],) } else { () },
    ..if mit_einzelpreis { ([*Einzelpreis*],) } else { () },
    [*Summe*],
  )

  #let zeile(p) = (
    ..if mit_nummer { (p.nummer,) } else { () },
    p.bezeichnung,
    // Ohne eigene Spalte gehört die Einheit hinter die Menge — sonst stünde dort
    // eine nackte Zahl.
    if mit_einheit { p.menge } else { p.menge + " " + p.einheit },
    ..if mit_einheit { (p.einheit,) } else { () },
    ..if mit_einzelpreis { (p.einzelpreis,) } else { () },
    p.summe,
  )

  // table.header(repeat: true) wiederholt die Kopfzeile auf Folgeseiten — ohne das
  // stünden bei einer langen Rechnung ab Seite 2 namenlose Zahlenspalten.
  //
  // Die Summenzeilen stehen als letzte Zeilen *in* dieser Tabelle, nicht als
  // eigener Absatz danach: Ein außenstehendes `align(right)` richtet sich nach
  // dem Seitenrand, während die Summe-Spalte durch den Zellenabstand der
  // Tabelle ein Stück davor endet — auf den ersten Blick nicht zu sehen, aber
  // genug, damit die Beträge nicht sauber untereinanderstehen, wie man es aus
  // einer Buchhaltungstabelle kennt. Als Tabellenzeile trifft jede Summe exakt
  // dieselbe rechte Kante wie jede Positionssumme darüber.
  // Voll umrandet statt nur der schlanken Linie unter Kopf- und
  // Positionszeilen — wer viele Positionen hat, verliert beim Lesen sonst
  // leicht die Zeile.
  //
  // Bei Regelbesteuerung stehen Nettobetrag und Umsatzsteuer je Steuersatz
  // (§ 14 Abs. 4 Nr. 7–8 UStG) VOR der Gesamtsumme, ohne eigenen Rahmen — nur
  // die abschließende Zeile trägt die Betonung (dickere Linie in der
  // Akzentfarbe, fett), damit sie sich sichtbar von der Aufschlüsselung
  // darüber abhebt, wie auf einem Kassenbon oder in einer Buchhaltungstabelle.
  #let steuerzeilen = json(bytes(sys.inputs.at("steuerzeilen_json", default: "[]")))
  #let gesamt_label = if sys.inputs.titel == "Angebot" { "Gesamt" } else { "Rechnungsbetrag" }

  // Nettobetrag und Steuer nur mit Satzangabe, wenn mehr als ein Satz auf dem
  // Beleg vorkommt — bei nur einem Satz macht "Nettobetrag 19 %" die Zeile
  // eng, ohne mehr zu sagen als "Nettobetrag" allein.
  #let mit_satzangabe = steuerzeilen.len() > 1
  #let summenzeilen = steuerzeilen.map(z => (
    (label: if mit_satzangabe { "Nettobetrag " + z.satz + " %" } else { "Nettobetrag" }, betrag: z.netto),
    (label: "Umsatzsteuer " + z.satz + " %", betrag: z.ust),
  )).flatten()

  #table(
    columns: spalten,
    align: ausrichtung,
    stroke: if mit_gitterlinien {
      0.4pt + rgb("#bbbbbb")
    } else {
      (x, y) => if y == 0 { (bottom: 0.6pt + akzent) } else { (bottom: 0.4pt + rgb("#dddddd")) }
    },
    table.header(..kopfzeile),
    ..positionen.map(zeile).flatten(),
    ..summenzeilen.map(z => (
      table.cell(colspan: spalten.len() - 1, align: right, stroke: none, inset: (y: 2pt))[
        #text(size: 9pt)[#z.label]
      ],
      table.cell(stroke: none, inset: (y: 2pt))[#text(size: 9pt)[#z.betrag]],
    )).flatten(),
    table.cell(
      colspan: spalten.len() - 1,
      align: right,
      stroke: (top: 0.6pt + akzent, bottom: none),
    )[*#gesamt_label*],
    table.cell(stroke: (top: 0.6pt + akzent, bottom: none))[*#sys.inputs.summe*],
  )

  #if ist_gesetzt(sys.inputs.gesamtauftragswert) [
    #v(0.2cm)
    Gesamt-Auftragswert: #sys.inputs.gesamtauftragswert (zzgl. USt)
  ]

  #girocode_block(sys.inputs.girocode_matrix_json)

  #if sys.inputs.kleinunternehmer == "ja" [
    #v(0.3cm)
    Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.
  ]
]

#if not ist_erinnerung and ist_gesetzt(sys.inputs.fusstext) [
  #v(0.5cm)
  #sys.inputs.fusstext
]
