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

#v(1cm)

#sys.inputs.kunde_name \
#sys.inputs.kunde_strasse \
#sys.inputs.kunde_plz #sys.inputs.kunde_ort
#if ist_gesetzt(sys.inputs.kunde_land) [
  \ #sys.inputs.kunde_land
]

#v(1cm)

= #sys.inputs.titel #sys.inputs.nummer

Datum: #sys.inputs.datum \
Leistungsdatum: #sys.inputs.leistungsdatum \
Zahlungsziel: #sys.inputs.zahlungsziel_tage Tage

#if ist_gesetzt(sys.inputs.kopftext) [
  #v(0.5cm)
  #sys.inputs.kopftext
]

#v(0.5cm)

#let positionen = json(bytes(sys.inputs.positionen_json))

// table.header(repeat: true) wiederholt die Kopfzeile auf Folgeseiten — ohne das
// stünden bei einer langen Rechnung ab Seite 2 namenlose Zahlenspalten.
#table(
  columns: (1fr, auto, auto, auto),
  align: (left, right, right, right),
  table.header(
    [*Bezeichnung*], [*Menge*], [*Einzelpreis*], [*Summe*],
  ),
  ..positionen.map(p => (p.bezeichnung, p.menge, p.einzelpreis, p.summe)).flatten()
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
