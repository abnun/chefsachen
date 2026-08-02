import { useEffect, useState } from "react";
import { api, type AppFehler, type Beleg, type Kunde } from "../api";

/**
 * Zustand und Abläufe einer Belegliste — Abruf, Statusfilter, Anlegen.
 *
 * `Angebote.tsx` und `Rechnungen.tsx` waren zu weiten Teilen dieselbe Datei.
 * Was sie unterscheidet, sind die Spalten der Tabelle und die Beschriftungen;
 * alles davor war doppelt gepflegt — und lief auseinander. Die Angebotsliste
 * zeigte am Ende das ISO-Datum, weil die Umstellung nur in der Rechnungsliste
 * angekommen war.
 *
 * Die Tabellen bleiben bewusst in den Seiten. Eine Rechnung hat Spalten für
 * Zahlungsstand, Fälligkeit und offenen Betrag, ein Angebot nicht; sie über
 * Konfiguration zusammenzuführen brächte mehr Verwicklung als Ersparnis.
 */
export function useBelegListe(typ: "angebot" | "rechnung", onOeffnen: (id: string) => void) {
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  // Eine leere Liste und eine noch ausstehende Antwort sehen sonst gleich aus.
  const [geladen, setGeladen] = useState(false);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [kundeId, setKundeId] = useState("");
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);

  useEffect(() => {
    api.belege
      .list(typ, statusFilter || undefined)
      .then((liste) => {
        setBelege(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler))
      .finally(() => setGeladen(true));
  }, [typ, statusFilter]);

  useEffect(() => {
    // Die Kundenliste dient nur der Namensauflösung in der Tabelle und der
    // Auswahl im Formular. Schlägt sie fehl, bleibt die Belegliste brauchbar.
    api.kunden.list().then(setKunden).catch(() => {});
  }, []);

  async function anlegen() {
    setFormFehler(null);
    const kunde = kunden.find((k) => k.id === kundeId);
    if (!kunde) {
      setFormFehler({ typ: "validation", feld: "kunde_id", meldung: "Bitte einen Kunden wählen" });
      return;
    }
    try {
      const fusstext = (await api.einstellungen.get(`text.${typ}.fuss`)) ?? "";
      const beleg = await api.belege.create({
        typ,
        kunde_id: kundeId,
        datum,
        leistungsdatum: datum,
        zahlungsziel_tage: kunde.zahlungsziel_tage,
        kopftext: "",
        fusstext,
      });
      setZeigeFormular(false);
      onOeffnen(beleg.id);
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  /** Name des Kunden zum Beleg — der festgeschriebene geht dem aktuellen vor. */
  function kundeName(beleg: Beleg): string {
    return beleg.kunde_snapshot_name ?? kunden.find((k) => k.id === beleg.kunde_id)?.name ?? beleg.kunde_id;
  }

  return {
    belege,
    kunden,
    statusFilter,
    setStatusFilter,
    fehler,
    geladen,
    zeigeFormular,
    setZeigeFormular,
    kundeId,
    setKundeId,
    datum,
    setDatum,
    formFehler,
    anlegen,
    kundeName,
  };
}
