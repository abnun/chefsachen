interface XRechnungHilfeSeiteProps {
  onZurueck: () => void;
}

/**
 * Erklärt Aufbau und Felder der XRechnung in einfachen Worten — verlinkt von
 * den Formularen, die Käuferreferenz und Leitweg-ID abfragen. Eigene Seite
 * statt Tooltip oder Dialog, weil der Text dafür zu lang ist.
 */
export function XRechnungHilfeSeite({ onZurueck }: XRechnungHilfeSeiteProps) {
  return (
    <div className="app-layout">
      <main className="app-main">
        <button type="button" className="btn btn-leise" onClick={onZurueck}>
          ← Zurück
        </button>
        <div className="karte">
          <h1 className="seiten-kopf">Was ist die XRechnung?</h1>
          <p>
            Die XRechnung ist das amtliche Format für elektronische Rechnungen in
            Deutschland. Seit 2025 müssen auch Kleinunternehmer Rechnungen an andere
            Unternehmen (B2B) als E-Rechnung ausstellen können — ein PDF allein reicht
            dafür nicht mehr aus. Chefsachen erzeugt die XRechnung automatisch aus
            denselben Angaben wie die normale PDF-Rechnung.
          </p>
          <p>
            Ein paar zusätzliche Felder verlangt der Standard, die auf einer normalen
            Rechnung sonst nicht nötig wären:
          </p>
          <dl className="xrechnung-hilfe-liste">
            <dt>Käuferreferenz</dt>
            <dd>
              Eine Kennung, die dein Kunde für seine eigene Buchhaltung verlangt — oft
              eine Bestellnummer oder ein Aktenzeichen. Frag im Zweifel beim Kunden nach.
            </dd>
            <dt>Leitweg-ID</dt>
            <dd>
              Nur bei Rechnungen an Behörden nötig. Die Behörde gibt sie dir vor, meist
              auf der Bestellung oder dem Auftrag vermerkt. Leitweg-ID oder
              Käuferreferenz reicht aus — nicht beide.
            </dd>
            <dt>E-Mail und Telefon der eigenen Firma</dt>
            <dd>Der Standard verlangt einen erreichbaren Kontakt beim Rechnungssteller.</dd>
            <dt>Steuernummer oder USt-IdNr.</dt>
            <dd>Mindestens eine der beiden muss hinterlegt sein.</dd>
          </dl>
        </div>
      </main>
    </div>
  );
}
