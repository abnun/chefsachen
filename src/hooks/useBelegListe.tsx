import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type AppFehler, type Beleg, type Kunde } from "../api";
import { type Richtung } from "../components/SortierKopf";

/**
 * Zustand und Abläufe einer Belegliste — Abruf, Statusfilter, Anlegen.
 *
 * `Angebote.tsx` und `Rechnungen.tsx` waren zu weiten Teilen dieselbe Datei.
 * Was sie unterscheidet, sind die Spalten der Tabelle und die Beschriftungen;
 * alles davor war doppelt gepflegt — und lief auseinander. Die Angebotsliste
 * zeigte am Ende das ISO-Datum, weil die Umstellung nur in der Rechnungsliste
 * angekommen war.
 *
 * Sortiert und geblättert wird im Speicher, gesucht dagegen im Backend. Der
 * Grund ist der Kundenname: Er steht in einer anderen Tabelle und ist bei
 * gestellten Belegen eingefroren — danach zu suchen, ohne alle Kunden zu laden,
 * geht nur in SQL. Sortierung und Blättern brauchen dagegen keinen Rundweg;
 * die Liste ist ohnehin vollständig da. Bei einem Kleinunternehmer geht es um
 * einige hundert Belege im Jahr. Sollte das je zu viel werden, ist die Grenze
 * spürbar (langsamer Abruf) und die Umstellung auf LIMIT/OFFSET überschaubar.
 *
 * Die Tabellen bleiben bewusst in den Seiten. Eine Rechnung hat Spalten für
 * Zahlungsstand, Fälligkeit und offenen Betrag, ein Angebot nicht; sie über
 * Konfiguration zusammenzuführen brächte mehr Verwicklung als Ersparnis.
 */
export function useBelegListe(typ: "angebot" | "rechnung", onOeffnen: (id: string) => void) {
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [suche, setSuche] = useState("");
  const [sortierung, setSortierung] = useState<{ spalte: string; richtung: Richtung }>({
    spalte: "datum",
    richtung: "ab",
  });
  const [seite, setSeite] = useState(1);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  // Eine leere Liste und eine noch ausstehende Antwort sehen sonst gleich aus.
  const [geladen, setGeladen] = useState(false);
  const [zeigeFormular, setZeigeFormular] = useState(false);
  const [kundeId, setKundeId] = useState("");
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10));
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);

  useEffect(() => {
    // Verzögert abfragen, sonst löst jeder Tastendruck einen Abruf aus.
    const zeitgeber = setTimeout(() => {
      api.belege
        .list(typ, statusFilter || undefined, suche || undefined)
        .then((liste) => {
          setBelege(liste);
          setFehler(null);
        })
        .catch((e) => setFehler(e as AppFehler))
        .finally(() => setGeladen(true));
    }, suche ? 300 : 0);
    return () => clearTimeout(zeitgeber);
  }, [typ, statusFilter, suche]);

  // Ein Filterwechsel kann die Trefferzahl verkleinern; Seite 7 gäbe es dann
  // nicht mehr und die Tabelle bliebe leer, ohne dass ersichtlich wäre warum.
  useEffect(() => {
    setSeite(1);
  }, [typ, statusFilter, suche, sortierung]);

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

  /**
   * Name des Kunden zum Beleg — der festgeschriebene geht dem aktuellen vor.
   *
   * In `useCallback` gefasst, weil die Sortierung ihn benutzt: Als gewöhnliche
   * Funktion entstünde sie bei jedem Rendern neu, und das Memo müsste bei jedem
   * Rendern neu sortieren — oder es führte sie gar nicht als Abhängigkeit und
   * arbeitete irgendwann mit veralteten Namen.
   */
  const kundeName = useCallback(
    (beleg: Beleg): string =>
      beleg.kunde_snapshot_name ?? kunden.find((k) => k.id === beleg.kunde_id)?.name ?? beleg.kunde_id,
    [kunden],
  );

  /** Klick auf einen Spaltenkopf: gleiche Spalte kehrt um, neue beginnt aufsteigend. */
  function sortieren(spalte: string) {
    setSortierung((vorher) =>
      vorher.spalte === spalte
        ? { spalte, richtung: vorher.richtung === "auf" ? "ab" : "auf" }
        : { spalte, richtung: "auf" },
    );
  }

  const sortiert = useMemo(() => {
    const wert = (b: Beleg): string | number => {
      switch (sortierung.spalte) {
        // Entwürfe haben noch keine Nummer. Sie ans Ende zu stellen ist
        // sinnvoller, als sie unter den leeren Zeichenketten zu vergraben.
        case "nummer":
          return b.nummer ?? "\uffff";
        case "kunde":
          return kundeName(b).toLowerCase();
        case "status":
          return b.status;
        case "summe":
          return b.summe_cent;
        case "faellig":
          return b.faellig_am ?? "\uffff";
        case "offen":
          return b.summe_cent - (b.bezahlt_cent ?? 0);
        default:
          return b.datum;
      }
    };
    const richtung = sortierung.richtung === "auf" ? 1 : -1;
    // Kopie: sort() arbeitet auf der Vorlage und würde den Zustand verändern.
    return [...belege].sort((a, b) => {
      const x = wert(a);
      const y = wert(b);
      if (x === y) return 0;
      return (x < y ? -1 : 1) * richtung;
    });
  }, [belege, sortierung, kundeName]);

  const SEITENGROESSE = 25;
  const seitenAnzahl = Math.max(1, Math.ceil(sortiert.length / SEITENGROESSE));
  const sichtbar = sortiert.slice((seite - 1) * SEITENGROESSE, seite * SEITENGROESSE);

  return {
    /** Die Belege der aktuellen Seite, sortiert. */
    belege: sichtbar,
    /** Alle Treffer, unabhängig von der Seite. */
    trefferAnzahl: sortiert.length,
    suche,
    setSuche,
    sortierung,
    sortieren,
    seite,
    setSeite,
    seitenAnzahl,
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
