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
import { Suchfeld } from "../components/Suchfeld";
import { ERSTATTUNG_LABEL, RECHNUNG_STATUS, statusAuswahl } from "../belegStatus";
import { datumDeutsch, heuteIso } from "../datum";
import { formatCent } from "../geld";
import { useBelegListe } from "../hooks/useBelegListe";
import { useListenTastenkuerzel } from "../hooks/useListenTastenkuerzel";
import { type FuehrungsSchritt } from "../components/Fuehrung";
import { type Zahlungsstand } from "../api";

/**
 * Statisch außerhalb der Komponente, wie auf der Übersicht: Ein je Rendern
 * neues Array ließe den Positionierungs-Effekt der Führung durchdrehen.
 */
const RUNDGANG_SCHRITTE: FuehrungsSchritt[] = [
  {
    ziel: "[data-tour='titel']",
    titel: "Rechnungen",
    text: "Vom Entwurf über das Stellen (feste Nummer, unveränderbar) bis zur Zahlung. Korrekturen an einer gestellten Rechnung gehen nur noch per Storno — so verlangt es die GoBD.",
  },
  {
    ziel: "[data-tour='suche']",
    titel: "Suche",
    text: "Findet Rechnungen nach Nummer oder Kundenname — auch nach dem beim Stellen eingefrorenen Namen. ⌘F (Strg+F) springt hierher.",
  },
  {
    ziel: "[data-tour='status']",
    titel: "Statusfilter",
    text: "Entwurf, gestellt oder storniert. Wer offene Posten sucht, ist auf der Übersicht schneller — dort stehen sie mit Fälligkeit gesammelt.",
  },
  {
    ziel: "[data-tour='neu']",
    titel: "Neue Rechnung",
    text: "Kunde und Datum wählen, dann öffnet sich der Entwurf — auch per ⌘N (Strg+N). Aus einem angenommenen Angebot entsteht eine Rechnung übrigens direkt im Angebot selbst.",
  },
  {
    ziel: "[data-tour='tabelle']",
    titel: "Die Rechnungsliste",
    text: "Neben Status und Summe stehen hier Zahlungsstand, Fälligkeit (überfällig rot) und der noch offene Betrag. Ein Klick auf eine Zeile öffnet die Rechnung samt Zahlungserfassung.",
  },
];

interface RechnungenProps {
  onOeffnen: (id: string) => void;
}

const ZAHLUNGSSTAND_LABEL: Record<Zahlungsstand, string> = {
  offen: "Offen",
  teilbezahlt: "Teilbezahlt",
  bezahlt: "Bezahlt",
  ueberzahlt: "Überzahlt",
};

/**
 * Bezahlt ist der Normalfall und bleibt leise; Farbe trägt nur, was noch
 * etwas verlangt: Offenes in Blau, eine Überzahlung (Geld muss zurück) in
 * Bernstein. Zwölf grüne Marken untereinander sagten nichts, außer dass die
 * Tabelle bunt ist.
 */
const ZAHLUNGSSTAND_KLASSE: Record<Zahlungsstand, string> = {
  offen: "status-gestellt",
  teilbezahlt: "status-gestellt",
  bezahlt: "status-leise",
  ueberzahlt: "status-warnung",
};

/**
 * Fälligkeit als Text, überfällige Rechnungen als solche gekennzeichnet.
 * Der Vergleich läuft über die ISO-Schreibweise, die sich lexikografisch
 * sortieren lässt — eine Zeitzonenumrechnung wäre hier nur Fehlerquelle.
 */
function faelligkeit(faellig_am: string | null | undefined, stand: Zahlungsstand | null | undefined) {
  if (!faellig_am) return { text: "—", ueberfaellig: false };
  const heute = heuteIso();
  const offen = stand === "offen" || stand === "teilbezahlt";
  return { text: datumDeutsch(faellig_am), ueberfaellig: offen && faellig_am < heute };
}

