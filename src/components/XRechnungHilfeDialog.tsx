import { Dialog } from "./Dialog";

interface XRechnungHilfeDialogProps {
  onSchliessen: () => void;
}

/**
 * Erklärt Aufbau und Felder der XRechnung in einfachen Worten, verlinkt von
 * den Formularen, die Käuferreferenz und Leitweg-ID abfragen.
 *
 * Als Blatt statt als eigene Seite: Die Seite stand ohne Seitenleiste über dem
 * ganzen Fenster, der Zurück-Knopf gedrängt neben den Ampelknöpfen. Das Blatt
 * lässt das Formular darunter sichtbar, aus dem man gekommen ist, und hält den
 * Fokus wie jeder Dialog bei sich.
 */
export function XRechnungHilfeDialog({ onSchliessen }: XRechnungHilfeDialogProps) {
  return (
    <Dialog
      titel="Was ist die XRechnung?"
      breit
      onSchliessen={onSchliessen}
      aktionen={
        <button type="button" className="btn btn-primaer" onClick={onSchliessen}>
          Fertig
        </button>
      }
    >
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
    </Dialog>
  );
}
