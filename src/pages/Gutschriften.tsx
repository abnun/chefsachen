import { useRef, useState } from "react";
import { BelegAnlegen } from "../components/BelegAnlegen";
import { Fehler } from "../components/Fehler";
import { ZeilenKnopf } from "../components/ZeilenKnopf";
import { Blaettern } from "../components/Blaettern";
import { Hinweis } from "../components/Hinweis";
import { Laden } from "../components/Laden";
import { SortierKopf } from "../components/SortierKopf";
import { StatusMarke } from "../components/StatusMarke";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { GUTSCHRIFT_STATUS, statusAuswahl } from "../belegStatus";
import { datumDeutsch } from "../datum";
import { formatCent } from "../geld";
import { useBelegListe } from "../hooks/useBelegListe";
import { useListenTastenkuerzel } from "../hooks/useListenTastenkuerzel";
import { type Zahlungsstand } from "../api";

interface GutschriftenProps {
  onOeffnen: (id: string) => void;
}

/**
 * Bei einer Gutschrift fließt Geld zurück, nicht hin. „Offen" hieße dort
 * fälschlich, der Kunde schulde etwas — tatsächlich steht eine Erstattung aus.
 */
const ERSTATTUNG_LABEL: Record<Zahlungsstand, string> = {
  offen: "Erstattung offen",
  teilbezahlt: "Teilerstattet",
  bezahlt: "Erstattet",
  ueberzahlt: "Übererstattet",
};

export function Gutschriften({ onOeffnen }: GutschriftenProps) {
  const liste = useBelegListe("gutschrift", onOeffnen);
  /** Der Hinweis für den leeren Anfang lässt sich wegklicken. */
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const sucheRef = useRef<HTMLInputElement>(null);

  useListenTastenkuerzel({
    neu: () => liste.setZeigeFormular(true),
    sucheFokussieren: () => sucheRef.current?.focus(),
  });

  return (
    <div>
      <h1 data-tour="titel">Gutschriften</h1>
      {liste.fehler && <Fehler fehler={liste.fehler} />}
      <Werkzeugleiste
        filter={
          <>
            <label className="feld">
              Suche
              <input
                ref={sucheRef}
                type="search"
                value={liste.suche}
                onChange={(e) => liste.setSuche(e.currentTarget.value)}
                placeholder="Nummer oder Kunde"
              />
            </label>
            <label className="feld">
              Status
              <select
                value={liste.statusFilter}
                onChange={(e) => liste.setStatusFilter(e.currentTarget.value)}
              >
                <option value="">Alle</option>
                {statusAuswahl(GUTSCHRIFT_STATUS).map(([wert, label]) => (
                  <option key={wert} value={wert}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        aktion={
          !liste.zeigeFormular && (
            <button
              type="button"
              className="btn btn-primaer"
              onClick={() => liste.setZeigeFormular(true)}
            >
              Neue Gutschrift
            </button>
          )
        }
      />

      {/* Solange das Anlage-Formular offen ist, bleibt die Liste ausgeblendet —
          sonst wirkte sie wie ein Teil der neuen Gutschrift. */}
      {liste.zeigeFormular ? (
        <BelegAnlegen
          kunden={liste.kunden}
          kundeId={liste.kundeId}
          onKundeId={liste.setKundeId}
          datum={liste.datum}
          onDatum={liste.setDatum}
          fehler={liste.formFehler}
          onAnlegen={liste.anlegen}
        />
      ) : (
        <>
          {!liste.geladen && <Laden was="Gutschriften" />}

          {liste.geladen && liste.belege.length === 0 &&
            !liste.suche && !liste.statusFilter && !leerHinweisVersteckt && (
              <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
                Noch keine Gutschriften — leg oben eine an oder erstelle eine aus einer Rechnung.
              </Hinweis>
            )}

          {liste.geladen && liste.belege.length === 0 && (liste.suche || liste.statusFilter) && (
            <p>
              {liste.suche
                ? `Keine Gutschriften gefunden für „${liste.suche}".`
                : "Keine Gutschriften mit diesem Status."}
            </p>
          )}

          <table className="tabelle tabelle-klickbar">
            <thead>
              <tr>
                <SortierKopf
                  spalte="nummer"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Nummer
                </SortierKopf>
                <SortierKopf
                  spalte="kunde"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Kunde
                </SortierKopf>
                <SortierKopf
                  spalte="datum"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Datum
                </SortierKopf>
                <SortierKopf
                  spalte="status"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Status
                </SortierKopf>
                <th>Erstattung</th>
                <SortierKopf
                  spalte="summe"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Betrag
                </SortierKopf>
              </tr>
            </thead>
            <tbody>
              {liste.belege.map((g) => (
                <tr key={g.id} onClick={() => onOeffnen(g.id)}>
                  <td className="tabelle-num nicht-umbrechen">
                    <ZeilenKnopf onOeffnen={() => onOeffnen(g.id)}>{g.nummer ?? "Entwurf"}</ZeilenKnopf>
                  </td>
                  <td>{liste.kundeName(g)}</td>
                  <td className="nicht-umbrechen">{datumDeutsch(g.datum)}</td>
                  <td>
                    <StatusMarke status={g.status} />
                    {g.gutschrift_zu_id && <span className="marke">mit Bezug</span>}
                  </td>
                  <td>{g.zahlungsstand ? ERSTATTUNG_LABEL[g.zahlungsstand] : "—"}</td>
                  <td className="nicht-umbrechen">{formatCent(g.summe_cent)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Blaettern
            seite={liste.seite}
            seitenAnzahl={liste.seitenAnzahl}
            gesamt={liste.trefferAnzahl}
            onSeite={liste.setSeite}
          />
        </>
      )}
    </div>
  );
}
