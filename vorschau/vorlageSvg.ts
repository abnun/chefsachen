/**
 * Ersatz für die Belegvorschau, die sonst der Rust-Teil als SVG zeichnet.
 *
 * Eine schlichte A4-Seite mit den Firmendaten und einem erfundenen Beleg. Sie
 * folgt nur wenigen Schaltern (Akzentfarbe, Gitterlinien, Falzmarken), genug,
 * damit die Einstellungsseite in Screenshots nicht leer aussieht.
 */

import type { Firma } from "../src/api";

function maskieren(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function vorlageSvg(firma: Firma, einstellungen: Map<string, string>): string {
  const akzent = einstellungen.get("vorlage.akzentfarbe") || "#1a1a1a";
  const gitter = einstellungen.get("vorlage.tabelle_gitterlinien") === "ja";
  const falz = einstellungen.get("vorlage.falzmarken") !== "nein";
  const name = maskieren(firma.name || "Ihre Firma");
  const absender = maskieren([firma.name, firma.strasse, `${firma.plz} ${firma.ort}`].filter((t) => t.trim()).join(" · "));

  const zeilen: [string, string, string, string][] = [
    ["1", "Illustration ganzseitig", "3 Stk.", "1.140,00 €"],
    ["2", "Spot-Illustration", "4 Stk.", "480,00 €"],
    ["3", "Gestaltung", "6 Std.", "420,00 €"],
    ["4", "Erweiterte Nutzungsrechte", "1 pausch.", "450,00 €"],
  ];
  let y = 360;
  const tabelle = zeilen
    .map(([pos, bez, menge, summe]) => {
      y += 26;
      const linie = gitter ? `<line x1="70" x2="525" y1="${y + 8}" y2="${y + 8}" stroke="#ccc" stroke-width="0.5"/>` : "";
      return `<text x="70" y="${y}">${pos}</text><text x="95" y="${y}">${bez}</text><text x="380" y="${y}" text-anchor="end">${menge}</text><text x="525" y="${y}" text-anchor="end">${summe}</text>${linie}`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595 842" width="595" height="842" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#1a1a1a">
<rect width="595" height="842" fill="#fff"/>
${falz ? '<line x1="0" x2="14" y1="298" y2="298" stroke="#999" stroke-width="0.5"/><line x1="0" x2="14" y1="421" y2="421" stroke="#999" stroke-width="0.5"/>' : ""}
<text x="525" y="80" text-anchor="end" font-size="15" font-weight="bold" fill="${akzent}">${name}</text>
<text x="70" y="150" font-size="7" fill="#666">${absender}</text>
<text x="70" y="170">Kaffeerösterei Bohnenwerk GmbH</text>
<text x="70" y="184">Paul Wenzel</text>
<text x="70" y="198">Zschochersche Straße 23</text>
<text x="70" y="212">04229 Leipzig</text>
<text x="525" y="170" text-anchor="end">Rechnungsnr. RE-2026-0014</text>
<text x="525" y="184" text-anchor="end">Datum 13.11.2026</text>
<text x="525" y="198" text-anchor="end">Leistungsdatum 10.11.2026</text>
<text x="70" y="290" font-size="16" font-weight="bold" fill="${akzent}">Rechnung</text>
<text x="70" y="320">Sehr geehrte Damen und Herren,</text>
<text x="70" y="334">vielen Dank für die gute Zusammenarbeit. Für meine Leistungen berechne ich:</text>
<line x1="70" x2="525" y1="368" y2="368" stroke="${akzent}" stroke-width="1"/>
<text x="70" y="362" font-weight="bold">Pos.</text><text x="95" y="362" font-weight="bold">Bezeichnung</text><text x="380" y="362" text-anchor="end" font-weight="bold">Menge</text><text x="525" y="362" text-anchor="end" font-weight="bold">Gesamt</text>
${tabelle}
<line x1="330" x2="525" y1="${y + 18}" y2="${y + 18}" stroke="${akzent}" stroke-width="1"/>
<text x="330" y="${y + 36}" font-weight="bold">Gesamtbetrag</text><text x="525" y="${y + 36}" text-anchor="end" font-weight="bold">2.490,00 €</text>
<text x="70" y="${y + 70}">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</text>
<line x1="70" x2="525" y1="770" y2="770" stroke="#ccc" stroke-width="0.5"/>
<text x="70" y="786" font-size="7" fill="#666">${maskieren(firma.email)} · ${maskieren(firma.telefon)}</text>
<text x="70" y="798" font-size="7" fill="#666">IBAN ${maskieren(firma.iban)} · BIC ${maskieren(firma.bic)} · Steuernummer ${maskieren(firma.steuernummer)}</text>
</svg>`;
}
