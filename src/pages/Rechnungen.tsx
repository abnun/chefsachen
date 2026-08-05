import { useRef } from "react";
import { BelegAnlegen } from "../components/BelegAnlegen";
import { Fehler } from "../components/Fehler";
import { ZeilenKnopf } from "../components/ZeilenKnopf";
import { Blaettern } from "../components/Blaettern";
import { Laden } from "../components/Laden";
import { SortierKopf } from "../components/SortierKopf";
import { StatusMarke } from "../components/StatusMarke";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { RECHNUNG_STATUS, statusAuswahl } from "../belegStatus";
import { datumDeutsch, heuteIso } from "../datum";
import { formatCent } from "../geld";
import { useBelegListe } from "../hooks/useBelegListe";
import { useListenTastenkuerzel } from "../hooks/useListenTastenkuerzel";
import { type FuehrungsSchritt } from "../components/Fuehrung";
import { SeitenkopfMitRundgang } from "../components/SeitenkopfMitRundgang";
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
 * Bei einem Stornobeleg fließt Geld zurück, nicht hin. „Offen" hieße dort
 * fälschlich, der Kunde schulde etwas — tatsächlich steht eine Erstattung aus.
 */
const GUTSCHRIFT_LABEL: Record<Zahlungsstand, string> = {
  offen: "Erstattung offen",
  teilbezahlt: "Teilerstattet",
  bezahlt: "Erstattet",
  ueberzahlt: "Übererstattet",
};

const ZAHLUNGSSTAND_KLASSE: Record<Zahlungsstand, string> = {
  offen: "status-gestellt",
  teilbezahlt: "status-gestellt",
  bezahlt: "status-bezahlt",
  ueberzahlt: "status-storniert",
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
  const sucheRef = useRef<HTMLInputElement>(null);

  useListenTastenkuerzel({
    neu: () => liste.setZeigeFormular(true),
    sucheFokussieren: () => sucheRef.current?.focus(),
  });

  return (
    <div>
      <SeitenkopfMitRundgang titel="Rechnungen" schritte={RUNDGANG_SCHRITTE} />
      {liste.fehler && <Fehler fehler={liste.fehler} />}
      <Werkzeugleiste
        filter={
          <>
            <label className="feld" data-tour="suche">
              Suche
              <input
                ref={sucheRef}
                type="search"
                value={liste.suche}
                onChange={(e) => liste.setSuche(e.currentTarget.value)}
                placeholder="Nummer oder Kunde"
              />
            </label>
            <label className="feld" data-tour="status">
              Status
              <select
                value={liste.statusFilter}
                onChange={(e) => liste.setStatusFilter(e.currentTarget.value)}
              >
                <option value="">Alle</option>
                {statusAuswahl(RECHNUNG_STATUS).map(([wert, label]) => (
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
              data-tour="neu"
              onClick={() => liste.setZeigeFormular(true)}
            >
              Neue Rechnung
            </button>
          )
        }
      />

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

          {liste.geladen && liste.belege.length === 0 && (
            <p>
              {liste.suche
                ? `Keine Rechnungen gefunden für „${liste.suche}".`
                : liste.statusFilter
                  ? "Keine Rechnungen mit diesem Status."
                  : "Noch keine Rechnungen — leg oben eine an."}
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
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Summe
                </SortierKopf>
                <SortierKopf
                  spalte="offen"
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
                        {(r.storno_von_id ? GUTSCHRIFT_LABEL : ZAHLUNGSSTAND_LABEL)[r.zahlungsstand]}
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
                  <td className="nicht-umbrechen">{formatCent(r.summe_cent)}</td>
                  <td className="nicht-umbrechen">
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
