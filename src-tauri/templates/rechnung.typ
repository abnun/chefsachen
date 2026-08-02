#set text(font: "Inter", size: 10pt)

#let ist_gesetzt(wert) = wert != none and wert != ""

// Fußzeile mit Seitenzahl: Bei einer mehrseitigen Rechnung muss der Empfänger
// erkennen können, ob das Dokument vollständig ist. Sie erscheint erst ab
// Seite 2 — auf einer einseitigen Rechnung wäre "Seite 1 von 1" nur Ballast.
#set page(
  margin: 2.5cm,
  footer: context {
    let seiten = counter(page).final().first()
    if seiten > 1 {
      align(center, text(size: 8pt, fill: rgb("#666666"))[
        #sys.inputs.titel #sys.inputs.nummer — Seite #counter(page).display() von #seiten
      ])
    }
  },
)

#if ist_gesetzt(sys.inputs.hat_logo) [
  #image(sys.inputs.hat_logo, width: 3cm)
]

#align(right)[
  #sys.inputs.firma_name \
  #sys.inputs.firma_strasse \
  #sys.inputs.firma_plz #sys.inputs.firma_ort
]

// Anschriftfeld nach DIN 5008 Form A: 20 mm von links, 45 mm von oben,
// 85 mm breit. Nur an dieser Stelle steht die Anschrift im Sichtfenster eines
// gewöhnlichen Umschlags (DIN lang, C6/5). Lag sie im Fluss des Dokuments,
// verschob sie ein Logo oder eine längere Firmenanschrift so weit, dass die
// Rechnung von Hand kuvertiert werden musste.
//
// `place` nimmt die Angaben relativ zum Seitenrand (hier 2,5 cm), deshalb die
// Differenz zu den Maßen der Norm.
#place(
  top + left,
  dx: 2cm - 2.5cm,
  dy: 4.5cm - 2.5cm,
  block(width: 8.5cm)[
    // Rücksendeangabe: kleingedruckt über der Anschrift, wie in der Norm
    // vorgesehen. Sie steht ebenfalls im Fenster und weist den Absender aus,
    // falls die Sendung nicht zustellbar ist.
    #text(size: 7pt)[
      #sys.inputs.firma_name · #sys.inputs.firma_strasse · #sys.inputs.firma_plz #sys.inputs.firma_ort
    ]
    #v(0.4cm)
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
#v(8.5cm - 2.5cm)

= #sys.inputs.titel #sys.inputs.nummer

Datum: #sys.inputs.datum \
#sys.inputs.leistung_beschriftung: #sys.inputs.leistungsdatum
#if ist_gesetzt(sys.inputs.faellig_am) [
  \ Zahlbar bis #sys.inputs.faellig_am (#sys.inputs.zahlungsziel_tage Tage)
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

// table.header(repeat: true) wiederholt die Kopfzeile auf Folgeseiten — ohne das
// stünden bei einer langen Rechnung ab Seite 2 namenlose Zahlenspalten.
#table(
  columns: (auto, 1fr, auto, auto, auto),
  align: (right, left, right, right, right),
  table.header(
    [*Pos.*], [*Bezeichnung*], [*Menge*], [*Einzelpreis*], [*Summe*],
  ),
  ..positionen.map(p => (p.nummer, p.bezeichnung, p.menge, p.einzelpreis, p.summe)).flatten()
)

#align(right)[*Gesamt: #sys.inputs.summe*]

#if sys.inputs.kleinunternehmer == "ja" [
  #v(0.3cm)
  Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.
]

#if ist_gesetzt(sys.inputs.fusstext) [
  #v(0.5cm)
  #sys.inputs.fusstext
]

// Bankverbindung: gesetzlich nicht vorgeschrieben, aber ohne sie kann der
// Empfänger die Rechnung nicht bezahlen.
#if ist_gesetzt(sys.inputs.firma_iban) [
  #v(0.5cm)
  #text(size: 9pt)[
    *Bankverbindung* \
    IBAN: #sys.inputs.firma_iban
    #if ist_gesetzt(sys.inputs.firma_bic) [
      \ BIC: #sys.inputs.firma_bic
    ]
  ]
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
