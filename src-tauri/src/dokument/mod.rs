pub mod eingangsrechnung_parse;
pub mod export;
pub mod kontext;
/// Nur für Tests: ruft den amtlichen KoSIT-Validator auf. Gehört nicht in den
/// Auslieferungsbau — die App validiert nicht, sie erzeugt.
#[cfg(test)]
pub mod kosit;
pub mod pdf;
pub mod xrechnung;
pub mod zugferd;
