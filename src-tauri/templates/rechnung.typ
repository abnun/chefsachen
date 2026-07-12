#set text(font: "Inter", size: 10pt)
#set page(margin: 2.5cm)

#if sys.inputs.hat_logo != "" [
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

#v(1cm)

= #sys.inputs.titel #sys.inputs.nummer

Datum: #sys.inputs.datum \
Leistungsdatum: #sys.inputs.leistungsdatum \
Zahlungsziel: #sys.inputs.zahlungsziel_tage Tage

#v(0.5cm)

#let positionen = json(bytes(sys.inputs.positionen_json))

#table(
  columns: (1fr, auto, auto, auto),
  align: (left, right, right, right),
  [*Bezeichnung*], [*Menge*], [*Einzelpreis*], [*Summe*],
  ..positionen.map(p => (p.bezeichnung, p.menge, p.einzelpreis, p.summe)).flatten()
)

#align(right)[*Gesamt: #sys.inputs.summe*]

#v(1cm)

#sys.inputs.fusstext
