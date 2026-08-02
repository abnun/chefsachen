pub mod eingangsrechnung_parse;
pub mod export;
pub mod kontext;
/// Nur für Tests: ruft den amtlichen KoSIT-Validator auf. Gehört nicht in den
/// Auslieferungsbau — die App validiert nicht, sie erzeugt.
#[cfg(test)]
pub mod kosit;
/// Nur für Tests: prüft erzeugte PDFs mit veraPDF gegen die PDF/A-Regeln.
#[cfg(test)]
pub mod verapdf;
pub mod pdf;
pub mod xrechnung;
pub mod zugferd;