export function Rechnungen({ onOeffnen }: RechnungenProps) {
  const liste = useBelegListe("rechnung", onOeffnen);
  /** Der Hinweis für den leeren Anfang lässt sich wegklicken. */
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const sucheRef = useRef<HTMLInputElement>(null);

  useListenTastenkuerzel({
    neu: () => liste.setZeigeFormular(true),
    sucheFokussieren: () => sucheRef.current?.focus(),
  });

  return (
    <div>
      <Werkzeugleiste
        titel="Rechnungen"
        rundgang={RUNDGANG_SCHRITTE}
        filter={
          <>
            <Suchfeld
              ref={sucheRef}
              wert={liste.suche}
              onAendern={liste.setSuche}
              platzhalter="Nummer oder Kunde"
              dataTour="suche"
            />
            <select
              aria-label="Status"
              data-tour="status"
              value={liste.statusFilter}
              onChange={(e) => liste.setStatusFilter(e.currentTarget.value)}
            >
              <option value="">Alle Status</option>
              {statusAuswahl(RECHNUNG_STATUS).map(([wert, label]) => (
                <option key={wert} value={wert}>
                  {label}
                </option>
              ))}
            </select>
          </>
        }
        aktion={
          !liste.zeigeFormular && (
            <button
              type="button"
              className="btn btn-primaer"
              data-tour="neu"
              onClick={() => liste.setZeigeFormular(true)}
            >
              Neue Rechnung
            </button>
          )
        }
      />
      {liste.fehler && <Fehler fehler={liste.fehler} />}

      {/* Solange das Anlage-Formular offen ist, bleibt die Liste komplett
          ausgeblendet — sonst wirkte sie wie ein Teil der neuen Rechnung. */}
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
          {!liste.geladen && <Laden was="Rechnungen" />}

          {liste.geladen && liste.belege.length === 0 &&
            !liste.suche && !liste.statusFilter && !leerHinweisVersteckt && (
              <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
                Noch keine Rechnungen — leg oben eine an.
              </Hinweis>
            )}

          {liste.geladen && liste.belege.length === 0 && (liste.suche || liste.statusFilter) && (
            <p>
              {liste.suche
                ? `Keine Rechnungen gefunden für „${liste.suche}".`
                : "Keine Rechnungen mit diesem Status."}
            </p>
          )}

          <table className="tabelle tabelle-klickbar" data-tour="tabelle">
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
                <th>Zahlung</th>
                <SortierKopf
                  spalte="faellig"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Fällig
                </SortierKopf>
                <SortierKopf
                  spalte="summe"
                  className="zahl"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Summe
                </SortierKopf>
                <SortierKopf
                  spalte="offen"
                  className="zahl"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Offen
                </SortierKopf>
              </tr>
            </thead>
            <tbody>
              {liste.belege.map((r) => (
                <tr key={r.id} onClick={() => onOeffnen(r.id)}>
                  <td className="tabelle-num nicht-umbrechen">
                    <ZeilenKnopf onOeffnen={() => onOeffnen(r.id)}>{r.nummer ?? "Entwurf"}</ZeilenKnopf>
                  </td>
                  <td>{liste.kundeName(r)}</td>
                  <td className="nicht-umbrechen">{datumDeutsch(r.datum)}</td>
                  <td>
                    <StatusMarke status={r.status} />
                    {r.storno_von_id && <span className="marke">Storno</span>}
                  </td>
                  <td>
                    {r.zahlungsstand ? (
                      <span className={`status ${ZAHLUNGSSTAND_KLASSE[r.zahlungsstand]}`}>
                        {(r.storno_von_id ? ERSTATTUNG_LABEL : ZAHLUNGSSTAND_LABEL)[r.zahlungsstand]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {(() => {
                    const f = faelligkeit(r.faellig_am, r.zahlungsstand);
                    return (
                      <td className={`nicht-umbrechen ${f.ueberfaellig ? "ueberfaellig" : ""}`}>{f.text}</td>
                    );
                  })()}
                  <td className="zahl nicht-umbrechen">{formatCent(r.summe_cent)}</td>
                  <td className="zahl nicht-umbrechen">
                    {r.zahlungsstand && r.zahlungsstand !== "bezahlt"
                      ? formatCent(r.summe_cent - (r.bezahlt_cent ?? 0))
                      : "—"}
                  </td>
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
