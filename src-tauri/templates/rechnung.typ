#set text(font: "Inter", size: 10pt)

#let ist_gesetzt(wert) = wert != none and wert != ""
#let ja(wert) = wert == "ja"

// Einstellbares aus `dokument::vorlage`. Die Vorgaben dort bilden das
// ursprüngliche Aussehen ab; hier steht nur, wie die Werte wirken.
#let mass(name) = float(name) * 1mm
#let rand_oben = mass(sys.inputs.v_rand_oben_mm)
#let rand_unten = mass(sys.inputs.v_rand_unten_mm)
#let rand_seitlich = mass(sys.inputs.v_rand_seitlich_mm)
#let akzent = rgb(sys.inputs.v_akzentfarbe)

// Fußzeile mit Seitenzahl: Bei einer mehrseitigen Rechnung muss der Empfänger
// erkennen können, ob das Dokument vollständig ist. Sie erscheint erst ab
// Seite 2 — auf einer einseitigen Rechnung wäre "Seite 1 von 1" nur Ballast.
#set page(
  margin: (top: rand_oben, bottom: rand_unten, x: rand_seitlich),
  footer: context {
    let seiten = counter(page).final().first()
    if seiten > 1 {
      align(center, text(size: 8pt, fill: rgb("#666666"))[
        #sys.inputs.titel #sys.inputs.nummer — Seite #counter(page).display() von #seiten
      ])
    }
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

= #sys.inputs.titel #sys.inputs.nummer

Datum: #sys.inputs.datum

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
] else [
  \ #sys.inputs.leistung_beschriftung: #sys.inputs.leistungsdatum
  #if ist_gesetzt(sys.inputs.zahlungsbedingung) [
    \ #sys.inputs.zahlungsbedingung
  ]
  // Umgekehrt: eine Gültigkeit ist eine Angebotssache. Der Fußtext versprach
  // bisher eine Frist, ohne dass ein Datum dazu auf dem Beleg stand.
  #if ist_gesetzt(sys.inputs.angebot_gueltig_bis) [
    \ Gültig bis: #sys.inputs.angebot_gueltig_bis
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
  // Die Gesamtsumme steht als letzte Zeile *in* dieser Tabelle, nicht als
  // eigener Absatz danach: Ein außenstehendes `align(right)` richtet sich nach
  // dem Seitenrand, während die Summe-Spalte durch den Zellenabstand der
  // Tabelle ein Stück davor endet — auf den ersten Blick nicht zu sehen, aber
  // genug, damit die Beträge nicht sauber untereinanderstehen, wie man es aus
  // einer Buchhaltungstabelle kennt. Als Tabellenzeile trifft die Summe exakt
  // dieselbe rechte Kante wie jede Positionssumme darüber.
  // Voll umrandet statt nur der schlanken Linie unter Kopf- und
  // Positionszeilen — wer viele Positionen hat, verliert beim Lesen sonst
  // leicht die Zeile. Die Gesamtsumme darunter behält ihre eigene Betonung
  // (dickere Linie in der Akzentfarbe) in beiden Varianten.
  // Steueraufschlüsselung (§ 14 Abs. 4 Nr. 7–8 UStG) bei Regelbesteuerung:
  // eine Zeile je Steuersatz, *in* der Tabelle — aus demselben Grund wie die
  // Gesamtsumme: nur so treffen die Beträge exakt deren rechte Kante.
  #let steuerzeilen = json(bytes(sys.inputs.at("steuerzeilen_json", default: "[]")))
  #let steuerzelle(inhalt) = table.cell(stroke: none, inset: (y: 2pt))[#text(size: 9pt)[#inhalt]]

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
    table.cell(
      colspan: spalten.len() - 1,
      align: right,
      stroke: (top: 0.6pt + akzent, bottom: none),
    )[*Gesamt:*],
    table.cell(stroke: (top: 0.6pt + akzent, bottom: none))[*#sys.inputs.summe*],
    ..steuerzeilen.map(z => (
      table.cell(colspan: spalten.len() - 1, align: right, stroke: none, inset: (y: 2pt))[
        #text(size: 9pt)[Enthaltene USt #z.satz % (aus Nettobetrag #z.netto):]
      ],
      steuerzelle(z.ust),
    )).flatten(),
  )

  #if sys.inputs.kleinunternehmer == "ja" [
    #v(0.3cm)
    Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.
  ]
]

// Bankverbindung: gesetzlich nicht vorgeschrieben, aber ohne sie kann der
// Empfänger nicht zahlen — bei einer Erinnerung erst recht wichtig.
#let bankverbindung = if ist_gesetzt(sys.inputs.firma_iban) [
  #v(0.5cm)
  #text(size: 9pt)[
    *Bankverbindung* \
    IBAN: #sys.inputs.firma_iban
    #if ist_gesetzt(sys.inputs.firma_bic) [
      \ BIC: #sys.inputs.firma_bic
    ]
  ]
] else { none }

#if sys.inputs.v_bankverbindung == "nach_summe" and bankverbindung != none [
  #bankverbindung
]

#if not ist_erinnerung and ist_gesetzt(sys.inputs.fusstext) [
  #v(0.5cm)
  #sys.inputs.fusstext
]

#if sys.inputs.v_bankverbindung != "nach_summe" and bankverbindung != none [
  #bankverbindung
]

// Kontaktangaben: gesetzlich nicht vorgeschrieben, anders als die
// Steuernummer/USt-IdNr. unten — nur was gepflegt ist, erscheint auch.
// Absichtlich nicht im Kopf neben Logo und Anschrift: Der bleibt bewusst
// knapp, wie ein DIN-5008-Briefkopf es vorsieht.
#let kontaktzeilen = (
  if ist_gesetzt(sys.inputs.firma_telefon) { "Telefon: " + sys.inputs.firma_telefon },
  if ist_gesetzt(sys.inputs.firma_fax) { "Fax: " + sys.inputs.firma_fax },
  if ist_gesetzt(sys.inputs.firma_email) { "E-Mail: " + sys.inputs.firma_email },
).filter(z => z != none)

#if kontaktzeilen.len() > 0 [
  #v(0.3cm)
  #text(size: 9pt)[#kontaktzeilen.join(" · ")]
]

// Pflichtangabe nach § 14 Abs. 4 Nr. 2 UStG: Steuernummer oder USt-IdNr. des
// Ausstellers. Ohne sie ist die Rechnung formell fehlerhaft und der Empfänger
// kann sie zurückweisen.
#v(0.5cm)
#text(size: 9pt)[
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
