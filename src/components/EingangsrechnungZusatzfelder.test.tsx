import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EingangsrechnungZusatzfelder } from "./EingangsrechnungZusatzfelder";

afterEach(cleanup);

const LEERE_FELDER = {
  kaeufer_name: "", kaeufer_strasse: "", kaeufer_plz: "", kaeufer_ort: "", kaeufer_land: "",
  verkaeufer_strasse: "", verkaeufer_plz: "", verkaeufer_ort: "", verkaeufer_land: "",
  verkaeufer_steuernummer: "", verkaeufer_email: "",
  zahlungsbedingungen: "", faelligkeitsdatum: "", iban: "", bic: "", bankname: "",
  bestellnummer: "", leitweg_id: "", lieferantennummer: "", leistungsdatum: "",
  waehrung: "EUR", steuerzeilen: [],
};

describe("EingangsrechnungZusatzfelder", () => {
  it("zeigt nichts an, wenn alle Felder leer sind", () => {
    const { container } = render(<EingangsrechnungZusatzfelder {...LEERE_FELDER} />);
    expect(container.textContent).toBe("");
  });

  it("zeigt befüllte Felder gruppiert an und blendet leere Gruppen aus", () => {
    render(<EingangsrechnungZusatzfelder {...LEERE_FELDER}
      verkaeufer_strasse="Weg 1" verkaeufer_plz="10115" verkaeufer_ort="Berlin" verkaeufer_land="DE"
      verkaeufer_steuernummer="DE123456789" verkaeufer_email="info@lieferant.de"
      iban="DE00 1234 5678" bic="ABCDDEFF"
    />);
    expect(screen.getByText("DE123456789")).toBeTruthy();
    expect(screen.getByText("info@lieferant.de")).toBeTruthy();
    // Exakter String statt Regex: eine Regex würde sowohl den <span> als auch das
    // umschließende <p> ("IBAN: DE00 1234 5678") als Treffer werten und
    // "multiple elements found" auslösen — exact-Matching trifft nur den <span>.
    expect(screen.getByText("DE00 1234 5678")).toBeTruthy();
    // Gruppe "Referenzen" (Bestellnummer/Leitweg-ID) ist komplett leer -> Überschrift fehlt.
    expect(screen.queryByText("Referenzen")).toBeNull();
  });

  it("zeigt eine Tabelle mit einer Zeile je Steuersatz", () => {
    render(<EingangsrechnungZusatzfelder {...LEERE_FELDER}
      steuerzeilen={[
        { nettobetrag_cent: 10000, steuersatz_promille: 190, steuerbetrag_cent: 1900 },
        { nettobetrag_cent: 5000, steuersatz_promille: 70, steuerbetrag_cent: 350 },
      ]}
    />);
    expect(screen.getByText("100,00 €")).toBeTruthy();
    expect(screen.getByText("19,0 %")).toBeTruthy();
    expect(screen.getByText("19,00 €")).toBeTruthy();
    expect(screen.getByText("7,0 %")).toBeTruthy();
  });
});
